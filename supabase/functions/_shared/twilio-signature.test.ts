// Run with:  deno test --allow-env --allow-net supabase/functions/_shared/twilio-signature.test.ts
//
// Validates the Twilio HMAC-SHA1 verifier end-to-end without hitting Supabase.
// We exercise the verifier in soft mode + bypass mode and re-implement the
// canonical signing string here to compare against the wire format Twilio
// uses (see https://www.twilio.com/docs/usage/security#validating-requests).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyTwilioRequest } from "./twilio-verify.ts";

const TOKEN = "test-token-deadbeef";
const FN = "ai-voice-call-status";
const BASE_URL = "https://example.supabase.co";

Deno.env.set("TWILIO_AUTH_TOKEN", TOKEN);
Deno.env.set("SUPABASE_URL", BASE_URL);
// Make sure we never fall back to app_secrets lookup during tests.
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  let bin = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function buildSignedRequest(params: Record<string, string>, override?: { sig?: string; url?: string }) {
  const url = override?.url ?? `${BASE_URL}/functions/v1/${FN}`;
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  return { url, data, params };
}

async function makeReq(params: Record<string, string>, sig?: string) {
  const body = new URLSearchParams(params);
  return new Request(`${BASE_URL}/functions/v1/${FN}`, {
    method: "POST",
    headers: sig ? { "X-Twilio-Signature": sig } : {},
    body,
  });
}

Deno.test("verifyTwilioRequest accepts a correctly signed payload", async () => {
  const params = { CallSid: "CA123", CallStatus: "completed", From: "+233244000000", To: "+233200000001" };
  const { data } = buildSignedRequest(params);
  const expected = await hmacSha1Base64(TOKEN, data);
  const req = await makeReq(params, expected);
  const res = await verifyTwilioRequest(req, FN, {});
  assertEquals(res.ok, true);
  assertEquals(res.params.CallSid, "CA123");
});

Deno.test("verifyTwilioRequest rejects a tampered payload", async () => {
  const params = { CallSid: "CA123", CallStatus: "completed" };
  const { data } = buildSignedRequest(params);
  const expected = await hmacSha1Base64(TOKEN, data);
  // Caller flips the CallStatus after signing.
  const tampered = { ...params, CallStatus: "failed" };
  const req = await makeReq(tampered, expected);
  const res = await verifyTwilioRequest(req, FN, {});
  assertEquals(res.ok, false);
  assertEquals(res.response?.status, 403);
});

Deno.test("verifyTwilioRequest rejects when the signature header is missing", async () => {
  const req = await makeReq({ CallSid: "CA1" });
  const res = await verifyTwilioRequest(req, FN, {});
  assertEquals(res.ok, false);
  assertEquals(res.response?.status, 403);
});

Deno.test("verifyTwilioRequest rejects a wrong-token signature", async () => {
  const params = { CallSid: "CA1", CallStatus: "ringing" };
  const { data } = buildSignedRequest(params);
  const wrong = await hmacSha1Base64("wrong-token", data);
  const req = await makeReq(params, wrong);
  const res = await verifyTwilioRequest(req, FN, {});
  assertEquals(res.ok, false);
  assertEquals(res.response?.status, 403);
});

Deno.test("verifyTwilioRequest TWILIO_VERIFY_DISABLED bypasses checks", async () => {
  Deno.env.set("TWILIO_VERIFY_DISABLED", "true");
  try {
    const req = await makeReq({ anything: "yes" });
    const res = await verifyTwilioRequest(req, FN, {});
    assertEquals(res.ok, true);
  } finally {
    Deno.env.delete("TWILIO_VERIFY_DISABLED");
  }
});
