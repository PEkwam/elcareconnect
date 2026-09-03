import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyTwilioRequest } from "../_shared/twilio-verify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verify = await verifyTwilioRequest(req, 'ai-voice-call-status', corsHeaders);
    if (!verify.ok) return verify.response!;
    const params = verify.params;

    const callSid = params.CallSid || '';
    const callStatus = params.CallStatus || '';
    const callDuration = Number(params.CallDuration || 0);
    const to = params.To || '';
    const from = params.From || '';
    const parentCallSid = params.ParentCallSid || '';

    if (!callSid || !callStatus) {
      return new Response('Missing callback data', { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Append-only insert: no UPDATE contention on outbound_calls.
    // A background drainer (process-call-events) folds these into outbound_calls.
    const { error } = await supabaseAdmin
      .from('outbound_call_events')
      .insert({
        call_sid: callSid,
        parent_sid: parentCallSid || null,
        to_number: to || null,
        from_number: from || null,
        call_status: callStatus,
        duration: Number.isFinite(callDuration) ? callDuration : null,
        raw: params,
      });

    if (error) {
      console.error('Failed to enqueue call event:', error);
      return new Response(JSON.stringify({ success: false, error: 'Unable to enqueue event' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Apply immediately instead of waiting for the cron drain, so the UI
    // reflects completed / no-answer / busy / failed within the same request.
    let applied = false;
    try {
      const { error: drainErr } = await supabaseAdmin.rpc('process_outbound_call_events', { _limit: 200 });
      applied = !drainErr;
      if (drainErr) console.error('Inline drain failed (cron will retry):', drainErr);
    } catch (e) {
      console.error('Inline drain threw (cron will retry):', e);
    }

    return new Response(JSON.stringify({ success: true, queued: true, applied }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error handling Twilio status callback:', error);
    return new Response(JSON.stringify({ success: false, error: 'Unable to process status callback' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
