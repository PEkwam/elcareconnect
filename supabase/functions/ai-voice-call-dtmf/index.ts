import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";
import { findCallForLeg } from "../_shared/call-lookup.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Localized prompts by language code
const LOCALIZED_PROMPTS: Record<string, {
  scheduleGreat: string;
  sayPreferredDate: string;
  noResponse: string;
  callbackOk: string;
  invalidInput: string;
  menuPrompt: string;
  maxRetries: string;
  noRecord: string;
  errorGeneric: string;
  repeatInfo: string;
  transferToAgent: string;
}> = {
  en: {
    scheduleGreat: "Great! Let's schedule your appointment.",
    sayPreferredDate: 'Please say your preferred date and time for the appointment. For example, "Monday at 10 AM" or "Next Tuesday at 2 PM".',
    noResponse: "We didn't receive your response. We'll call you back to schedule. Goodbye!",
    callbackOk: "No problem. We will call you back at a more convenient time. Thank you and goodbye!",
    invalidInput: "Sorry, I didn't understand that.",
    menuPrompt: "Press 1 to schedule an appointment. Press 2 for a callback later. Press 0 to speak with a live agent. Press 9 to hear options again.",
    maxRetries: "We could not capture your response. An agent will contact you. Goodbye!",
    noRecord: "We could not find your record. An agent will contact you. Goodbye!",
    errorGeneric: "An error occurred. Goodbye!",
    repeatInfo: "Let me repeat the options for you.",
    transferToAgent: "Please hold while we connect you to a live agent.",
  },
  tw: {
    scheduleGreat: "Eye! Yɛbɛhyehyɛ wo appointment.",
    sayPreferredDate: "Mepa wo kyɛw, ka da ne bere a wopɛ sɛ wonya appointment no. Sɛ nhwɛso no, 'Dwowda bere 10 anɔpa' anaasɛ 'Benada a ɛdi hɔ bere 2 awia'.",
    noResponse: "Yɛannya wo mmuae. Yɛbɛsan afrɛ wo. Nante yie!",
    callbackOk: "Ɛyɛ. Yɛbɛsan afrɛ wo bere a ɛbɛyɛ wo yie. Medaase, nante yie!",
    invalidInput: "Kafra, mente aseɛ.",
    menuPrompt: "Mia 1 sɛ wopɛ appointment. Mia 2 sɛ wopɛ sɛ yɛsan frɛ wo. Mia 0 sɛ wopɛ sɛ wokasa kyerɛ agent. Mia 9 sɛ wopɛ sɛ wote nsɛm no bio.",
    maxRetries: "Yɛantumi anya wo mmuae. Agent bɛfrɛ wo. Nante yie!",
    noRecord: "Yɛantumi anhu wo record. Agent bɛfrɛ wo. Nante yie!",
    errorGeneric: "Mfomso bi asi. Nante yie!",
    repeatInfo: "Ma mensan mka nsɛm no mma wo.",
    transferToAgent: "Mepa wo kyɛw, twɛn kakra, yɛde wo rekɔ agent bi nkyɛn.",
  },
  ga: {
    scheduleGreat: "Ehee! Míbɛ schedule wo appointment.",
    sayPreferredDate: "Tswa ejo kɛ eshwee ni ohe baa lɛ appointment lɛ. Akɛ nhwɛso, 'Ju lɛ bere 10 anɔpa' alo 'Sho nɛɛ lɛ bere 2 awia'.",
    noResponse: "Miihe wo response ko. Míba call wɔ back. Oyiwaladonɛ!",
    callbackOk: "Ɛhɛɛ. Míba call wɔ back mli time ni eba le. Oyiwaladonɛ!",
    invalidInput: "Miishe nɛɛ koni.",
    menuPrompt: "Tao 1 nɛ obaa schedule appointment. Tao 2 nɛ obaa yɛ call wɔ back. Tao 0 nɛ obaa kasa kɛ agent. Tao 9 nɛ obaa nɛɛ nsɛm lɛ bio.",
    maxRetries: "Miitumi annya wo response. Agent bɛ call wɔ. Oyiwaladonɛ!",
    noRecord: "Miitumi anhu wo record. Agent bɛ call wɔ. Oyiwaladonɛ!",
    errorGeneric: "Error bi aba. Oyiwaladonɛ!",
    repeatInfo: "Ma miboa nsɛm lɛ mma wɔ.",
    transferToAgent: "Tswa mɔ kakra, míde wɔ rekɔ agent bi hewɔ.",
  },
  ee: {
    scheduleGreat: "Nyuie! Míaƒo ɖoɖo aɖe na wò.",
    sayPreferredDate: "Taflatse, gblɔ ŋkeke kple gaƒoƒo si nèlɔ̃ be nàƒo ɖoɖo la ɖe. Le kpɔɖeŋu me, 'Dzoɖagbe ɣe 10 ŋdi' alo 'Braɖagbe si gbɔna ɣe 2 ŋdɔ'.",
    noResponse: "Míemɛ sè wò ŋuɖoɖo o. Míagayɔ wò. Heɖe nyuie!",
    callbackOk: "Mesɔ nane o. Míagayɔ wò ɣe si anyo na wò. Akpe, heɖe nyuie!",
    invalidInput: "Taflatse, mese egɔme o.",
    menuPrompt: "Ʈu 1 ne èdi be nàƒo ɖoɖo aɖe da. Ʈu 2 ne èdi be míagayɔ wò. Ʈu 0 ne èdi be nàƒo nyawo kple agent. Ʈu 9 ne èdi be nàgase nya la.",
    maxRetries: "Míemɛ sè wò ŋuɖoɖo o. Agent aɖe ayɔ wò. Heɖe nyuie!",
    noRecord: "Míemɛ kpɔ wò nuŋlɔɖi o. Agent aɖe ayɔ wò. Heɖe nyuie!",
    errorGeneric: "Vodada aɖe dzɔ. Heɖe nyuie!",
    repeatInfo: "Ma megase nya la na wò.",
    transferToAgent: "Taflatse, lala anyi ɖe afimama, míde wò yi agent gbɔ.",
  },
  ha: {
    scheduleGreat: "Da kyau! Bari mu saita alƙawari.",
    sayPreferredDate: "Don Allah, faɗi rana da lokacin da kuke so na alƙawari. Misali, 'Litinin ƙarfe 10 na safe' ko 'Talata mai zuwa ƙarfe 2 na rana'.",
    noResponse: "Ba mu sami amsarku ba. Za mu sake kiran ku. Sai an jima!",
    callbackOk: "Babu matsala. Za mu sake kiran ku a lokaci mafi dacewa. Na gode, sai an jima!",
    invalidInput: "Yi haƙuri, ban fahimta ba.",
    menuPrompt: "Danna 1 don saita alƙawari. Danna 2 don sake kiran ku daga baya. Danna 0 don magana da wakili. Danna 9 don sake jin zaɓuɓɓukan.",
    maxRetries: "Ba mu iya samun amsarku ba. Wakilin zai tuntube ku. Sai an jima!",
    noRecord: "Ba mu sami bayananku ba. Wakilin zai tuntube ku. Sai an jima!",
    errorGeneric: "An sami kuskure. Sai an jima!",
    repeatInfo: "Bari in sake faɗi zaɓuɓɓukan a gare ku.",
    transferToAgent: "Don Allah ku jira, muna haɗa ku da wakilin mu.",
  },
};

