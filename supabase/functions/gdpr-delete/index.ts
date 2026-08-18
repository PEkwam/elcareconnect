// GDPR account-deletion endpoint.
// Requires body { confirm: "DELETE" }. Anonymises operational records the
// user touched (so call/audit history stays intact for the business), then
// removes profile / roles / personal rows and deletes the auth user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { rateLimit } from "../_shared/rate-limit.ts";
import { logAudit } from "../_shared/audit.ts";
import { withMonitoring } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return new Response(JSON.stringify({ error: "Missing confirmation. Send { confirm: 'DELETE' }." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

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

    // Rate limit: 2 destructive deletions per hour per user.
    const rl = await rateLimit(
      { key: `gdpr-delete:${uid}`, limit: 2, windowSeconds: 3600 },
      corsHeaders,
    );
    if (!rl.allowed) return rl.response!;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const receipt: Record<string, number | string> = {};
    await logAudit(req, {
      action: "gdpr.delete",
      targetTable: "auth.users",
      targetId: uid,
      actorUserId: uid,
      metadata: { email_hash: email ? email.split("@")[1] : null },
    });

    // 1) Anonymise operational rows (preserve business records, strip PII linkage).
    const anonEmail = `deleted+${uid.slice(0, 8)}@redacted.local`;
    const anonOps = async (table: string) => {
      try {
        const { count } = await admin.from(table)
          .update({ agent_email: anonEmail })
          .eq("agent_email", email)
          .select("*", { count: "exact", head: true });
        receipt[`${table}_anonymised`] = count ?? 0;
      } catch (e) { receipt[`${table}_anonymised`] = `err:${(e as Error).message}`; }
    };
    await anonOps("outbound_calls");
    await anonOps("customer_notes");
    await anonOps("callback_requests");
    await anonOps("chat_messages");

    // 2) Delete personal rows.
    const wipe = async (table: string, filter: (q: any) => any) => {
      try {
        const { count } = await filter(admin.from(table).delete()).select("*", { count: "exact", head: true });
        receipt[`${table}_deleted`] = count ?? 0;
      } catch (e) { receipt[`${table}_deleted`] = `err:${(e as Error).message}`; }
    };
    await wipe("agent_status", (q) => q.or(`user_id.eq.${uid},agent_email.eq.${email}`));
    await wipe("agent_shifts", (q) => q.eq("agent_email", email));
    await wipe("agent_skills", (q) => q.eq("agent_email", email));
    await wipe("user_roles", (q) => q.eq("user_id", uid));
    await wipe("profiles", (q) => q.eq("user_id", uid));

    // 3) Delete the auth user last.
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("auth.deleteUser failed", delErr.message);
      receipt["auth_user_deleted"] = `err:${delErr.message}`;
    } else {
      receipt["auth_user_deleted"] = 1;
    }

    console.log(`gdpr-delete completed for ${uid.slice(0, 8)}***`);

    return new Response(JSON.stringify({ ok: true, receipt }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gdpr-delete error", (e as Error).message);
    return new Response(JSON.stringify({ error: "Deletion failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(withMonitoring("gdpr-delete", handler, corsHeaders));
