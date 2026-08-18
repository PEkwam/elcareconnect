// Campaign execution: create campaign, bulk insert contacts, enqueue jobs.
import { sleep, check } from 'k6';
import { login, invokeFn, restGet } from './lib/common.js';

export const options = {
  scenarios: {
    campaigns: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<2500'],
  },
};

export function setup() {
  return { token: login(__ENV.TEST_USER_EMAIL, __ENV.TEST_USER_PASSWORD) };
}

export default function (data) {
  const campaignName = `LT-${__VU}-${__ITER}-${Date.now()}`;
  const create = invokeFn('create-campaign', {
    name: campaignName,
    contacts: Array.from({ length: 50 }, (_, i) => ({
      phone: `+1555${String(1000000 + __VU * 1000 + i).slice(-7)}`,
      name: `Lead ${i}`,
    })),
  }, data.token);

  check(create, { 'campaign created': (r) => r.status >= 200 && r.status < 300 });

  // Trigger enqueue
  const enqueue = invokeFn('enqueue-campaign-jobs', { campaign_name: campaignName }, data.token);
  check(enqueue, { 'enqueue ok': (r) => r.status >= 200 && r.status < 300 });

  sleep(1);
}
