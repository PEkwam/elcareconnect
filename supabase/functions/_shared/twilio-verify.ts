// Shared Twilio webhook signature verifier.
//
// Computes base64(HMAC-SHA1(authToken, fullUrl + sortedParamConcat)) and
// compares it (constant-time) to the X-Twilio-Signature header.
//
// Behavior knobs (env vars):
//   TWILIO_VERIFY_DISABLED=true   -> bypass entirely (dev/local only)
//   TWILIO_VERIFY_SOFT=true       -> log a warning but still allow the request
// Default: hard-fail (returns 403) when the signature is missing or invalid.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let cachedToken: { value: string; fetchedAt: number } | null = null;
const TOKEN_TTL_MS = 60_000;

async function loadAuthToken(): Promise<string> {
  const envToken = (Deno.env.get("TWILIO_AUTH_TOKEN") || "").trim();
  if (envToken) return envToken;

  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.value;
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return "";
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await admin
    .from("app_secrets")
    .select("value")
    .eq("key", "TWILIO_AUTH_TOKEN")
    .maybeSingle();
  const value = (data?.value || "").trim();
  cachedToken = { value, fetchedAt: Date.now() };
  return value;
}

function canonicalUrl(req: Request, functionName: string): string {
  // Twilio configured URLs always point at the public Supabase functions host.
  // Use SUPABASE_URL + the path Twilio called (preserves query string).
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  let search = "";
  try {
    search = new URL(req.url).search;
  } catch (_e) {
    search = "";
  }
  return `${base}/functions/v1/${functionName}${search}`;
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  // base64
  let bin = "";
  const bytes = new Uint8Array(sigBuf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyResult {
  ok: boolean;
  params: Record<string, string>;
  /** 403 Response to return if !ok and verification is enforced. */
  response?: Response;
}

/**
 * Verify a Twilio webhook request. Consumes req.formData() once and returns
 * the parsed params so the caller doesn't need to re-read the body.
 *
 * Returns `{ ok: true, params }` to proceed.
 * Returns `{ ok: false, params, response }` when verification fails and the
 * caller should immediately return the provided 403 Response.
 *
 * In soft mode (TWILIO_VERIFY_SOFT=true) failures are logged and ok stays true.
 */
export async function verifyTwilioRequest(
  req: Request,
  functionName: string,
  corsHeaders: Record<string, string>,
): Promise<VerifyResult> {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) params[k] = String(v);

  if (Deno.env.get("TWILIO_VERIFY_DISABLED") === "true") {
    return { ok: true, params };
  }

  const softMode = Deno.env.get("TWILIO_VERIFY_SOFT") === "true";
  const signature = req.headers.get("X-Twilio-Signature") || "";
  const token = await loadAuthToken();
  const url = canonicalUrl(req, functionName);

  const fail = (reason: string) => {
    if (softMode) {
      console.warn(`[twilio-verify:${functionName}] ${reason} (soft mode, allowing)`);
      return { ok: true, params } as VerifyResult;
    }
    console.error(`[twilio-verify:${functionName}] rejected: ${reason}`);
    return {
      ok: false,
      params,
      response: new Response("Forbidden: invalid Twilio signature", {
        status: 403,
        headers: corsHeaders,
      }),
    } as VerifyResult;
  };

  if (!signature) return fail("missing X-Twilio-Signature header");
  if (!token) return fail("TWILIO_AUTH_TOKEN not configured");

  // Twilio canonical string: url + sorted (key + value) concatenation of POST params.
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];

  const expected = await hmacSha1Base64(token, data);
  if (!timingSafeEqual(expected, signature)) {
    return fail("signature mismatch");
  }
  return { ok: true, params };
}
