import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Drainer for outbound_call_events. Intended to be invoked on a short cron
// (every 5-10s) or manually. Authorized via CRON_SECRET header or service-role JWT.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const provided = req.headers.get('x-cron-secret') ?? '';
    const authHeader = req.headers.get('authorization') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isService = !!serviceRoleKey && authHeader.trim() === `Bearer ${serviceRoleKey}`;

    if (!isService && (!cronSecret || provided !== cronSecret)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    let totalProcessed = 0;
    // Drain in batches until nothing left or we hit a safety cap
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabaseAdmin.rpc('process_outbound_call_events', { _limit: 500 });
      if (error) {
        console.error('Drainer error:', error);
        return new Response(JSON.stringify({ success: false, error: 'Drainer failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const n = Number(data ?? 0);
      totalProcessed += n;
      if (n < 500) break;
    }

    return new Response(JSON.stringify({ success: true, processed: totalProcessed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('process-call-events fatal:', e);
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
