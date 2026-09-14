// Shared accessor for admin-managed secrets.
//
// Operators save Twilio / Resend credentials through the in-app Setup page,
// which stores them in the `app_secrets` table. Some functions previously read
// only `Deno.env`, so those features silently no-opped. Always read through
// this helper: app_secrets first, environment variable as fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cache = new Map<string, string>();

export async function getAppSecret(key: string): Promise<string> {
  const cached = cache.get(key);
  if (cached) return cached;

  let value = "";
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data, error } = await admin
      .from("app_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) console.error(`app_secrets lookup failed for ${key}: ${error.message}`);
    value = ((data as { value?: string } | null)?.value ?? "").trim();
  } catch (err) {
    console.error(`app_secrets lookup threw for ${key}:`, err);
  }

  if (!value) value = (Deno.env.get(key) ?? "").trim();
  if (value) cache.set(key, value);
  return value;
}

export async function getAppSecrets<T extends string>(
  keys: readonly T[],
): Promise<Record<T, string>> {
  const values = await Promise.all(keys.map((k) => getAppSecret(k)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<T, string>;
}
