// Enqueue a campaign run: normalize every client phone via libphonenumber-js
// and insert one campaign_jobs row per client. Creates a campaign_runs row
// and returns its id so the UI can subscribe to progress.
//
// Hardening: per-user rate limit (10/min), Idempotency-Key support, audit log.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { normalizePhoneE164, isE164 } from "../_shared/phone.ts";
import { rateLimit } from "../_shared/rate-limit.ts";
import { beginIdempotency } from "../_shared/idempotency.ts";
import { logAudit } from "../_shared/audit.ts";
import { withMonitoring, recordMetric } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
};

const BodySchema = z.object({
  campaign_id: z.string().uuid(),
  client_ids: z.array(z.string().uuid()).optional(),
  rate_limit_per_minute: z.number().int().min(1).max(600).default(30),
  concurrency: z.number().int().min(1).max(50).default(5),
  max_attempts: z.number().int().min(1).max(10).default(3),
});

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: require admin/supervisor caller.
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData } = await supabase.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Unauthorized" }, 401);
  const { data: isAdminRow } = await supabase.rpc("is_supervisor_or_admin", { _user_id: uid });
  if (!isAdminRow) return json({ error: "Forbidden" }, 403);

  // Rate limit: 10 enqueues per minute per user.
  const rl = await rateLimit(
    { key: `campaign-enqueue:${uid}`, limit: 10, windowSeconds: 60 },
    corsHeaders,
  );
  if (!rl.allowed) return rl.response!;

  // Idempotency (optional but recommended). Clients should send a stable key
  // like sha256(campaign_id + sorted client_ids) to make retries safe.
  const idem = await beginIdempotency(req, "campaign-enqueue", corsHeaders);
  if (idem.replay) return idem.replay;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { campaign_id, client_ids, rate_limit_per_minute, concurrency, max_attempts } = parsed.data;

  // Pull clients (either the explicit set, or every client mapped to this campaign).
  let clientsQ = supabase.from("clients").select("id, phone");
  if (client_ids?.length) {
    clientsQ = clientsQ.in("id", client_ids);
  } else {
    const { data: mapped } = await supabase
      .from("campaign_clients")
      .select("client_id")
      .eq("campaign_id", campaign_id);
    const ids = (mapped ?? []).map((r: any) => r.client_id).filter(Boolean);
    if (!ids.length) return json({ error: "No clients linked to this campaign" }, 400);
    clientsQ = clientsQ.in("id", ids);
  }
  const { data: clients, error: clientsErr } = await clientsQ;
  if (clientsErr) return json({ error: "Failed to load clients" }, 500);

  const rows: any[] = [];
  let invalid = 0;
  const invalidIds: string[] = [];
  for (const c of clients ?? []) {
    const e164 = normalizePhoneE164(c.phone);
    if (!isE164(e164)) {
      invalid++;
      invalidIds.push(c.id);
      continue;
    }
    rows.push({
      campaign_id,
      client_id: c.id,
      phone_e164: e164,
      max_attempts,
    });
  }
  if (!rows.length) {
    return json({ error: "No valid phone numbers to enqueue", invalid, invalid_client_ids: invalidIds.slice(0, 20) }, 422);
  }

  const { data: run, error: runErr } = await supabase
    .from("campaign_runs")
    .insert({
      campaign_id,
      rate_limit_per_minute,
      concurrency,
      total: rows.length,
      created_by: uid,
    })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: "Failed to create campaign run" }, 500);

  const tagged = rows.map((r) => ({ ...r, run_id: run.id }));
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < tagged.length; i += CHUNK) {
    const chunk = tagged.slice(i, i + CHUNK);
    const { error: insErr, count } = await supabase
      .from("campaign_jobs")
      .insert(chunk, { count: "exact" })
      .select("id", { count: "exact", head: true });
    if (insErr) {
      for (const row of chunk) {
        const { error: e1 } = await supabase.from("campaign_jobs").insert(row);
        if (!e1) inserted++;
      }
    } else {
      inserted += count ?? chunk.length;
    }
  }

  const responseBody = { run_id: run.id, enqueued: inserted, invalid };
  await idem.store(responseBody);
  await logAudit(req, {
    action: "campaign.enqueue",
    targetTable: "campaign_runs",
    targetId: run.id,
    actorUserId: uid,
    metadata: { campaign_id, enqueued: inserted, invalid },
  });
  await recordMetric("campaign_enqueue.jobs", inserted, { campaign_id });

  return json(responseBody);

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(withMonitoring("campaign-enqueue", handler, corsHeaders));
