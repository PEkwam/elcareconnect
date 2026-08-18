import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claimsData?.claims?.sub) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: ok } = await admin.rpc('is_supervisor_or_admin', { _user_id: claimsData.claims.sub });
    if (!ok) return json({ error: 'Forbidden' }, 403);

    const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const token = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    if (!sid || !token) return json({ error: 'Twilio not configured' }, 500);
    const auth = `Basic ${btoa(`${sid}:${token}`)}`;

    const callsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=10`,
      { headers: { Authorization: auth } },
    );
    const calls = await callsRes.json();

    const summarized = (calls.calls || []).map((c: any) => ({
      sid: c.sid,
      parent_call_sid: c.parent_call_sid,
      to: c.to,
      from: c.from,
      status: c.status,
      direction: c.direction,
      duration: c.duration,
      start_time: c.start_time,
      end_time: c.end_time,
      price: c.price,
    }));

    const latest = summarized[0];
    let notifications: any[] = [];
    if (latest?.sid) {
      const notifRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${latest.sid}/Notifications.json?PageSize=20`,
        { headers: { Authorization: auth } },
      );
      const nj = await notifRes.json();
      notifications = (nj.notifications || []).map((n: any) => ({
        error_code: n.error_code,
        message_text: n.message_text,
        log: n.log,
        message_date: n.message_date,
      }));
    }

    return new Response(
      JSON.stringify({ calls: summarized, latest_notifications: notifications }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('twilio-recent-calls error', e);
    return json({ error: 'An unexpected error occurred.' }, 500);
  }
});
