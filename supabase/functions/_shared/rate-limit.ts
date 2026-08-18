// Postgres-backed sliding-window rate limiter.
// Backed by public.consume_rate_limit() — service-role only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface RateLimitOptions {
  /** Identifier for the bucket, e.g. "campaign-enqueue:<user_id>". */
  key: string;
  /** Max requests permitted in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 429 Response ready to return when !allowed. */
  response?: Response;
}

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

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "anon";
}

export async function rateLimit(
  opts: RateLimitOptions,
  corsHeaders: Record<string, string> = {},
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin().rpc("consume_rate_limit", {
      _key: opts.key,
      _limit: opts.limit,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      // Fail-open on infra error rather than blocking legitimate traffic.
      console.error("[rate-limit] rpc error", error);
      return { allowed: true };
    }
    if (data === true) return { allowed: true };
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please slow down." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(opts.windowSeconds),
          },
        },
      ),
    };
  } catch (e) {
    console.error("[rate-limit] exception", e);
    return { allowed: true };
  }
}
