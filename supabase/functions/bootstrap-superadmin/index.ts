import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const { email, password } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let userId: string | null = null;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created?.user) {
    userId = created.user.id;
  } else {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
    if (!found) return new Response(JSON.stringify({ error: error?.message ?? "user not found" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    userId = found.id;
    await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  }

  await admin.from("profiles").upsert({ user_id: userId, email, display_name: email }, { onConflict: "user_id" });
  await admin.from("user_roles").upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });

  return new Response(JSON.stringify({ ok: true, user_id: userId }), { headers: { ...cors, "Content-Type": "application/json" } });
});