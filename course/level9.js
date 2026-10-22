/* Level 9 — Architecture and APIs */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const txt = (parent, x, y, s, attrs) => { const t = H.svg("text", Object.assign({ x, y, "font-size": 12, fill: "var(--ink)" }, attrs || {}), parent); t.textContent = s; return t; };
  const pct = v => (v * 100).toFixed(v > 0.9999 ? 3 : 2) + "%";

  /* ---------------- 9.1 Monolith or services ---------------- */
  function hops(root) {
    const p = H.panel(root, "What every network hop costs", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Splitting code into services turns function calls into network calls. Each service here is 99.9% available and answers in 10 ms, except 1% of the time when it takes 1 s (a GC pause, a cold cache).</p>
      <div class="controls"><div class="seg" id="hp-m"></div><div class="ctl" style="min-width:240px"><label for="hp-n">Services involved in one request <output id="hp-no"></output></label><input type="range" id="hp-n" min="1" max="100" value="5"></div></div>
      <div class="svgwrap" id="hp-svg"></div><div class="readout" id="hp-r"></div><div class="callout" id="hp-v"></div>`;
    let mode = "chain";
    function run() {
      const n = +p.querySelector("#hp-n").value; p.querySelector("#hp-no").textContent = n;
      const avail = Math.pow(0.999, n), pSlow = 1 - Math.pow(0.99, n);
      const typical = mode === "chain" ? n * 10 : 10;
      readout(p.querySelector("#hp-r"), [["Request succeeds", pct(avail), avail < 0.99 ? "bad" : avail < 0.999 ? "warn" : "good"], ["Typical latency", typical + " ms"], ["Requests that hit at least one 1 s pause", (pSlow * 100).toFixed(1) + "%", pSlow > 0.1 ? "bad" : pSlow > 0.02 ? "warn" : "good"]]);
      const W = 680, Hh = 170, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Availability and slow-request share as the number of services grows" });
      const x = k => 50 + (k - 1) / 99 * (W - 80), y = v => 20 + (1 - v) * (Hh - 50);
      [0, 0.5, 1].forEach(v => { H.svg("line", { x1: 50, x2: W - 30, y1: y(v), y2: y(v), stroke: "var(--line)" }, s); txt(s, 44, y(v) + 4, (v * 100) + "%", { "text-anchor": "end", "font-size": 10, fill: "var(--muted)" }); });
      [1, 25, 50, 75, 100].forEach(k => txt(s, x(k), Hh - 10, k, { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }));
      let a = "", b = ""; for (let k = 1; k <= 100; k++) { a += `${k > 1 ? "L" : "M"}${x(k).toFixed(1)} ${y(Math.pow(0.999, k)).toFixed(1)}`; b += `${k > 1 ? "L" : "M"}${x(k).toFixed(1)} ${y(1 - Math.pow(0.99, k)).toFixed(1)}`; }
      H.svg("path", { d: a, fill: "none", stroke: "var(--ok)", "stroke-width": 2 }, s); H.svg("path", { d: b, fill: "none", stroke: "var(--bad)", "stroke-width": 2 }, s);
      H.svg("line", { x1: x(n), x2: x(n), y1: 14, y2: Hh - 26, stroke: "var(--xp)", "stroke-dasharray": "3 3" }, s);
      txt(s, x(100) - 4, y(Math.pow(0.999, 100)) - 6, "all succeed", { "text-anchor": "end", "font-size": 11, fill: "var(--ok)" }); txt(s, x(100) - 4, y(1 - Math.pow(0.99, 100)) + 14, "hit a 1 s pause", { "text-anchor": "end", "font-size": 11, fill: "var(--bad)" });
      const h = p.querySelector("#hp-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#hp-v"); v.className = "callout " + (pSlow > 0.1 ? "bad" : "warn");
      v.textContent = (mode === "chain" ? `In a chain, latencies add up (${typical} ms before any work) and every service must be up: 0.999^${n} = ${pct(avail)}.` : `Calling ${n} services in parallel keeps typical latency at 10 ms, but the request waits for the slowest one.`) + ` A 1-in-100 slow response becomes ${(pSlow * 100).toFixed(0)}% of requests at ${n} services. Dean and Barroso's 'The Tail at Scale' gives the same arithmetic for fan-out to 100 servers: 63%.`;
    }
    seg(p.querySelector("#hp-m"), [["chain", "Call one after another"], ["fan", "Fan out in parallel"]], mode, v => { mode = v; run(); });
    p.querySelector("#hp-n").addEventListener("input", run); run();
  }

  /* ---------------- 9.2 API styles ---------------- */
  const STYLES = {
    rest: { n: "REST, resource per URL", trips: 3, calls: "GET /users/1 → GET /users/1/orders?limit=3 → 3× GET /orders/{id}/items (in parallel)", kb: 14, note: "Three dependent round trips, and each response carries every field of the resource whether the screen needs it or not (over-fetching)." },
    bff: { n: "REST + backend-for-frontend", trips: 1, calls: "GET /mobile/home  (the BFF calls the services inside the data centre)", kb: 3, note: "One endpoint shaped for this screen. The slow round trips happen inside the data centre where they cost about 1 ms each. The price: an endpoint per screen to maintain." },
    graphql: { n: "GraphQL", trips: 1, calls: "POST /graphql  { user(id:1) { name orders(last:3) { total items { name } } } }", kb: 2, note: "The client asks for exactly these fields in one request; the server resolves them. Flexible for many different clients, but caching, rate limiting and query cost control get harder (one URL, arbitrary queries)." },
    grpc: { n: "gRPC (service to service)", trips: 3, calls: "GetUser → ListOrders → 3× ListItems over one HTTP/2 connection, Protobuf-encoded", kb: 5, note: "Same call shape as REST, but binary Protocol Buffers over HTTP/2 with a typed contract and generated clients. Excellent between your own services; browsers cannot call it directly without a proxy (gRPC-Web)." }
  };
  function apiStyles(root) {
    const p = H.panel(root, "One phone screen, four API styles", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">The home screen needs the user's name, their last 3 orders and each order's items. Payload sizes are illustrative.</p>
      <div class="controls"><div class="seg" id="as-s"></div><div class="ctl" style="min-width:220px"><label for="as-rtt">Round-trip time <output id="as-rtto"></output></label><input type="range" id="as-rtt" min="1" max="300" value="150"></div></div>
      <div class="callout" id="as-c" style="font-family:var(--f-mono);font-size:12.5px"></div><div class="readout" id="as-r"></div><div class="callout" id="as-v"></div>`;
    let k = "rest";
    function run() {
      const S = STYLES[k], rtt = +p.querySelector("#as-rtt").value; p.querySelector("#as-rtto").textContent = rtt + " ms" + (rtt > 100 ? " (mobile)" : rtt < 5 ? " (same data centre)" : "");
      p.querySelector("#as-c").textContent = S.calls; p.querySelector("#as-c").className = "callout";
      const t = S.trips * rtt + (k === "bff" ? 3 : 0);
      readout(p.querySelector("#as-r"), [["Round trips from the device", S.trips], ["Time spent on round trips", t + " ms", t > 300 ? "bad" : t > 150 ? "warn" : "good"], ["Bytes downloaded", "≈" + S.kb + " KB"]]);
      p.querySelector("#as-v").className = "callout"; p.querySelector("#as-v").textContent = S.note;
    }
    seg(p.querySelector("#as-s"), Object.entries(STYLES).map(([a, b]) => [a, b.n]), k, v => { k = v; run(); });
    p.querySelector("#as-rtt").addEventListener("input", run); run();
  }

  function push(root) {
    const p = H.panel(root, "Getting updates to the browser", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A dashboard shows order status. Statuses change about 6 times a minute. How does the browser find out?</p>
      <div class="controls"><div class="seg" id="pu-s"></div><div class="ctl" style="min-width:220px" id="pu-iw"><label for="pu-i">Poll every <output id="pu-io"></output></label><input type="range" id="pu-i" min="1" max="60" value="5"></div></div>
      <div class="readout" id="pu-r"></div><div class="callout" id="pu-v"></div>`;
    let k = "poll";
    function run() {
      const I = +p.querySelector("#pu-i").value; p.querySelector("#pu-io").textContent = I + " s"; p.querySelector("#pu-iw").style.display = k === "poll" ? "" : "none";
      const R = { poll: [["Requests per minute, per browser", (60 / I).toFixed(0)], ["Requests that found nothing new", Math.max(0, 60 / I - 6).toFixed(0), 60 / I > 12 ? "warn" : ""], ["Average delay before you see a change", (I / 2).toFixed(1) + " s", I > 10 ? "bad" : I > 3 ? "warn" : "good"]],
        sse: [["Connections", "1, kept open"], ["Messages per minute", "6 (only real changes)"], ["Delay", "≈ network latency", "good"]],
        ws: [["Connections", "1, kept open"], ["Messages per minute", "6 down, plus anything the browser sends up"], ["Delay", "≈ network latency", "good"]] }[k];
      readout(p.querySelector("#pu-r"), R);
      p.querySelector("#pu-v").className = "callout";
      p.querySelector("#pu-v").textContent = { poll: "Polling is simple and cache-friendly, and fine when a few seconds of delay is acceptable. Shorter intervals buy freshness with mostly empty requests, multiplied by every open tab.", sse: "Server-Sent Events: a normal HTTP response (text/event-stream) that never ends; the server writes an event whenever something changes. One direction only, automatic reconnection built into browsers. A great fit for dashboards and notifications.", ws: "WebSocket (RFC 6455): the HTTP connection is upgraded to a two-way channel. Needed when the client also sends a stream (chat, collaborative editing, games). Costs: long-lived connections to load-balance and to drain during deploys." }[k];
    }
    seg(p.querySelector("#pu-s"), [["poll", "Polling"], ["sse", "Server-Sent Events"], ["ws", "WebSocket"]], k, v => { k = v; run(); });
    p.querySelector("#pu-i").addEventListener("input", run); run();
  }

  /* ---------------- 9.3 Gateways and discovery ---------------- */
  const STAGES = ["TLS", "Authenticate", "Rate limit", "Route", "Service"];
  const REQS = {
    ok: { n: "Valid request", stop: -1, code: "200", why: "Every stage passes. The service receives X-Request-ID and X-Client headers, so its logs can be joined with the gateway's." },
    nokey: { n: "No API key", stop: 1, code: "401", why: "Rejected before touching any service. Authentication lives in one place instead of being re-implemented (slightly differently) in every service." },
    burst: { n: "51st request this second", stop: 2, code: "429", why: "Over the client's limit. The gateway answers 429 Too Many Requests in microseconds, protecting the services from one noisy client." },
    route: { n: "Unknown path", stop: 3, code: "404", why: "No route matches. Only paths you chose to expose reach the internal network." },
    slow: { n: "Service is slow", stop: 4, code: "504", why: "The service did not answer within 2 s. The gateway gives up and frees the connection, instead of holding the client (and a worker) hostage." }
  };
  function gateway(root) {
    const p = H.panel(root, "Follow a request through the gateway", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="gw-s"></div></div><div class="svgwrap" id="gw-svg"></div><div class="callout" id="gw-v"></div>`;
    let k = "ok";
    function draw() {
      const R = REQS[k], W = 680, Hh = 120, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Gateway stages" });
      txt(s, 20, 62, "Client", { "font-weight": 600 });
      STAGES.forEach((st, i) => {
        const x = 80 + i * 112, reached = R.stop === -1 || i <= R.stop, failed = i === R.stop;
        H.svg("rect", { x, y: 40, width: 102, height: 36, rx: 8, fill: failed ? "var(--bad-soft)" : reached ? "var(--ok-soft)" : "transparent", stroke: failed ? "var(--bad)" : reached ? "var(--ok)" : "var(--line)", "stroke-dasharray": reached ? "" : "4 3" }, s);
        txt(s, x + 51, 62, st, { "text-anchor": "middle", "font-size": 11, "font-weight": 600 });
        if (failed) txt(s, x + 51, 98, "→ " + R.code, { "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "var(--bad)" });
      });
      H.svg("rect", { x: 74, y: 18, width: 442, height: 66, rx: 10, fill: "none", stroke: "var(--xp)", "stroke-dasharray": "6 4" }, s); txt(s, 80, 32, "API gateway", { "font-size": 10, fill: "var(--xp)", "font-weight": 600 }); txt(s, 80 + 4 * 112 + 51, 32, "2 s timeout", { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" });
      if (R.stop === -1) txt(s, 80 + 4 * 112 + 51, 98, "→ 200", { "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "var(--ok)" });
      const h = p.querySelector("#gw-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#gw-v"); v.className = "callout " + (R.stop === -1 ? "good" : "warn"); v.textContent = R.why;
    }
    seg(p.querySelector("#gw-s"), Object.entries(REQS).map(([a, b]) => [a, b.n]), k, v => { k = v; draw(); });
    draw();
  }

  /* ---------------- 9.4 Rate limiting algorithms ---------------- */
  const ALGOS = {
    fixed: "Fixed window", log: "Sliding log", counter: "Sliding counter", bucket: "Token bucket"
  };
  const PATTERNS = { steady: "Steady 1.5/s", bursty: "Bursts", edge: "Boundary trick" };
  function traffic(kind) {
    const t = [];
    if (kind === "steady") for (let x = 0.3; x < 30; x += 1 / 1.5) t.push(x);
    if (kind === "bursty") [2, 12.5, 16, 24].forEach(b => { for (let i = 0; i < 12; i++) t.push(b + i * 0.06); });
    if (kind === "edge") { [9.2, 19.2].forEach(b => { for (let i = 0; i < 10; i++) t.push(b + i * 0.07); }); [10.05, 20.05].forEach(b => { for (let i = 0; i < 10; i++) t.push(b + i * 0.07); }); }
    return t.sort((a, b) => a - b);
  }
  function limiter(algo, times, L, W) {
    const out = []; let acc = [], tokens = L, last = 0;
    const counts = {};
    for (const t of times) {
      let ok;
      if (algo === "fixed") { const w = Math.floor(t / W); counts[w] = counts[w] || 0; ok = counts[w] < L; if (ok) counts[w]++; }
      else if (algo === "log") { acc = acc.filter(x => x > t - W); ok = acc.length < L; if (ok) acc.push(t); }
      else if (algo === "counter") { const w = Math.floor(t / W), into = t - w * W; counts[w] = counts[w] || 0; const est = (counts[w - 1] || 0) * (W - into) / W + counts[w]; ok = est < L; if (ok) counts[w]++; }
      else { tokens = Math.min(L, tokens + (t - last) * L / W); last = t; ok = tokens >= 1; if (ok) tokens -= 1; }
      out.push([t, ok]);
    }
    return out;
  }
  function rateLimit(root) {
    const p = H.panel(root, "Four rate limiters, same limit: 10 requests per 10 seconds", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="rl-a"></div></div><div class="controls"><div class="seg" id="rl-p"></div></div>
      <div class="svgwrap" id="rl-svg"></div><div class="readout" id="rl-r"></div><div class="callout" id="rl-v"></div>`;
    let algo = "fixed", pat = "edge";
    const L = 10, W = 10;
    function draw() {
      const res = limiter(algo, traffic(pat), L, W), Wd = 680, Hh = 150, x = t => 30 + t / 30 * (Wd - 50);
      const s = H.svg("svg", { viewBox: `0 0 ${Wd} ${Hh}`, role: "img", "aria-label": "Requests over 30 seconds, accepted or rejected" });
      [0, 10, 20, 30].forEach(t => { H.svg("line", { x1: x(t), x2: x(t), y1: 20, y2: 110, stroke: algo === "fixed" || algo === "counter" ? "var(--line-strong)" : "var(--line)", "stroke-dasharray": "3 3" }, s); txt(s, x(t), 128, t + " s", { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); });
      res.forEach(([t, ok], i) => H.svg("circle", { cx: x(t), cy: ok ? 45 + (i % 4) * 6 : 85 + (i % 4) * 6, r: 3.6, fill: ok ? "var(--ok)" : "var(--bad)" }, s));
      txt(s, Wd - 18, 50, "accepted", { "text-anchor": "end", "font-size": 10, fill: "var(--ok)" }); txt(s, Wd - 18, 92, "rejected", { "text-anchor": "end", "font-size": 10, fill: "var(--bad)" });
      // worst 10-second span
      const acc = res.filter(r => r[1]).map(r => r[0]); let worst = 0; acc.forEach((t, i) => { const n = acc.filter(u => u >= t && u < t + W).length; worst = Math.max(worst, n); });
      const h = p.querySelector("#rl-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#rl-r"), [["Accepted", acc.length + " of " + res.length], ["Most accepted in any 10 s span", worst, worst > L ? "bad" : "good"], ["Memory per client", { fixed: "1 counter", log: "a timestamp per request", counter: "2 counters", bucket: "2 numbers (tokens, time)" }[algo]]]);
      const v = p.querySelector("#rl-v"); v.className = "callout " + (worst > L ? "bad" : "good");
      v.textContent = { fixed: "Counts per clock window and resets at the boundary. Cheap and simple, but 10 requests at 9.9 s and 10 more at 10.1 s are both allowed: double the limit within a fraction of a second.", log: "Remembers the time of every accepted request and counts those in the last 10 s. Exact, but stores one entry per request per client.", counter: "Cloudflare's approximation: this window's count plus the previous window's count weighted by how much of it still overlaps. Two counters per client, and in Cloudflare's measurement over 400 million requests only 0.003% were wrongly allowed or limited.", bucket: "Tokens refill at 1 per second up to 10; each request spends one. Allows a burst up to the bucket size, then the long-run rate. Two numbers per client; used by Stripe and by AWS API Gateway. nginx's limit_req is the closely related leaky bucket." }[algo];
    }
    seg(p.querySelector("#rl-a"), Object.entries(ALGOS), algo, v => { algo = v; draw(); });
    seg(p.querySelector("#rl-p"), Object.entries(PATTERNS), pat, v => { pat = v; draw(); });
    draw();
  }

  /* ---------------- 9.5 Pagination and versioning ---------------- */
  function pagination(root) {
    const p = H.panel(root, "Page 10,000: offset vs keyset", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">One million orders, 50 per page, sorted newest first, with an index on (created_at, id). Timings are from this level's lab on Postgres 16.</p>
      <div class="controls"><div class="ctl" style="min-width:280px"><label for="pg-n">Page <output id="pg-no"></output></label><input type="range" id="pg-n" min="0" max="4" step="1" value="2"></div></div>
      <div class="readout" id="pg-r"></div><div class="callout" id="pg-v"></div>`;
    const M = [[1, 0.03, 50, 0.03], [10, 0.13, 500, 0.03], [100, 1.26, 5000, 0.07], [1000, 7.28, 50000, 0.07], [10000, 71.08, 500000, 0.04]];
    function run() {
      const [pg, om, rows, km] = M[+p.querySelector("#pg-n").value]; p.querySelector("#pg-no").textContent = pg.toLocaleString();
      readout(p.querySelector("#pg-r"), [["OFFSET: rows read", rows.toLocaleString(), rows > 10000 ? "bad" : rows > 500 ? "warn" : ""], ["OFFSET: query time", om + " ms", om > 10 ? "bad" : ""], ["Keyset: rows read / time", "50 / " + km + " ms", "good"]]);
      const v = p.querySelector("#pg-v"); v.className = "callout " + (rows > 10000 ? "bad" : "");
      v.innerHTML = `<code>OFFSET ${((pg - 1) * 50).toLocaleString()} LIMIT 50</code> must walk past every earlier row before returning 50, so cost grows with the page number. Keyset pagination (<code>WHERE (created_at, id) &lt; (last seen) ORDER BY … LIMIT 50</code>) jumps straight to the right place in the index: the same cost on page 10,000 as on page 1.`;
    }
    p.querySelector("#pg-n").addEventListener("input", run); run();

    const q = H.panel(root, "New rows arrive while you scroll", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">You load page 1 (5 items, newest first). Two new orders arrive. Then you load page 2.</p>
      <div class="controls"><div class="seg" id="dr-s"></div></div><div class="svgwrap" id="dr-svg"></div><div class="callout" id="dr-v"></div>`;
    let mode = "offset";
    function drift() {
      const before = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11], after = [22, 21].concat(before);
      const page1 = before.slice(0, 5), page2 = mode === "offset" ? after.slice(5, 10) : before.slice(5, 10);
      const W = 680, Hh = 110, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Two pages of results" });
      const row = (y, label, ids, dupSet) => { txt(s, 20, y + 18, label, { "font-size": 12, "font-weight": 600 }); ids.forEach((id, i) => { const dup = dupSet && dupSet.has(id); H.svg("rect", { x: 130 + i * 70, y, width: 62, height: 28, rx: 6, fill: dup ? "var(--bad-soft)" : "var(--data-soft)", stroke: dup ? "var(--bad)" : "var(--data)" }, s); txt(s, 161 + i * 70, y + 18, "#" + id, { "text-anchor": "middle", "font-size": 12, class: "mono" }); }); };
      row(14, "Page 1", page1); row(60, "Page 2", page2, new Set(page1));
      const h = q.querySelector("#dr-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = q.querySelector("#dr-v"); v.className = "callout " + (mode === "offset" ? "bad" : "good");
      v.textContent = mode === "offset" ? "OFFSET 5 now lands two rows earlier, because two new rows pushed everything down. #16 and #15 appear again. (Deletes cause the opposite: rows silently skipped.)" : "The cursor says 'after #16', so page 2 starts at #15 no matter what was inserted above. No duplicates, no gaps.";
    }
    seg(q.querySelector("#dr-s"), [["offset", "?offset=5"], ["keyset", "?cursor=after #16"]], mode, v => { mode = v; drift(); });
    drift();
  }

  const CHANGES = [
    ["Add a new optional field to a response", false, "Old clients ignore fields they do not know (if they were written to). Stripe treats this as backwards-compatible."],
    ["Rename a response field (amount → amount_cents)", true, "Every client reading the old name breaks. Add the new field alongside, deprecate the old one, remove it in a new version."],
    ["Add a new optional query parameter", false, "Old clients never send it and get the old behaviour."],
    ["Make a previously optional request field required", true, "Requests that worked yesterday now fail validation."],
    ["Change a field's type (string id → integer id)", true, "Typed clients fail to parse; loosely typed ones misbehave later."],
    ["Add a new value to an enum in a response", true, "Often overlooked: a client with a switch over known values may crash on the new one. Document that enums can grow, and treat unknown values safely."],
    ["Add a new endpoint", false, "Nobody depends on something that did not exist."]
  ];
  function breaking(root) {
    const p = H.panel(root, "Breaking or not?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">For each change to a public API, decide whether existing clients could break.</p><div id="br-l" style="display:grid;gap:8px"></div><div class="readout" id="br-r" style="margin-top:12px"></div>`;
    const ans = {};
    const list = p.querySelector("#br-l");
    CHANGES.forEach(([c, br, why], i) => {
      const row = H.el(`<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px;font-size:14px"></span><button class="btn" type="button" data-v="0">Safe</button><button class="btn" type="button" data-v="1">Breaking</button></div><div class="note" style="display:none;margin-top:6px"></div></div>`);
      row.querySelector("span").textContent = c;
      row.querySelectorAll("button").forEach(b => b.onclick = () => {
        const guess = b.dataset.v === "1", right = guess === br; ans[i] = right;
        const n = row.querySelector(".note"); n.style.display = ""; n.style.color = right ? "var(--ok)" : "var(--bad)";
        n.textContent = (right ? "Right: " : "Not quite: ") + (br ? "breaking. " : "safe. ") + why;
        const done = Object.keys(ans).length, score = Object.values(ans).filter(Boolean).length;
        readout(p.querySelector("#br-r"), [["Answered", `${done} of ${CHANGES.length}`], ["Correct", score, score === CHANGES.length ? "good" : ""]]);
      });
      list.appendChild(row);
    });
    readout(p.querySelector("#br-r"), [["Answered", `0 of ${CHANGES.length}`], ["Correct", 0]]);
  }

  Course.register({
    id: 9,
    blurb: "How the pieces talk: when splitting into services pays off, which API style fits which client, what a gateway does, how rate limiters really work, and how to paginate and version an API without breaking anyone.",
    examBadge: "lvl9",
    lessons: [
      { id: "9.1", sources: [["MonolithFirst", "https://martinfowler.com/bliki/MonolithFirst.html", "Martin Fowler"], ["Deconstructing the Monolith", "https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity", "Kirsten Westeinde, Shopify Engineering, 2019: the modular monolith"], ["The Tail at Scale", "https://cacm.acm.org/research/the-tail-at-scale/", "Jeffrey Dean and Luiz André Barroso, Communications of the ACM, 2013"]],
        title: "Monolith, modular monolith, microservices", minutes: 20,
        lede: "Microservices are an organisational tool with a technical bill attached. Before paying it, see what every network hop costs, and what most teams should build first.",
        render(r) { hops(r); H.keys(r, [["Monolith", "One deployable. Function calls are fast and transactions are easy. The risk is a tangled codebase, not the single process."], ["Modular monolith", "One deployable with enforced internal boundaries (Shopify's choice). Most of the structure, none of the network."], ["Microservices", "Independently deployed services owning their data. They let many teams ship independently, at the price of network failures, distributed data and much more operations."], ["Start with a monolith", "Fowler: boundaries are hard to get right early. Split along boundaries that have proven themselves, when team size demands it."], ["Fan-out amplifies the tail", "A rare slow response becomes common when one request touches many services."]]); H.yourApp(r, "In practice", "One app with clear modules (in FastAPI: routers, a service layer, its own tables per module) is a modular monolith. That is the right shape until several teams are tripping over each other's deploys."); },
        check: { q: "Each service is 99.9% available. A request must pass through 10 of them in a chain. Roughly how often does it succeed?", opts: ["99.9%", "99.0%", "90%", "99.99%"], a: 1, why: "0.999^10 ≈ 0.990: ten services each failing 0.1% of the time fail together about 1% of the time." } },
      { id: "9.2", sources: [["RFC 9110: HTTP Semantics", "https://www.rfc-editor.org/rfc/rfc9110.html", "Methods, safety and idempotency, status codes"], ["gRPC over HTTP/2", "https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md", "The gRPC wire protocol"], ["Introduction to GraphQL", "https://graphql.org/learn/introduction/", "graphql.org"], ["Using server-sent events", "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events", "MDN"], ["RFC 6455: The WebSocket Protocol", "https://www.rfc-editor.org/rfc/rfc6455.html", "IETF"]],
        title: "REST, gRPC, GraphQL and real-time", minutes: 25,
        lede: "There is no best API style, only better fits. The client (a phone far away, a service next door, a browser that needs live updates) decides which costs matter.",
        render(r) { apiStyles(r); push(r); H.keys(r, [["REST", "Resources at URLs, HTTP methods and status codes. GET, PUT and DELETE are idempotent by definition (RFC 9110), so caches and retries just work. The default for public APIs."], ["Backend-for-frontend", "A thin API per client type that aggregates calls server-side, fixing chatty screens on high-latency networks."], ["GraphQL", "The client chooses fields; one request per screen. Pays off with many clients and fast-changing screens; harder to cache and to protect from expensive queries."], ["gRPC", "Typed Protobuf contracts over HTTP/2, with streaming. Ideal between services; needs a proxy for browsers."], ["Push", "Polling for 'is there news?', SSE for server-to-browser streams, WebSocket for two-way."]]); },
        check: { q: "Why can a client safely retry a timed-out PUT but not, by default, a POST?", opts: ["PUT is faster to process, so a duplicate costs the server very little", "HTTP defines PUT as idempotent: repeating it has the effect of doing it once", "POST bodies are encrypted with a one-time key, so a replay is rejected", "Servers drop duplicate POSTs automatically, so a retry would be wasted"], a: 1, why: "RFC 9110 marks PUT, DELETE and the safe methods as idempotent. POST needs an idempotency key (Level 7) to be safe to retry." } },
      { id: "9.3", sources: [["Pattern: API Gateway / Backends for Frontends", "https://microservices.io/patterns/apigateway.html", "Chris Richardson"], ["Pattern: Server-side service discovery", "https://microservices.io/patterns/server-side-discovery.html", "Chris Richardson"], ["Service", "https://kubernetes.io/docs/concepts/services-networking/service/", "Kubernetes documentation: stable names and virtual IPs for a changing set of pods"]],
        title: "API gateways and service discovery", minutes: 20,
        lede: "Once there is more than one service, two questions appear: what sits between the internet and your services, and how does anything find a service whose instances come and go?",
        render(r) { gateway(r); H.keys(r, [["The gateway's jobs", "TLS termination, authentication, rate limits, routing, request IDs, timeouts, sometimes response caching. Done once, consistently."], ["Keep it thin", "Business logic in the gateway couples every service to it. Route and protect; do not compute."], ["Service discovery", "Instances change all the time. Clients use a stable name; something maps it to healthy instances."], ["Server-side discovery", "A load balancer or proxy looks the instances up (Kubernetes Services, cloud load balancers, Docker's DNS in the labs)."], ["Client-side discovery", "The client asks a registry (Consul, Eureka) and picks an instance itself. Fewer hops, more logic in every client."]]); },
        check: { q: "Which job does NOT belong in an API gateway?", opts: ["Checking API keys", "Rate limiting per client", "Calculating an order's tax", "Adding a request ID"], a: 2, why: "Business rules belong in services. The gateway handles cross-cutting concerns." } },
      { id: "9.4", sources: [["How we built rate limiting capable of scaling to millions of domains", "https://blog.cloudflare.com/counting-things-a-lot-of-different-things/", "Julien Desgats, Cloudflare, 2017: the sliding window counter"], ["Scaling your API with rate limiters", "https://stripe.com/blog/rate-limiters", "Paul Tarjan, Stripe, 2017: token buckets and load shedding"], ["ngx_http_limit_req_module", "https://nginx.org/en/docs/http/ngx_http_limit_req_module.html", "nginx: leaky bucket, burst, nodelay"], ["RFC 6585, section 4: 429 Too Many Requests", "https://www.rfc-editor.org/rfc/rfc6585.html", "IETF"]],
        title: "Rate limiting algorithms", minutes: 25,
        lede: "Every public API needs a limit per client. The four common algorithms agree on the average rate and disagree on bursts, memory and exactness. The differences show up exactly when someone pushes.",
        render(r) { rateLimit(r); H.keys(r, [["Fixed window", "One counter per window. Allows up to 2× the limit across a boundary."], ["Sliding log", "Exact; memory grows with traffic."], ["Sliding window counter", "Two counters, weighted. Cloudflare's choice at scale."], ["Token bucket / leaky bucket", "Bursts up to a capacity, then a steady rate. Stripe uses token buckets; nginx limit_req is a leaky bucket (with burst, it behaves like one)."], ["Tell the client", "Respond 429 with Retry-After, and keep the shared counters in one place (Redis) so every API instance enforces the same limit."]]); },
        check: { q: "A limit of 100 per minute uses fixed windows. What is the most a client can get through in two seconds?", opts: ["100, because the counter covers any 60-second span", "About 200: 100 just before the minute ends and 100 just after", "About 3, because the limit works out to 1.7 per second", "Unlimited, because fixed windows only count whole minutes"], a: 1, why: "The counter resets at the boundary, so two full windows' worth can land back to back." } },
      { id: "9.5", sources: [["LIMIT and OFFSET", "https://www.postgresql.org/docs/16/queries-limit.html", "PostgreSQL 16 documentation"], ["We need tool support for keyset pagination", "https://use-the-index-luke.com/no-offset", "Markus Winand, Use The Index, Luke"], ["APIs as infrastructure: future-proofing Stripe with versioning", "https://stripe.com/blog/api-versioning", "Brandur Leach, Stripe, 2017"], ["RFC 9745: The Deprecation HTTP Response Header Field", "https://www.rfc-editor.org/rfc/rfc9745.html", "IETF, 2025"], ["RFC 8594: The Sunset HTTP Header Field", "https://www.rfc-editor.org/rfc/rfc8594.html", "IETF, 2019"]],
        title: "Pagination and versioning", minutes: 25,
        lede: "Two promises an API makes over time: that page 2 follows page 1, and that what worked yesterday works tomorrow. Both are easy to break by accident.",
        render(r) { pagination(r); breaking(r); H.keys(r, [["Keyset (cursor) pagination", "WHERE (sort key) < (last seen) ORDER BY … LIMIT n. Constant cost and stable under inserts. Return an opaque cursor, not raw values."], ["Offset is fine when", "Data is small or static, or users need 'jump to page 37'. Always ORDER BY something unique."], ["Additive changes are safe", "New endpoints, new optional fields and parameters. Clients must ignore unknown fields."], ["Breaking changes need a new version", "URL (/v2), header, or Stripe-style dated versions pinned per account."], ["Deprecate out loud", "Deprecation and Sunset headers (RFC 9745, RFC 8594), a successor link, docs, and usage metrics so you know who still calls v1."]]); },
        check: { q: "Users scrolling a feed see the same post twice when new posts arrive. What fixes it?", opts: ["A larger page size, so fewer page boundaries shift", "Keyset pagination: ask for items older than the last one seen", "Caching page 1, so it does not change while the user scrolls", "Sorting by id ascending instead of newest first"], a: 1, why: "Offsets shift when rows are inserted above; a cursor anchored to the last item does not." } }
    ],
    exam: [
      { q: "What is the main reason to choose microservices?", opts: ["Network calls between services are faster than in-process function calls", "Letting many teams deploy independently, at the cost of operational complexity", "Each service needs no database, because state is passed in messages", "Transactions across services are easier than inside one database"], a: 1, why: "The benefit is organisational independence; the cost is distributed-systems complexity." },
      { q: "A request fans out to 50 services in parallel; each is slow 1% of the time. Roughly what share of requests is slow?", opts: ["1%", "About 40%", "50%", "99%"], a: 1, why: "1 − 0.99^50 ≈ 0.39." },
      { q: "A mobile screen makes 6 dependent API calls over a 150 ms network. What usually helps most?", opts: ["A faster database, so each of the six calls returns sooner", "One backend-for-frontend endpoint (or GraphQL query) for the screen", "More API replicas, so the six calls can be served in parallel", "Gzip compression on every response, so each one downloads faster"], a: 1, why: "The time is in round trips, so remove round trips." },
      { q: "Which is a good fit for Server-Sent Events?", opts: ["A multiplayer game sending inputs both ways", "A live dashboard the server updates", "Uploading large files from the browser", "Service-to-service RPC calls"], a: 1, why: "SSE is one-way, server to browser." },
      { q: "Where should an API key check live in a system with a gateway and ten services?", opts: ["In every service, each checking separately", "In the gateway, once", "In the database, with a trigger", "In the browser, before the request is sent"], a: 1, why: "Cross-cutting concerns belong in one consistent place." },
      { q: "Which rate limiter can let through twice its limit in a short span?", opts: ["Token bucket", "Sliding log", "Fixed window", "Sliding window counter"], a: 2, why: "Counts reset at window boundaries." },
      { q: "Why does OFFSET pagination get slower on deep pages?", opts: ["The network sends the larger result pages more slowly", "The database reads and discards every row before the offset", "Indexes stop being used after the first 1,000 rows of a table", "It doesn't: OFFSET jumps straight to the right row in the index"], a: 1, why: "Skipped rows are still computed." },
      { q: "Which change is safe without a new API version?", opts: ["Renaming a field to a clearer name", "Adding an optional response field", "Making an optional field required", "Changing an id from string to integer"], a: 1, why: "Additive changes do not break clients that ignore unknown fields." }
    ],
    lab: {
      title: "Build a gateway, break a rate limiter, and page through a million rows",
      time: "about 4 hours",
      folder: "level-9-gateway-apis/",
      needs: "Docker Desktop (or Docker Engine) and a terminal",
      intro: `<p>An nginx API gateway sits in front of two small FastAPI services. You will send it requests without keys, too many requests, and requests to a slow service; compare a fixed-window limiter with a token bucket in Redis; measure offset against keyset pagination on 1,000,000 rows; and watch an old client break when an API changes underneath it.</p><p>No ports are published. Scripts run in a <code>tools</code> container that calls <code>http://gateway</code>, like an outside client would. API keys: <code>key-alice</code> and <code>key-bob</code>.</p>`,
      vmIntro: "Read-only checks for the API in front of your app (nginx on the VM from Level 1).",
      vmChecks: [
        ["Do unauthenticated requests fail fast?", "curl -s -o /dev/null -w '%{http_code}\\n' https://your-domain/api/<a protected path>", "401 or 403 without a token, never 200 or a 500 stack trace."],
        ["Is there a rate limit at the edge?", "sudo nginx -T 2>/dev/null | grep -nE 'limit_req|limit_conn'", "A limit_req_zone and limit_req on API locations (or the equivalent in your cloud load balancer or WAF), with limit_req_status 429."],
        ["Are upstream timeouts set deliberately?", "sudo nginx -T 2>/dev/null | grep -nE 'proxy_(connect|read|send)_timeout'", "Explicit values that match how long your slowest legitimate endpoint takes. The default proxy_read_timeout is 60 s, often far too generous."],
        ["Do logs carry a request ID?", "sudo nginx -T 2>/dev/null | grep -n request_id; sudo tail -n 3 /var/log/nginx/access.log", "$request_id in the log format and passed to the app (proxy_set_header X-Request-ID), so one ID finds a request in every log."],
        ["Do list endpoints have a maximum page size?", "curl -s 'https://your-domain/api/<list endpoint>?limit=100000' | head -c 300", "The API caps the page size (or rejects the request). An uncapped limit lets one call read your whole table."]
      ],
      steps: [
        { id: "l9-1", why: "A gateway is only useful if every request really passes through its checks. Calling it with and without a key, and finding the same request ID in two logs, shows that it does.", title: "Talk to the gateway",
          body: `${H.code(`cd level-9-gateway-apis
docker compose up -d --build            # the first start seeds 1,000,000 orders (~10 s)
docker compose build tools
docker compose run --rm tools python hello.py
docker compose logs gateway | tail -n 4`)}<p>Read <code>gateway/nginx.conf</code> top to bottom first: it is about 60 lines.</p>`,
          expect: "401 without a key, 200 with one. The response's X-Request-ID is the same ID the users service saw, and the same ID in the gateway's JSON log. /health needs no key; unknown paths get 404.",
          solution: `${H.code(`no key        401  X-Request-ID c90c0331d99b1fcdf28f05d02d6ee688  {"error":"missing or unknown X-Api-Key"}
key-alice     200  X-Request-ID bd9f22a8b2cd6d9f0f25d181c2b907d9  {"id":1,"name":"Grace","seen_request_id":"bd9f22a8b2cd6d9f0f25d181c2b907d9","seen_client":"alice"}
health check  200  X-Request-ID 8f231e94d5e7a6a4995899824a033283  {"ok":true}
unknown path  404  X-Request-ID cfcf96ac2a9d8e777242129513f47dea  {"error":"no route"}

{"time":"…","request_id":"bd9f22a8b2cd6d9f0f25d181c2b907d9","client":"alice","method":"GET",
 "uri":"/users/1","status":200,"upstream":"172.20.0.4:8000","upstream_s":"0.002","total_s":0.002}`, [2])}
            <ul><li><b>One place for auth.</b> The users service has no authentication code at all; it trusts that only the gateway can reach it (no published ports). In production the gateway would validate a JWT or call an auth service (Level 11), but the shape is the same.</li><li><b>The request ID</b> is generated by nginx (<code>$request_id</code>), returned to the client and forwarded to the service. When a user reports an error, that one ID finds the request in every log.</li><li><b>Auth runs before routing.</b> The check is a server-level <code>if</code>, which nginx evaluates before choosing a location. Put it inside <code>location /</code> instead and nested locations would silently skip it, a classic nginx mistake.</li><li><b>upstream_s vs total_s</b> separates time spent in the service from time in the gateway. If they diverge, the gateway (or the client's network) is the bottleneck.</li><li>Your request IDs and container IPs will differ.</li></ul>` },
        { id: "l9-2", why: "A timeout at the gateway is what keeps one slow dependency from tying up every connection. Seeing the 504 arrive at exactly 2 seconds shows the knob doing its job.", title: "A slow service meets a timeout",
          body: `${H.code(`docker compose run --rm tools python slow.py
docker compose logs gateway | grep slow | tail -n 1`)}`,
          expect: "504 after 2.0 seconds, although the client was willing to wait 10. The log shows upstream_s of about 2.00.",
          solution: `${H.code(`504 after 2.09 s
{"time":"…","request_id":"54b4513c…","client":"alice","method":"GET","uri":"/users/slow?ms=3000",
 "status":504,"upstream":"172.20.0.4:8000","upstream_s":"2.003","total_s":2.002}`, [1])}
            <ul><li><b><code>proxy_read_timeout 2s</code></b> caps how long the gateway waits for a response. nginx's default is 60 s: one slow dependency could hold thousands of client connections for a minute each.</li><li><b>The service kept working.</b> The users service still slept its full 3 s; the gateway just stopped waiting. Timeouts protect the caller, not the callee. Level 10 adds the other half: circuit breakers that stop sending traffic to something that is failing.</li><li><b>Pick timeouts from data:</b> slightly above the slowest legitimate p99 for that route, not a round number.</li><li>The 504 body is nginx's default HTML page; a production gateway would add an <code>error_page</code> returning JSON.</li></ul>` },
        { id: "l9-3", why: "Rate limits protect everyone from one client. Measuring what gets through, for bursts and for sustained overload, shows exactly what burst and rate mean in nginx.", title: "Rate-limit per client at the gateway",
          body: `${H.code(`docker compose run --rm tools python burst.py --key key-alice --count 50
docker compose run --rm tools python burst.py --key key-bob --count 5
sleep 3
docker compose run --rm tools python burst.py --key key-alice --count 50 --rate 8
sleep 3
docker compose run --rm tools python burst.py --key key-alice --count 150 --rate 15`)}<p>The gateway allows each client 10 requests per second on average, with a burst of 20 (<code>limit_req zone=perclient burst=20 nodelay</code>).</p>`,
          expect: "50 at once: 21 accepted, 29 rejected with 429. Bob is unaffected. 8 per second: all accepted. 15 per second for 10 s: about 120 accepted, 30 rejected.",
          solution: `${H.code(`50 requests as key-alice in 0.1s: 200 x21, 429 x29
5 requests as key-bob in 0.0s: 200 x5
50 requests as key-alice in 6.1s: 200 x50
150 requests as key-alice in 9.9s: 200 x120, 429 x30`, [1, 4])}
            <ul><li><b>21 = 1 + burst.</b> nginx's leaky bucket lets one request through at the rate and holds up to 20 excess in the bucket; with <code>nodelay</code> those are served immediately instead of being spaced out. Request 22 overflows: 429.</li><li><b>Per client, not global.</b> The zone is keyed by <code>$client</code>, so Alice's flood never touches Bob's allowance. Keyed by IP instead, everyone behind one office NAT would share a limit.</li><li><b>Sustained overload:</b> 10 s × 10 per second = 100, plus the 20 burst = 120. The long-run rate wins; the burst only absorbs short spikes.</li><li><b>Limitation:</b> nginx keeps these counters in its own shared memory. Two gateway instances would each allow 10/s. For a limit shared across instances, use a shared store: the next step.</li></ul>` },
        { id: "l9-4", why: "Algorithms that look identical on average behave very differently at the edges. This step reproduces the fixed-window boundary problem and shows the token bucket closing it.", title: "Fixed window vs token bucket, at the boundary",
          body: `${H.code(`docker compose run --rm tools python ratelimit.py`)}<p>Both limiters in <code>orders/main.py</code> allow 20 requests per 10 seconds on average, implemented as Lua scripts in Redis. The script sends 20 requests just before a 10-second boundary, 20 just after, and 20 more 5 seconds later.</p>`,
          expect: "Fixed window accepts all 40 in under 2 seconds. Token bucket accepts about 23, then 10 of the last 20 (5 seconds × 2 tokens per second).",
          solution: `${H.code(` fixed: before boundary 20/20   just after 20/20   => 40 accepted in 1.7s   |   5 s later  0/20
bucket: before boundary 20/20   just after  3/20   => 23 accepted in 1.6s   |   5 s later 10/20`, [1])}
            <ul><li><b>Fixed window:</b> the counter resets at the boundary, so a client can get 2× the limit in 2 seconds. Then it is shut out for the rest of the window, which is why the last batch gets nothing.</li><li><b>Token bucket:</b> 20 tokens to start, refilled at 2 per second. The second batch finds only the ~3 tokens that refilled in 1.6 s. Five seconds later, 10 tokens: a smooth long-run rate.</li><li><b>Why Lua in Redis?</b> Read, compute and write happen atomically inside Redis, so two API instances cannot both spend the last token. Both scripts use Redis's <code>TIME</code>, so all instances share one clock (Level 7's lesson on clock skew).</li><li><b>Tell the client.</b> 429 responses carry <code>Retry-After</code> and every response carries <code>X-RateLimit-Remaining</code>, so well-behaved clients slow down instead of hammering.</li><li>The script calls the orders service directly (inside the Docker network) so the gateway's own 10/s limit does not interfere.</li></ul>` },
        { id: "l9-5", why: "Deep pages are where offset pagination quietly becomes your slowest query. EXPLAIN shows exactly how many rows the database reads and throws away.", title: "Measure offset vs keyset on a million rows",
          body: `${H.code(`docker compose run --rm tools python pagecost.py
docker compose exec db psql -U lab -d lab -c "EXPLAIN ANALYZE SELECT * FROM orders ORDER BY created_at DESC, id DESC OFFSET 499950 LIMIT 50"`)}`,
          expect: "Offset cost grows with the page: about 70 ms and 500,000 rows read for page 10,000. Keyset stays at 50 rows and a few hundredths of a millisecond on every page.",
          solution: `${H.code(`   page    offset | OFFSET ms rows read  buffers | KEYSET ms rows read  buffers
      1         0 |      0.03        50        4 |      0.03        50        4
     10       450 |      0.13       500        9 |      0.03        50        5
    100     4,950 |      1.26     5,000       64 |      0.07        50        5
  1,000    49,950 |      7.28    50,000      610 |      0.07        50        4
 10,000   499,950 |     71.08   500,000    6,076 |      0.04        50        4`, [6])}
            <ul><li><b>Rows read = offset + limit.</b> Postgres's documentation says it plainly: rows skipped by OFFSET "still have to be computed inside the server". The index helps it walk in order, not skip.</li><li><b>Keyset reads 50 rows on every page</b> because <code>WHERE (created_at, id) &lt; (…)</code> lets the index jump straight to the starting point. It needs an index whose order matches the ORDER BY, including the tie-breaker (<code>id</code>).</li><li><b>71 ms sounds small,</b> but it is per request, it grows linearly, and crawlers and "load more" buttons hit deep pages constantly. At 10 million rows it is ten times worse.</li><li>Your timings will vary with hardware; the rows-read and buffers columns should match.</li></ul>` },
        { id: "l9-6", why: "Correctness matters as much as speed: offset pagination shows users duplicates whenever data changes while they scroll. Measuring it settles the argument.", title: "Page through while new orders arrive",
          body: `${H.code(`docker compose run --rm tools python pager.py --version v1
docker compose run --rm tools python pager.py --version v2`)}<p>Each run reads 20 pages of 50 newest-first orders, pausing briefly between pages, while a writer inserts about 50 new orders per second.</p>`,
          expect: "v1 (offset) shows about 90 orders twice. v2 (cursor) shows none.",
          solution: `${H.code(`v1: read 1000 rows over 20 pages while 96 new orders arrived
  duplicates (same order shown twice): 92
  distinct orders seen: 908  (the first 1000 rows of the list, minus repeats)
v2: read 1000 rows over 20 pages while 97 new orders arrived
  duplicates (same order shown twice): 0
  distinct orders seen: 1000  (the first 1000 rows of the list, minus repeats)`, [2, 5])}
            <ul><li><b>Why duplicates:</b> each new order goes on top and pushes every row down by one. The next <code>OFFSET</code> then starts that many rows too early, so the tail of the previous page appears again. Nearly every insert became one duplicate.</li><li><b>Deletes do the opposite:</b> rows shift up and the client silently skips some, which is worse because nobody notices.</li><li><b>The cursor is opaque</b> (base64 of the last row's sort key). Clients cannot construct or depend on its contents, so you can change what is inside later without breaking anyone.</li></ul>` },
        { id: "l9-7", why: "API changes break clients you cannot update, like app builds already on phones. Watching an old client break shows why versions and deprecation headers exist.", title: "Version an API without breaking old clients",
          body: `${H.code(`docker compose run --rm tools python client_v1.py --path /v1/orders
docker compose run --rm tools python client_v1.py --path /v2/orders`)}<p><code>client_v1.py</code> plays an old mobile app that expects v1's shape: an <code>orders</code> list with <code>amount</code> in dollars. v2 renamed both (<code>data</code>, <code>amount_cents</code>) and switched to cursors.</p>`,
          expect: "Against v1 the app works and receives Deprecation, Sunset and Link headers. Against v2 it crashes on the renamed field.",
          solution: `${H.code(`  Deprecation: @1767225600
  Sunset: Fri, 01 Jan 2027 00:00:00 GMT
  Link: </v2/orders>; rel="successor-version"
  order 1000194: $9.99
  order 1000193: $9.99
  order 1000192: $9.99
app works

app crashed: KeyError 'orders'`, [1, 2, 9])}
            <ul><li><b>Renaming is breaking.</b> Had v2 replaced v1 in place, every installed copy of the old app would have crashed at once. Running both side by side lets clients move on their schedule.</li><li><b>Deprecation: @1767225600</b> is a structured date (seconds since 1970: 1 January 2026), per RFC 9745. <b>Sunset</b> (RFC 8594) says when v1 will stop working, and <b>Link rel="successor-version"</b> says where to go. Clients and API tooling can warn automatically.</li><li><b>Before removing v1,</b> look at the gateway logs: <code>docker compose logs gateway | grep -c '"/v1/'</code>. Version removal is decided by traffic, not by the calendar.</li><li><b>Alternatives:</b> Stripe avoids /v2 paths entirely: each account is pinned to a dated version and the server translates responses for older versions. More work for the API team, much less for clients.</li><li><b>Clean up:</b> <code>docker compose --profile tools down -v</code>.</li></ul>` }
      ]
    }
  });
})();
