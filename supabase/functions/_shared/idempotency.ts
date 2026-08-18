// Idempotency-Key handling. Backed by public.claim_idempotency_key /
// public.store_idempotency_response.
//
// Usage:
//   const idem = await beginIdempotency(req, "campaign-enqueue");
//   if (idem.replay) return idem.replay;          // return cached response
//   ... do work ...
//   await idem.store({ run_id: "..." });          // cache the response
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

export interface BeginIdempotency {
  /** When non-null, replay the cached response and skip work. */
  replay: Response | null;
  /** Idempotency key, or null when caller did not supply one. */
  key: string | null;
  /** Persist the JSON response so future calls with the same key replay it. */
  store: (body: unknown, status?: number) => Promise<void>;
}

export async function beginIdempotency(
  req: Request,
  scope: string,
  corsHeaders: Record<string, string> = {},
  options: { required?: boolean } = {},
): Promise<BeginIdempotency> {
  const key = (req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || "").trim();
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  const noop: BeginIdempotency = {
    replay: null,
    key: null,
    store: async () => {},
  };

  if (!key) {
    if (options.required) {
      return {
        replay: new Response(
          JSON.stringify({ error: "Missing Idempotency-Key header" }),
          { status: 400, headers },
        ),
        key: null,
        store: async () => {},
      };
    }
    return noop;
  }
  if (key.length > 255) {
    return {
      replay: new Response(
        JSON.stringify({ error: "Idempotency-Key too long" }),
        { status: 400, headers },
      ),
      key: null,
      store: async () => {},
    };
  }

  const scoped = `${scope}:${key}`;
  try {
    const { data } = await admin().rpc("claim_idempotency_key", {
      _key: scoped,
      _scope: scope,
    });
    if (data) {
      // Already seen: data is either {_pending:true} or the prior response.
      if ((data as any)?._pending) {
        return {
          replay: new Response(
            JSON.stringify({ error: "Request with this Idempotency-Key is still in flight" }),
            { status: 409, headers },
          ),
          key: scoped,
          store: async () => {},
        };
      }
      return {
        replay: new Response(JSON.stringify(data), { status: 200, headers }),
        key: scoped,
        store: async () => {},
      };
    }
  } catch (e) {
    // Fail-open on infra errors.
    console.error("[idempotency] rpc error", e);
    return noop;
  }

  return {
    replay: null,
    key: scoped,
    store: async (body: unknown) => {
      try {
        await admin().rpc("store_idempotency_response", {
          _key: scoped,
          _response: body as any,
        });
      } catch (e) {
        console.error("[idempotency] store error", e);
      }
    },
  };
}
