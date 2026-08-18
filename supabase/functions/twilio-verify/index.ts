import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const result: any = { ok: false, checks: [], message: "" };

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    // Admin-only: validate JWT and role
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, message: 'Unauthorized', checks: [] }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    );
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ ok: false, message: 'Unauthorized', checks: [] }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: claimsData.claims.sub });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, message: 'Forbidden', checks: [] }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }



    const { data: rows } = await admin
      .from('app_secrets')
      .select('key,value')
      .in('key', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']);

    const map = new Map((rows || []).map((r: any) => [r.key, r.value]));
    const sid = (map.get('TWILIO_ACCOUNT_SID') || Deno.env.get('TWILIO_ACCOUNT_SID') || '').trim();
    const token = (map.get('TWILIO_AUTH_TOKEN') || Deno.env.get('TWILIO_AUTH_TOKEN') || '').trim();
    const phone = (map.get('TWILIO_PHONE_NUMBER') || Deno.env.get('TWILIO_PHONE_NUMBER') || '').trim();

    // Check 1: SID present and well-formed
    if (!sid) {
      result.checks.push({ name: 'Account SID', status: 'fail', detail: 'Not set. Add it under Application Secrets.' });
    } else if (!sid.startsWith('AC') || sid.length !== 34) {
      result.checks.push({ name: 'Account SID', status: 'fail', detail: 'Looks invalid. A Twilio Account SID starts with "AC" and is 34 characters long.' });
    } else {
      result.checks.push({ name: 'Account SID', status: 'pass', detail: `Detected ${sid.slice(0, 6)}…${sid.slice(-4)}` });
    }

    // Check 2: Token present
    if (!token) {
      result.checks.push({ name: 'Auth Token', status: 'fail', detail: 'Not set. Add it under Application Secrets.' });
    } else if (token.length < 30) {
      result.checks.push({ name: 'Auth Token', status: 'warn', detail: 'Token seems shorter than expected.' });
    } else {
      result.checks.push({ name: 'Auth Token', status: 'pass', detail: 'Present.' });
    }

    // Check 3: Phone number
    if (!phone) {
      result.checks.push({ name: 'From Phone Number', status: 'fail', detail: 'Not set. Add a Twilio phone number in E.164 format (e.g. +15558675310).' });
    } else if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      result.checks.push({ name: 'From Phone Number', status: 'fail', detail: `"${phone}" is not in E.164 format. Use a leading + and country code.` });
    } else {
      result.checks.push({ name: 'From Phone Number', status: 'pass', detail: phone });
    }

    // Check 4: Live Twilio API call (only if SID + token present)
    if (sid && token) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
          headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` },
        });
        const body = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch {}

        if (r.status === 200 && parsed) {
          result.checks.push({
            name: 'Twilio Account Status',
            status: parsed.status === 'active' ? 'pass' : 'warn',
            detail: `Account "${parsed.friendly_name}" is ${parsed.status} (${parsed.type}).`,
          });
        } else if (r.status === 401) {
          result.checks.push({ name: 'Twilio Authentication', status: 'fail', detail: 'Twilio rejected the credentials. Double-check the Account SID and Auth Token.' });
        } else {
          result.checks.push({ name: 'Twilio Authentication', status: 'fail', detail: `Twilio responded with status ${r.status}. ${parsed?.message || ''}`.trim() });
        }
      } catch (e: any) {
        result.checks.push({ name: 'Twilio Authentication', status: 'fail', detail: `Could not reach Twilio: ${e.message}` });
      }

      // Check 5: Verify the From number belongs to this account
      if (phone && /^\+[1-9]\d{6,14}$/.test(phone)) {
        try {
          const r = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}`,
            { headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}` } },
          );
          if (r.status === 200) {
            const j = await r.json();
            if (Array.isArray(j.incoming_phone_numbers) && j.incoming_phone_numbers.length > 0) {
              result.checks.push({ name: 'From Number Ownership', status: 'pass', detail: `${phone} is registered on this Twilio account.` });
            } else {
              result.checks.push({ name: 'From Number Ownership', status: 'fail', detail: `${phone} is not an active Twilio number on this account. Buy or verify it in Twilio first.` });
            }
          } else {
            result.checks.push({ name: 'From Number Ownership', status: 'warn', detail: `Could not confirm number ownership (status ${r.status}).` });
          }
        } catch (e: any) {
          result.checks.push({ name: 'From Number Ownership', status: 'warn', detail: `Could not confirm number ownership: ${e.message}` });
        }
      }
    }

    const hasFail = result.checks.some((c: any) => c.status === 'fail');
    result.ok = !hasFail;
    result.message = result.ok
      ? 'Twilio is configured correctly and ready to place calls.'
      : 'Twilio setup has issues. Please review the failed checks below.';

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: 'We could not run the verification right now. Please try again in a moment.',
        checks: [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
