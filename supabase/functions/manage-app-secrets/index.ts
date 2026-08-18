import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rateLimit } from "../_shared/rate-limit.ts";
import { logAudit } from "../_shared/audit.ts";
import { withMonitoring } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_KEYS = [
  "OPENAI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "GOOGLE_CLOUD_API_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
];

function maskValue(v: string) {
  if (!v) return "";
  if (v.length <= 4) return "•".repeat(v.length);
  return "•".repeat(Math.max(4, v.length - 4)) + v.slice(-4);
}

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isSuperAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 30 secret operations per minute per admin.
    const rl = await rateLimit(
      { key: `manage-app-secrets:${user.id}`, limit: 30, windowSeconds: 60 },
      corsHeaders,
    );
    if (!rl.allowed) return rl.response!;

    const { action, key, value, reveal } = await req.json().catch(() => ({}));

    if (action === "list") {
      const { data, error } = await admin
        .from("app_secrets")
        .select("key, value, updated_at, updated_by")
        .in("key", ALLOWED_KEYS);
      if (error) throw error;

      const map = new Map((data || []).map((r: any) => [r.key, r]));
      const items = ALLOWED_KEYS.map((k) => {
        const row: any = map.get(k);
        const v = row?.value || "";
        return {
          key: k,
          has_value: !!v,
          masked: maskValue(v),
          value: reveal ? v : undefined,
          updated_at: row?.updated_at || null,
        };
      });
      await logAudit(req, {
        action: reveal ? "app_secret.reveal" : "app_secret.list",
        targetTable: "app_secrets",
        actorUserId: user.id,
        metadata: { reveal: !!reveal },
      });
      return new Response(JSON.stringify({ secrets: items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert") {
      if (!ALLOWED_KEYS.includes(key)) {
        return new Response(JSON.stringify({ error: "Invalid key" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await admin
        .from("app_secrets")
        .upsert({ key, value: value ?? "", updated_at: new Date().toISOString(), updated_by: user.id });
      if (error) throw error;
      await logAudit(req, {
        action: "app_secret.upsert",
        targetTable: "app_secrets",
        targetId: key,
        actorUserId: user.id,
        metadata: { has_value: !!value },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-app-secrets error:", err);
    return new Response(
      JSON.stringify({ error: "Request failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};

serve(withMonitoring("manage-app-secrets", handler, corsHeaders));
