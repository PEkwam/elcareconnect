#!/usr/bin/env node
// Aggregates k6 JSON output into a Markdown report.
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: summarize.js <raw.json>'); process.exit(1); }

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
const metrics = {};
for (const line of lines) {
  let pt; try { pt = JSON.parse(line); } catch { continue; }
  if (pt.type !== 'Point') continue;
  const m = pt.metric, v = pt.data.value;
  const tag = pt.data.tags && (pt.data.tags.fn || pt.data.tags.rpc || pt.data.tags.rest);
  const key = tag ? `${m}::${tag}` : m;
  (metrics[key] ||= []).push(v);
}

function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] || 0;
}

const out = ['# k6 Load Test Report', '', `Generated: ${new Date().toISOString()}`, ''];
out.push('| Metric | Count | Avg | p95 | p99 | Max |');
out.push('|---|---:|---:|---:|---:|---:|');
for (const [k, v] of Object.entries(metrics).sort()) {
  if (!k.startsWith('http_req_duration')) continue;
  const avg = (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
  out.push(`| ${k} | ${v.length} | ${avg} | ${pct(v, 0.95).toFixed(0)} | ${pct(v, 0.99).toFixed(0)} | ${Math.max(...v).toFixed(0)} |`);
}
console.log(out.join('\n'));
