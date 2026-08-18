import http from 'k6/http';
import { check, fail } from 'k6';

export const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://svqcapuruvcnaqwgavgu.supabase.co';
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
export const BASE_URL = __ENV.BASE_URL || 'https://mycalls-ai.lovable.app';

export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
}

export function login(email, password) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY } }
  );
  check(res, { 'login 200': (r) => r.status === 200 }) || fail(`login failed: ${res.status} ${res.body}`);
  return res.json('access_token');
}

export function invokeFn(name, body, token) {
  return http.post(
    `${SUPABASE_URL}/functions/v1/${name}`,
    JSON.stringify(body || {}),
    { headers: authHeaders(token), tags: { fn: name } }
  );
}

export function rpc(name, args, token) {
  return http.post(
    `${SUPABASE_URL}/rest/v1/rpc/${name}`,
    JSON.stringify(args || {}),
    { headers: authHeaders(token), tags: { rpc: name } }
  );
}

export function restGet(path, token) {
  return http.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: authHeaders(token),
    tags: { rest: path.split('?')[0] },
  });
}
