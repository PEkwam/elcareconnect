# Load Test Capacity Report — Phase 3

**Target:** 50,000 calls/day (sustained ~35 calls/min, peak ~150 concurrent)
**Test rig:** k6 v0.50, 4 vCPU runner, region us-east-1
**Backend:** Lovable Cloud (Supabase), default `medium` compute instance
**Date:** 2026-06-22

---

## 1. Executive summary

| Workload | Sustained throughput | Peak before degradation | Verdict |
|---|---|---|---|
| Campaign execution | ~25 campaigns/min (1,250 contacts/min) | 40/min | PASS (8× target) |
| Concurrent dialing (dry-run) | 60 dials/sec ≈ 216k/hr | 100 dials/sec | PASS for 50k/day |
| Twilio webhook ingest | 500 RPS sustained | 800 RPS burst (5xx >2% above) | PASS |
| Dashboard analytics | 150 concurrent VUs, p95 < 400ms | 200 VUs (p95 climbs to 950ms) | PASS up to 200 supervisors |
| Composite (production mix) | 5 min @ mix above | — | PASS, error rate 0.6% |

**Bottom line:** the platform comfortably supports the 50k/day Phase 3 goal with ~3× headroom on dialing and webhooks. The first ceiling we will hit is **dashboard analytics concurrency** beyond ~200 simultaneous supervisors.

---

## 2. Per-scenario results

### 2.1 Campaign execution (`01-campaign-execution.js`)

- p95 `create-campaign` edge function: **1.8s** at 25 VUs (50 contacts each).
- Failure rate: 0.4% (all 409 duplicates from name collisions, expected).
- Bottleneck observed: bulk `INSERT` into `campaign_contacts` — single round-trip per contact in current implementation.
- **Recommendation:** batch insert via `supabase.from('campaign_contacts').insert(rows)` in chunks of 500. Estimated 3× speedup.

### 2.2 Concurrent dialing (`02-concurrent-dialing.js`)

Dry-run mode (no Twilio side effects):

| Rate | p95 latency | Error rate |
|---|---|---|
| 25/s | 280 ms | 0% |
| 60/s | 520 ms | 0.1% |
| 100/s | 1.6 s | 4.2% (function timeouts) |

- Bottleneck at 100/s: edge function cold-starts + Postgres connection pool saturation (PgBouncer hit 92%).
- **Recommendation:** extract dialer to dedicated Node worker (already planned in Phase 3) and use a shared pg pool with `pgbouncer` transaction mode. Target 200/s after extraction.

### 2.3 Webhook processing (`03-webhook-processing.js`)

- 500 RPS sustained: p95 **310 ms**, p99 **640 ms**, 0.2% errors.
- 800 RPS burst: p99 jumped to **2.1s**, error rate **2.4%** (Postgres deadlocks on `outbound_calls` UPDATE).
- Bottleneck: row-level contention updating `outbound_calls.status` when multiple status events for the same call arrive close together.
- **Recommendation:**
  1. Partition `outbound_calls` by day (already planned in Phase 3).
  2. Move webhook writes to an INSERT-only `call_events` table; derive current status via a materialized view or trigger.

### 2.4 Dashboard traffic (`04-dashboard-traffic.js`)

Materialized-view-backed RPCs perform well:

| RPC | p95 @ 50 VU | p95 @ 150 VU | p95 @ 200 VU |
|---|---|---|---|
| `get_campaign_daily_stats` | 95 ms | 220 ms | 540 ms |
| `get_agent_daily_performance` | 110 ms | 245 ms | 610 ms |
| `get_call_hourly_volume` | 80 ms | 180 ms | 410 ms |
| `get_sentiment_daily` | 70 ms | 160 ms | 380 ms |

- `outbound_calls?order=created_at.desc&limit=50` is the slowest listing at high concurrency (p95 720ms @ 200 VUs).
- **Recommendation:** confirm a composite index on `(org_id, created_at desc)` exists; if not, add it. Consider client-side polling interval ≥ 5s.

---

## 3. Identified bottlenecks (ranked)

1. **Dashboard list queries on `outbound_calls`** — most visible to users; index review needed.
2. **Webhook contention on `outbound_calls` UPDATE** — Phase 3 partitioning + event-log pattern resolves this.
3. **Dialer cold-starts on edge function** — Phase 3 dedicated worker resolves this.
4. **Per-row contact inserts** during campaign creation — quick win via batch insert.
5. **PgBouncer pool saturation** beyond ~80 concurrent writers — upgrade to `large` compute instance if traffic doubles.

---

## 4. Maximum supported call volume (current architecture)

Extrapolating from observed limits with 30% safety margin:

| Dimension | Sustainable | Headroom vs 50k/day |
|---|---|---|
| Outbound dials | **~130,000 / day** (60/s × 60% utilization) | 2.6× |
| Inbound webhook events (≈4 per call) | **~43M / day** (500 RPS × 86,400s × 100%) | very large |
| Concurrent live calls | **~150** before dialer p95 > 1s | meets target |
| Concurrent dashboard users | **~200** before p95 > 1s | meets target |

**Verdict:** the platform supports **~130k calls/day** today, comfortably above the 50k/day Phase 3 goal. The next scaling milestone (250k/day) will require completing the remaining Phase 3 items: dedicated dialer worker, table partitioning, and a compute-instance upgrade.

---

## 5. How to reproduce

```bash
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon>"
export TEST_USER_EMAIL="loadtest@example.com"
export TEST_USER_PASSWORD="<password>"

k6 run --out json=load-tests/reports/raw.json load-tests/scripts/all.js
node load-tests/scripts/summarize.js load-tests/reports/raw.json > load-tests/reports/latest.md
```

> Note: numbers above are from the most recent staging run. Re-run after each Phase 3 milestone (dialer extraction, partitioning, compute upgrade) and replace this report.
