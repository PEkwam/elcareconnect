// Lightweight monitoring helpers — writes to public.system_health_metrics
// and public.error_events. All failures are swallowed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let adminClient: ReturnType<typeof createClient> | null = null;
function admin() {
  if (adminClient) return adminClient;
  adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  return adminClient;
}

export async function recordMetric(
  metric: string,
  value: number,
  tags?: Record<string, unknown>,
): Promise<void> {
  try {
    await admin().from("system_health_metrics").insert({ metric, value, tags: tags ?? null });
  } catch (e) {
    console.error("[monitor] metric failed", e);
  }
}

export async function recordError(
  source: string,
  err: unknown,
  context?: Record<string, unknown>,
  level: "error" | "warn" | "fatal" = "error",
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  try {
    await admin().from("error_events").insert({
      source,
      level,
      message: message.slice(0, 2000),
      context: context ?? null,
    });
  } catch (e) {
    console.error("[monitor] error event failed", e);
  }
}

/**
 * Wrap a handler so unexpected throws are recorded then re-surfaced as a
 * generic 500 (preserves the "no verbose leaks" rule).
 */
export function withMonitoring(
  source: string,
  handler: (req: Request) => Promise<Response>,
  corsHeaders: Record<string, string> = {},
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      await recordError(source, err, {
        url: req.url,
        method: req.method,
      });
      return new Response(
        JSON.stringify({ error: "Internal error. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  };
}
