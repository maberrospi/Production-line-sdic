// 50 requests/s for 30 s to product pages with a realistic popularity skew:
// 80% of requests go to 100 popular products, 20% are spread over the other 9,900.
//
//   -e BASE=http://localhost:8080/products          (or .../cached/products)
//   -e RATE=50 -e DURATION=30s
import http from "k6/http";

const BASE = __ENV.BASE || "http://localhost:8080/products";
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || "30s";

export const options = {
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  scenarios: {
    products: { executor: "constant-arrival-rate", rate: RATE, timeUnit: "1s", duration: DURATION, preAllocatedVUs: 10, maxVUs: 200 },
  },
};

export default function () {
  const id = Math.random() < 0.8 ? 1 + Math.floor(Math.random() * 100) : 101 + Math.floor(Math.random() * 9900);
  http.get(`${BASE}/${id}`, { timeout: "10s", tags: { name: "product" } });
}

function fmt(ms) {
  return ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : ms.toFixed(1) + " ms";
}

export function handleSummary(data) {
  const m = data.metrics, d = m.http_req_duration.values;
  const count = m.http_reqs.values.count;
  const failed = m.http_req_failed ? m.http_req_failed.values.passes : 0;
  const out = [
    "",
    `  PRODUCTS LOAD REPORT  ${BASE}`,
    `  offered ${RATE} req/s for ${DURATION}  ->  completed ${count}, failed ${failed}`,
    `  p50 ${fmt(d.med).padStart(9)}   p95 ${fmt(d["p(95)"]).padStart(9)}   p99 ${fmt(d["p(99)"]).padStart(9)}   avg ${fmt(d.avg)}`,
    "",
  ];
  return { stdout: out.join("\n") + "\n" };
}
