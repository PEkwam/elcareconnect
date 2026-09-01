import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// Built-in fallback prompts (used only when DB has no greeting/menu text)
const FALLBACK: Record<string, { code: string; greeting: string; menuPrompt: string }> = {
  '1': { code: 'en', greeting: 'You selected English. Thank you!', menuPrompt: 'Press 1 to schedule an appointment. Press 2 to be called back later. Press 9 to repeat. Press 0 for a live agent.' },
  '2': { code: 'tw', greeting: 'Wo ayi Twi. Medaase!', menuPrompt: 'Mia 1 sɛ wopɛ sɛ wo hyehyɛ appointment. Mia 2 sɛ wopɛ sɛ yɛsan frɛ wo. Mia 9 sɛ wopɛ sɛ wote bio. Mia 0 ma agent.' },
  '3': { code: 'ga', greeting: 'Oyi Ga. Oyiwaladonɛ!', menuPrompt: 'Tao 1 nɛ obaa schedule appointment. Tao 2 nɛ obaa yɛ call wɔ back. Tao 9 nɛ obaa nɛɛ bio. Tao 0 nɛ live agent.' },
  '4': { code: 'ha', greeting: 'Kun zaɓi Hausa. Na gode!', menuPrompt: 'Danna 1 don saita alƙawari. Danna 2 don sake kiranku. Danna 9 don sake ji. Danna 0 don agent.' },
  '5': { code: 'ee', greeting: 'Nètia Eʋegbe. Akpe!', menuPrompt: 'Ʈu 1 ne èdi be nàƒo ɖoɖo. Ʈu 2 ne èdi be míagayɔ wò. Ʈu 9 ne èdi be nàgase. Ʈu 0 na agent.' },
};

function sayOrPlay(audioUrl: string | null | undefined, text: string): string {
  if (audioUrl) return `<Play>${audioUrl}</Play>`;
  if (!text) return '';
  return `<Say voice="Polly.Joanna-Neural">${text}</Say>`;
}

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);
}

async function resolveLiveAgentNumber(supabaseAdmin: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: escalation } = await supabaseAdmin
    .from('escalation_settings')
    .select('supervisor_phones')
    .limit(1)
    .maybeSingle();

  const supervisorPhone = Array.isArray(escalation?.supervisor_phones)
    ? escalation.supervisor_phones.find((phone: string) => /^\+\d{8,15}$/.test(phone))
    : null;

  if (supervisorPhone) return supervisorPhone;

  const { data: settings } = await supabaseAdmin
    .from('system_settings')
    .select('admin_bridge_phone')
    .limit(1)
    .maybeSingle();

  return settings?.admin_bridge_phone && /^\+\d{8,15}$/.test(settings.admin_bridge_phone)
    ? settings.admin_bridge_phone
    : null;
}

