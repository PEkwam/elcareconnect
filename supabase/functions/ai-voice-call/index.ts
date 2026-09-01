import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CallSettings {
  default_caller_id: string;
  dial_me_first_enabled: boolean;
  admin_bridge_phone: string;
}

// Normalize a phone number to E.164. Defaults to Ghana (+233) when no country code is present.
function normalizePhone(raw: string, defaultCountryCode = '233'): string {
  if (!raw) return raw;
  let p = String(raw).trim().replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  // Strip leading zeros (local trunk prefix)
  p = p.replace(/^0+/, '');
  // If it already begins with the country code digits, just prefix '+'
  if (p.startsWith(defaultCountryCode)) return '+' + p;
  return '+' + defaultCountryCode + p;
}

// Twilio API helper. When dial_me_first is enabled, Twilio rings the admin's
// mobile FIRST; once the admin picks up, Twilio dials the client and bridges
// the two legs. The client sees `default_caller_id` as the Caller ID.
async function makePhoneCall(toNumber: string, _message: string, _campaign: any, settings: CallSettings, creds: { sid: string; token: string; phone: string }) {
  const accountSid = creds.sid;
  const authToken = creds.token;
  const twilioNumber = creds.phone || '+16203222626';

  if (!accountSid || !authToken) {
    throw new Error('Calling service is not configured yet. Please ask an administrator to add the Twilio Account SID and Auth Token in App Secrets before placing calls.');
  }

  const callerId = settings.default_caller_id || twilioNumber;
  const langActionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-dtmf-language`;
  const bridgeIvrUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-bridge-ivr`;
  const statusCallbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-voice-call-status`;

  let toLeg: string;
  let twimlContent: string | null = null;
  let urlContent: string | null = null;

  if (settings.dial_me_first_enabled && settings.admin_bridge_phone) {
    // Leg 1 → admin mobile. When admin answers, bridge to client AND
    // run the multilingual IVR on the client leg via <Dial><Number url="...">.
    toLeg = settings.admin_bridge_phone;
    twimlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Connecting you to the client. Please wait while they choose a language.</Say>
  <Dial callerId="${callerId}" answerOnBridge="true" timeout="30">
    <Number url="${bridgeIvrUrl}" method="POST">${toNumber}</Number>
  </Dial>
</Response>`;
  } else {
    // Direct outbound to client — fetch TwiML from the bridge IVR function so
    // the client hears admin-uploaded Recording 1 (intro) + their name +
    // Recording 2 (IVR menu) instead of the default Twilio voice.
    toLeg = toNumber;
    urlContent = bridgeIvrUrl;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const formData = new URLSearchParams({
    To: toLeg,
    From: twilioNumber,
    StatusCallback: statusCallbackUrl,
    StatusCallbackMethod: 'POST',
  });
  if (twimlContent) {
    formData.set('Twiml', twimlContent);
  } else if (urlContent) {
    formData.set('Url', urlContent);
    formData.set('Method', 'POST');
  }
  // Twilio expects multiple StatusCallbackEvent values as repeated keys.
  formData.append('StatusCallbackEvent', 'initiated');
  formData.append('StatusCallbackEvent', 'ringing');
  formData.append('StatusCallbackEvent', 'answered');
  formData.append('StatusCallbackEvent', 'completed');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Twilio API error', response.status, errorText);
    let safeMessage = 'Call provider rejected the call request.';
    let twilioCode: number | undefined;

    try {
      const errorJson = JSON.parse(errorText);
      twilioCode = errorJson?.code;
      if (errorJson?.code === 21219) {
        safeMessage = 'This trial Twilio account can only call verified destination numbers. Verify the client number in Twilio or upgrade the account.';
      } else if (errorJson?.code === 21215 || errorJson?.code === 21408) {
        safeMessage = 'Twilio voice geo permissions are blocking this destination. Enable Ghana (+233) in Twilio voice geo permissions.';
      } else if (errorJson?.code === 21211 || errorJson?.code === 21214) {
        safeMessage = 'The destination phone number is not valid. Please check the number format.';
      } else if (errorJson?.message) {
        safeMessage = `Twilio: ${errorJson.message}`;
      }
    } catch {
      // Keep a generic user-safe message.
    }

    const err: any = new Error(safeMessage);
    err.twilioCode = twilioCode;
    throw err;
  }
  return await response.json();
}

