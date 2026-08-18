// GDPR data-export endpoint
// Returns every row in the project's database tied to the calling user.
// Auth: requires a valid Supabase JWT. Uses service-role internally so
// it can read user_roles / agent_* tables, but only returns rows that
// reference the caller's user_id or email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { rateLimit } from "../_shared/rate-limit.ts";
import { logAudit } from "../_shared/audit.ts";
import { withMonitoring } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Verify the caller.
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;
    const email = userData.user.email ?? "";

    // Rate limit: 3 exports per hour per user.
    const rl = await rateLimit(
      { key: `gdpr-export:${uid}`, limit: 3, windowSeconds: 3600 },
      corsHeaders,
    );
    if (!rl.allowed) return rl.response!;

    const admin = createClient(SUPABASE_URL, SERVICE);
    await logAudit(req, {
      action: "gdpr.export",
      targetTable: "auth.users",
      targetId: uid,
      actorUserId: uid,
    });

    // Helper – swallow per-table errors so one missing table doesn't kill the export.
    const safe = async (label: string, q: Promise<any>) => {
      try { const { data } = await q; return { [label]: data ?? [] }; }
      catch { return { [label]: [] }; }
    };

    const parts = await Promise.all([
      safe("auth_user", Promise.resolve({ data: {
        id: uid, email, created_at: userData.user.created_at,
        last_sign_in_at: userData.user.last_sign_in_at,
        user_metadata: userData.user.user_metadata,
      } })),
      safe("profile", admin.from("profiles").select("*").eq("user_id", uid)),
      safe("user_roles", admin.from("user_roles").select("*").eq("user_id", uid)),
      safe("agent_status", admin.from("agent_status").select("*").or(`user_id.eq.${uid},agent_email.eq.${email}`)),
      safe("agent_shifts", admin.from("agent_shifts").select("*").eq("agent_email", email)),
      safe("agent_skills", admin.from("agent_skills").select("*").eq("agent_email", email)),
      safe("callback_requests", admin.from("callback_requests").select("*").eq("agent_email", email)),
      safe("customer_notes", admin.from("customer_notes").select("*").eq("agent_email", email)),
      safe("outbound_calls", admin.from("outbound_calls").select("*").eq("agent_email", email)),
      safe("chat_messages", admin.from("chat_messages").select("*").or(`user_id.eq.${uid},agent_email.eq.${email}`)),
      safe("campaign_types", admin.from("campaign_types").select("*").eq("created_by", uid)),
      safe("sip_trunks", admin.from("sip_trunks").select("*").eq("created_by", uid)),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: uid,
      email,
      data: Object.assign({}, ...parts),
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="my-data-${uid}.json"`,
      },
    });
  } catch (e) {
    console.error("gdpr-export error", (e as Error).message);
    return new Response(JSON.stringify({ error: "Export failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(withMonitoring("gdpr-export", handler, corsHeaders));
