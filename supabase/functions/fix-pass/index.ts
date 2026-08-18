import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const key = req.headers.get("x-boot-key");
  if (key !== Deno.env.get("BOOT_KEY_TMP")) return new Response("no", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const u = data.users.find((x) => x.email === "claptonnon@gmail.com");
  if (!u) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  const { error: e2 } = await admin.auth.admin.updateUserById(u.id, { password: "Heavenisreal@1", email_confirm: true });
  return new Response(JSON.stringify({ ok: !e2, error: e2?.message }), { headers: { "content-type": "application/json" } });
});
