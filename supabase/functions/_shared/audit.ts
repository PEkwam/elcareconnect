// Append-only audit log helper. Inserts via public.log_audit_event SECURITY DEFINER.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { clientIp } from "./rate-limit.ts";

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

export interface AuditEvent {
  action: string;
  targetTable?: string;
  targetId?: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(req: Request, event: AuditEvent): Promise<void> {
  try {
    await admin().rpc("log_audit_event", {
      _action: event.action,
      _target_table: event.targetTable ?? null,
      _target_id: event.targetId ?? null,
      _actor: event.actorUserId ?? null,
      _ip: clientIp(req),
      _user_agent: req.headers.get("user-agent") ?? null,
      _metadata: (event.metadata ?? null) as any,
    });
  } catch (e) {
    // Audit must never break the caller — just log.
    console.error("[audit] failed", e);
  }
}
