// Composite scenario: runs all four workloads concurrently to mimic production mix.
import { sleep } from 'k6';
import campaign from './01-campaign-execution.js';
import dialing from './02-concurrent-dialing.js';
import webhook from './03-webhook-processing.js';
import dashboard from './04-dashboard-traffic.js';
import { login } from './lib/common.js';

export const options = {
  scenarios: {
    campaign_exec: { executor: 'constant-vus', vus: 5, duration: '5m', exec: 'campaignFn' },
    dialing: {
      executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s',
      duration: '5m', preAllocatedVUs: 80, maxVUs: 200, exec: 'dialingFn',
    },
    webhooks: {
      executor: 'constant-arrival-rate', rate: 300, timeUnit: '1s',
      duration: '5m', preAllocatedVUs: 100, maxVUs: 400, exec: 'webhookFn',
    },
    dashboard: { executor: 'constant-vus', vus: 50, duration: '5m', exec: 'dashboardFn' },
  },
  thresholds: {
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<2000'],
  },
};

export function setup() {
  return { token: login(__ENV.TEST_USER_EMAIL, __ENV.TEST_USER_PASSWORD) };
}

export function campaignFn(data) { campaign(data); }
export function dialingFn(data) { dialing(data); }
export function webhookFn() { webhook(); }
export function dashboardFn(data) { dashboard(data); }
