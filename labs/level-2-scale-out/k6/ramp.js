// Ramp the offered load from START to END requests/second, then hold at END.
// At the end it prints, for each slice of the ramp, what the server actually achieved
// and how latency (p95) changed: the "knee" of the curve from Lesson 0.4 shows up as a bar chart.
//
// Settings (pass with -e NAME=value):
//   TARGET  URL to hit                    default http://localhost:8000/work
//   START   starting req/s                default 10
//   END     final req/s                   default 150
//   RAMP    ramp duration in seconds      default 120
import http from "k6/http";

const TARGET = __ENV.TARGET || "http://localhost:8000/work";
const START = Number(__ENV.START || 10);
const END = Number(__ENV.END || 150);
const RAMP = Number(__ENV.RAMP || 120);
const HOLD = 20;
const N = 7;
const STEP = (END - START) / N;

const SLICES = [];
for (let i = 0; i < N; i++) SLICES.push(`${Math.round(START + i * STEP)}-${Math.round(START + (i + 1) * STEP)}`);
SLICES.push(`${END}-hold`);

// Thresholds that always pass, only so per-slice numbers appear in the summary data.
const thresholds = {};
for (const s of SLICES) {
  thresholds[`http_req_duration{offered:${s}}`] = ["max>=0"];
  thresholds[`http_reqs{offered:${s}}`] = ["count>=0"];
  thresholds[`http_req_failed{offered:${s}}`] = ["rate>=0"];
}

export const options = {
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  thresholds,
  scenarios: {
    ramp: {
      executor: "ramping-arrival-rate",
      startRate: START,
      timeUnit: "1s",
      preAllocatedVUs: 5,
      maxVUs: 300,
      stages: [
        { target: END, duration: `${RAMP}s` },
        { target: END, duration: `${HOLD}s` },
      ],
    },
  },
};

export function setup() {
  return { t0: Date.now() };
}

export default function (data) {
  const t = (Date.now() - data.t0) / 1000;
  let slice = N; // hold
  if (t < RAMP) {
    const offered = START + ((END - START) * t) / RAMP;
    slice = Math.max(0, Math.min(N - 1, Math.floor((offered - START) / STEP)));
  }
  http.get(TARGET, { timeout: "10s", tags: { offered: SLICES[slice] } });
}

function fmt(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return "-";
  return ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : Math.round(ms) + "ms";
}

export function handleSummary(data) {
  const m = data.metrics;
  const rows = SLICES.map((s, i) => {
    const d = m[`http_req_duration{offered:${s}}`];
    const c = m[`http_reqs{offered:${s}}`];
    const f = m[`http_req_failed{offered:${s}}`];
    const secs = i < N ? RAMP / N : HOLD;
    const n = c ? c.values.count : 0;
    const offered = i < N ? START + STEP * (i + 0.5) : END;
    return { s, offered, achieved: n / secs, med: d ? d.values.med : NaN, p95: d ? d.values["p(95)"] : NaN, err: f ? f.values.rate : 0 };
  });
  const maxP95 = Math.max(1, ...rows.map((r) => (isNaN(r.p95) ? 0 : r.p95)));
  const base = rows.find((r) => !isNaN(r.p95));
  const knee = rows.find((r) => base && (r.p95 > Math.max(5 * base.p95, base.p95 + 100) || r.achieved < r.offered * 0.9));
  const dropped = m.dropped_iterations ? m.dropped_iterations.values.count : 0;
  const peakVus = m.vus ? m.vus.values.max : 0;

  const L = [];
  L.push("");
  L.push(`  RAMP REPORT  ${TARGET}`);
  L.push(`  offered load rose from ${START} to ${END} req/s over ${RAMP}s, then held for ${HOLD}s`);
  L.push("");
  L.push("  offered   achieved   median    p95   errors   p95 latency");
  L.push("  (req/s)   (req/s)                               (longer bar = slower)");
  for (const r of rows) {
    const bar = isNaN(r.p95) ? "" : "█".repeat(Math.max(1, Math.round((r.p95 / maxP95) * 32)));
    const flag = r.achieved < r.offered * 0.9 ? "  <- can't keep up" : "";
    L.push(`  ${r.s.padStart(8)}  ${r.achieved.toFixed(0).padStart(7)}   ${fmt(r.med).padStart(6)}  ${fmt(r.p95).padStart(6)}  ${(Math.round(r.err * 100) + "%").padStart(5)}   ${bar}${flag}`);
  }
  L.push("");
  if (knee) {
    L.push(`  Knee: latency took off in the ${knee.s} req/s slice.`);
    L.push(`  Past this point requests queue up: achieved throughput stops rising and waiting time explodes.`);
  } else {
    L.push(`  No knee: latency stayed flat up to ${END} req/s. The server has more capacity;`);
    L.push(`  rerun with a higher END, for example -e END=400.`);
  }
  L.push("");
  L.push(`  peak VUs in use: ${peakVus}   dropped iterations: ${dropped}`);
  L.push("  errors = requests that failed or hit k6's 10 s timeout (p95 of 10.00s means timeouts).");
  L.push("  VUs in use ≈ requests in flight (Little's law: L = λ × W). When the server saturates,");
  L.push("  W grows, so k6 needs more and more VUs. Hitting the VU limit means requests were dropped.");
  L.push("");
  return { stdout: L.join("\n") + "\n" };
}
