import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FINAL_STATUSES = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);

// Reconciles outbound_calls rows that look stuck (in_progress) by querying
// Twilio for the real call status and updating the row. Safety net for any
// missed status webhooks.
//
// Two invocation modes:
//   1. Admin user (Authorization: Bearer <user-jwt>) — for manual trigger
//      from the dashboard. Must be a real authenticated user.
//   2. Scheduled cron (x-cron-secret: <CRON_SECRET>) — invoked hourly by
//      pg_cron. No user context required.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // --- AuthN: accept either cron secret OR a valid user JWT ---
    // Cron secret can be set in env or in the app_secrets table via the UI.
    let cronSecret = Deno.env.get('CRON_SECRET') || '';
    if (!cronSecret) {
      const tmp = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const { data: row } = await tmp
        .from('app_secrets').select('value').eq('key', 'CRON_SECRET').maybeSingle();
      cronSecret = (row as any)?.value ?? '';
    }
    const providedCronSecret = req.headers.get('x-cron-secret') || '';
    const isCron = cronSecret && providedCronSecret && providedCronSecret === cronSecret;

    if (!isCron) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Load Twilio creds: app_secrets first, then env fallback.
    const { data: secretRows } = await supabaseAdmin
      .from('app_secrets')
      .select('key, value')
      .in('key', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
    const secretMap = new Map((secretRows || []).map((r: any) => [r.key, r.value]));
    const sid = (secretMap.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_ACCOUNT_SID') || '').trim();
    const token = (secretMap.get('TWILIO_AUTH_TOKEN') || Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim();
    if (!sid || !token) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const auth = `Basic ${btoa(`${sid}:${token}`)}`;

    // Pull in_progress AND dialing calls older than 2 minutes (still within 24h).
    // 2-minute floor avoids racing with the dialer.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const olderThan = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stuck } = await supabaseAdmin
      .from('outbound_calls')
      .select('id, twilio_call_sid, started_at')
      .in('call_status', ['in_progress', 'dialing'])
      .not('twilio_call_sid', 'is', null)
      .gte('created_at', since)
      .lte('created_at', olderThan)
      .limit(200);

    let reconciled = 0;
    for (const row of stuck ?? []) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${row.twilio_call_sid}.json`, {
          headers: { Authorization: auth },
        });
        if (!r.ok) continue;
        const c = await r.json();
        const status: string = c.status;
        if (!FINAL_STATUSES.has(status)) continue;

        const update: Record<string, unknown> = {
          call_status: status === 'completed' ? 'completed' : 'failed',
          outcome: status === 'completed' ? 'completed' : status.replace('-', '_'),
          ended_at: c.end_time || new Date().toISOString(),
          call_duration: Number(c.duration) || 0,
          notes: `Reconciled from Twilio: ${status}`,
        };
        await supabaseAdmin.from('outbound_calls').update(update).eq('id', row.id);
        reconciled++;
      } catch (e) {
        console.error('Reconcile error for', row.twilio_call_sid, e);
      }
    }

    return new Response(JSON.stringify({ success: true, mode: isCron ? 'cron' : 'user', checked: stuck?.length ?? 0, reconciled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('reconcile-call-status error', e);
    return new Response(JSON.stringify({ error: 'Reconcile failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
