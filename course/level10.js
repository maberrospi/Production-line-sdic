/* Level 10 — Reliability and operations */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const txt = (parent, x, y, s, attrs) => { const t = H.svg("text", Object.assign({ x, y, "font-size": 12, fill: "var(--ink)" }, attrs || {}), parent); t.textContent = s; return t; };
  const dur = min => min >= 1440 ? (min / 1440).toFixed(1) + " days" : min >= 60 ? (min / 60).toFixed(1) + " h" : min >= 1 ? min.toFixed(1) + " min" : (min * 60).toFixed(0) + " s";

  /* ---------------- 10.1 SLOs and error budgets ---------------- */
  function budget(root) {
    const p = H.panel(root, "What a nine buys you", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="sl-s"></div><div class="ctl" style="min-width:220px"><label for="sl-r">Traffic <output id="sl-ro"></output></label><input type="range" id="sl-r" min="1" max="4" value="2"></div></div>
      <div class="readout" id="sl-o"></div><div class="callout" id="sl-v"></div>`;
    let slo = 0.999;
    const rates = [1, 10, 100, 1000];
    function run() {
      const r = rates[+p.querySelector("#sl-r").value - 1]; p.querySelector("#sl-ro").textContent = r + " req/s";
      const minutes = (1 - slo) * 30 * 24 * 60, reqs = (1 - slo) * r * 30 * 86400;
      readout(p.querySelector("#sl-o"), [["Error budget per 30 days", ((1 - slo) * 100).toFixed(2).replace(/\.?0+$/, "") + "% of requests"], ["As full downtime", dur(minutes), minutes < 10 ? "bad" : minutes < 60 ? "warn" : ""], ["As failed requests", Math.round(reqs).toLocaleString()]]);
      p.querySelector("#sl-v").className = "callout";
      p.querySelector("#sl-v").textContent = slo >= 0.9999 ? "Four nines leaves about 4 minutes a month: less than one slow deploy or one human noticing a page. It needs automated rollback, redundancy everywhere and a big budget. Only promise it if users need it." : slo >= 0.999 ? "Three nines: about 43 minutes a month. Achievable on a well-run single region with careful deploys. A common target for user-facing APIs." : "Two to two-and-a-half nines leaves hours of slack: fine for internal tools and batch systems, and a sensible first SLO when you have no data yet.";
    }
    seg(p.querySelector("#sl-s"), [[0.99, "99%"], [0.995, "99.5%"], [0.999, "99.9%"], [0.9995, "99.95%"], [0.9999, "99.99%"]], slo, v => { slo = +v; run(); });
    p.querySelector("#sl-r").addEventListener("input", run); run();
  }

  function burn(root) {
    const p = H.panel(root, "Burn rate: how fast is the budget going?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">SLO 99.9% over 30 days. Something starts failing. Drag the error rate and see how long the month's budget lasts, and which of Google's recommended alerts would fire.</p>
      <div class="controls"><div class="ctl" style="min-width:320px"><label for="br-e">Share of requests failing <output id="br-eo"></output></label><input type="range" id="br-e" min="0" max="20" value="10"></div></div>
      <div class="readout" id="br-r"></div><div id="br-a" style="display:grid;gap:6px;margin-top:10px"></div><div class="callout" id="br-v"></div>`;
    const steps = [0.0005, 0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 0.0002, 0.0001];
    const ordered = steps.slice().sort((a, b) => a - b);
    function run() {
      const e = ordered[+p.querySelector("#br-e").value], rate = e / 0.001;
      p.querySelector("#br-eo").textContent = (e * 100).toFixed(e < 0.001 ? 2 : e < 0.01 ? 2 : 1) + "%";
      const exhaust = 30 * 24 * 60 / rate;
      readout(p.querySelector("#br-r"), [["Burn rate", rate.toFixed(rate < 10 ? 1 : 0) + "×", rate >= 14.4 ? "bad" : rate >= 1 ? "warn" : "good"], ["Whole month's budget gone in", rate > 0 ? dur(exhaust) : "never", exhaust < 1440 ? "bad" : exhaust < 43200 ? "warn" : "good"], ["Budget used per hour", ((rate / (30 * 24)) * 100).toFixed(2) + "%"]]);
      const A = [["Page", "1 h and 5 min windows", 14.4, "2% of the budget in 1 hour"], ["Page", "6 h and 30 min windows", 6, "5% of the budget in 6 hours"], ["Ticket", "3 days and 6 h windows", 1, "10% of the budget in 3 days"]];
      const box = p.querySelector("#br-a"); box.innerHTML = "";
      A.forEach(([sev, w, th, means]) => { const on = rate >= th; const d = H.el(`<div style="display:flex;gap:10px;align-items:center;padding:6px 10px;border-radius:8px;border:1px solid ${on ? "var(--bad)" : "var(--line)"};background:${on ? "var(--bad-soft)" : "transparent"};font-size:13px"><b style="width:56px"></b><span style="flex:1"></span><span class="mono"></span></div>`); d.children[0].textContent = on ? sev + "!" : sev; d.children[1].textContent = `burn rate ≥ ${th} over ${w} (${means})`; d.children[2].textContent = on ? "FIRING" : "quiet"; box.appendChild(d); });
      const v = p.querySelector("#br-v"); v.className = "callout " + (rate >= 6 ? "bad" : rate >= 1 ? "warn" : "good");
      v.textContent = rate >= 14.4 ? "Wake someone up: at this pace the month's budget is gone in about two days or less." : rate >= 6 ? "Page, but it is a slower fire: the 6-hour window catches incidents the 1-hour one would miss." : rate >= 1 ? "Spending faster than the SLO allows, but slowly: a ticket for working hours, not a 3 a.m. page." : "Inside budget. Alerting on 'any error' would page constantly for this; alerting on budget burn keeps quiet.";
    }
    p.querySelector("#br-e").max = ordered.length - 1; p.querySelector("#br-e").value = ordered.indexOf(0.01);
    p.querySelector("#br-e").addEventListener("input", run); run();
  }

  /* ---------------- 10.2 Timeouts, retries, circuit breakers ---------------- */
  function threads(root) {
    const p = H.panel(root, "40 worker threads meet a slow dependency", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A FastAPI service handles 40 requests per second with 40 worker threads. Each request calls a payments service. By Little's law, threads busy = arrival rate × time each request holds a thread.</p>
      <div class="controls"><div class="ctl" style="min-width:260px"><label for="th-l">Payments latency <output id="th-lo"></output></label><input type="range" id="th-l" min="0" max="7" value="5"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="th-t"> 300 ms timeout</label></div>
      <div class="svgwrap" id="th-svg"></div><div class="readout" id="th-r"></div><div class="callout" id="th-v"></div>`;
    const L = [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5];
    function run() {
      const lat = L[+p.querySelector("#th-l").value], to = p.querySelector("#th-t").checked; p.querySelector("#th-lo").textContent = H.fmtMs(lat * 1000);
      const hold = to ? Math.min(lat, 0.3) : lat, need = 40 * hold, sat = need > 40;
      const failing = to && lat > 0.3;
      const W = 680, Hh = 70, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Thread pool usage" });
      for (let i = 0; i < 40; i++) H.svg("rect", { x: 20 + i * 16, y: 10, width: 13, height: 28, rx: 2, fill: i < Math.min(40, need) ? (sat ? "var(--bad)" : "var(--compute)") : "var(--line)" }, s);
      txt(s, 20, 58, sat ? `needs ${need.toFixed(0)} threads, has 40: requests queue for a thread` : `${need.toFixed(1)} of 40 threads busy`, { "font-size": 12, fill: sat ? "var(--bad)" : "var(--ink)", "font-weight": 600 });
      const h = p.querySelector("#th-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#th-r"), [["Checkouts", failing ? "fail fast (300 ms)" : sat ? "succeed, very slowly" : "succeed", failing ? "warn" : sat ? "bad" : "good"], ["Unrelated endpoints (/health, /fast)", sat ? "stuck behind them" : "unaffected", sat ? "bad" : "good"], ["Queue", sat ? "grows every second" : "none", sat ? "bad" : "good"]]);
      const v = p.querySelector("#th-v"); v.className = "callout " + (sat ? "bad" : failing ? "warn" : "good");
      v.textContent = sat ? `Each request holds a thread for ${H.fmtMs(hold * 1000)}, so 40/s needs ${need.toFixed(0)} threads. The pool is exhausted, everything queues, and even endpoints that never call payments wait. In this level's lab, a 2 s dependency at 40 checkouts per second made checkout's median 17.3 s, and an endpoint that calls nothing took up to 28 s.` : failing ? "With a timeout, each request gives up after 300 ms: checkouts fail, but quickly, and the rest of the service stays healthy. A fast failure can be retried later, queued, or shown as 'we'll confirm by email'. A hung request just spreads." : "Plenty of headroom. Note how little latency it takes to tip over: at 1 s per call, 40 requests per second already needs all 40 threads.";
    }
    p.querySelector("#th-l").addEventListener("input", run); p.querySelector("#th-t").addEventListener("change", run); run();
  }

  function amplification(root) {
    const p = H.panel(root, "Retries multiply across layers", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A request passes through several services, and each one retries failed calls to the next. The bottom service is down. How many calls does it receive for one user request?</p>
      <div class="controls"><div class="ctl" style="min-width:200px"><label for="am-l">Layers <output id="am-lo"></output></label><input type="range" id="am-l" min="1" max="5" value="3"></div>
      <div class="ctl" style="min-width:200px"><label for="am-r">Retries per layer <output id="am-ro"></output></label><input type="range" id="am-r" min="0" max="5" value="3"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="am-b"> Retry only at the layer next to the failure</label></div>
      <div class="readout" id="am-o"></div><div class="callout" id="am-v"></div>`;
    function run() {
      const l = +p.querySelector("#am-l").value, r = +p.querySelector("#am-r").value, one = p.querySelector("#am-b").checked;
      p.querySelector("#am-lo").textContent = l; p.querySelector("#am-ro").textContent = r;
      const calls = one ? r + 1 : Math.pow(r + 1, l);
      readout(p.querySelector("#am-o"), [["Calls reaching the failing service", calls.toLocaleString(), calls > 10 ? "bad" : calls > 2 ? "warn" : "good"], ["…if 1,000 users try at once", (calls * 1000).toLocaleString(), calls > 10 ? "bad" : ""]]);
      const v = p.querySelector("#am-v"); v.className = "callout " + (calls > 10 ? "bad" : "warn");
      v.textContent = one ? "Retrying in one place keeps it linear. Google's SRE book adds a client-wide retry budget too: retries may be at most 10% of requests, which caps the extra load at about 1.1× however bad things get." : `Each layer multiplies: (${r} + 1)^${l} = ${calls.toLocaleString()} calls. Just when the bottom service is struggling, it receives the most traffic, which keeps it down. The SRE book warns this is a 'combinatorial explosion'.`;
    }
    ["#am-l", "#am-r"].forEach(id => p.querySelector(id).addEventListener("input", run)); p.querySelector("#am-b").addEventListener("change", run); run();
  }

  function breakerSim(root) {
    const p = H.panel(root, "Drive a circuit breaker", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">This breaker opens after 5 consecutive failures and waits 5 seconds before letting one trial request through.</p>
      <div class="controls"><button class="btn" type="button" id="cb-ok">A call succeeds</button><button class="btn" type="button" id="cb-f">A call fails</button><button class="btn" type="button" id="cb-w">Wait 5 seconds</button><button class="btn" type="button" id="cb-x">Reset</button></div>
      <div class="svgwrap" id="cb-svg"></div><div class="callout" id="cb-v"></div>`;
    let st;
    const reset = () => { st = { s: "closed", f: 0, msg: "Closed: calls go through. Make some fail." }; draw(); };
    function call(ok) {
      if (st.s === "open") { st.msg = "Open: the call is rejected instantly without touching the dependency. Callers get a fast error (or a fallback), and the dependency gets breathing room."; return draw(); }
      if (st.s === "half") { if (ok) { st.s = "closed"; st.f = 0; st.msg = "The trial call succeeded, so the breaker closes and traffic flows again."; } else { st.s = "open"; st.msg = "The trial call failed: back to open for another 5 seconds."; } return draw(); }
      if (ok) { st.f = 0; st.msg = "Success resets the failure count."; } else { st.f++; st.msg = `Failure ${st.f} of 5.`; if (st.f >= 5) { st.s = "open"; st.msg = "Fifth failure in a row: the breaker opens."; } }
      draw();
    }
    function draw() {
      const W = 680, Hh = 150, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Circuit breaker states" });
      const defs = H.svg("defs", {}, s), mk = H.svg("marker", { id: "cb-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.6 }, mk);
      const N = { closed: [110, 70, "Closed"], open: [570, 70, "Open"], half: [340, 70, "Half-open"] };
      const arr = (x1, y1, x2, y2, label, ly) => { H.svg("path", { d: `M${x1} ${y1} Q ${(x1 + x2) / 2} ${ly} ${x2} ${y2}`, fill: "none", stroke: "var(--line-strong)", "marker-end": "url(#cb-ar)" }, s); txt(s, (x1 + x2) / 2, ly + (ly < 70 ? -2 : 12), label, { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); };
      arr(170, 55, 510, 55, "5 failures in a row", 10); arr(510, 88, 400, 88, "after 5 s", 118); arr(280, 88, 170, 88, "trial succeeds", 118); arr(400, 60, 510, 60, "trial fails", 40);
      Object.entries(N).forEach(([k, [x, y, l]]) => { const on = st.s === k; H.svg("rect", { x: x - 60, y: y - 22, width: 120, height: 44, rx: 22, fill: on ? (k === "closed" ? "var(--ok-soft)" : k === "open" ? "var(--bad-soft)" : "var(--xp-soft)") : "var(--surface)", stroke: on ? (k === "closed" ? "var(--ok)" : k === "open" ? "var(--bad)" : "var(--xp)") : "var(--line)", "stroke-width": on ? 2.5 : 1 }, s); txt(s, x, y + 4, l + (k === "closed" && on ? ` (${st.f}/5)` : ""), { "text-anchor": "middle", "font-weight": 700 }); });
      const h = p.querySelector("#cb-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#cb-v"); v.className = "callout " + (st.s === "open" ? "bad" : st.s === "half" ? "warn" : ""); v.textContent = st.msg;
    }
    p.querySelector("#cb-ok").onclick = () => call(true); p.querySelector("#cb-f").onclick = () => call(false);
    p.querySelector("#cb-w").onclick = () => { if (st.s === "open") { st.s = "half"; st.msg = "Half-open: the next call is let through as a trial. Everything else is still rejected until it returns."; } else st.msg = "Waiting only matters while the breaker is open."; draw(); };
    p.querySelector("#cb-x").onclick = reset; reset();
  }

  /* ---------------- 10.3 Deploying safely ---------------- */
  const DEPLOY = {
    rolling: { n: "Rolling", note: "10 instances replaced one per minute. The bad version's share grows until an alert fires at minute 5; rolling back is another rolling deploy, so it shrinks just as slowly.", expo: t => t < 5 ? Math.min(1, (t + 1) / 10) : Math.max(0, 0.6 - (t - 5) * 0.1) },
    bluegreen: { n: "Blue-green", note: "All traffic switches to the new (green) environment at once. Everyone sees the bug, but the old (blue) environment is still running, so rollback is one switch back, here at minute 3.", expo: t => t < 3 ? 1 : 0 },
    canary: { n: "Canary", note: "5% of traffic goes to the new version first. Automated analysis compares the canary's error rate with the baseline's and aborts at minute 3. Few users ever saw the bug.", expo: t => t < 3 ? 0.05 : 0 },
    flag: { n: "Feature flag", note: "The code was already deployed, dark. The flag is turned on for 1% of users, then off in seconds when errors appear. Deploying and releasing become separate decisions.", expo: t => t < 1 ? 0.01 : 0 }
  };
  function deploys(root) {
    const p = H.panel(root, "Ship a bad release four ways", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">The new version fails 30% of requests. Traffic is 100 requests per second. Times are illustrative, chosen to match each strategy's mechanics.</p>
      <div class="controls"><div class="seg" id="dp-s"></div></div><div class="svgwrap" id="dp-svg"></div><div class="readout" id="dp-r"></div><div class="callout" id="dp-v"></div>`;
    let k = "rolling";
    function draw() {
      const D = DEPLOY[k], T = 12, W = 680, Hh = 160, x = t => 50 + t / T * (W - 80), y = v => 130 - v * 110;
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Share of users on the bad version over time" });
      [0, 0.5, 1].forEach(v => { H.svg("line", { x1: 50, x2: W - 30, y1: y(v), y2: y(v), stroke: "var(--line)" }, s); txt(s, 44, y(v) + 4, v * 100 + "%", { "text-anchor": "end", "font-size": 10, fill: "var(--muted)" }); });
      for (let t = 0; t <= T; t += 2) txt(s, x(t), 148, t + " min", { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" });
      let d = `M${x(0)} ${y(0)}`, bad = 0;
      for (let i = 0; i <= T * 10; i++) { const t = i / 10, e = D.expo(t); d += `L${x(t).toFixed(1)} ${y(e).toFixed(1)}`; bad += e * 100 * 6 * 0.3; }
      d += `L${x(T)} ${y(0)}Z`;
      H.svg("path", { d, fill: "var(--bad-soft)", stroke: "var(--bad)", "stroke-width": 1.5 }, s);
      txt(s, 56, 18, "share of traffic on the bad version", { "font-size": 11, fill: "var(--muted)" });
      const h = p.querySelector("#dp-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#dp-r"), [["Failed requests caused", Math.round(bad).toLocaleString(), bad > 5000 ? "bad" : bad > 500 ? "warn" : "good"], ["Peak share of users affected", Math.round(Math.max(...Array.from({ length: 121 }, (_, i) => D.expo(i / 10))) * 100) + "%"], ["Extra capacity needed", { rolling: "one instance", bluegreen: "a full second environment", canary: "a few instances", flag: "none" }[k]]]);
      p.querySelector("#dp-v").className = "callout"; p.querySelector("#dp-v").textContent = D.note;
    }
    seg(p.querySelector("#dp-s"), Object.entries(DEPLOY).map(([a, b]) => [a, b.n]), k, v => { k = v; draw(); });
    draw();
  }

  /* ---------------- 10.4 Observability ---------------- */
  function averages(root) {
    const p = H.panel(root, "Averages hide the users who suffer", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">10,000 requests. Most take about 50 ms. Some hit a cold cache or a lock and take 2 seconds.</p>
      <div class="controls"><div class="ctl" style="min-width:260px"><label for="av-t">Slow requests <output id="av-to"></output></label><input type="range" id="av-t" min="0" max="10" value="2"></div></div>
      <div class="svgwrap" id="av-svg"></div><div class="readout" id="av-r"></div><div class="callout" id="av-v"></div>`;
    function run() {
      const share = +p.querySelector("#av-t").value / 100; p.querySelector("#av-to").textContent = (share * 100).toFixed(0) + "%";
      const n = 10000, slow = Math.round(n * share), xs = [];
      for (let i = 0; i < n - slow; i++) xs.push(40 + ((i * 7919) % 2000) / 100);
      for (let i = 0; i < slow; i++) xs.push(1800 + ((i * 104729) % 40000) / 100);
      xs.sort((a, b) => a - b);
      const avg = xs.reduce((a, b) => a + b, 0) / n, pq = q => xs[Math.min(n - 1, Math.floor(q * n))];
      const B = [25, 50, 100, 250, 500, 1000, 2500], counts = B.map((b, i) => xs.filter(v => v <= b && (i === 0 || v > B[i - 1])).length);
      const W = 680, Hh = 140, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Latency histogram" }), mx = Math.max(...counts);
      counts.forEach((c, i) => { const bw = 80, x = 40 + i * 90, hgt = c ? Math.max(3, Math.log10(c + 1) / Math.log10(mx + 1) * 90) : 0; H.svg("rect", { x, y: 105 - hgt, width: bw, height: hgt, fill: i >= 5 ? "var(--bad)" : "var(--compute)", rx: 3 }, s); txt(s, x + bw / 2, 120, "≤" + (B[i] >= 1000 ? B[i] / 1000 + " s" : B[i] + " ms"), { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); txt(s, x + bw / 2, 100 - hgt, c.toLocaleString(), { "text-anchor": "middle", "font-size": 10 }); });
      txt(s, 40, 136, "histogram buckets (bar height on a log scale), as Prometheus stores them", { "font-size": 10, fill: "var(--muted)" });
      const h = p.querySelector("#av-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#av-r"), [["Average", avg.toFixed(0) + " ms", avg > 200 ? "warn" : ""], ["Median (p50)", pq(0.5).toFixed(0) + " ms"], ["p95", pq(0.95).toFixed(0) + " ms", pq(0.95) > 1000 ? "bad" : ""], ["p99", pq(0.99).toFixed(0) + " ms", pq(0.99) > 1000 ? "bad" : ""]]);
      const v = p.querySelector("#av-v"); v.className = "callout " + (share ? "warn" : "good");
      v.textContent = share ? `The average (${avg.toFixed(0)} ms) describes nobody: not the ${(100 - share * 100).toFixed(0)}% who got about 50 ms, nor the ${(share * 100).toFixed(0)}% who waited 2 s. Percentiles from a histogram show both. A page that makes 20 such requests waits for at least one slow one on ${((1 - Math.pow(1 - share, 20)) * 100).toFixed(0)}% of page loads.` : "No tail: here the average is honest. It rarely stays that way.";
    }
    p.querySelector("#av-t").addEventListener("input", run); run();
  }

  const SIGNALS = [
    ["Is checkout's error rate higher than usual right now?", "metrics", "A counter by status, aggregated: cheap to store for every request, perfect for dashboards and alerts."],
    ["Why did order 81723 fail at 14:02?", "logs", "One request's details: the error message, its parameters, the stack trace. Find it by request ID."],
    ["Which of the six services made this request take 3 seconds?", "traces", "A trace shows every span of one request across services, with timing, so the slow hop stands out."],
    ["Are we close to running out of database connections?", "metrics", "A gauge of saturation over time (the fourth golden signal)."],
    ["What did the user do just before the crash?", "logs", "An ordered record of events, joined by request or session ID."],
    ["Is the time going into our code or into the network between services?", "traces", "Compare a client span with the server span inside it: the gap is time on the wire, in queues or in proxies."]
  ];
  function signals(root) {
    const p = H.panel(root, "Metrics, logs or traces?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Pick the signal that answers each question fastest.</p><div id="sg-l" style="display:grid;gap:8px"></div>`;
    const list = p.querySelector("#sg-l");
    SIGNALS.forEach(([qq, a, why]) => {
      const row = H.el(`<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:14px;margin-bottom:6px"></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" type="button" data-v="metrics">Metrics</button><button class="btn" type="button" data-v="logs">Logs</button><button class="btn" type="button" data-v="traces">Traces</button></div><div class="note" style="display:none;margin-top:6px"></div></div>`);
      row.firstElementChild.textContent = qq;
      row.querySelectorAll("button").forEach(b => b.onclick = () => { const n = row.querySelector(".note"), ok = b.dataset.v === a; n.style.display = ""; n.style.color = ok ? "var(--ok)" : "var(--bad)"; n.textContent = (ok ? "Yes: " : `Better: ${a}. `) + why; });
      list.appendChild(row);
    });
  }

  /* ---------------- 10.5 Incidents and disaster recovery ---------------- */
  const DR = {
    backup: { n: "Backup and restore", rpo: "hours (since the last backup)", rto: "hours (rebuild, then restore)", cost: 1, note: "Nothing runs in the second region; you rebuild from infrastructure-as-code and backups. Cheapest by far, and only as good as your last restore test (Level 1)." },
    pilot: { n: "Pilot light", rpo: "seconds to minutes (data replicated continuously)", rto: "tens of minutes (start and scale the app tier)", cost: 2, note: "The data layer runs and replicates in the second region; app servers are off or minimal until needed." },
    warm: { n: "Warm standby", rpo: "seconds to minutes", rto: "minutes (scale up and switch)", cost: 3, note: "A scaled-down but working copy of everything runs in the second region and can take traffic immediately at reduced capacity." },
    active: { n: "Multi-site active/active", rpo: "near zero", rto: "near zero for most disasters", cost: 4, note: "Both regions serve users all the time. The most expensive and complex: every write must be replicated and conflicts handled (Levels 5 and 7). It still does not protect against corrupted data, which replicates too: you need backups anyway." }
  };
  function drStrategies(root) {
    const p = H.panel(root, "How much should recovery cost?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">RPO (recovery point objective): how much recent data you can afford to lose. RTO (recovery time objective): how long you can be down. AWS's disaster-recovery guide describes four strategies.</p>
      <div class="controls"><div class="seg" id="dr2-s"></div></div><div class="readout" id="dr2-r"></div><div class="callout" id="dr2-v"></div>`;
    let k = "backup";
    function run() { const D = DR[k]; readout(p.querySelector("#dr2-r"), [["RPO (data you could lose)", D.rpo], ["RTO (time to recover)", D.rto], ["Running cost", "$".repeat(D.cost) + "<span style='opacity:.25'>" + "$".repeat(4 - D.cost) + "</span>"]]); p.querySelector("#dr2-v").className = "callout"; p.querySelector("#dr2-v").textContent = D.note; }
    seg(p.querySelector("#dr2-s"), Object.entries(DR).map(([a, b]) => [a, b.n]), k, v => { k = v; run(); });
    run();
  }

  const FIRST = [
    ["Errors jumped from 0.1% to 12% four minutes after a deploy.", ["Roll back the deploy", "Read the new code to find the bug", "Scale up the database"], 0, "Mitigate first, understand later. The deploy is the prime suspect and rolling back is quick and safe. Debug the bad version afterwards, calmly."],
    ["The database disk is 97% full and growing 1% per minute.", ["Write a postmortem", "Free space or grow the volume now, then find what is writing", "Restart the app servers"], 1, "Three minutes from an outage: buy time first (expand the disk, drop an inactive replication slot, rotate huge logs), then investigate. Postmortems come after the fire is out."],
    ["Three engineers are investigating the same outage in a chat, and two just restarted different services.", ["Let them coordinate in the chat", "Name an incident commander who assigns roles and owns decisions", "Page more engineers"], 1, "Incident response roles (commander, operations, communications) stop well-meaning people from colliding. One person decides; everyone else knows who that is."]
  ];
  function firstMoves(root) {
    const p = H.panel(root, "First moves in an incident", "Try it");
    p.innerHTML = `<div id="fm-l" style="display:grid;gap:8px"></div>`;
    const list = p.querySelector("#fm-l");
    FIRST.forEach(([sit, opts, a, why]) => {
      const row = H.el(`<div style="border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:14px;margin-bottom:6px;font-weight:600"></div><div style="display:flex;gap:6px;flex-wrap:wrap"></div><div class="note" style="display:none;margin-top:6px"></div></div>`);
      row.firstElementChild.textContent = sit;
      opts.forEach((o, i) => { const b = H.el(`<button class="btn" type="button"></button>`); b.textContent = o; b.onclick = () => { const n = row.querySelector(".note"); n.style.display = ""; n.style.color = i === a ? "var(--ok)" : "var(--bad)"; n.textContent = (i === a ? "Yes. " : `Better: "${opts[a]}". `) + why; }; row.children[1].appendChild(b); });
      list.appendChild(row);
    });
  }

  Course.register({
    id: 10,
    blurb: "Keeping a running system healthy: deciding how reliable it must be, surviving slow and failing dependencies, shipping changes without breaking users, seeing what is happening inside, and recovering when things still go wrong.",
    examBadge: "lvl10",
    lessons: [
      { id: "10.1", sources: [["Service Level Objectives", "https://sre.google/sre-book/service-level-objectives/", "Google, Site Reliability Engineering, chapter 4"], ["Alerting on SLOs", "https://sre.google/workbook/alerting-on-slos/", "Google, The Site Reliability Workbook, chapter 5: burn rates and multiwindow alerts"], ["Embracing Risk", "https://sre.google/sre-book/embracing-risk/", "Google, Site Reliability Engineering, chapter 3: error budgets"]],
        title: "SLIs, SLOs and error budgets", minutes: 25,
        lede: "100% reliability is the wrong target: it is impossible, and chasing it stops you shipping. Instead, measure what users experience, pick a target slightly below perfect, and spend the difference deliberately.",
        render(r) { budget(r); burn(r); H.keys(r, [["SLI (service level indicator)", "A measurement of user experience, as a ratio: good events / all events. 'Checkouts that succeeded in under 1 s.'"], ["SLO (service level objective)", "A target for the SLI over a window: 99.9% over 30 days."], ["SLA (service level agreement)", "A contract with consequences (refunds). Set it looser than your SLO."], ["Error budget", "1 − SLO. While budget remains, ship; when it runs out, slow down and fix reliability."], ["Alert on burn rate", "Page when the budget is burning fast (14.4× over 1 h and 5 min), ticket when slowly. Not on every error."]]); H.yourApp(r, "In practice", "Start with two SLIs from nginx's access log or Prometheus: the share of requests that are not 5xx, and the share faster than a threshold you choose from today's p99. Set the SLO a little below what you achieve now."); },
        check: { q: "Your SLO is 99.9% and errors are running at 1.44%. What is the burn rate?", opts: ["1.44×", "14.4×", "0.144×", "144×"], a: 1, why: "Burn rate = error ratio / budget ratio = 1.44% / 0.1% = 14.4: a month's budget would last about 2 days." } },
      { id: "10.2", sources: [["Timeouts, retries, and backoff with jitter", "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/", "Marc Brooker, Amazon Builders' Library"], ["Handling Overload", "https://sre.google/sre-book/handling-overload/", "Google, Site Reliability Engineering, chapter 21: retry budgets"], ["Addressing Cascading Failures", "https://sre.google/sre-book/addressing-cascading-failures/", "Google, Site Reliability Engineering, chapter 22"], ["CircuitBreaker", "https://martinfowler.com/bliki/CircuitBreaker.html", "Martin Fowler"]],
        title: "Timeouts, retries and circuit breakers", minutes: 25,
        lede: "Most outages are not one thing breaking; they are one slow thing spreading. Three small tools stop the spread: give up in time, retry with restraint, and stop calling what is clearly down.",
        render(r) { threads(r); amplification(r); breakerSim(r); H.keys(r, [["Every network call gets a timeout", "Many HTTP clients wait forever by default. Base the value on the dependency's real p99."], ["Retry with backoff and jitter", "Wait exponentially longer between attempts, randomised, so clients do not retry in lockstep."], ["Retry in one layer, with a budget", "Cap attempts per request (about 3) and retries per client (about 10% of requests)."], ["Only retry what is safe", "Idempotent operations, or ones with an idempotency key (Level 7)."], ["Circuit breaker", "After repeated failures, fail fast for a while, then probe. Protects both sides."]]); },
        check: { q: "Three layers each retry 3 times. The bottom service is down. How many calls can one user request cause at the bottom?", opts: ["3", "9", "12", "64"], a: 3, why: "(3 + 1)^3 = 64. Retry at one layer only." } },
      { id: "10.3", sources: [["BlueGreenDeployment", "https://martinfowler.com/bliki/BlueGreenDeployment.html", "Martin Fowler"], ["CanaryRelease", "https://martinfowler.com/bliki/CanaryRelease.html", "Danilo Sato, martinfowler.com"], ["Canarying Releases", "https://sre.google/workbook/canarying-releases/", "Google, The Site Reliability Workbook, chapter 16"], ["Deployments: rolling update", "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/", "Kubernetes documentation"]],
        title: "Rolling, blue-green, canary and feature flags", minutes: 20,
        lede: "Most incidents start with a change. You cannot stop shipping, so make each change small, visible to few users first, and quick to undo.",
        render(r) { deploys(r); H.keys(r, [["Rolling", "Replace instances a few at a time. No extra environment, but rollback is as slow as rollout."], ["Blue-green", "Two full environments, switch traffic at once. Instant rollback, double the capacity."], ["Canary", "A small share of traffic first, compared automatically with the old version, then widen."], ["Feature flags", "Deploy code dark; turn features on per user group. Decouples deploying from releasing."], ["Watch the right comparison", "A 10% canary failing 20% of requests moves the global error rate by only 2%. Compare canary with baseline."]]); },
        check: { q: "Why compare a canary's error rate with the baseline's instead of watching the overall SLO?", opts: ["The overall SLO is paused during deploys, so it cannot show the canary's errors", "With 5% of traffic on the canary, even a badly broken canary barely moves the overall rate", "Canaries run with error reporting off, so only a comparison reveals failures", "Comparing two rates is cheaper for Prometheus than computing the SLO"], a: 1, why: "A small slice is diluted by healthy traffic, so look at the slice itself." } },
      { id: "10.4", sources: [["Monitoring Distributed Systems", "https://sre.google/sre-book/monitoring-distributed-systems/", "Google, Site Reliability Engineering, chapter 6: the four golden signals"], ["Observability primer and signals", "https://opentelemetry.io/docs/concepts/signals/", "OpenTelemetry documentation"], ["Histograms and summaries", "https://prometheus.io/docs/practices/histograms/", "Prometheus documentation"], ["The USE Method", "https://www.brendangregg.com/usemethod.html", "Brendan Gregg"]],
        title: "Metrics, logs and traces", minutes: 25,
        lede: "When something is wrong you need to answer three questions quickly: is it wrong (metrics), what happened to this request (logs), and where did the time go (traces).",
        render(r) { averages(r); signals(r); H.keys(r, [["Four golden signals", "Latency, traffic, errors, saturation (Google SRE). Per service, on one dashboard."], ["Histograms, not averages", "Record latency in buckets so you can compute p95/p99 and aggregate across instances."], ["Structured logs with IDs", "JSON lines with a request ID, so one search joins the gateway, the app and the database."], ["Traces", "Spans with parent links across services (OpenTelemetry), sampled to keep cost down."], ["Labels have a cost", "Never put user IDs or URLs with IDs in metric labels: each value is a new time series."]]); },
        check: { q: "Why record latency as a histogram rather than an average?", opts: ["Histograms use less memory than storing a running average for each series", "Averages hide the slow tail; histograms give percentiles and combine across hosts", "Prometheus cannot store averages at all, only counters and histogram buckets", "Averages are only meaningful for CPU and memory, not for request latency"], a: 1, why: "A small share of very slow requests barely moves the mean but ruins p99." } },
      { id: "10.5", sources: [["Disaster recovery options in the cloud", "https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html", "AWS whitepaper"], ["Managing Incidents", "https://sre.google/sre-book/managing-incidents/", "Google, Site Reliability Engineering, chapter 14"], ["Postmortem Culture: Learning from Failure", "https://sre.google/sre-book/postmortem-culture/", "Google, Site Reliability Engineering, chapter 15"]],
        title: "Incidents, RPO/RTO and multi-region", minutes: 20,
        lede: "Something will eventually break badly. What matters then is how much data you lose, how long you are down, and whether the people responding work as a team.",
        render(r) { firstMoves(r); drStrategies(r); H.keys(r, [["Mitigate before you diagnose", "Roll back, fail over, shed load. Root cause can wait an hour; users cannot."], ["Roles", "An incident commander decides, operations fixes, communications updates users and stakeholders."], ["Blameless postmortems", "What happened, impact, timeline, contributing causes, action items with owners. Systems, not people, are the cause."], ["RPO and RTO", "Set by the business per system, then a strategy (and budget) is chosen to meet them."], ["Practise", "A failover or restore you have never rehearsed will not work on the day."]]); },
        check: { q: "Your nightly backup is your only protection. What is your RPO?", opts: ["Zero, because the backup runs every night", "Up to about 24 hours of data", "The time a restore takes to finish", "One week, the usual retention period"], a: 1, why: "Anything written since the last backup is lost: up to a day." } }
    ],
    exam: [
      { q: "Which is the best SLI for a checkout API?", opts: ["CPU usage of the API servers, averaged over five minutes", "Share of checkout requests that succeed within 1 second", "Number of successful deploys per day to the checkout API", "Size of the orders database and its growth per week"], a: 1, why: "SLIs measure what users experience, as a ratio of good to total events." },
      { q: "A 99.9% SLO over 30 days allows roughly how much total downtime?", opts: ["4 minutes", "43 minutes", "7 hours", "3 days"], a: 1, why: "0.1% of 43,200 minutes ≈ 43 minutes." },
      { q: "Why do burn-rate alerts check a short window as well as a long one?", opts: ["To use less memory, because short windows need fewer stored samples", "So the alert fires only while budget is still burning, and clears soon after a fix", "Because Prometheus requires two windows for any recording rule", "To page more often, so that short blips are caught as well as long ones"], a: 1, why: "The short window (1/12 of the long one) confirms the burn is ongoing and lets the alert reset quickly." },
      { q: "A dependency becomes slow and your service has no timeout. What typically happens?", opts: ["Only the requests that use that dependency slow down", "Worker threads fill up waiting, and every endpoint slows or stalls", "Nothing, because the client library times out after 30 s by default", "The dependency recovers sooner, because callers are waiting quietly"], a: 1, why: "Waiting requests hold threads; once the pool is full, everything queues." },
      { q: "What does jitter add to exponential backoff?", opts: ["Longer timeouts, so slow responses have time to arrive", "Randomness, so many clients don't retry at the same instants", "Encryption of retried requests, so they cannot be replayed", "More retries, so transient errors are always overcome"], a: 1, why: "Synchronised retries arrive as waves; jitter spreads them out." },
      { q: "A circuit breaker is open. What happens to a new call?", opts: ["It waits until the dependency recovers, then goes through", "It fails immediately without calling the dependency", "It is retried 3 times before the breaker gives up", "It is queued and sent when the breaker closes"], a: 1, why: "Open means fail fast, until the cooldown allows a trial call." },
      { q: "Which deployment strategy gives instant rollback but needs double the capacity during a deploy?", opts: ["Rolling", "Blue-green", "Canary", "Recreate"], a: 1, why: "Two full environments, and switching back is one change." },
      { q: "During an incident, what comes first?", opts: ["Finding the root cause, so the fix is the right one", "Mitigating user impact: roll back, fail over, shed load", "Writing the postmortem while details are still fresh", "Finding out which person made the change that broke it"], a: 1, why: "Restore service first; investigate once users are unaffected." }
    ],
    lab: {
      title: "Break a dependency, contain it, alert on an SLO, ship a canary and read a trace",
      time: "about 5 hours",
      folder: "level-10-reliability/",
      needs: "Docker Desktop (or Docker Engine), a terminal and a browser; ports 9090 and 16686 free on localhost (or set PROM_PORT and JAEGER_PORT)",
      intro: `<p><code>checkout</code> calls <code>payments</code> through Toxiproxy, a proxy that can add latency or cut connections on command. Each checkout chooses a resilience policy with the <code>X-Policy</code> header, so you can compare them under the same fault. Prometheus records metrics and evaluates SLO alerts; Jaeger collects traces.</p><p>Only the Prometheus and Jaeger web pages are published, on 127.0.0.1. Everything else stays on the Compose network. Three helpers: <code>./load.sh</code> runs the load generator in the <code>tools</code> container, <code>./toxi.sh</code> runs Toxiproxy's command-line tool, and <code>./payments.sh</code> makes payments answer errors or shows what it received. On Windows without a POSIX shell, the README lists the equivalent <code>docker compose</code> commands.</p><p>Policies: <code>none</code> (no timeout), <code>timeout</code> (300 ms), <code>retry</code> (3 immediate retries), <code>backoff</code> (retries with jittered backoff and a 10% retry budget) and <code>breaker</code> (a circuit breaker).</p>`,
      vmIntro: "Read-only checks that your production setup can tell you it is unhealthy, and contain it when it is.",
      vmChecks: [
        ["Do outbound HTTP calls have timeouts?", "grep -rnE 'httpx\\.(Client|AsyncClient|get|post)|requests\\.(get|post|Session)' --include=*.py . | grep -v timeout | head", "No matches: every client or call passes timeout=. httpx defaults to 5 s; requests has no default and can wait forever."],
        ["Is nginx's upstream timeout deliberate?", "sudo nginx -T 2>/dev/null | grep -nE 'proxy_(connect|read)_timeout'", "Values chosen from your slowest legitimate endpoint, not the 60 s default."],
        ["Is something measuring errors and latency?", "sudo awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head", "You can at least count status codes. Better: Prometheus metrics or a hosted monitor with an alert on 5xx ratio and p95 latency."],
        ["Will you hear about an outage?", "# not a command: list your alerts and where they go", "An external uptime check (from outside the VM) and at least one alert that reaches your phone. An alert that only lands in an unread email does not count."],
        ["Can you roll back in one command?", "docker image ls --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' | head", "The previous image tag is still present (Level 1's deploy script keeps it), so rolling back is a tag change and a restart."]
      ],
      steps: [
        { id: "l10-1", why: "You cannot tell that something is broken without knowing what healthy looks like. A baseline run gives you the numbers every later step is compared with, and checks that metrics and traces are flowing before you need them.", title: "Start everything and take a baseline",
          body: `${H.code(`cd level-10-reliability
docker compose up -d --build
docker compose build tools
./load.sh --policy none --rate 40 --duration 30
./payments.sh stats`)}<p>Then open <b>http://localhost:9090/targets</b> (Prometheus) and <b>http://localhost:16686</b> (Jaeger: choose Service <i>checkout</i>, then <i>Find Traces</i>). Read <code>checkout/main.py</code> first: the function <code>pay</code> holds all five policies in about 50 lines.</p><p><code>load.sh</code> starts a new checkout every 1/40 s whether or not earlier ones have finished, the way real users keep arriving. Each line covers the last 5 seconds: <i>answered</i> and its p50/p95, <i>waiting</i> (sent but not yet answered) and <i>payments calls</i> (what payments received).</p>`,
          expect: "Every checkout succeeds in about 20 ms, nothing waits, and payments receives exactly one call per checkout. On the targets page, checkout-v1 and payments are UP; checkout-v2 is DOWN until step 7. Jaeger lists traces from the run.",
          solution: `${H.code(`policy=none  target=http://checkout-v1:8000  40 checkouts/s for 30 s (1,200 checkouts)
  time  answered     ok  failed  waiting       p50       p95  payments calls
    5s       200    200       0        1     21 ms     24 ms  +200
   10s       200    200       0        1     20 ms     23 ms  +201
  …
   30s       200    200       0        0     20 ms     22 ms  +199

Summary (30 s until the last answer)
  checkouts sent            1,200
  succeeded                 1,200  (100.0%)
  failed                    0
  latency p50 / p95 / max   21 ms / 23 ms / 75 ms
  /fast (calls nothing)     30 probes, p50 3 ms, max 23 ms
  answered by v1            1,200 checkouts, 0 failed (0.0%)
  payments received         1,200 calls for 1,200 orders (1.00 calls per checkout)

payments: 1,200 calls for 1,200 distinct orders, 0 answered 500 (error rate set to 0%)`)}
            <ul><li><b>20 ms</b> is payments' 15 ms of work plus the hop through Toxiproxy. Write the numbers down: p50 21 ms, p95 23 ms, /fast 3 ms.</li><li><b>Little's law</b> says threads busy = arrival rate × time each request holds a thread = 40/s × 0.02 s ≈ 1 of the 40 available. Lots of headroom.</li><li><b>Why <code>/fast</code>?</b> It does nothing, but like every <code>def</code> endpoint in FastAPI it runs on a worker thread. It is the canary for "is the service itself healthy?", separate from "is payments healthy?".</li><li><b>checkout-v2 DOWN is expected:</b> Prometheus is configured to scrape it, but it only starts in step 7.</li></ul>` },

        { id: "l10-2", why: "This is the most common way one slow dependency takes down a healthy service: no timeout, so every request waits, threads run out, and even requests that never touch the dependency queue behind them. Seeing it once makes the case for timeouts better than any rule.", title: "Make payments slow, with no timeout",
          body: `${H.code(`./toxi.sh toxic add -t latency -a latency=2000 -n slow payments
./toxi.sh list
./load.sh --policy none --rate 40 --duration 30`)}<p>While it runs, in Prometheus (<b>Query</b>, then the <i>Graph</i> tab, range 5m) plot <code>checkout_threads_busy</code>, then <code>checkout_inflight_requests</code>. A <i>toxic</i> is Toxiproxy's word for a fault; this one delays everything payments sends back by 2 s.</p>`,
          expect: "Throughput drops to about 20 answers per second, the waiting column climbs past 600 and latency grows every interval, ending around 30 s. /fast, which calls nothing, takes seconds too. Every checkout eventually succeeds. threads_busy sits flat at 40; inflight climbs to about 600.",
          solution: `${H.code(`payments	0.0.0.0:9000	payments:8000	enabled	1
policy=none  target=http://checkout-v1:8000  40 checkouts/s for 30 s (1,200 checkouts)
  time  answered     ok  failed  waiting       p50       p95  payments calls
    5s        79     79       0      122  2,039 ms  3,048 ms  +119
   10s        81     81       0      241  4,079 ms  5,087 ms  +81
   15s       115    115       0      326  7,122 ms  8,147 ms  +115
   20s        85     85       0      441  9,171 ms    10.2 s  +85
   25s       107    107       0      534    12.2 s    13.3 s  +107
   30s        93     93       0      640    14.3 s    15.4 s  +93
   35s       107    107       0      533    17.3 s    18.4 s  +107
  …
   60s        97     97       0       40    29.7 s    30.8 s  +97
   62s        40     40       0        0    31.6 s    31.8 s  +0

Summary (62 s until the last answer)
  succeeded                 1,200  (100.0%)
  latency p50 / p95 / max   17.3 s / 30.6 s / 31.8 s
  /fast (calls nothing)     8 probes, p50 4,091 ms, max 27.9 s
  payments received         1,200 calls for 1,200 orders (1.00 calls per checkout)

Prometheus: max checkout_threads_busy 40, max checkout_inflight_requests 601`, [10, 18, 19])}
            <ul><li><b>The arithmetic:</b> each checkout now holds a thread for 2 s, so 40 threads finish 40 / 2 = 20 checkouts per second. 40 arrive per second, so the queue grows by 20 every second: 600 after 30 s. Each new arrival waits behind everyone already queued, which is why p50 rises by about 2 s every 5 s.</li><li><b>"100% succeeded" is a lie users would not believe.</b> No error was ever returned, so an error-rate alert stays silent while users wait 17 seconds. That is why the SLI in step 6 should also count slow requests as bad (the Workbook's latency SLI); this lab alerts on errors only to keep the rules short.</li><li><b><code>/fast</code> got stuck too</b> (up to 27.9 s, and only 8 probes finished in 62 s). It never calls payments, but it needs a thread like everyone else. This is how a slow dependency becomes a full outage: health checks time out, the load balancer marks the service dead, and the remaining instances get even more load.</li><li><b>threads_busy flat at 40</b> is the saturation signal from the four golden signals. <code>/metrics</code> kept answering because it is an <code>async</code> endpoint that needs no thread, which is also a reminder that a health check can look fine while the real work is stuck.</li><li><b>payments was never slow.</b> It received 119 calls in the first 5 s while only 79 answers came back: the 2 s was added on the way back. Step 8 shows this in a trace.</li></ul>` },

        { id: "l10-3", why: "A timeout turns a slow failure into a fast one. The checkouts still fail, but the service stays healthy and can tell users something useful, which is the whole point of failing fast.", title: "Give up after 300 ms",
          body: `${H.code(`./load.sh --policy timeout --rate 40 --duration 30
./payments.sh stats`)}<p>The 2 s toxic is still in place. The <code>timeout</code> policy passes <code>timeout=0.3</code> to the HTTP client, chosen from payments' normal p99 (about 25 ms) plus generous headroom.</p>`,
          expect: "Every checkout fails with 503 in about 308 ms, nothing queues (waiting stays near 12), and /fast is back to a few milliseconds. payments still received, and charged, all 1,200 orders.",
          solution: `${H.code(`policy=timeout  target=http://checkout-v1:8000  40 checkouts/s for 30 s (1,200 checkouts)
  time  answered     ok  failed  waiting       p50       p95  payments calls
    5s       188      0     188       13    307 ms    315 ms  +200
   10s       200      0     200       12    308 ms    312 ms  +201
  …
Summary (30 s until the last answer)
  succeeded                 0  (0.0%)
  failed                    1,200
        1,200  503 timeout
  latency p50 / p95 / max   308 ms / 313 ms / 355 ms
  /fast (calls nothing)     31 probes, p50 4 ms, max 11 ms
  payments received         1,200 calls for 1,200 orders (1.00 calls per checkout)

payments: 1,200 calls for 1,200 distinct orders, 0 answered 500 (error rate set to 0%)`, [9, 10])}
            <ul><li><b>Little's law again:</b> 40/s × 0.3 s = 12 threads busy, comfortably under 40, so nothing queues and the rest of the service (here <code>/fast</code>) is unaffected. The fault is contained to the feature that depends on payments.</li><li><b>A fast failure is useful.</b> Checkout could now show "we'll confirm your order by email" and retry from a queue (Level 8), or offer another payment method. A hung request offers nothing.</li><li><b>Every one of those "failed" orders was charged.</b> payments did its work in 15 ms; only the reply was late. A timeout tells you that <i>you</i> stopped waiting, not that the operation did not happen. This is why retrying a payment needs an idempotency key (Level 7), and why the order should be reconciled later rather than simply marked failed.</li></ul>` },

        { id: "l10-4", why: "Retries are the right fix for brief, random failures and exactly the wrong one for an outage. Running both cases side by side shows why the Builders' Library and the SRE book insist on backoff, jitter and a retry budget, rather than on retrying or not retrying.", title: "Retry: an outage, then transient errors",
          body: `${H.code(`# Part 1: payments is still slow (a hard outage)
./load.sh --policy retry --rate 40 --duration 30
./load.sh --policy backoff --rate 40 --duration 30

# Part 2: payments is fast again, but 5% of charges fail at random
./toxi.sh toxic remove -n slow payments
./payments.sh errors 0.05
./load.sh --policy timeout --rate 40 --duration 30 --every 0
./load.sh --policy backoff --rate 40 --duration 30 --every 0
./payments.sh errors 0`)}<p><code>retry</code> tries again immediately, up to 3 times. <code>backoff</code> waits a random time between 0 and 50 ms × 2<sup>attempt</sup> (full jitter) and only retries while retries are under 10% of recent requests (the retry budget).</p>`,
          expect: "Part 1: retry sends 4 calls per checkout to payments and holds each thread for about 1.2 s, so queueing returns: p50 grows to several seconds and /fast slows to seconds. backoff sends about 1.1 calls per checkout and stays at about 300 ms. Part 2: without retries about 5% of checkouts fail; with backoff none do, for about 5% extra calls.",
          solution: `${H.code(`policy=retry   …
    5s       120      0     120       81  1,556 ms  1,896 ms  +582
   30s       156      0     156      308  7,198 ms  7,750 ms  +618
  failed                    1,200
        1,200  503 timeout (after 4 attempts)
  latency p50 / p95 / max   5,496 ms / 9,607 ms / 10.0 s
  /fast (calls nothing)     15 probes, p50 1,448 ms, max 8,744 ms
  payments received         4,800 calls for 1,200 orders (4.00 calls per checkout)

policy=backoff …
  failed                    1,200
        1,200  503 timeout (retry budget exhausted)
  latency p50 / p95 / max   309 ms / 667 ms / 718 ms
  /fast (calls nothing)     31 probes, p50 3 ms, max 58 ms
  payments received         1,321 calls for 1,200 orders (1.10 calls per checkout)

payments now fails 5% of charges with HTTP 500
policy=timeout …
  succeeded                 1,143  (95.2%)
           57  503 payments answered 500
  payments received         1,200 calls for 1,200 orders (1.00 calls per checkout)
policy=backoff …
  succeeded                 1,200  (100.0%)
  latency p50 / p95 / max   21 ms / 45 ms / 304 ms
  payments received         1,260 calls for 1,200 orders (1.05 calls per checkout)`, [7, 14, 22, 23])}
            <ul><li><b>Immediate retries made the outage worse in two ways.</b> payments received 4× its normal load at the moment it was struggling (in a real outage, that extra load is often what keeps it down). And each checkout now held a thread for 4 × 0.3 = 1.2 s: 40/s × 1.2 s = 48 threads needed, 40 available, so the queue and the stuck <code>/fast</code> from step 2 came back.</li><li><b>The retry budget capped the damage at 1.10×.</b> Once retries reached 10% of requests, checkout stopped retrying and failed fast. This is the per-client budget from the SRE book's "Handling Overload" chapter: however bad things get, retries add at most 10% load.</li><li><b>For random, short failures, retries are what you want.</b> 5% of first attempts failed; a retry after a few milliseconds almost always succeeded (only 5% × 5% = 0.25% of checkouts fail twice in a row, and they get a third try), so 57 failures became 0 at the cost of 60 extra calls. The p95 rose from 26 ms to 45 ms: that is the backoff wait.</li><li><b>Why jitter?</b> If every client waits exactly 50, 100, 200 ms, all their retries arrive together in waves. A random wait spreads them out (Marc Brooker's Builders' Library article shows this with simulations).</li><li><b>Only retry what is safe.</b> Each of those 4,800 calls charged a card. Retries need the idempotency keys from Level 7.</li></ul>` },

        { id: "l10-5", why: "A timeout still spends 300 ms and a call on a dependency that is clearly down. A circuit breaker notices the pattern and stops calling for a while, which gives the dependency room to recover and gives users an instant answer.", title: "Open, and close, a circuit breaker",
          body: `${H.code(`./toxi.sh toxic add -t latency -a latency=2000 -n slow payments
./load.sh --policy breaker --rate 40 --duration 30 --every 2

# in a second terminal, about 15 s into the run:
./toxi.sh toxic remove -n slow payments

docker compose logs checkout-v1 | grep '"event": "breaker"'`)}<p>The breaker (class <code>Breaker</code>) opens after 5 failures in a row, rejects calls for 5 s, then lets one trial call through (half-open).</p>`,
          expect: "In the first 2 s about 17 calls reach payments and time out; then failures take about 4 ms and payments receives almost nothing (one trial call every 5 s). After you remove the toxic, the next trial succeeds, the breaker closes and checkouts succeed in about 20 ms again.",
          solution: `${H.code(`  time  answered     ok  failed  waiting       p50       p95  payments calls
    2s        80      0      80        1      4 ms    310 ms  +17
    4s        80      0      80        0      4 ms      6 ms  +0
    6s        81      0      81        0      4 ms      5 ms  +1
    8s        80      0      80        0      3 ms      5 ms  +0
  …
   12s        80      0      80        0      4 ms      6 ms  +1
   14s        80      0      80        0      3 ms      4 ms  +0
Removed toxic 'slow' on proxy 'payments'
   16s        80      0      80        0      4 ms      5 ms  +0
   18s        80     78       2        1     21 ms     25 ms  +78
   20s        80     80       0        1     21 ms     26 ms  +81
Summary
          624  503 circuit open
           19  503 timeout
  payments received         576 calls for 576 orders (0.48 calls per checkout)

breaker log, seconds after it first opened:
 0.00 open        5.02 half-open   5.32 open
10.34 half-open  10.65 open       15.67 half-open  15.69 closed`, [3, 11, 17])}
            <ul><li><b>Why 17 calls before it opened, not 5?</b> At 40 checkouts per second, about 12 calls start during each 300 ms timeout. By the time the fifth failure is recorded, a dozen more are already in flight. Breakers count outcomes, so they always react a little late.</li><li><b>Open means fast and cheap:</b> 624 checkouts failed in about 4 ms without touching payments. Compare step 3, where every failure cost 300 ms and a call. A struggling dependency gets breathing room instead of a steady stream of requests it cannot serve.</li><li><b>Half-open is the probe.</b> At 5 s and 10 s, one trial call went through (the +1 lines), timed out after 300 ms, and the breaker reopened. The 19 timeouts are the 17 initial calls plus those 2 trials. After the toxic was removed, the trial at about 15.7 s took 20 ms, so the breaker closed and traffic flowed at once.</li><li><b>Pairs well with a fallback.</b> When the breaker is open, a real checkout could accept the order and charge later from a queue, instead of returning 503.</li><li>In production you would use a tested implementation: a library (for example resilience4j for Java or Polly for .NET; Python has smaller ones such as pybreaker), or a proxy such as Envoy, whose outlier detection stops sending traffic to failing hosts. The class here is about 40 lines so you can read it.</li></ul>` },

        { id: "l10-6", why: "Alerting on every error pages you constantly; not alerting misses real outages. Burn-rate alerts page only when the error budget is going fast enough to matter, and stop soon after the problem does. Watching one fire and clear makes the two windows make sense.", title: "Fire, and clear, an SLO burn-rate alert",
          body: `${H.code(`docker compose up -d --force-recreate --renew-anon-volumes prometheus   # forget steps 2-5

# terminal 1: steady traffic for 5 minutes
./load.sh --policy timeout --rate 20 --duration 300 --every 30

# terminal 2: after about 1 minute
./payments.sh errors 0.1
# about 2 minutes later
./payments.sh errors 0`)}<p>Watch <b>http://localhost:9090/alerts</b> (refresh it) and graph <code>checkout:burn_rate:30s</code> and <code>checkout:burn_rate:6m</code> together. Read <code>prometheus/rules.yml</code> first: the SLO is 99.9% of checkouts not 5xx, and the windows are scaled 10× shorter than the SRE Workbook's so this takes minutes, not hours.</p>`,
          expect: "About 15-20 s after errors start, CheckoutErrorBudgetFastBurn fires (both windows above 14.4×). About 30 s after you set errors back to 0, it clears, while the 6m burn rate is still far above 14.4. The slow-burn alert fires too and stays firing for longer.",
          solution: `${H.code(` time   burn 6m   burn 30s   alerts
   45s      0.0       0.0    none
   60s   >>> payments.sh errors 0.1
   75s     11.5      30.0    SlowBurn
   80s     22.1      62.0    FastBurn, SlowBurn        <- paged about 20 s in
  120s     46.4      88.0    FastBurn, SlowBurn
  180s   >>> payments.sh errors 0
  195s     59.7      50.0    FastBurn, SlowBurn
  210s     55.2       6.0    SlowBurn                  <- fast alert clears, 6m still 55x
  285s     40.2       0.0    SlowBurn

load.sh, every 30 s:   90s  600 answered  539 ok  61 failed …   210s  600  598  2 …
Summary: 6,000 sent, 5,779 succeeded (96.3%), 221 × "503 payments answered 500"`, [4, 8])}
            <ul><li><b>Burn rate = error ratio / error budget.</b> With 10% of checkouts failing and a 0.1% budget, the burn rate is 100: a 30-day budget would be gone in 7.2 hours. The 30 s window shows about 90-100; the 6 m window climbs slowly because it still contains the healthy minute before.</li><li><b>Why two windows?</b> The long one (6 m, standing in for 1 h) proves the problem is significant: a 10-second blip does not move it. The short one (30 s, for 5 min) proves it is still happening. Without the short window, the page would keep firing for minutes after the fix, because the 6 m window still remembers the errors (55× at 210 s).</li><li><b>Why did the slow-burn alert fire first?</b> Its threshold is lower (6×) and, with only a minute or two of data, its "36 m" window holds just that. On a system with hours of history it would fire later and catch slower fires the fast alert misses.</li><li><b>Why recreate Prometheus first?</b> Steps 2-5 failed thousands of checkouts in the last few minutes. Those errors are in the 6 m and 36 m windows, so the alerts would fire before you broke anything. The flag gives Prometheus a fresh, empty data volume.</li><li><b>No phone rang.</b> Prometheus only evaluates alerts; Alertmanager (not in this lab) routes <code>severity: page</code> to a pager and the rest to a ticket queue.</li><li><b>Try it:</b> repeat with <code>--policy backoff</code>. When this was run, 2.4% of checkouts still failed: 10% of first attempts fail, so retries need about 11% of requests and the 10% budget runs out. The burn rate falls from about 100 to about 25, which still pages. That is the right outcome: retries smooth over occasional errors, but a dependency failing one call in ten is an incident.</li></ul>` },

        { id: "l10-7", why: "Most incidents start with a change. A canary sends a small share of real traffic to the new version and compares it with the old one, so a bad release hurts few users and is undone by a config change. The comparison has to be per version: the overall numbers hide it.", title: "Ship a buggy v2 as a 10% canary, then roll back",
          body: `${H.code(`docker compose --profile canary up -d --build      # checkout-v2 and the gateway (10% to v2)
./load.sh --target http://gateway --policy timeout --rate 40 --duration 60 --every 15
docker compose logs checkout-v2 | grep '"level": "error"' | head -n 2

# roll back: all traffic to v1
CANARY=off docker compose --profile canary up -d gateway
./load.sh --target http://gateway --policy timeout --rate 40 --duration 15 --every 0`)}<p>While it runs, query Prometheus for the error ratio per version:</p>${H.code(`sum by (version) (rate(checkout_requests_total{code=~"5.."}[1m]))
  / sum by (version) (rate(checkout_requests_total[1m]))`)}<p>Read <code>gateway/default.conf.template</code>: <code>split_clients</code> picks a bucket per request, and a <code>map</code> turns the bucket into an upstream. In PowerShell, set the variable first: <code>$env:CANARY="off"</code>.</p>`,
          expect: "About 10% of checkouts reach v2, and about 20% of those fail with 500, while v1 has no errors. Overall only about 2% fail. The logs show KeyError for IE or PT. After the rollback, every checkout is answered by v1 and none fail.",
          solution: `${H.code(`Summary (60 s until the last answer)
  checkouts sent            2,400
  succeeded                 2,353  (98.0%)
  failed                    47
           47  500 internal error
  answered by v1            2,160 checkouts, 0 failed (0.0%)
  answered by v2            240 checkouts, 47 failed (19.6%)

Prometheus:  {version="v1"} 0     {version="v2"} 0.187     overall 0.019

{"service": "checkout", "version": "v2", "level": "error", "path": "/checkout",
 "error": "KeyError('PT')", "where": "main.py:68 in total_cents()"}

after CANARY=off:
  succeeded                 600  (100.0%)
  answered by v1            600 checkouts, 0 failed (0.0%)`, [6, 7])}
            <ul><li><b>The bug:</b> v2's rebuilt tax table is missing Ireland and Portugal, 2 of the 10 countries the load sends, so 20% of v2's checkouts crash. Code review missed it; real traffic found it in seconds.</li><li><b>Compare canary with baseline.</b> Overall, 98% of checkouts succeeded: on a dashboard that looks like a blip. Split by version, it is 0% against 19.6%, an unambiguous verdict. That is the comparison Google's canarying chapter (and tools such as Argo Rollouts or Flagger) automate. Here the 99.9% SLO alert would also have fired, but it cannot tell you which version is at fault.</li><li><b>Blast radius:</b> 47 failed checkouts instead of the roughly 480 (20% of 2,400) a full rollout would have caused in the same minute.</li><li><b>Rollback was a config change.</b> v2 is still running; only the routing changed, so you can debug it with no users on it. Kubernetes and most load balancers do the same thing with weights.</li><li><b>In production, split by user, not by request.</b> Hashing <code>$request_id</code> sends one user's requests to both versions. Hashing a user or session ID keeps each user on one version, which matters when versions behave differently.</li><li>The <code>version</code> label on every metric, and <code>X-Version</code> on every response, are what made the comparison possible. Add a version label to your own app's metrics before you need it.</li></ul>` },

        { id: "l10-8", why: "Metrics told you something was slow; a trace tells you where the time went in one request. Seeing a 2 s call that payments thinks took 15 ms, or 9 seconds of waiting before any work began, are things no dashboard would show you.", title: "Find where the time went, in Jaeger",
          body: `${H.code(`./toxi.sh toxic add -t latency -a latency=2000 -n slow payments
./load.sh --policy none --rate 2 --duration 5 --every 0
./load.sh --policy retry --rate 2 --duration 5 --every 0
./load.sh --policy none --rate 40 --duration 10 --every 0
./toxi.sh toxic remove -n slow payments
docker compose logs checkout-v1 | grep '"policy": "retry"' | tail -n 1`)}<p>In Jaeger: Service <i>checkout</i>, Operation <i>POST /checkout</i>, Min Duration <i>1s</i>, then <i>Find Traces</i>. Open one trace from each run. Or copy the <code>trace_id</code> from the log line into Jaeger's search box at the top.</p>`,
          expect: "Run 1: checkout's call takes 2 s while payments' own span takes about 15 ms. Run 2: four failed 300 ms calls one after another, each with a short payments span. Run 3: the slowest traces start their handler span many seconds after the request arrived.",
          solution: `${H.code(`start      duration   span
1) policy none, 2 per second
     0.0 ms  2022.8 ms  checkout: POST /checkout
     2.7 ms  2019.5 ms    checkout: checkout handler (worker thread)
     3.1 ms  2018.8 ms      checkout: POST                       (the call to payments)
     5.4 ms    15.6 ms        payments: POST /charge

2) policy retry
     0.0 ms  1218.8 ms  checkout: POST /checkout                 ERROR
     1.8 ms   303.3 ms      checkout: POST                       ERROR (timeout)
     4.4 ms    15.8 ms        payments: POST /charge
   305.6 ms   303.8 ms      checkout: POST                       ERROR
   610.1 ms   303.1 ms      checkout: POST                       ERROR
   913.8 ms   304.2 ms      checkout: POST                       ERROR
   914.8 ms    15.7 ms        payments: POST /charge

3) policy none, 40 per second
     0.0 ms 11198.7 ms  checkout: POST /checkout
  9178.4 ms  2019.7 ms    checkout: checkout handler (worker thread)
  9180.1 ms    15.7 ms        payments: POST /charge`, [5, 6, 20])}
            <ul><li><b>Trace 1: the time is between the services.</b> checkout waited 2,019 ms for a reply; payments spent 15.6 ms on the request. The missing 2 seconds are in the network path, here Toxiproxy. In real systems that gap is a proxy, a saturated connection pool, DNS, TLS, or packet loss. Without both spans you would blame payments, and payments' own dashboards would show nothing wrong.</li><li><b>Trace 2: retries are visible.</b> Four identical client spans, each cut off at 300 ms, each with a payments span that succeeded. Exactly what step 4's "4.00 calls per checkout" meant, and four charges for one order.</li><li><b>Trace 3: queueing is visible.</b> The request arrived at 0; its handler started 9.2 s later. Nothing ran for those 9 seconds: the request was waiting for one of the 40 threads. The gap between a server span and its first child is the queue.</li><li><b>How the spans connect:</b> OpenTelemetry's instrumentation for FastAPI (server spans) and httpx (client spans) adds a <code>traceparent</code> header to each outgoing call, so payments joins the same trace. The handler span is one line of manual instrumentation in <code>checkout/main.py</code>.</li><li><b>Logs and traces meet on the trace ID.</b> Every checkout log line carries <code>trace_id</code>, so a log search leads straight to the trace. This lab keeps every trace; production systems sample (for example 1-10% of requests, or keep all errors and slow ones), to keep storage affordable.</li></ul>` },

        { id: "l10-9", why: "Containers, volumes and Prometheus's data take disk space, and leftover toxics make later experiments confusing.", title: "Clean up",
          body: `${H.code(`docker compose --profile canary --profile tools down -v`)}`,
          expect: "All containers, the network and the anonymous Prometheus volume are removed.",
          solution: `<p>Nothing here keeps state you need: traces are in Jaeger's memory and metrics in a throwaway volume. <code>-v</code> removes that volume too; without it, a later <code>up</code> would bring back the old metrics (which is exactly what step 6's <code>--renew-anon-volumes</code> avoided).</p>` }
      ]
    }
  });
})();
