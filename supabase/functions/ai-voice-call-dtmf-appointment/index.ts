import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";
import { findCallForLeg } from "../_shared/call-lookup.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verify = await verifyTwilioRequest(req, 'ai-voice-call-dtmf-appointment', corsHeaders);
    if (!verify.ok) return verify.response!;
    const params = verify.params;

    const transcriptionText = params.TranscriptionText;
    const from = params.From;
    const to = params.To;
    const callSid = params.CallSid;

    console.log('Appointment function called with:', {
      transcriptionText,
      from,
      to,
      callSid,
      allFormData: params,
    });

    if (!to) {
      console.error('No phone number received from Twilio');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">There was an error. We will call you back. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Match this leg by CallSid first — phone-only matching crosses wires
    // when many calls run at once.
    const callData: any = await findCallForLeg(supabaseAdmin, params as any, '*, clients(*)');

    if (!callData) {
      console.error('Call record not found for phone:', to, 'or CallSid:', callSid);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We could not find your call record. An agent will contact you. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }
    
    console.log('Found call record:', { 
      callId: callData.id, 
      clientName: callData.clients?.name,
      clientEmail: callData.clients?.email 
    });

    // Track retry attempts for this stage
    const retryCount = parseInt(callData.notes?.match(/appt_retry:(\d+)/)?.[1] || '0');

    console.log('Found call record, requesting email address');

    // Check if transcription is valid
    if (!transcriptionText || transcriptionText.trim().length < 3) {
      console.log('Invalid or empty appointment details - retry count:', retryCount);
      
      if (retryCount >= 2) {
        // Max retries reached
        await supabaseAdmin
          .from('outbound_calls')
          .update({
            call_status: 'completed',
            outcome: 'max_retries_reached',
            notes: `${callData.notes} | Max retries for appointment details`,
            ended_at: new Date().toISOString()
          })
          .eq('id', callData.id);

        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We could not capture your response. An agent will contact you. Goodbye!</Say></Response>',
          { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
        );
      }

      // Retry
      const updateResult = await supabaseAdmin
        .from('outbound_calls')
        .update({
          notes: `${callData.notes?.replace(/appt_retry:\d+/, '')} | appt_retry:${retryCount + 1}`
        })
        .eq('id', callData.id);
      
      if (updateResult.error) {
        console.error('Error updating retry count:', updateResult.error);
      }

      const retryResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Sorry, I did not catch that. Let's try again.</Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural">Please speak your preferred date and time clearly. For example, Monday at 10 A M.</Say>
  <Pause length="1"/>
  <Record maxLength="20" timeout="3" transcribe="true" transcribeCallback="${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-appointment"/>
  <Say voice="Polly.Joanna-Neural">We did not receive your response. An agent will contact you shortly. Goodbye!</Say>
</Response>`;

      return new Response(retryResponse, {
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      });
    }

    // Store appointment preference in the database for finalize function - APPEND to existing notes
    const existingNotes = callData.notes || '';
    const cleanedNotes = existingNotes.replace(/\| Appointment preference:.*?(?=\||$)/, '').replace(/\| appt_retry:\d+/, '').trim();
    const updateResult = await supabaseAdmin
      .from('outbound_calls')
      .update({
        notes: `${cleanedNotes} | CallSid:${callSid} | Appointment preference: ${transcriptionText || 'Not captured'}`
      })
      .eq('id', callData.id);

    if (updateResult.error) {
      console.error('Error storing appointment preference:', updateResult.error);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna-Neural">We encountered an error saving your preference. An agent will contact you. Goodbye!</Say></Response>',
        { headers: { 'Content-Type': 'text/xml', ...corsHeaders } }
      );
    }

    console.log('Stored appointment preference successfully, redirecting to finalize');

    // Acknowledge and redirect to finalize (Twilio Redirect makes POST request)
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Got it! Checking availability now.</Say>
  <Redirect method="POST">${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-appointment-finalize</Redirect>
</Response>`;

    console.log('Sending TwiML redirect to finalize function');
    return new Response(twimlResponse, {
      headers: { 'Content-Type': 'text/xml', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error processing appointment details:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Goodbye!</Say></Response>',
      {
        status: 500,
        headers: { 'Content-Type': 'text/xml', ...corsHeaders }
      }
    );
  }
});
