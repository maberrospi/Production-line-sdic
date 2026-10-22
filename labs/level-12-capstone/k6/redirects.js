// Redirect load through the gateway, with a realistic skew: 80% of clicks go to 20 popular links.
//   docker compose run --rm k6 run /k6/redirects.js            (-e RATE=300 -e DURATION=30s)
import http from "k6/http";
import { check } from "k6";

const GATEWAY = __ENV.GATEWAY || "http://gateway";
const RATE = Number(__ENV.RATE || 300);
const DURATION = __ENV.DURATION || "30s";

export const options = {
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    redirects: { executor: "constant-arrival-rate", rate: RATE, timeUnit: "1s", duration: DURATION, preAllocatedVUs: 20, maxVUs: 300 },
  },
};

export function setup() {
  const codes = http.get(`${__ENV.APP || "http://app:8000"}/internal/codes?n=1000`).json();
  if (codes.length < 100) throw new Error("seed some links first: docker compose run --rm tools python seed.py");
  return { codes };
}

export default function (data) {
  const c = data.codes;
  const code = Math.random() < 0.8 ? c[Math.floor(Math.random() * 20)] : c[20 + Math.floor(Math.random() * (c.length - 20))];
  // redirects: 0, so we measure our 302, not the destination site.
  const r = http.get(`${GATEWAY}/${code}`, { redirects: 0, tags: { name: "redirect" } });
  check(r, { "302 with a Location": (res) => res.status === 302 && !!res.headers["Location"] });
}

function fmt(ms) {
  return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : ms.toFixed(1) + " ms";
}

export function handleSummary(data) {
  const m = data.metrics, d = m.http_req_duration.values;
  const total = m.http_reqs.values.count - 1;      // minus the setup request
  const ok = m.checks ? m.checks.values.passes : 0;
  const dropped = m.dropped_iterations ? m.dropped_iterations.values.count : 0;   // k6 ran out of VUs: the system fell behind
  const out = [
    "",
    `  REDIRECT LOAD REPORT  ${GATEWAY}`,
    `  offered ${RATE} req/s for ${DURATION}  ->  ${total} redirects, ${ok} were 302 with a Location, ${total - ok} were not, ${dropped} never sent`,
    `  p50 ${fmt(d.med).padStart(9)}   p95 ${fmt(d["p(95)"]).padStart(9)}   p99 ${fmt(d["p(99)"]).padStart(9)}   max ${fmt(d.max)}`,
    "",
  ];
  return { stdout: out.join("\n") + "\n" };
}
