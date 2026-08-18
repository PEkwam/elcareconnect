# Production Hardening Plan

Scope: Critical + High severity items only. No new features. Each fix paired with verification evidence (unit tests, edge-function tests, or scripted curl checks).

## 1. Twilio Webhook Signature Verification (Critical)

Twilio signs every webhook with `X-Twilio-Signature` (HMAC-SHA1 of full URL + sorted form params, base64). Today the `ai-voice-call*` and `ai-voice-call-dtmf*` functions accept any caller.

- Add `supabase/functions/_shared/twilio-signature.ts` — pure verifier (URL + params + token → signature), constant-time compare.
- Wrap every Twilio-facing function: `ai-voice-call`, `ai-voice-call-status`, `ai-voice-call-dtmf`, `ai-voice-call-dtmf-language`, `ai-voice-call-dtmf-appointment`, `ai-voice-call-dtmf-appointment-finalize`, `ai-voice-call-bridge-ivr`. Reject with 403 on mismatch.
- Read `TWILIO_AUTH_TOKEN` from `app_secrets` first, then env. Allow a `TWILIO_SIGNATURE_BYPASS=true` escape hatch only when not in prod (used by tests).
- Evidence: `supabase/functions/_shared/twilio-signature.test.ts` covers good signature, bad signature, tampered param, missing header.

## 2. API Rate Limiting (High)

No backend rate-limiting primitive exists — per directives, this is a known gap and we ship an ad-hoc Postgres-backed limiter the user has already implicitly approved by asking for it.

- Migration: `api_rate_limits` table (`key text`, `window_start timestamptz`, `count int`, PK on `key, window_start`) + `consume_rate_limit(_key text, _limit int, _window_seconds int) returns boolean` SECURITY DEFINER function using upsert + `RETURNING count <= _limit`.
- Shared helper `supabase/functions/_shared/rate-limit.ts` keyed by `user_id` (auth) or `ip` (twilio/anon). Default 60 req/min; tighter caps for `campaign-enqueue` (10/min) and `gdpr-export` (3/hour).
- Apply to: `campaign-enqueue`, `campaign-control`, `gdpr-export`, `gdpr-delete`, `manage-app-secrets`, `send-agent-invitation`, `officer-chat`, `twilio-verify`.
- Evidence: edge-function test hits `campaign-enqueue` 11× and asserts the 11th returns 429.

## 3. Idempotency Protection (High)

Prevents duplicate campaign enqueues, duplicate Twilio status writes, double-spend on `campaign-control` actions.

- Migration: `idempotency_keys(key text primary key, scope text, response jsonb, created_at timestamptz default now())` + cleanup index on `created_at`.
- Shared helper `_shared/idempotency.ts` — `withIdempotency(scope, key, handler)`; returns cached response if key seen in last 24h.
- `campaign-enqueue` requires `Idempotency-Key` header (auto-generated client-side from `campaign_id + cursor`). `ai-voice-call-status` keys on `CallSid + CallStatus`. `campaign-worker` keys job execution on `job.id + attempt`.
- Evidence: test posts same `Idempotency-Key` twice to `campaign-enqueue`; asserts only one `campaign_runs` row created.

## 4. E.164 Phone Validation Enforcement (High)

`libphonenumber-js` already wraps inputs but it's not enforced server-side or in DB.

- Migration: add `CHECK (phone ~ '^\+[1-9]\d{7,14}$')` to `clients.phone`, `outbound_calls.phone_number`, `campaign_clients.phone`, `callback_requests.phone_number`. Backfill: normalize existing rows via UPDATE using regex; rows that can't be repaired get NULL with `phone_invalid=true` flag column on `clients`.
- Server: `_shared/phone.ts` already exists — enforce in `campaign-enqueue` (reject batch on first bad number), `campaign-worker` (skip + mark job failed with `invalid_phone`).
- Frontend: `src/lib/phone.ts` — throw on invalid, surface inline error in CSV importer.
- Evidence: vitest unit covering `+233244000000`, `0244000000` (GH local → +233 default), `+1-800-555` (invalid), empty. Edge test asserts 422 on bad payload to `campaign-enqueue`.

## 5. Audit Logging (High)

- Migration: `audit_log(id bigserial pk, occurred_at timestamptz default now(), actor_user_id uuid, actor_role text, action text, target_table text, target_id text, ip inet, user_agent text, metadata jsonb)`. RLS: only `admin`/`super_admin` can SELECT; INSERT via SECURITY DEFINER function `log_audit_event(...)`.
- Helper `_shared/audit.ts` — `logAudit(req, supabase, {action, target, metadata})`.
- Wire into: `manage-app-secrets` (read/write/delete), `manage-agents` (invite/disable), `campaign-control` (pause/resume/cancel/retry), `gdpr-export`, `gdpr-delete`, `send-agent-invitation`, user-role mutations.
- Admin-only `AuditLogPanel` is **not** in scope (no new features) — surfaced via existing PrivacyPanel link is fine if trivial; otherwise skipped.
- Evidence: edge test calls `campaign-control pause`, then `supabase.from('audit_log').select` asserts one row with matching `action='campaign.pause'`.

## 6. Monitoring (High)

- Migration: `system_health_metrics(id bigserial pk, captured_at timestamptz default now(), metric text, value numeric, tags jsonb)` + `error_events(id bigserial pk, occurred_at timestamptz default now(), source text, level text, message text, context jsonb)`.
- `_shared/monitor.ts` — `recordMetric(name, value, tags)`, `recordError(source, err, ctx)`. All edge functions wrap their handler in `try/catch` that calls `recordError` and re-throws sanitized message (preserves existing "generic error" rule).
- Worker emits `campaign_worker.jobs_claimed`, `campaign_worker.jobs_succeeded`, `campaign_worker.jobs_failed` per tick.
- Cron-scheduled `monitor-health` edge function runs every 5 min: counts queued/active/failed jobs, stuck locks, recent error rate; writes to `system_health_metrics`; alerts via existing `send-escalation-notification` if thresholds exceeded.
- Evidence: trigger a deliberate failure in worker; assert `error_events` row exists.

## Implementation order

1. Migration bundle (`api_rate_limits`, `idempotency_keys`, `audit_log`, `system_health_metrics`, `error_events`, phone CHECK constraints).
2. Shared helpers in `supabase/functions/_shared/`.
3. Wire helpers into all listed edge functions.
4. Frontend phone enforcement.
5. Tests + scripted verification (`bun test` for frontend, Deno test runner for edge helpers, curl-based integration via `supabase--test_edge_functions`).
6. Schedule `monitor-health` cron.

## Out of scope

- Net-new features (admin UI for audit log, dashboards for metrics) — only minimal links if zero-cost.
- WAF, DDoS protection, infra-level rate limiting — outside Lovable Cloud surface.
- Secret rotation automation.

## Risks

- Adding CHECK constraints can fail on dirty data; backfill runs first inside the same migration transaction, NULL-ing unsalvageable rows.
- Twilio signature verification will break local dev that hits these endpoints directly — `TWILIO_SIGNATURE_BYPASS` env flag mitigates.
- Postgres-backed rate limit costs one round-trip per request; acceptable at 10k calls/day.
