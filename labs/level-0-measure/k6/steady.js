// Steady load: a fixed number of requests per second, no matter how slow the responses get.
// At the end it prints a readable report: a latency histogram, percentiles and Little's law.
//
// Settings (pass with -e NAME=value):
//   TARGET    URL to hit                 default http://localhost:8000/tail
//   RATE      requests per second         default 30
//   DURATION  how long                    default 30s
import http from "k6/http";
import { Counter } from "k6/metrics";

const TARGET = __ENV.TARGET || "http://localhost:8000/tail";
const RATE = Number(__ENV.RATE || 30);
const DURATION = __ENV.DURATION || "30s";

// Latency histogram buckets, in milliseconds
const EDGES = [5, 10, 25, 50, 100, 250, 500, 1000, Infinity];
const LABELS = ["<5ms", "5-10ms", "10-25ms", "25-50ms", "50-100ms", "100-250ms", "250-500ms", "500ms-1s", ">1s"];
const buckets = LABELS.map((_, i) => new Counter(`latency_bucket_${i}`));

export const options = {
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 200,
    },
  },
};

export default function () {
  const res = http.get(TARGET, { timeout: "10s" });
  const ms = res.timings.duration;
  for (let i = 0; i < EDGES.length; i++) {
    if (ms < EDGES[i]) { buckets[i].add(1); break; }
  }
}

function fmt(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return "-";
  return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : ms.toFixed(1) + " ms";
}

export function handleSummary(data) {
  const m = data.metrics;
  const d = m.http_req_duration.values;
  const count = m.http_reqs.values.count;
  const rate = m.http_reqs.values.rate;
  const dropped = m.dropped_iterations ? m.dropped_iterations.values.count : 0;
  const peakVus = m.vus ? m.vus.values.max : 0;
  const counts = LABELS.map((_, i) => (m[`latency_bucket_${i}`] ? m[`latency_bucket_${i}`].values.count : 0));
  const maxCount = Math.max(1, ...counts);

  const lines = [];
  lines.push("");
  lines.push(`  STEADY LOAD REPORT  ${TARGET}`);
  lines.push(`  offered ${RATE} req/s for ${DURATION}  ->  completed ${count} requests (${rate.toFixed(1)} req/s), dropped ${dropped}`);
  lines.push("");
  lines.push("  Where the requests landed (each bar = number of requests in that latency range)");
  LABELS.forEach((l, i) => {
    const bar = "█".repeat(Math.round((counts[i] / maxCount) * 40));
    lines.push(`  ${l.padStart(10)} | ${bar}${counts[i] ? " " + counts[i] : ""}`);
  });
  lines.push("");
  lines.push(`  p50 (median) ${fmt(d.med).padStart(10)}   half of requests were faster than this`);
  lines.push(`  p95          ${fmt(d["p(95)"]).padStart(10)}   1 in 20 were slower`);
  lines.push(`  p99          ${fmt(d["p(99)"]).padStart(10)}   1 in 100 were slower`);
  lines.push(`  max          ${fmt(d.max).padStart(10)}`);
  lines.push(`  average      ${fmt(d.avg).padStart(10)}   <- compare with p50: the slow tail drags it up`);
  lines.push("");
  const L = rate * (d.avg / 1000);
  lines.push("  Little's law:  L = λ × W");
  lines.push(`    λ (throughput)    = ${rate.toFixed(1)} req/s`);
  lines.push(`    W (avg duration)  = ${fmt(d.avg)} = ${(d.avg / 1000).toFixed(4)} s`);
  lines.push(`    L (in flight)     = ${L.toFixed(2)} requests in progress at any moment, on average`);
  lines.push(`    peak VUs used     = ${peakVus}  (k6 needs roughly one VU per request in flight)`);
  lines.push("");
  return { stdout: lines.join("\n") + "\n" };
}
