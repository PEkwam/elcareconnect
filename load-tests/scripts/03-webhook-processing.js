// Webhook processing: simulate Twilio posting status callbacks at high RPS.
import http from 'k6/http';
import { check } from 'k6';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/common.js';

export const options = {
  scenarios: {
    webhooks: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 300 },
        { duration: '2m', target: 500 },   // 500 RPS sustained
        { duration: '1m', target: 800 },   // burst
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

const STATUSES = ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer'];

export default function () {
  const sid = `CA${Date.now()}${__VU}${__ITER}`.slice(0, 34);
  const body = {
    CallSid: sid,
    CallStatus: STATUSES[Math.floor(Math.random() * STATUSES.length)],
    From: '+15551234567',
    To: '+15557654321',
    CallDuration: String(Math.floor(Math.random() * 300)),
    Timestamp: new Date().toISOString(),
  };

  const res = http.post(
    `${SUPABASE_URL}/functions/v1/twilio-status-webhook`,
    Object.entries(body).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apikey': SUPABASE_ANON_KEY,
      },
      tags: { fn: 'twilio-status-webhook' },
    }
  );

  check(res, { 'webhook 2xx': (r) => r.status >= 200 && r.status < 300 });
}
