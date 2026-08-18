// Dashboard traffic: realtime analytics RPCs + listing queries.
import { sleep, check, group } from 'k6';
import { login, rpc, restGet } from './lib/common.js';

export const options = {
  scenarios: {
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 150 },
        { duration: '1m', target: 200 },   // 200 concurrent supervisors
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{rpc:get_campaign_daily_stats}': ['p(95)<400'],
    'http_req_duration{rpc:get_agent_daily_performance}': ['p(95)<400'],
    'http_req_duration{rpc:get_call_hourly_volume}': ['p(95)<400'],
  },
};

export function setup() {
  return { token: login(__ENV.TEST_USER_EMAIL, __ENV.TEST_USER_PASSWORD) };
}

export default function (data) {
  const token = data.token;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  group('analytics RPCs (materialized views)', () => {
    check(rpc('get_campaign_daily_stats', { _from: from, _to: today }, token), { '200': (r) => r.status === 200 });
    check(rpc('get_agent_daily_performance', { _from: from, _to: today }, token), { '200': (r) => r.status === 200 });
    check(rpc('get_call_hourly_volume', { _hours: 24 }, token), { '200': (r) => r.status === 200 });
    check(rpc('get_sentiment_daily', { _from: from, _to: today }, token), { '200': (r) => r.status === 200 });
  });

  group('list queries', () => {
    check(restGet('outbound_calls?select=id,status,created_at&order=created_at.desc&limit=50', token), { '200': (r) => r.status === 200 });
    check(restGet('agent_status?select=agent_email,status,updated_at&limit=100', token), { '200': (r) => r.status === 200 });
  });

  sleep(2);
}
