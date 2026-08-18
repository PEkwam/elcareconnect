// Pause / resume / cancel / retry-failed a campaign_run. Admin-only.
// Hardening: per-user rate limit, audit log, monitoring.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { logAudit } from "../_shared/audit.ts";
import { withMonitoring } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
};

const BodySchema = z.object({
  run_id: z.string().uuid(),
  action: z.enum(["pause", "resume", "cancel", "retry_failed"]),
});

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return j({ error: "Unauthorized" }, 401);
  const { data: u } = await supabase.auth.getUser(jwt);
  const uid = u?.user?.id;
  if (!uid) return j({ error: "Unauthorized" }, 401);
  const { data: ok } = await supabase.rpc("is_admin", { _user_id: uid });
  if (!ok) return j({ error: "Forbidden" }, 403);

  const rl = await rateLimit({ key: `campaign-control:${uid}`, limit: 60, windowSeconds: 60 }, corsHeaders);
  if (!rl.allowed) return rl.response!;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return j({ error: parsed.error.flatten() }, 400);
  const { run_id, action } = parsed.data;

  const { data: run } = await supabase
    .from("campaign_runs")
    .select("id, campaign_id, state")
    .eq("id", run_id)
    .single();
  if (!run) return j({ error: "Run not found" }, 404);

  if (action === "pause") {
    await supabase.from("campaign_runs").update({ state: "paused" }).eq("id", run_id);
  } else if (action === "resume") {
    await supabase.from("campaign_runs").update({ state: "running" }).eq("id", run_id);
  } else if (action === "cancel") {
    await supabase.from("campaign_runs")
      .update({ state: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", run_id);
    await supabase.from("campaign_jobs")
      .update({ state: "cancelled" })
      .eq("campaign_id", run.campaign_id)
      .in("state", ["queued"]);
  } else if (action === "retry_failed") {
    await supabase.from("campaign_jobs")
      .update({ state: "queued", attempts: 0, last_error: null, scheduled_for: new Date().toISOString() })
      .eq("campaign_id", run.campaign_id)
      .eq("state", "failed");
    await supabase.from("campaign_runs").update({ state: "running", finished_at: null }).eq("id", run_id);
  }

  await logAudit(req, {
    action: `campaign.${action}`,
    targetTable: "campaign_runs",
    targetId: run_id,
    actorUserId: uid,
    metadata: { campaign_id: run.campaign_id, prior_state: run.state },
  });

  return j({ ok: true });

  function j(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

serve(withMonitoring("campaign-control", handler, corsHeaders));