function getPrompts(langCode: string) {
  return LOCALIZED_PROMPTS[langCode] || LOCALIZED_PROMPTS['en'];
}

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verify = await verifyTwilioRequest(req, 'ai-voice-call-dtmf', corsHeaders);
    if (!verify.ok) return verify.response!;
    const params = verify.params;

    const digit = params.Digits;
    const callSid = params.CallSid;
    const from = params.From;
    const to = params.To;

    console.log('DTMF Response received:', { digit, callSid, from, to });

    const clientPhone = to;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // --- Find call record (same logic as before) ---

    if (!clientPhone) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">There was an error processing your request. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    // Resolve this leg by CallSid first (safe under heavy concurrency).
    const callData: any = await findCallForLeg(supabaseAdmin, params as any, '*, clients(*)');

    // Determine language from call record
    const urlLang = new URL(req.url).searchParams.get('lang');
    const langCode = callData?.call_language || urlLang || callData?.clients?.preferred_language || 'en';
    const prompts = getPrompts(langCode);

    if (!callData) {
      console.error('No call record found for client phone:', clientPhone);
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${prompts.noRecord}</Say></Response>`,
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }
    
    console.log('Using call record:', callData.id, 'Language:', langCode);

    const retryCount = parseInt(callData.notes?.match(/retry_count:(\d+)/)?.[1] || '0');
    const mainDtmfAction = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf?lang=${langCode}`;

    // --- Press 0: Transfer to live agent ---
    if (digit === '0') {
      console.log('Client pressed 0 - transferring to live agent');

      // Update call record
      await supabaseAdmin
        .from('outbound_calls')
        .update({
          outcome: 'transfer_to_agent',
          notes: `${callData.notes || ''} | Client pressed 0 - Transfer to live agent requested`,
        })
        .eq('id', callData.id);

      // Create a customer note for the transfer request
      if (callData.clients?.id) {
        await supabaseAdmin
          .from('customer_notes')
          .insert({
            client_id: callData.clients.id,
            call_id: callData.id,
            note_type: 'transfer',
            content: `Client pressed 0 during IVR - requested transfer to live agent (language: ${langCode}).`,
            agent_email: 'ai-system@dck.com'
          });
      }

      // Add to call queue for agent pickup
      if (callData.clients?.id) {
        await supabaseAdmin
          .from('call_queue')
          .insert({
            client_id: callData.clients.id,
            call_type: 'transfer_from_ivr',
            priority_level: 'high',
          });
      }

      // Resolve a real phone number to dial: escalation supervisor phones → admin bridge phone
      let dialNumber: string | null = null;

      const { data: escalation } = await supabaseAdmin
        .from('escalation_settings')
        .select('supervisor_phones')
        .limit(1)
        .maybeSingle();

      if (escalation?.supervisor_phones && escalation.supervisor_phones.length > 0) {
        dialNumber = escalation.supervisor_phones.find((phone: string) => /^\+\d{8,15}$/.test(phone)) || null;
      }

      if (!dialNumber) {
        const { data: settings } = await supabaseAdmin
          .from('system_settings')
          .select('admin_bridge_phone')
          .limit(1)
          .maybeSingle();
        if (settings?.admin_bridge_phone && /^\+\d{8,15}$/.test(settings.admin_bridge_phone)) {
          dialNumber = settings.admin_bridge_phone;
        }
      }

      console.log('Transferring to live agent at:', dialNumber);

      const callerId = Deno.env.get('TWILIO_PHONE_NUMBER') || '';
      const callerIdAttr = /^\+\d{8,15}$/.test(callerId) ? ` callerId="${escapeXml(callerId)}"` : '';

      const twimlResponse = dialNumber
        ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${prompts.transferToAgent}</Say>
  <Pause length="1"/>
  <Dial timeout="30"${callerIdAttr} answerOnBridge="true">
    <Number>${escapeXml(dialNumber)}</Number>
  </Dial>
  <Say voice="Polly.Joanna-Neural">We were unable to reach an agent. We will call you back shortly. Goodbye!</Say>
</Response>`
        : `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">No agents are configured to receive transfers. We will call you back shortly. Goodbye!</Say>
</Response>`;

      return new Response(twimlResponse, {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });
    }

    // --- Press 9: Repeat options ---
    if (digit === '9') {
      console.log('Client pressed 9 - repeating menu options');
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${prompts.repeatInfo}</Say>
  <Pause length="1"/>
  <Gather numDigits="1" timeout="10" action="${mainDtmfAction}" method="POST" actionOnEmptyResult="true">
    <Say voice="Polly.Joanna-Neural">${prompts.menuPrompt}</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">${prompts.noResponse}</Say>
</Response>`;
      return new Response(twimlResponse, {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });
    }

    // --- Press 1: Schedule appointment ---
    if (digit === '1') {
      console.log('Client pressed 1 - collecting appointment details');
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${prompts.scheduleGreat}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">${prompts.sayPreferredDate}</Say>
  <Record maxLength="30" timeout="5" action="${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-appointment-finalize" method="POST" transcribe="true" transcribeCallback="${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-appointment-finalize"/>
  <Say voice="Polly.Joanna-Neural">${prompts.noResponse}</Say>
</Response>`;

      const existingNotes = callData.notes || '';
      const callSidNote = existingNotes.includes('CallSid:') ? existingNotes.split('|')[0] : `CallSid: ${callSid}`;
      
      await supabaseAdmin
        .from('outbound_calls')
        .update({
          notes: `${callSidNote} | Client pressed 1 - Ready to make appointment | retry_count:0`,
          outcome: 'appointment_in_progress'
        })
        .eq('id', callData.id);

      return new Response(twimlResponse, {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });

    // --- Press 2: Callback later ---
    } else if (digit === '2') {
      console.log('Client pressed 2 - requesting callback');

      await supabaseAdmin
        .from('customer_notes')
        .insert({
          client_id: callData.clients.id,
          call_id: callData.id,
          note_type: 'callback',
          content: `Client pressed 2 - requested callback (language: ${langCode}).`,
          agent_email: 'ai-system@dck.com'
        });

      await supabaseAdmin
        .from('outbound_calls')
        .update({
          call_status: 'completed',
          outcome: 'callback_requested',
          notes: `Client pressed 2 - Requested callback later (lang: ${langCode})`,
          ended_at: new Date().toISOString()
        })
        .eq('id', callData.id);

      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${prompts.callbackOk}</Say></Response>`,
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );

    // --- Invalid input with retry ---
    } else {
      console.log('Invalid digit received:', digit, '- retry count:', retryCount);
      
      if (retryCount >= 2) {
        await supabaseAdmin
          .from('outbound_calls')
          .update({
            call_status: 'completed',
            outcome: 'max_retries_reached',
            notes: `${callData.notes} | Max retries reached`,
            ended_at: new Date().toISOString()
          })
          .eq('id', callData.id);

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">${prompts.maxRetries}</Say></Response>`,
          { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
        );
      }

      await supabaseAdmin
        .from('outbound_calls')
        .update({
          notes: `${callData.notes?.replace(/retry_count:\d+/, '')} | retry_count:${retryCount + 1}`
        })
        .eq('id', callData.id);

      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">${prompts.invalidInput}</Say>
  <Pause length="1"/>
  <Gather numDigits="1" timeout="10" action="${mainDtmfAction}" method="POST" actionOnEmptyResult="true">
    <Say voice="Polly.Joanna-Neural">${prompts.menuPrompt}</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">${prompts.noResponse}</Say>
</Response>`;

      return new Response(twimlResponse, {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });
    }

  } catch (error) {
    console.error('Error handling DTMF response:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Goodbye!</Say></Response>',
      { status: 500, headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
    );
  }
});
