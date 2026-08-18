import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);
}

// Bridged client leg: Recording 1 ("Dear" intro) + client name + Recording 2 (IVR menu).
// Falls back to default Twilio <Say> if admin recordings aren't uploaded.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const verify = await verifyTwilioRequest(req, 'ai-voice-call-bridge-ivr', corsHeaders);
  if (!verify.ok) return verify.response!;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  // Determine client (from To) so we can speak their name + find the campaign
  let clientName = '';
  let campaignId: string | null = null;
  let campaignOptions: any = null;
  let preferredLanguage: string | null = null;
  try {
    const to = verify.params.To || null;
    if (to) {
      const { data } = await supabaseAdmin
        .from('outbound_calls')
        .select('campaign_id, clients(name, preferred_language), call_campaigns(options)')
        .eq('phone_number', to)
        .order('created_at', { ascending: false })
        .limit(1);
      const row: any = data?.[0];
      clientName = row?.clients?.name || '';
      preferredLanguage = row?.clients?.preferred_language || null;
      campaignId = row?.campaign_id || null;
      campaignOptions = row?.call_campaigns?.options || null;
    }
  } catch (_e) { /* ignore lookup failures — fall back to defaults */ }

  // Resolve toggles — default to TRUE for legacy campaigns w/o the options.
  const playGreeting = campaignOptions?.playGreeting ?? true;
  const playIntro = campaignOptions?.playIntro ?? true;
  const playIvrMenu = campaignOptions?.playIvrMenu ?? true;

  // Load BOTH campaign-scoped (if any) and system-default (campaign_id NULL)
  // recordings. Prefer campaign-scoped when both exist so admins can override
  // the greeting/IVR per campaign without touching the system defaults.
  const recordingFilters = supabaseAdmin
    .from('campaign_recordings')
    .select('kind, language_code, audio_url, campaign_id')
    .in('kind', ['system_intro', 'system_message_intro', 'system_ivr']);

  const { data: allRows } = campaignId
    ? await recordingFilters.or(`campaign_id.eq.${campaignId},campaign_id.is.null`)
    : await recordingFilters.is('campaign_id', null);

  const pickAudio = (kind: string) => {
    const rows = (allRows || []).filter((r: any) => r.kind === kind && r.audio_url);
    const campaignRows = rows.filter((r: any) => r.campaign_id);
    const systemRows = rows.filter((r: any) => !r.campaign_id);
    const choose = (list: any[]) =>
      list.find((r: any) => r.language_code === 'default')?.audio_url
      || list.find((r: any) => r.language_code === 'en')?.audio_url
      || list[0]?.audio_url
      || null;
    return choose(campaignRows) || choose(systemRows);
  };

  const introAudio = pickAudio('system_intro');           // Recording 1 — "Dear"
  const messageIntroAudio = pickAudio('system_message_intro'); // Recording 2 — "You have a message from…"
  const ivrAudio = pickAudio('system_ivr');               // Recording 3 — IVR language menu

  const langActionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-language`;

  // Recording 1 ("Dear") + client name (TTS) — falls back to <Say> if no upload.
  const greetingTwiml = !playGreeting
    ? ''
    : introAudio
      ? `<Play>${introAudio}</Play>${clientName ? `<Say voice="alice">${escapeXml(clientName)}</Say>` : ''}`
      : `<Say voice="alice">Dear ${escapeXml(clientName || 'valued customer')}.</Say>`;

  // Recording 2 — intro message (plays BEFORE the IVR Gather, not inside it).
  const messageIntroTwiml = !playIntro
    ? ''
    : messageIntroAudio
      ? `<Play>${messageIntroAudio}</Play>`
      : `<Say voice="alice">You have a message from Enterprise Life.</Say>`;

  // Recording 3 — IVR language menu (inside <Gather> so digits are captured).
  const ivrTwiml = ivrAudio
    ? `<Play>${ivrAudio}</Play>`
    : `<Say voice="alice">For English press 1, Twi press 2, Ga press 3, Hausa press 4, Ewe press 5, press 9 to repeat, press 0 to speak with the agent.</Say>`;

  // Build the section after the (optional) greeting/intro:
  //  - IVR ON  → present language menu via <Gather>.
  //  - IVR OFF → skip menu and go straight to the campaign message in the
  //              client's preferred language (defaults to English = digit 1).
  const langToDigit: Record<string, string> = { en: '1', tw: '2', ga: '3', ha: '4', ee: '5' };
  const defaultDigit = (preferredLanguage && langToDigit[preferredLanguage]) || '1';

  const tailTwiml = playIvrMenu
    ? `<Gather numDigits="1" action="${langActionUrl}" method="POST" timeout="12">
    ${ivrTwiml}
  </Gather>
  <Say voice="alice">No selection received. Connecting you to the agent now.</Say>`
    : `<Redirect method="POST">${langActionUrl}?digit=${defaultDigit}</Redirect>`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}
  ${greetingTwiml ? '<Pause length="1"/>' : ''}
  ${messageIntroTwiml}
  ${messageIntroTwiml ? '<Pause length="1"/>' : ''}
  ${tailTwiml}
</Response>`;

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml', ...corsHeaders },
  });
});
