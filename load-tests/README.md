# Load Testing Framework (k6)

Complete load testing suite for the call-center platform, targeting Phase 3's goal of **50,000 calls/day** (~35 calls/minute sustained, with peak bursts of 150+ concurrent).

## Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Linux
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Environment Variables

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export TEST_USER_EMAIL="loadtest@example.com"
export TEST_USER_PASSWORD="<password>"
export BASE_URL="https://mycalls-ai.lovable.app"
```

## Scenarios

| Script | Purpose | Target |
|--------|---------|--------|
| `scripts/01-campaign-execution.js` | Create campaigns + enqueue jobs | 1k campaigns/hr |
| `scripts/02-concurrent-dialing.js` | Sustain N parallel outbound calls | 150 concurrent |
| `scripts/03-webhook-processing.js` | Hammer Twilio status webhook | 500 RPS |
| `scripts/04-dashboard-traffic.js` | Realtime analytics RPCs + listing | 200 VUs |
| `scripts/all.js` | Composite scenario (runs all 4) | mixed |

## Run

```bash
# Individual
k6 run load-tests/scripts/03-webhook-processing.js

# All-in-one composite (recommended for capacity report)
k6 run --out json=load-tests/reports/raw.json load-tests/scripts/all.js

# Generate human report
node load-tests/scripts/summarize.js load-tests/reports/raw.json > load-tests/reports/REPORT.md
```

See `reports/REPORT.md` for the latest capacity findings and bottleneck analysis.
