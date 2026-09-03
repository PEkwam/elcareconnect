// Chunked bulk import of campaign clients.
//
// The browser parses/normalizes the CSV and posts bounded chunks (<= 500 rows).
// Each chunk is resolved with set-based queries (2 lookups + 2 writes) instead
// of 3 round-trips per row, so 50k-row files import in minutes, not hours.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { normalizePhoneE164, isE164 } from "../_shared/phone.ts";
import { withMonitoring, recordMetric } from "../_shared/monitor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RowSchema = z.object({
  row_number: z.number().int().optional(),
  name: z.string().min(1),
  phone: z.string().min(3),
  policy_number: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  product_type: z.string().nullable().optional(),
  premium_amount: z.number().nullable().optional(),
  premium_due_date: z.string().nullable().optional(),
  payment_status: z.enum(["current", "overdue", "failed"]).nullable().optional(),
  custom_data: z.record(z.string()).default({}),
});

const BodySchema = z.object({
  campaign_id: z.string().uuid().nullable().optional(),
  rows: z.array(RowSchema).min(1).max(500),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const { data: userData } = await supabase.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Unauthorized" }, 401);
  const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: uid });
  if (!isStaff) return json({ error: "Forbidden" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { campaign_id, rows } = parsed.data;

  const errors: { row: number; message: string }[] = [];

  // 1. Validate + dedupe within the chunk (last occurrence wins).
  type Prepared = {
    rowNumber: number;
    key: string;
    payload: Record<string, unknown>;
    custom: Record<string, string>;
    policy: string | null;
    phone: string;
  };
  const byKey = new Map<string, Prepared>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = r.row_number ?? i + 1;
    const phone = isE164(r.phone) ? r.phone : normalizePhoneE164(r.phone);
    if (!isE164(phone)) {
      errors.push({ row: rowNumber, message: `Invalid phone number "${r.phone}"` });
      continue;
    }
    const policy = r.policy_number?.trim() || null;
    const payload: Record<string, unknown> = { name: r.name.trim(), phone };
    if (policy) payload.policy_number = policy;
    if (r.email) payload.email = r.email;
    if (r.product_type) payload.product_type = r.product_type;
    if (r.premium_amount !== null && r.premium_amount !== undefined) {
      payload.premium_amount = r.premium_amount;
    }
    if (r.premium_due_date) payload.premium_due_date = r.premium_due_date;
    if (r.payment_status) payload.payment_status = r.payment_status;
    byKey.set(policy ? `p:${policy}` : `t:${phone}`, {
      rowNumber,
      key: policy ? `p:${policy}` : `t:${phone}`,
      payload,
      custom: r.custom_data ?? {},
      policy,
      phone,
    });
  }
  const prepared = Array.from(byKey.values());
  if (!prepared.length) {
    return json({ inserted: 0, updated: 0, linked: 0, failed: errors.length, errors });
  }

  // 2. Resolve existing clients in two set-based lookups.
  const policies = prepared.map((p) => p.policy).filter(Boolean) as string[];
  const phones = prepared.map((p) => p.phone);
  const byPolicy = new Map<string, string>();
  const byPhone = new Map<string, string>();
  if (policies.length) {
    const { data } = await supabase
      .from("clients")
      .select("id, policy_number")
      .in("policy_number", policies);
    for (const c of data ?? []) byPolicy.set((c as any).policy_number, (c as any).id);
  }
  {
    const { data } = await supabase.from("clients").select("id, phone").in("phone", phones);
    for (const c of data ?? []) {
      if (!byPhone.has((c as any).phone)) byPhone.set((c as any).phone, (c as any).id);
    }
  }

  const toUpdate: Record<string, unknown>[] = [];
  const toInsert: Prepared[] = [];
  const linkIds: { p: Prepared; id: string }[] = [];
  for (const p of prepared) {
    const existing = (p.policy ? byPolicy.get(p.policy) : undefined) ?? byPhone.get(p.phone);
    if (existing) {
      toUpdate.push({ id: existing, ...p.payload });
      linkIds.push({ p, id: existing });
    } else {
      toInsert.push(p);
    }
  }

  // 3. Bulk write clients.
  let updated = 0;
  if (toUpdate.length) {
    const { error } = await supabase.from("clients").upsert(toUpdate as any, { onConflict: "id" });
    if (error) {
      // Fall back row-by-row so one bad row doesn't kill the chunk.
      for (const u of toUpdate) {
        const { id, ...rest } = u as any;
        const { error: e1 } = await supabase.from("clients").update(rest).eq("id", id);
        if (e1) errors.push({ row: 0, message: e1.message });
        else updated++;
      }
    } else {
      updated = toUpdate.length;
    }
  }

  let inserted = 0;
  if (toInsert.length) {
    const payloads = toInsert.map((p) => ({
      premium_amount: 0,
      ...p.payload,
    }));
    const { data, error } = await supabase.from("clients").insert(payloads as any).select("id, phone, policy_number");
    if (error) {
      for (const p of toInsert) {
        const { data: one, error: e1 } = await supabase
          .from("clients")
          .insert({ premium_amount: 0, ...p.payload } as any)
          .select("id")
          .single();
        if (e1 || !one) errors.push({ row: p.rowNumber, message: e1?.message ?? "Insert failed" });
        else {
          inserted++;
          linkIds.push({ p, id: (one as any).id });
        }
      }
    } else {
      inserted = data?.length ?? 0;
      const idByPolicy = new Map<string, string>();
      const idByPhone = new Map<string, string>();
      for (const c of data ?? []) {
        if ((c as any).policy_number) idByPolicy.set((c as any).policy_number, (c as any).id);
        if (!idByPhone.has((c as any).phone)) idByPhone.set((c as any).phone, (c as any).id);
      }
      for (const p of toInsert) {
        const id = (p.policy ? idByPolicy.get(p.policy) : undefined) ?? idByPhone.get(p.phone);
        if (id) linkIds.push({ p, id });
        else errors.push({ row: p.rowNumber, message: "Could not resolve inserted client" });
      }
    }
  }

  // 4. Bulk link to the campaign.
  let linked = 0;
  if (linkIds.length) {
    const seen = new Set<string>();
    const links = linkIds
      .filter(({ id }) => (seen.has(id) ? false : (seen.add(id), true)))
      .map(({ p, id }) => ({ campaign_id, client_id: id, custom_data: p.custom }));
    const { error } = await supabase
      .from("campaign_clients")
      .upsert(links as any, { onConflict: "campaign_id,client_id" });
    if (error) errors.push({ row: 0, message: `Link failed: ${error.message}` });
    else linked = links.length;
  }

  await recordMetric("campaign_import.rows", prepared.length, { campaign_id });

  return json({
    inserted,
    updated,
    linked,
    failed: errors.length,
    errors: errors.slice(0, 50),
  });
};

serve(withMonitoring("campaign-import-clients", handler, corsHeaders));
