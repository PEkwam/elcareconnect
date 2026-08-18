// Run with:  deno test --allow-env --allow-net supabase/functions/_shared/helpers.test.ts
//
// Pure-logic helpers only. Helpers that instantiate the Supabase JS client
// (rateLimit, logAudit, recordMetric, recordError) are exercised end-to-end
// via the edge integration tests / runtime — Deno's test runner reports the
// Supabase client's internal token-refresh interval as a leak which doesn't
// reflect production behaviour.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:1");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { beginIdempotency } = await import("./idempotency.ts");
const { withMonitoring } = await import("./monitor.ts");

Deno.test("beginIdempotency returns 400 when required header is absent", async () => {
  const req = new Request("http://x/", { method: "POST" });
  const r = await beginIdempotency(req, "scope", {}, { required: true });
  assertEquals(r.replay?.status, 400);
  assertEquals(r.key, null);
});

Deno.test("beginIdempotency is a no-op when key absent and not required", async () => {
  const req = new Request("http://x/", { method: "POST" });
  const r = await beginIdempotency(req, "scope");
  assertEquals(r.replay, null);
  assertEquals(r.key, null);
});

Deno.test("beginIdempotency rejects an oversized Idempotency-Key", async () => {
  const req = new Request("http://x/", {
    method: "POST",
    headers: { "Idempotency-Key": "x".repeat(300) },
  });
  const r = await beginIdempotency(req, "scope");
  assertEquals(r.replay?.status, 400);
});

Deno.test({
  name: "withMonitoring converts a handler throw into a sanitized 500",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const wrapped = withMonitoring("test", async () => {
      throw new Error("internal stack-trace detail that must NEVER leak to clients");
    });
    const res = await wrapped(new Request("http://x/"));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "Internal error. Please try again later.");
    assertEquals(String(body.error).includes("stack-trace"), false);
  },
});

Deno.test("withMonitoring passes through successful responses", async () => {
  const wrapped = withMonitoring("test", async () => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const res = await wrapped(new Request("http://x/"));
  assertEquals(res.status, 200);
});