function liveAgentTwiml(dialNumber: string | null): string {
  const callerId = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
  const callerIdAttr = /^\+\d{8,15}$/.test(callerId) ? ` callerId="${escapeXml(callerId)}"` : '';

  if (!dialNumber) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">No live agent number is configured. We will call you back shortly. Goodbye!</Say>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Please hold while we connect you to a live agent.</Say>
  <Pause length="1"/>
  <Dial timeout="30"${callerIdAttr} answerOnBridge="true">
    <Number>${escapeXml(dialNumber)}</Number>
  </Dial>
  <Say voice="Polly.Joanna-Neural">We were unable to reach an agent. We will call you back shortly. Goodbye!</Say>
</Response>`;
}

function applyPlaceholders(template: string, client: any, productMap?: Map<string, string>): string {
  if (!template) return '';
  const tv = (client?.tag_values || {}) as Record<string, any>;
  const resolveProduct = (raw: string | null | undefined): string => {
    if (!raw) return 'your policy type';
    const trimmed = String(raw).trim();
    return productMap?.get(trimmed) || trimmed;
  };
  const fmtMonthYear = (val?: string | null): string => {
    if (!val) return 'N/A';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch { return val; }
  };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
    const builtins: Record<string, any> = {
      client_name: client?.name || 'valued customer',
      due_date: fmtMonthYear(client?.premium_due_date),
      premium_amount: client?.premium_amount?.toString() || '0',
      policy_number: client?.policy_number || 'your policy',
      product_type: resolveProduct(client?.product_type),
      policy_type: resolveProduct(client?.product_type),
    };
    if (name in builtins) return String(builtins[name]);
    const v = tv[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verify = await verifyTwilioRequest(req, 'ai-voice-call-dtmf-language', corsHeaders);
    if (!verify.ok) return verify.response!;
    const params = verify.params;

    let digit: string | null = (params.Digits as string | undefined) || null;
    const callSid = (params.CallSid as string | undefined) || null;
    const to = (params.To as string | undefined) || null;

    // Track repeat attempts via query param
    const url = new URL(req.url);
    const attempt = parseInt(url.searchParams.get('attempt') || '0', 10) || 0;

    // Allow callers (e.g. bridge-ivr bypass when IVR menu is disabled) to
    // pre-select a language by passing `?digit=1` in the query string.
    const queryDigit = url.searchParams.get('digit');
    if (!digit && queryDigit) {
      digit = queryDigit;
    }

    console.log('Language DTMF received:', { digit, callSid, to, attempt, queryDigit });

    // After 2 silent/invalid attempts, auto-select English (default = 1)
    const isInvalid = !digit || (digit !== '0' && digit !== '9' && !FALLBACK[digit]);
    if (isInvalid && attempt >= 2) {
      console.log('Max IVR attempts reached — defaulting to English (1)');
      digit = '1';
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Press 0 → transfer to live agent
    if (digit === '0') {
      let dialNumber: string | null = null;

      if (to) {
        const { data: callRecords } = await supabaseAdmin
          .from('outbound_calls')
          .select('id, client_id')
          .eq('phone_number', to)
          .order('created_at', { ascending: false })
          .limit(1);
        if (callRecords && callRecords.length > 0) {
          await supabaseAdmin
            .from('outbound_calls')
            .update({ outcome: 'transfer_to_agent', notes: 'Pressed 0 during language selection' })
            .eq('id', callRecords[0].id);
          if (callRecords[0].client_id) {
            await supabaseAdmin.from('call_queue').insert({
              client_id: callRecords[0].client_id,
              call_type: 'transfer_from_ivr',
              priority_level: 'high',
            });
          }
        }
      }

      dialNumber = await resolveLiveAgentNumber(supabaseAdmin);

      return new Response(
        liveAgentTwiml(dialNumber),
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    const fb = FALLBACK[digit || ''];

    // Press 9 or invalid → repeat language menu (Recording 3)
    if (digit === '9' || !digit || !fb) {
      const nextAttempt = (digit === '9') ? attempt : attempt + 1;
      const langActionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-language?attempt=${nextAttempt}`;
      const message = digit === '9' ? '' : 'Sorry, that was not a valid option.';

      // Re-use the uploaded IVR menu recording if available
      const { data: ivrRow } = await supabaseAdmin
        .from('campaign_recordings')
        .select('audio_url')
        .eq('kind', 'system_ivr')
        .is('campaign_id', null)
        .not('audio_url', 'is', null)
        .order('language_code', { ascending: true })
        .limit(1)
        .maybeSingle();

      const ivrTwiml = ivrRow?.audio_url
        ? `<Play>${ivrRow.audio_url}</Play>`
        : `<Say voice="Polly.Joanna-Neural">For English press 1, Twi press 2, Ga press 3, Hausa press 4, Ewe press 5, press 9 to repeat, press 0 for a live agent.</Say>`;

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${message ? `<Say voice="Polly.Joanna-Neural">${message}</Say><Pause length="1"/>` : ''}
  <Gather numDigits="1" action="${langActionUrl}" method="POST" timeout="15">
    ${ivrTwiml}
  </Gather>
  <Redirect method="POST">${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-language?attempt=${nextAttempt + 1}</Redirect>
</Response>`,
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    // Look up the most recent call for this number to get campaign + client.
    // Try `To` first (normal direct call); if not found, try `From` (bridged
    // leg where the client number is the caller); finally fall back to the
    // most recent in-progress call so we don't break the flow.
    const from = (params.From as string | undefined) || null;
    let callRecord: any = null;
    const tryLookup = async (phone: string) => {
      const { data } = await supabaseAdmin
        .from('outbound_calls')
        .select('id, client_id, campaign_id, clients(*), call_campaigns(*)')
        .eq('phone_number', phone)
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] || null;
    };
    if (to) callRecord = await tryLookup(to);
    if (!callRecord && from) callRecord = await tryLookup(from);
    if (!callRecord) {
      const { data } = await supabaseAdmin
        .from('outbound_calls')
        .select('id, client_id, campaign_id, clients(*), call_campaigns(*)')
        .order('created_at', { ascending: false })
        .limit(1);
      callRecord = data?.[0] || null;
    }
    if (callRecord) {
      console.log('Language selected:', fb.code, 'for call', callRecord.id, 'campaign', callRecord.campaign_id);
      await supabaseAdmin.from('outbound_calls').update({ call_language: fb.code }).eq('id', callRecord.id);
      if (callRecord.client_id) {
        await supabaseAdmin.from('clients').update({ preferred_language: fb.code }).eq('id', callRecord.client_id);
      }
    } else {
      console.warn('No outbound_calls row found for To=', to, 'From=', from);
    }

    // Look up admin-configured greeting/menu for this language
    const { data: langRow } = await supabaseAdmin
      .from('supported_languages')
      .select('greeting_text, menu_prompt_text, greeting_audio_url, menu_audio_url')
      .eq('code', fb.code)
      .eq('is_active', true)
      .maybeSingle();

    // Only play a language confirmation if the admin uploaded an audio file
    // for it. Avoid speaking "You selected English" before the campaign script
    // — that was being perceived as the system repeating itself.
    const greetingTwiml = langRow?.greeting_audio_url
      ? `<Play>${langRow.greeting_audio_url}</Play>`
      : '';

    // Build localized campaign script playback.
    // Preferred: campaign_recordings rows (text segments → <Play>, tag segments → <Say> resolved tag value).
    // Fallback: legacy script_audio_urls / script_translations on call_campaigns.
    let campaignTwiml = '';
    const campaign = callRecord?.call_campaigns;
    const client = callRecord?.clients;

    // Fetch product types so we can resolve codes → names in TTS
    const { data: productTypesRows } = await supabaseAdmin
      .from('product_types')
      .select('code, name')
      .eq('is_active', true);
    const productNameByCode = new Map<string, string>();
    (productTypesRows || []).forEach((r: any) => {
      if (r.code) productNameByCode.set(r.code, r.name || r.code);
    });

    const resolveProductName = (raw: string | null | undefined): string => {
      if (!raw) return '';
      const trimmed = String(raw).trim();
      return productNameByCode.get(trimmed) || trimmed;
    };

    const resolveTag = (name: string): string => {
      const fmtMonthYear = (val?: string | null): string => {
        if (!val) return '';
        try {
          const d = new Date(val);
          if (isNaN(d.getTime())) return val;
          return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } catch { return val; }
      };
      const builtins: Record<string, any> = {
        client_name: client?.name,
        due_date: fmtMonthYear(client?.premium_due_date),
        premium_amount: client?.premium_amount,
        policy_number: client?.policy_number,
        product_type: resolveProductName(client?.product_type),
        policy_type: resolveProductName(client?.product_type),
        this_month: new Date().toLocaleString('en-US', { month: 'long' }),
      };
      const tv = (client?.tag_values || {}) as Record<string, any>;
      const raw = name in builtins ? builtins[name] : tv[name];
      return raw === undefined || raw === null || raw === '' ? '' : String(raw);
    };

    if (campaign) {
      // Pull every recording rendition stored for this campaign+language so
      // admins can mix segments, full intro recordings, or a single campaign
      // message — whichever they uploaded under the selected language.
      // Accept a few common aliases for the selected language so admins
      // can upload under 'en' / 'eng' / 'english' (etc.) and still hit.
      const langAliases: Record<string, string[]> = {
        en: ['en', 'eng', 'english'],
        tw: ['tw', 'twi'],
        ga: ['ga'],
        ha: ['ha', 'hausa'],
        ee: ['ee', 'ewe'],
      };
      const codeAliases = langAliases[fb.code] || [fb.code];

      const { data: segs } = await supabaseAdmin
        .from('campaign_recordings')
        .select('kind, segment_order, text_content, tag_name, is_tag, audio_url, language_code')
        .eq('campaign_id', campaign.id)
        .in('language_code', codeAliases)
        .in('kind', ['segment', 'campaign_message', 'campaign_intro'])
        .order('segment_order', { nullsFirst: false });

      console.log('Campaign recordings found for', fb.code, ':', segs?.length || 0);

      // Build an ordered playback list by parsing the campaign script the
      // SAME WAY the Recordings panel does (parseScript). For English we
      // treat campaign.script as the canonical source so we don't fall
      // through to another language's translation by accident.
      const translations = (campaign.script_translations || {}) as Record<string, string>;
      const scriptSource = fb.code === 'en'
        ? (campaign.script || translations['en'] || translations['eng'] || translations['default'] || '')
        : (translations[fb.code] || translations[codeAliases[1] || ''] || campaign.script || '');

      type Part = { text: string; is_tag: boolean; tag_name?: string };
      const parts: Part[] = [];
      if (scriptSource) {
        const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
        let last = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(scriptSource)) !== null) {
          const before = scriptSource.slice(last, m.index).trim();
          if (before) parts.push({ text: before, is_tag: false });
          parts.push({ text: `{{${m[1]}}}`, is_tag: true, tag_name: m[1] });
          last = m.index + m[0].length;
        }
        const tail = scriptSource.slice(last).trim();
        if (tail) parts.push({ text: tail, is_tag: false });
      }

      // Build segMap preferring rows that actually have audio, and within
      // those preferring the primary language code (e.g. 'en' over 'eng').
      // This prevents an empty 'en' row from shadowing a complete 'eng' row.
      const aliasRank = new Map<string, number>();
      codeAliases.forEach((c, i) => aliasRank.set(c, i));
      const scoreRow = (s: any) => {
        const audioScore = s.audio_url ? 0 : 100;
        const langScore = aliasRank.get(s.language_code) ?? 50;
        return audioScore + langScore;
      };
      const segMap = new Map<number, any>();
      (segs || []).forEach((s: any) => {
        if (typeof s.segment_order !== 'number') return;
        const existing = segMap.get(s.segment_order);
        if (!existing || scoreRow(s) < scoreRow(existing)) {
          segMap.set(s.segment_order, s);
        }
      });

      if (parts.length > 0) {
        const out: string[] = [];
        parts.forEach((p, idx) => {
          const dbSeg = segMap.get(idx);
          if (p.is_tag) {
            // Tags are always spoken at call time from client data so the
            // value is current (premium, due date, etc.). If admin uploaded
            // an MP3 for this tag slot, prefer it.
            if (dbSeg?.audio_url) {
              out.push(`<Play>${dbSeg.audio_url}</Play>`);
            } else {
              const val = resolveTag(p.tag_name!);
              if (val) out.push(`<Say voice="Polly.Joanna-Neural">${escapeXml(val)}</Say>`);
            }
          } else {
            if (dbSeg?.audio_url) {
              out.push(`<Play>${dbSeg.audio_url}</Play>`);
            } else {
              out.push(`<Say voice="Polly.Joanna-Neural">${escapeXml(applyPlaceholders(p.text, client, productNameByCode))}</Say>`);
            }
          }
        });
        campaignTwiml = out.join('\n  ');
      } else if (segs && segs.length > 0) {
        // No script text but segments exist — play them in segment_order.
        campaignTwiml = (segs as any[])
          .slice()
          .sort((a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0))
          .map((s) => {
            if (s.is_tag) {
              const val = resolveTag(s.tag_name);
              return val ? `<Say voice="Polly.Joanna-Neural">${escapeXml(val)}</Say>` : '';
            }
            if (s.audio_url) return `<Play>${s.audio_url}</Play>`;
            if (s.text_content) return `<Say voice="Polly.Joanna-Neural">${escapeXml(applyPlaceholders(s.text_content, client, productNameByCode))}</Say>`;
            return '';
          }).join('\n  ');
      } else {
        // Legacy fallback: campaign-level audio URL maps
        const audioUrls = (campaign.script_audio_urls || {}) as Record<string, string>;
        const localizedAudio = audioUrls[fb.code] || audioUrls['default'];
        if (localizedAudio) {
          campaignTwiml = `<Play>${localizedAudio}</Play>`;
        } else {
          const text = applyPlaceholders(scriptSource, client, productNameByCode);
          if (text) campaignTwiml = `<Say voice="Polly.Joanna-Neural">${escapeXml(text)}</Say>`;
        }
      }

      if (!campaignTwiml) {
        console.warn('No campaign script available for language', fb.code, 'campaign', campaign.id);
        campaignTwiml = `<Say voice="Polly.Joanna-Neural">Sorry, the message in your selected language is not yet available.</Say>`;
      }
    }


    // For interactive medical-booking campaigns, also offer the appointment menu
    const isInteractive = campaign?.type === 'medical_booking';
    const menuTwiml = sayOrPlay(langRow?.menu_audio_url, escapeXml(langRow?.menu_prompt_text || fb.menuPrompt));
    const mainDtmfAction = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf`;

    // Segments are emitted back-to-back (no <Pause>) so an uploaded recording
    // and a system-spoken tag value sound like one continuous message.
    const twimlResponse = isInteractive
      ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}${campaignTwiml}
  <Gather numDigits="1" action="${mainDtmfAction}" method="POST" timeout="10">
    ${menuTwiml}
  </Gather>
  <Say voice="Polly.Joanna-Neural">We didn't receive your response. We'll call you back. Goodbye!</Say>
</Response>`
      : `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiml}${campaignTwiml}
  <Say voice="Polly.Joanna-Neural">Thank you. Goodbye!</Say>
</Response>`;

    return new Response(twimlResponse, {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error in language DTMF handler:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Goodbye!</Say></Response>',
      { status: 500, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
    );
  }
});