// Input validation schema
const callRequestSchema = z.object({
  callId: z.string().uuid({ message: 'Invalid call ID format' }),
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize admin client (always needed for downstream queries)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Allow internal invocations (campaign-scheduler, retry jobs, etc.) that
    // present the service-role key. Otherwise require an authenticated user
    // with admin/super_admin/supervisor/agent role.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isInternalCall = !!serviceRoleKey && bearerToken === serviceRoleKey;

    if (!isInternalCall) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const hasPermission = roles?.some(r =>
        ['admin', 'super_admin', 'supervisor', 'agent'].includes(r.role)
      );

      if (!hasPermission) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Agent or admin role required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate input
    const requestBody = await req.json();
    const validationResult = callRequestSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { callId } = validationResult.data;

    // Get call details with client and campaign info
    const { data: callData, error: callError } = await supabaseAdmin
      .from('outbound_calls')
      .select(`
        *,
        clients (*),
        call_campaigns (*)
      `)
      .eq('id', callId)
      .single();

    if (callError) throw callError;
    if (!callData) throw new Error('Call not found');

    // Idempotency guard: refuse to redial a call that is already in flight or
    // already finished. Prevents the "double-click Execute Now" bug and lets
    // the campaign scheduler safely re-enqueue without duplicating Twilio legs.
    if (
      callData.twilio_call_sid ||
      ['in_progress', 'completed', 'dialing'].includes(callData.call_status)
    ) {
      console.log(`Skipping dial for ${callId}: already ${callData.call_status} sid=${callData.twilio_call_sid}`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Call already initiated', call_status: callData.call_status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Atomic claim: only one worker can flip pending->dialing. If 0 rows are
    // updated, another worker already took this call — bail out cleanly.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('outbound_calls')
      .update({ call_status: 'dialing' })
      .eq('id', callId)
      .is('twilio_call_sid', null)
      .not('call_status', 'in', '("in_progress","completed","dialing")')
      .select('id');
    if (claimErr) console.error('Claim update failed:', claimErr);
    if (!claimed || claimed.length === 0) {
      console.log(`Claim race lost for ${callId} — another worker is dialing it.`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Already claimed by another worker' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const client = callData.clients;
    const campaign = callData.call_campaigns;

    // Helper to format date as Month Year, e.g. "April 2026"
    const fmtMonthYear = (val?: string | null): string => {
      if (!val) return 'N/A';
      try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return val;
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } catch { return val; }
    };

    // Replace placeholders in script
    let script = campaign.script;
    script = script.replace(/\{\{premium_amount\}\}/g, client.premium_amount?.toString() || '0');
    script = script.replace(/\{\{due_date\}\}/g, fmtMonthYear(client.premium_due_date));
    script = script.replace(/\{\{client_name\}\}/g, client.name || 'valued customer');
    script = script.replace(/\{\{policy_number\}\}/g, client.policy_number || 'your policy');
    script = script.replace(/\{\{product_type\}\}/g, client.product_type || 'your policy type');

    console.log('Making phone call for:', {
      clientName: client.name,
      phone: callData.phone_number,
      campaignType: campaign.type,
      script: script
    });

    // Load runtime call settings (caller-id + dial-me-first config)
    const { data: settingsRow } = await supabaseAdmin
      .from('system_settings')
      .select('default_caller_id, dial_me_first_enabled, admin_bridge_phone')
      .limit(1)
      .maybeSingle();
    const settings: CallSettings = {
      default_caller_id: settingsRow?.default_caller_id || Deno.env.get('TWILIO_PHONE_NUMBER') || '+233246052499',
      dial_me_first_enabled: settingsRow?.dial_me_first_enabled ?? false,
      admin_bridge_phone: settingsRow?.admin_bridge_phone || '',
    };

    // Load Twilio credentials from app_secrets (admin-managed), fallback to env
    const { data: secretRows } = await supabaseAdmin
      .from('app_secrets')
      .select('key, value')
      .in('key', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']);
    const secretMap = new Map((secretRows || []).map((r: any) => [r.key, r.value]));
    const creds = {
      sid: secretMap.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_ACCOUNT_SID') || '',
      token: secretMap.get('TWILIO_AUTH_TOKEN') || Deno.env.get('TWILIO_AUTH_TOKEN') || '',
      phone: secretMap.get('TWILIO_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER') || '',
    };

    // Normalize phone numbers to E.164 before handing to Twilio
    const normalizedTo = normalizePhone(callData.phone_number);
    if (settings.admin_bridge_phone) {
      settings.admin_bridge_phone = normalizePhone(settings.admin_bridge_phone);
    }
    if (settings.default_caller_id) {
      settings.default_caller_id = normalizePhone(settings.default_caller_id);
    }
    creds.phone = creds.phone ? normalizePhone(creds.phone) : creds.phone;

    // Make actual phone call using Twilio
    let twilioResult;
    try {
      twilioResult = await makePhoneCall(normalizedTo, script, campaign, settings, creds);
      console.log('Twilio call initiated:', twilioResult);
      if (twilioResult && twilioResult.sid) {
        const { error: updErr } = await supabaseAdmin
          .from('outbound_calls')
          .update({
            call_status: 'in_progress',
            twilio_call_sid: twilioResult.sid,
            started_at: new Date().toISOString(),
            ended_at: null,
            outcome: null,
            call_duration: null,
            notes: `CallSid: ${twilioResult.sid}`
          })
          .eq('id', callId);
        if (updErr) console.error('Failed to update outbound_calls after Twilio queue:', updErr);
      }
    } catch (twilioError) {
      console.error('Twilio call failed:', twilioError);
      const safeError = twilioError instanceof Error ? twilioError.message : 'Call could not be started. Please check the phone number and call settings.';
      await supabaseAdmin
        .from('outbound_calls')
        .update({
          call_status: 'failed',
          outcome: 'call_failed',
          ended_at: new Date().toISOString(),
          notes: safeError,
        })
        .eq('id', callId);

      return new Response(
        JSON.stringify({ success: false, error: safeError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        callSid: twilioResult?.sid,
        status: twilioResult?.status || 'queued',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

    // Use Google Cloud Gemini API to simulate realistic call outcome
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${Deno.env.get('GOOGLE_CLOUD_API_KEY')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are simulating the outcome of a real phone call that was made to a client. ${twilioResult ? 'The call was successfully initiated via Twilio.' : 'The call could not be initiated due to technical issues.'} Respond with a JSON object containing:
                - outcome: one of 'payment_agreed', 'appointment_scheduled', 'callback_requested', 'refused', 'no_response'
                - duration: call duration in seconds (30-300)
                - notes: brief summary of the conversation  
                - payment_link: if payment_agreed, include a mock payment link
                
                Be realistic - not every call will result in success.
                
                Client: ${client.name}, Phone: ${callData.phone_number}, Campaign: ${campaign.type}, Script: ${script}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      }),
    });

    if (!geminiResponse.ok) {
      throw new Error(`Google Cloud API error: ${await geminiResponse.text()}`);
    }

    const aiResult = await geminiResponse.json();
    const aiResponse = aiResult.candidates[0].content.parts[0].text;
    
    // Parse AI response (try to extract JSON)
    let callOutcome;
    try {
      callOutcome = JSON.parse(aiResponse);
    } catch {
      // Fallback if AI doesn't return valid JSON
      callOutcome = {
        outcome: Math.random() > 0.6 ? 'payment_agreed' : 'callback_requested',
        duration: Math.floor(Math.random() * 240) + 60,
        notes: 'AI call completed',
        payment_link: Math.random() > 0.6 ? 'https://payment.example.com/pay/12345' : null
      };
    }

    // Update call record with results
    const { error: updateError } = await supabaseAdmin
      .from('outbound_calls')
      .update({
        call_status: 'completed',
        outcome: callOutcome.outcome,
        call_duration: callOutcome.duration,
        notes: callOutcome.notes,
        payment_link: callOutcome.payment_link,
        ended_at: new Date().toISOString(),
      })
      .eq('id', callId);

    if (updateError) throw updateError;

    // If payment was agreed and it's a premium call, potentially update client status
    if (callOutcome.outcome === 'payment_agreed' && campaign.type === 'premium_reminder') {
      await supabaseAdmin
        .from('clients')
        .update({
          payment_status: 'current',
          last_payment_date: new Date().toISOString().split('T')[0]
        })
        .eq('id', client.id);
    }

    // If appointment was scheduled and it's a medical call, use appointment scheduler
    if (callOutcome.outcome === 'appointment_scheduled' && campaign.type === 'medical_booking') {
      try {
        // Check if appointment already exists for this call to prevent duplicates
        const { data: existingAppointment } = await supabaseAdmin
          .from('medical_appointments')
          .select('*')
          .eq('client_id', client.id)
          .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Created in last 60 seconds
          .maybeSingle();

        if (existingAppointment) {
          console.log('Appointment already exists for this call, skipping duplicate creation');
        } else {
          // Extract availability from AI response (expecting dates in notes or separate field)
          const availabilityMatch = callOutcome.notes?.match(/available[:\s]+([^.]+)/i);
          const clientAvailability = availabilityMatch ? availabilityMatch[1].split(',').map(d => d.trim()) : [];
          
          // Call appointment scheduler
          const appointmentResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/appointment-scheduler`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              callId: callId,
              clientAvailability: clientAvailability,
              appointmentType: 'General Consultation',
              medicalCenter: 'DCK Medical Center'
            })
          });

          if (!appointmentResponse.ok) {
            console.error('Failed to schedule appointment:', await appointmentResponse.text());
          } else {
            const appointmentResult = await appointmentResponse.json();
            console.log('Appointment scheduled successfully:', appointmentResult);
          }
        }
      } catch (appointmentError) {
        console.error('Error scheduling appointment:', appointmentError);
      }
    }

    console.log('Call completed:', {
      callId,
      outcome: callOutcome.outcome,
      duration: callOutcome.duration
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        outcome: callOutcome.outcome,
        duration: callOutcome.duration,
        notes: callOutcome.notes
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in AI voice call:', error);
    const humanMessage = error instanceof Error && error.message
      ? error.message
      : 'We could not start this call right now. Please try again in a moment, or contact your administrator if it keeps happening.';

    return new Response(
      JSON.stringify({
        success: false,
        error: humanMessage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});