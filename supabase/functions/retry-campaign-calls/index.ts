import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours
const RETRY_STATUSES = new Set(["failed", "no-answer", "busy", "canceled"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    let body: { campaign_id?: string; client_ids?: string[] } = {};
    try { body = await req.json(); } catch { /* allow empty body for cron */ }
    const { campaign_id, client_ids } = body;

    // Require either a valid CRON_SECRET (for scheduled runs) or an authenticated staff JWT.
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const providedCron = req.headers.get("x-cron-secret") ?? "";
    const hasCron = !!cronSecret && providedCron === cronSecret;

    if (!hasCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: ok } = await supabaseAdmin.rpc("is_staff", { _user_id: user.id });
      if (!ok) return json({ error: "Forbidden" }, 403);
    }


    // Pick campaigns to scan
    const campQ = supabaseAdmin
      .from("call_campaigns")
      .select("id, name, is_active");
    const { data: campaigns } = campaign_id
      ? await campQ.eq("id", campaign_id)
      : await campQ.eq("is_active", true);

    if (!campaigns?.length) return json({ queued: 0, scanned: 0 });

    let queued = 0;
    const createdCallIds: string[] = [];

    for (const camp of campaigns) {
      let callQ = supabaseAdmin
        .from("outbound_calls")
        .select("id, client_id, phone_number, call_status, created_at")
        .eq("campaign_id", camp.id)
        .not("client_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (client_ids?.length) callQ = callQ.in("client_id", client_ids);
      const { data: rows } = await callQ;
      if (!rows?.length) continue;

      // Group by client_id
      const byClient = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = r.client_id as string;
        const arr = byClient.get(k) ?? [];
        arr.push(r);
        byClient.set(k, arr);
      }

      const newCalls: Array<{ client_id: string; campaign_id: string; phone_number: string; call_status: string; scheduled_at: string }> = [];

      for (const [clientId, history] of byClient) {
        if (history.length >= MAX_ATTEMPTS) continue;
        if (history.some((h) => h.call_status === "completed")) continue;
        // Skip if any attempt is currently in flight
        if (history.some((h) => ["scheduled", "in-progress", "ringing", "queued"].includes(h.call_status || ""))) continue;
        const latest = history[0];
        if (!latest) continue;
        if (!RETRY_STATUSES.has(latest.call_status || "")) continue;
        const ageMs = Date.now() - new Date(latest.created_at).getTime();
        if (ageMs < MIN_GAP_MS) continue;
        if (!latest.phone_number) continue;

        newCalls.push({
          client_id: clientId,
          campaign_id: camp.id,
          phone_number: latest.phone_number,
          call_status: "scheduled",
          scheduled_at: new Date().toISOString(),
        });
      }

      if (!newCalls.length) continue;

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("outbound_calls")
        .insert(newCalls)
        .select("id");
      if (insErr) {
        console.error("retry insert failed", insErr.message);
        continue;
      }
      queued += inserted?.length || 0;
      inserted?.forEach((c) => createdCallIds.push(c.id));
    }

    // Fire AI voice calls in the background
    for (const callId of createdCallIds) {
      EdgeRuntime.waitUntil(
        fetch(`${supabaseUrl}/functions/v1/ai-voice-call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ callId }),
        }).catch((e) => console.error("ai-voice-call dispatch failed", e?.message)),
      );
    }

    return json({ queued, scanned: campaigns.length });
  } catch (e) {
    console.error("retry-campaign-calls error", (e as Error)?.message);
    return json({ error: "Retry failed" }, 500);
  }
});
