// Cron-driven worker. Each invocation:
//   1. reaps expired locks,
//   2. for each running campaign run, claims a bounded batch of jobs
//      (respecting per-campaign rate limit + concurrency),
//   3. for each claimed job, creates an outbound_calls row and invokes
//      ai-voice-call. Success/failure updates the job state with exponential
//      backoff on retry; max_attempts trips it to 'failed'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isE164 } from "../_shared/phone.ts";
import { recordMetric, recordError } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const BACKOFF_SECS = [30, 120, 600, 1800]; // 30s, 2m, 10m, 30m

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Auth: accept CRON_SECRET header (from env OR app_secrets table) or service-role JWT.
  const incoming = req.headers.get("x-cron-secret");
  const auth = req.headers.get("Authorization") || "";
  let cronSecret = Deno.env.get("CRON_SECRET") || "";
  if (!cronSecret) {
    const { data: row } = await supabase
      .from("app_secrets").select("value").eq("key", "CRON_SECRET").maybeSingle();
    cronSecret = (row as any)?.value ?? "";
  }
  const okBySecret = cronSecret && incoming === cronSecret;
  const okByService = auth === `Bearer ${serviceKey}`;
  if (!okBySecret && !okByService) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const workerId = `w-${crypto.randomUUID().slice(0, 8)}`;
  const stats = { processed: 0, succeeded: 0, retried: 0, failed: 0 };

  // The cron fires once a minute, so a single batch per tick capped throughput
  // at `concurrency` calls/minute. Instead we run repeated bounded passes for
  // most of the minute, always re-checking the per-campaign rate budget.
  const DEADLINE = Date.now() + 50_000;
  const MAX_PASSES = 20;

  try {
    // 1. Release expired locks first.
    await supabase.rpc("reap_campaign_jobs");

    for (let pass = 0; pass < MAX_PASSES && Date.now() < DEADLINE; pass++) {
      // 2. Iterate running campaign runs.
      const { data: runs } = await supabase
        .from("campaign_runs")
        .select("id, campaign_id, rate_limit_per_minute, concurrency, total, completed, failed")
        .eq("state", "running");

      if (!runs || runs.length === 0) break;

      let dispatchedThisPass = 0;

      for (const run of runs) {
        if (Date.now() >= DEADLINE) break;
        // Rate-limit gate: count calls dispatched in the last 60s for this campaign.
        const since = new Date(Date.now() - 60_000).toISOString();
        const { count: recent } = await supabase
          .from("campaign_jobs")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", run.campaign_id)
          .gte("updated_at", since)
          .in("state", ["active", "completed"]);
        const budget = Math.max(0, (run.rate_limit_per_minute ?? 30) - (recent ?? 0));
        const batch = Math.min(run.concurrency ?? 5, budget);
        if (batch <= 0) continue;

        // 3. Claim and dispatch.
        const { data: claimed } = await supabase.rpc("claim_campaign_jobs", {
          _worker: workerId,
          _limit: batch,
          _lock_seconds: 180,
          _campaign: run.campaign_id,
        });

        if (!claimed || claimed.length === 0) continue;
        dispatchedThisPass += claimed.length;

        await Promise.all(
          claimed.map((job: any) => dispatch(supabase, job, stats)),
        );
      }

      // Nothing claimable (queue drained or every campaign rate-capped) —
      // pause briefly so we don't spin the database for the rest of the tick.
      if (dispatchedThisPass === 0) {
        if (Date.now() + 5_000 >= DEADLINE) break;
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }



    // 4. Mark finished runs.
    const { data: openRuns } = await supabase
      .from("campaign_runs")
      .select("id, campaign_id")
      .eq("state", "running");
    for (const r of openRuns ?? []) {
      const { count: remaining } = await supabase
        .from("campaign_jobs")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", r.campaign_id)
        .in("state", ["queued", "active"]);
      if ((remaining ?? 0) === 0) {
        await supabase
          .from("campaign_runs")
          .update({ state: "completed", finished_at: new Date().toISOString() })
          .eq("id", r.id);
      }
    }
  } catch (err) {
    console.error("campaign-worker error:", err);
    await recordError("campaign-worker", err, { workerId });
  }

  // Per-tick metrics for monitoring dashboards/alerts.
  await Promise.all([
    recordMetric("campaign_worker.jobs_processed", stats.processed, { workerId }),
    recordMetric("campaign_worker.jobs_succeeded", stats.succeeded, { workerId }),
    recordMetric("campaign_worker.jobs_retried", stats.retried, { workerId }),
    recordMetric("campaign_worker.jobs_failed", stats.failed, { workerId }),
  ]);

  return new Response(JSON.stringify({ worker: workerId, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function dispatch(supabase: any, job: any, stats: any) {
  stats.processed++;
  try {
    // Reject jobs whose phone number is not a valid E.164 — never let bad
    // numbers reach Twilio (avoids paid-error feedback loop).
    if (!isE164(job.phone_e164)) {
      throw new Error(`invalid_phone:${job.phone_e164 ?? ""}`);
    }
    // Create the outbound_calls row that ai-voice-call expects.
    const { data: call, error: callErr } = await supabase
      .from("outbound_calls")
      .insert({
        client_id: job.client_id,
        campaign_id: job.campaign_id,
        phone_number: job.phone_e164,
        call_status: "scheduled",
      })
      .select("id")
      .single();
    if (callErr || !call) throw new Error(callErr?.message || "insert failed");

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-voice-call`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ callId: call.id }),
    });
    if (!res.ok) throw new Error(`ai-voice-call ${res.status}`);

    await supabase
      .from("campaign_jobs")
      .update({
        state: "completed",
        call_sid: call.id,
        locked_until: null,
        locked_by: null,
        last_error: null,
      })
      .eq("id", job.id);

    await supabase
      .from("campaign_runs")
      .update({ completed: (await runCount(supabase, job.campaign_id, "completed")) })
      .eq("campaign_id", job.campaign_id)
      .eq("state", "running");

    stats.succeeded++;
  } catch (err: any) {
    const msg = String(err?.message || err).slice(0, 500);
    const attempts = job.attempts ?? 1;
    const maxAttempts = job.max_attempts ?? 3;
    if (attempts < maxAttempts) {
      const delay = BACKOFF_SECS[Math.min(attempts - 1, BACKOFF_SECS.length - 1)];
      await supabase
        .from("campaign_jobs")
        .update({
          state: "queued",
          scheduled_for: new Date(Date.now() + delay * 1000).toISOString(),
          locked_until: null,
          locked_by: null,
          last_error: msg,
        })
        .eq("id", job.id);
      stats.retried++;
    } else {
      await supabase
        .from("campaign_jobs")
        .update({
          state: "failed",
          locked_until: null,
          locked_by: null,
          last_error: msg,
        })
        .eq("id", job.id);
      await supabase
        .from("campaign_runs")
        .update({ failed: (await runCount(supabase, job.campaign_id, "failed")) })
        .eq("campaign_id", job.campaign_id)
        .eq("state", "running");
      stats.failed++;
    }
  }
}

async function runCount(supabase: any, campaign_id: string, state: string) {
  const { count } = await supabase
    .from("campaign_jobs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign_id)
    .eq("state", state);
  return count ?? 0;
}
