// Concurrent dialing: simulate the dialer worker triggering outbound calls in parallel.
import { sleep, check } from 'k6';
import { login, invokeFn } from './lib/common.js';

export const options = {
  scenarios: {
    dialing: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { duration: '1m', target: 25 },   // 25 calls/sec
        { duration: '2m', target: 60 },   // 60 calls/sec ≈ 216k/hr
        { duration: '2m', target: 100 },  // stress: 100 calls/sec
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{fn:dial-outbound}': ['p(95)<3000'],
  },
};

export function setup() {
  return { token: login(__ENV.TEST_USER_EMAIL, __ENV.TEST_USER_PASSWORD) };
}

export default function (data) {
  const phone = `+1555${String(2000000 + __VU * 100 + __ITER).slice(-7)}`;
  const res = invokeFn('dial-outbound', {
    to: phone,
    campaign: 'load-test',
    dry_run: true, // do NOT actually place Twilio calls during load tests
  }, data.token);

  check(res, {
    'dial accepted': (r) => r.status === 200 || r.status === 202,
  });
}
