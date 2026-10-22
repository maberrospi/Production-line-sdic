/* Level 0 — Foundations */
(function () {
  "use strict";
  const H = Course.H;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ---------------- 0.1 Journey of a request ---------------- */
  function journey(root) {
    const p = H.panel(root, "Follow one request from your browser to Postgres and back", "Try it");
    p.innerHTML = `
      <div class="controls">
        <div><div class="note" style="margin-bottom:4px">Where is the user? (server is in Frankfurt)</div><div class="seg" id="loc"></div></div>
        <div><div class="note" style="margin-bottom:4px">Connection</div><div class="seg" id="mode"><button type="button" aria-pressed="true" data-m="cold">First visit</button><button type="button" aria-pressed="false" data-m="warm">Repeat request</button></div></div>
      </div>
      <div class="svgwrap minw" id="jsvg"></div>
      <div class="callout" id="jcap" aria-live="polite">Press Play to send the request.</div>
      <div class="controls"><button class="btn primary" type="button" id="play">▶ Play</button><button class="btn" type="button" id="step">Step</button><button class="btn" type="button" id="reset">Reset</button></div>
      <h4 style="font-size:14px;margin:14px 0 6px">Waterfall: where the time went</h4>
      <div class="svgwrap" id="wf"></div>
      <div class="readout" id="jread"></div>`;
    const LOCS = [["London", 15], ["Nicosia", 50], ["New York", 85], ["Sydney", 285]];
    let rtt = 50, mode = "cold";
    const loc = p.querySelector("#loc");
    LOCS.forEach(([n, r]) => { const b = H.el(`<button type="button" aria-pressed="${r === rtt}">${n}</button>`); b.onclick = () => { rtt = r; loc.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); reset(); }; loc.appendChild(b); });
    p.querySelectorAll("#mode button").forEach(b => b.onclick = () => { mode = b.dataset.m; p.querySelectorAll("#mode button").forEach(x => x.setAttribute("aria-pressed", x === b)); reset(); });

    const sv = H.svg("svg", { viewBox: "0 0 760 300", role: "img", "aria-label": "Browser, DNS resolver and a VM containing nginx, FastAPI and Postgres" });
    p.querySelector("#jsvg").appendChild(sv);
    const box = (x, y, w, h, t, s, cls) => {
      const g = H.svg("g", {}, sv);
      H.svg("rect", { x, y, width: w, height: h, rx: 8, fill: cls === "vm" ? "var(--compute-soft)" : cls === "db" ? "var(--data-soft)" : "var(--surface)", stroke: cls === "db" ? "var(--data)" : cls === "vm" ? "var(--compute)" : "var(--line-strong)", "stroke-width": 1.5 }, g);
      const a = H.svg("text", { x: x + w / 2, y: y + (s ? h / 2 - 3 : h / 2 + 5), "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: "var(--ink)" }, g); a.textContent = t;
      if (s) { const b = H.svg("text", { x: x + w / 2, y: y + h / 2 + 14, "text-anchor": "middle", "font-size": 11.5, fill: "var(--muted)" }, g); b.textContent = s; }
      return g;
    };
    H.svg("rect", { x: 470, y: 40, width: 275, height: 240, rx: 14, fill: "none", stroke: "var(--compute)", "stroke-width": 1.5, "stroke-dasharray": "6 5" }, sv);
    const vt = H.svg("text", { x: 486, y: 64, "font-size": 12.5, "font-weight": 600, fill: "var(--compute)" }, sv); vt.textContent = "Your VM · Frankfurt · Docker";
    box(20, 125, 120, 54, "Browser", "app.example.com");
    box(220, 20, 150, 54, "DNS resolver", "name → IP address");
    box(490, 125, 105, 54, "nginx", ":443 · TLS", "vm");
    box(625, 125, 105, 54, "FastAPI", "api:8000", "vm");
    box(625, 210, 105, 54, "Postgres", "db:5432", "db");
    const wire = (d, dash) => H.svg("path", { d, fill: "none", stroke: "var(--line-strong)", "stroke-width": 2, "stroke-dasharray": dash || "" }, sv);
    wire("M140 140 L230 74", "4 4"); wire("M140 152 L490 152"); wire("M595 152 L625 152"); wire("M677 179 L677 210");
    const lbl = H.svg("text", { x: 315, y: 170, "text-anchor": "middle", "font-size": 12, fill: "var(--muted)", class: "mono" }, sv); lbl.textContent = "the internet";
    const dot = H.svg("circle", { cx: 140, cy: 152, r: 8, fill: "var(--signal)", opacity: 0 }, sv);
    const tag = H.svg("text", { x: 0, y: 0, "font-size": 11, "font-weight": 600, fill: "var(--signal)", class: "mono", opacity: 0 }, sv);

    const P = { b: [140, 152], bd: [140, 140], dns: [230, 74], ng: [490, 152], ng2: [595, 152], api: [625, 152], api2: [677, 179], db: [677, 210] };
    function steps() {
      const s = [];
      if (mode === "cold") {
        s.push({ k: "DNS lookup", ms: 22, net: true, path: [P.bd, P.dns, P.bd], label: "DNS?", cap: "The browser asks a DNS resolver for the IP of app.example.com. The answer is cached for its TTL, so repeat visits skip this." });
        s.push({ k: "TCP handshake", ms: rtt, net: true, path: [P.b, P.ng, P.b], label: "SYN", cap: `SYN → SYN-ACK → ACK. One full round trip (${rtt} ms) before a single byte of your request can be sent.` });
        s.push({ k: "TLS handshake", ms: rtt, net: true, path: [P.b, P.ng, P.b], label: "TLS", cap: `TLS 1.3 needs one more round trip (${rtt} ms) to agree on keys and check the certificate. TLS 1.2 needs two.` });
      }
      s.push({ k: "Request travels", ms: rtt / 2, net: true, path: [P.b, P.ng], label: "GET", cap: `The HTTP request crosses the internet: half a round trip, ${rtt / 2} ms.` });
      s.push({ k: "nginx", ms: 0.3, net: false, path: [P.ng, P.ng2, P.api], label: "proxy", cap: "nginx decrypts TLS and forwards the request to api:8000 over the private Docker network. Well under a millisecond." });
      s.push({ k: "FastAPI + Postgres", ms: 8, net: false, path: [P.api, P.api2, P.db, P.api2, P.api], label: "SQL", cap: "FastAPI validates the request and runs one indexed query on Postgres. About 8 ms of real work, all on one machine." });
      s.push({ k: "Response travels", ms: rtt / 2 + 4, net: true, path: [P.api, P.ng2, P.ng, P.b], label: "200", cap: `The response goes back the same way: half a round trip plus a few ms to transfer 50 KB.` });
      return s;
    }
    let idx = 0, playing = false, busy = false;
    const cap = p.querySelector("#jcap");
    function animate(path, label) {
      return new Promise(res => {
        const segs = []; let total = 0;
        for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push(d); total += d; }
        const dur = Math.max(500, Math.min(1500, total * 2.4));
        const t0 = performance.now(); dot.setAttribute("opacity", 1); tag.setAttribute("opacity", 1); tag.textContent = label;
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        function frame(t) {
          let f = reduce ? 1 : Math.min(1, (t - t0) / dur);
          let d = f * total, i = 0;
          while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
          const a = path[i], b = path[i + 1], q = segs[i] ? d / segs[i] : 1;
          const x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q;
          dot.setAttribute("cx", x); dot.setAttribute("cy", y); tag.setAttribute("x", x + 11); tag.setAttribute("y", y - 10);
          if (f < 1) requestAnimationFrame(frame); else res();
        }
        requestAnimationFrame(frame);
      });
    }
    async function stepOnce() {
      const s = steps();
      if (busy) return; if (idx >= s.length) { reset(); return; }
      busy = true; const st = s[idx];
      cap.innerHTML = `<b>${idx + 1}. ${st.k}</b> · <span class="mono">${H.fmtMs(st.ms)}</span><br>${st.cap}`;
      await animate(st.path, st.label);
      idx++; drawWf(); busy = false;
      if (idx >= s.length) { cap.innerHTML = `<b>Done.</b> ${summary()}`; playing = false; p.querySelector("#play").textContent = "▶ Replay"; dot.setAttribute("opacity", 0); tag.setAttribute("opacity", 0); }
    }
    async function play() { if (playing) return; if (idx >= steps().length) reset(); playing = true; p.querySelector("#play").textContent = "Playing…"; while (playing && idx < steps().length) { await stepOnce(); await new Promise(r => setTimeout(r, 250)); } }
    function reset() { playing = false; idx = 0; busy = false; dot.setAttribute("opacity", 0); tag.setAttribute("opacity", 0); cap.textContent = "Press Play to send the request."; p.querySelector("#play").textContent = "▶ Play"; drawWf(); }
    function summary() {
      const s = steps(); const tot = s.reduce((a, b) => a + b.ms, 0), net = s.filter(x => x.net).reduce((a, b) => a + b.ms, 0);
      return `${H.fmtMs(tot)} total, and ${Math.round(net / tot * 100)}% of it was the network. Your Python code was ${H.fmtMs(8)}.`;
    }
    function drawWf() {
      const s = steps(); const tot = s.reduce((a, b) => a + b.ms, 0);
      const W = 720, rowH = 22, h = s.length * rowH + 30;
      const w = H.svg("svg", { viewBox: `0 0 ${W} ${h}`, role: "img", "aria-label": "Waterfall of request phases" });
      const x0 = 150, sc = (W - x0 - 70) / Math.max(tot, 1);
      let t = 0;
      s.forEach((st, i) => {
        const y = i * rowH + 4, shown = i < idx;
        const tx = H.svg("text", { x: 0, y: y + 14, "font-size": 12, fill: shown ? "var(--ink)" : "var(--faint)" }, w); tx.textContent = st.k;
        H.svg("rect", { x: x0 + t * sc, y: y + 3, width: Math.max(2, st.ms * sc), height: 14, rx: 3, fill: st.net ? "var(--signal)" : "var(--compute)", opacity: shown ? 1 : 0.18 }, w);
        const v = H.svg("text", { x: x0 + (t + st.ms) * sc + 6, y: y + 14, "font-size": 11.5, fill: shown ? "var(--muted)" : "var(--faint)", class: "mono" }, w); v.textContent = H.fmtMs(st.ms);
        t += st.ms;
      });
      const ax = H.svg("text", { x: x0, y: h - 4, "font-size": 11.5, fill: "var(--muted)" }, w); ax.textContent = "■ network   ■ your server";
      ax.innerHTML = ""; const a1 = H.svg("tspan", { fill: "var(--signal)" }, ax); a1.textContent = "■ network   "; const a2 = H.svg("tspan", { fill: "var(--compute)" }, ax); a2.textContent = "■ your server";
      const host = p.querySelector("#wf"); host.innerHTML = ""; host.appendChild(w);
      const net = s.filter(x => x.net).reduce((a, b) => a + b.ms, 0);
      p.querySelector("#jread").innerHTML = `<div><div class="k">Total</div><div class="v">${H.fmtMs(tot)}</div></div><div><div class="k">Network</div><div class="v ${net / tot > .8 ? "bad" : "warn"}">${Math.round(net / tot * 100)}%</div></div><div><div class="k">Round trips</div><div class="v">${mode === "cold" ? "3 + DNS" : "1"}</div></div><div><div class="k">Server work</div><div class="v good">8.3 ms</div></div>`;
    }
    p.querySelector("#play").onclick = play; p.querySelector("#step").onclick = () => { playing = false; stepOnce(); }; p.querySelector("#reset").onclick = reset;
    drawWf();
  }

  /* ---------------- 0.2 Latency numbers ---------------- */
  const LAT = [
    ["L1 CPU cache reference", 1e-6, "The CPU reads from its own on-chip cache. This is the speed limit of computing."],
    ["RAM reference", 1e-4, "100× slower than cache. Still fast enough that reading a Python dict feels free."],
    ["NVMe SSD random read", 0.02, "Why Postgres keeps hot data in its shared buffers (RAM): disk is 200× slower than memory."],
    ["Round trip inside a datacenter", 0.5, "App server to a database or Redis on another machine nearby. Every network hop costs at least this."],
    ["Indexed Postgres lookup", 1, "Includes the round trip, parsing, planning and reading an index page from memory."],
    ["Spinning disk seek", 5, "Old HDDs. One reason managed databases moved to SSDs."],
    ["Send 1 MB over 1 Gbps", 8, "Bandwidth limits: large payloads take real time even on a fast link."],
    ["Round trip Frankfurt ↔ New York", 85, "Bounded by the speed of light in fibre. No amount of money makes this faster; only moving closer does (CDNs, regions)."],
    ["Round trip Frankfurt ↔ Sydney", 285, "The other side of the world. Three of these before the first byte is why far-away users feel your app is slow."],
    ["Full scan of 10M rows (no index)", 1500, "What a missing index costs. Same query, 1,500× slower than the indexed version."]
  ];
  function human(ms) {
    const s = ms * 1e6; // 1 ns -> 1 s
    if (s < 60) return s.toFixed(0) + " seconds";
    if (s < 3600) return (s / 60).toFixed(1) + " minutes";
    if (s < 86400) return (s / 3600).toFixed(1) + " hours";
    if (s < 86400 * 365) return (s / 86400).toFixed(1) + " days";
    return (s / 86400 / 365).toFixed(1) + " years";
  }
  function latency(root) {
    const p = H.panel(root, "The latency ladder", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="scale"><button type="button" aria-pressed="true" data-s="real">Real time</button><button type="button" aria-pressed="false" data-s="human">If 1 ns were 1 second</button></div><span class="note">Log scale: each grid line is 10× slower. Tap a row for what it means.</span></div><div id="ladder"></div><div class="callout" id="ldet" aria-live="polite">Tap a row.</div>`;
    let mode = "real";
    const host = p.querySelector("#ladder");
    function draw() {
      host.innerHTML = "";
      LAT.forEach(([n, ms, why], i) => {
        const pct = (Math.log10(ms * 1e6) / Math.log10(1.5e9)) * 100;
        const row = H.el(`<button type="button" style="display:grid;grid-template-columns:minmax(0,190px) minmax(0,1fr) 110px;gap:10px;align-items:center;width:100%;background:none;border:0;padding:5px 0;cursor:pointer;text-align:left;border-bottom:1px solid var(--line)">
          <span style="font-size:13px"></span>
          <span style="position:relative;height:14px;background:repeating-linear-gradient(90deg,transparent 0 calc(11.1% - 1px),var(--line) calc(11.1% - 1px) 11.1%)"><i style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(1, pct)}%;background:${ms >= 50 ? "var(--signal)" : ms >= 0.4 ? "var(--xp)" : "var(--compute)"};border-radius:3px"></i></span>
          <span class="mono" style="font-size:12.5px;text-align:right">${mode === "real" ? H.fmtMs(ms) : human(ms)}</span></button>`);
        row.firstElementChild.textContent = n;
        row.onclick = () => { p.querySelector("#ldet").innerHTML = `<b></b> ${H.fmtMs(ms)} · ≈ ${human(ms)} at human scale.<br>`; p.querySelector("#ldet b").textContent = n; p.querySelector("#ldet").append(why); };
        host.appendChild(row);
      });
    }
    p.querySelectorAll("#scale button").forEach(b => b.onclick = () => { mode = b.dataset.s; p.querySelectorAll("#scale button").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    draw();

    const q = H.panel(root, "Build an endpoint's latency budget", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">A typical goal is under 100 ms of server time. Add work to a request and see what blows the budget.</p>
      <div class="controls">
        <div class="ctl"><label for="b-q">Postgres queries per request <output id="o-q">3</output></label><input type="range" id="b-q" min="1" max="150" value="3"></div>
        <div class="ctl"><label for="b-r">Redis lookups <output id="o-r">2</output></label><input type="range" id="b-r" min="0" max="30" value="2"></div>
        <div class="ctl"><label for="b-x">Calls to an external API <output id="o-x">0</output></label><input type="range" id="b-x" min="0" max="3" value="0"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="b-far"> Database lives in another region (+20 ms per query)</label>
      <div class="svgwrap" id="bbar" style="margin-top:12px"></div><div class="callout" id="bverdict"></div>`;
    function upd() {
      const nq = +q.querySelector("#b-q").value, nr = +q.querySelector("#b-r").value, nx = +q.querySelector("#b-x").value, far = q.querySelector("#b-far").checked;
      q.querySelector("#o-q").textContent = nq; q.querySelector("#o-r").textContent = nr; q.querySelector("#o-x").textContent = nx;
      const parts = [["Python work", 6, "var(--compute)"], ["Postgres", nq * (far ? 21 : 1), "var(--data)"], ["Redis", nr * 0.5, "var(--xp)"], ["External API", nx * 120, "var(--signal)"]];
      const tot = parts.reduce((a, b) => a + b[1], 0), max = Math.max(200, tot);
      const s = H.svg("svg", { viewBox: "0 0 720 64", role: "img", "aria-label": "Stacked latency budget" });
      let x = 0; const sc = 720 / max;
      parts.forEach(([n, v, c]) => { if (v <= 0) return; H.svg("rect", { x: x * sc, y: 8, width: Math.max(1, v * sc), height: 26, fill: c }, s); x += v; });
      H.svg("line", { x1: 100 * sc, x2: 100 * sc, y1: 2, y2: 40, stroke: "var(--ink)", "stroke-width": 2, "stroke-dasharray": "4 3" }, s);
      const bt = H.svg("text", { x: 100 * sc + 4, y: 54, "font-size": 11.5, fill: "var(--muted)" }, s); bt.textContent = "100 ms budget";
      const lg = H.svg("text", { x: 0, y: 54, "font-size": 11.5, fill: "var(--ink)", class: "mono" }, s); lg.textContent = H.fmtMs(tot) + " total";
      const host = q.querySelector("#bbar"); host.innerHTML = ""; host.appendChild(s);
      const v = q.querySelector("#bverdict");
      if (far && nq > 2) { v.className = "callout bad"; v.textContent = `Every query pays a cross-region round trip. ${nq} queries × 21 ms = ${H.fmtMs(nq * 21)}. Keep the app and its database in the same region, always.`; }
      else if (nq > 30) { v.className = "callout bad"; v.textContent = `${nq} queries per request is the N+1 problem: a loop that fires one query per item. Fetch them in one query with a JOIN or WHERE id = ANY(...).`; }
      else if (nx > 0) { v.className = "callout warn"; v.textContent = "External calls dominate. Move them off the request path with a background job (Level 8), cache their results (Level 3), or set tight timeouts (Level 10)."; }
      else if (tot <= 100) { v.className = "callout good"; v.textContent = "Within budget. Most of the time a well-built endpoint is a handful of indexed queries on a co-located database."; }
      else { v.className = "callout warn"; v.textContent = "Over budget. Look for the biggest bar first: it is almost always I/O, not Python."; }
    }
    q.querySelectorAll("input").forEach(i => i.addEventListener("input", upd)); upd();
  }

  /* ---------------- 0.3 Percentiles ---------------- */
  function percentiles(root) {
    const p = H.panel(root, "1,000 requests, plotted", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="pc-f">Share of slow requests <output id="pc-fo">2%</output></label><input type="range" id="pc-f" min="0" max="15" step="0.5" value="2"></div>
        <div class="ctl"><label for="pc-s">A slow request takes <output id="pc-so">800 ms</output></label><input type="range" id="pc-s" min="150" max="3000" step="50" value="800"></div>
      </div><p class="note">Slow requests come from cold caches, lock waits, garbage collection pauses, a noisy neighbour on the VM.</p>
      <div class="svgwrap minw" id="hist"></div><div class="readout" id="pcr"></div><div class="callout" id="pcv"></div>`;
    function upd() {
      const f = +p.querySelector("#pc-f").value / 100, slow = +p.querySelector("#pc-s").value;
      p.querySelector("#pc-fo").textContent = (f * 100).toFixed(1).replace(/\.0$/, "") + "%"; p.querySelector("#pc-so").textContent = slow + " ms";
      const r = rng(7), xs = [];
      for (let i = 0; i < 1000; i++) {
        let v = 35 * Math.exp(0.35 * gauss(r));
        if (r() < f) v = slow * (0.6 + 0.8 * r());
        xs.push(v);
      }
      const sorted = xs.slice().sort((a, b) => a - b);
      const pct = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const P50 = pct(.5), P95 = pct(.95), P99 = pct(.99), MAX = sorted[sorted.length - 1];
      const W = 720, Hh = 230, x0 = 30, x1 = W - 10, lo = Math.log10(5), hi = Math.log10(5000);
      const X = v => x0 + (Math.log10(Math.max(5, Math.min(5000, v))) - lo) / (hi - lo) * (x1 - x0);
      const bins = new Array(70).fill(0);
      xs.forEach(v => { const b = Math.min(69, Math.max(0, Math.floor((Math.log10(Math.max(5, v)) - lo) / (hi - lo) * 70))); bins[b]++; });
      const mx = Math.max(...bins);
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Latency histogram with percentile markers" });
      const base = Hh - 30, top = 40;
      [5, 10, 50, 100, 500, 1000, 5000].forEach(t => { H.svg("line", { x1: X(t), x2: X(t), y1: top - 6, y2: base, stroke: "var(--line)" }, s); const tt = H.svg("text", { x: X(t), y: base + 16, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", class: "mono" }, s); tt.textContent = t >= 1000 ? t / 1000 + "s" : t + "ms"; });
      const bw = (x1 - x0) / 70;
      bins.forEach((c, i) => { if (!c) return; const h = Math.max(2, Math.sqrt(c / mx) * (base - top)); H.svg("rect", { x: x0 + i * bw + 1, y: base - h, width: bw - 2, height: h, rx: 1.5, fill: (lo + (i + .5) / 70 * (hi - lo)) > Math.log10(P99) ? "var(--signal)" : "var(--compute)", opacity: .85 }, s); });
      const mk = (v, t, c, row, dash) => { H.svg("line", { x1: X(v), x2: X(v), y1: top - 4 + row * 0, y2: base, stroke: c, "stroke-width": 2, "stroke-dasharray": dash || "" }, s); const tx = H.svg("text", { x: X(v) + 4, y: 14 + row * 13, "font-size": 11.5, "font-weight": 600, fill: c }, s); tx.textContent = t + " " + Math.round(v) + "ms"; };
      mk(P50, "p50", "var(--ink)", 0); mk(mean, "mean", "var(--muted)", 1, "4 3"); mk(P95, "p95", "var(--xp)", 0); mk(P99, "p99", "var(--signal)", 1);
      const host = p.querySelector("#hist"); host.innerHTML = ""; host.appendChild(s);
      const cls = v => v > 500 ? "bad" : v > 200 ? "warn" : "good";
      p.querySelector("#pcr").innerHTML = [["Mean", mean], ["p50 (median)", P50], ["p95", P95], ["p99", P99], ["Max", MAX]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v ${cls(v)}">${Math.round(v)} ms</div></div>`).join("");
      const v = p.querySelector("#pcv");
      if (f === 0) { v.className = "callout good"; v.textContent = "No slow requests: the mean, p50 and p99 are all close together. Real systems are never this tidy."; }
      else { v.className = "callout warn"; v.textContent = `The median user sees ${Math.round(P50)} ms, but 1 in 100 requests takes ${Math.round(P99)} ms or more. The mean (${Math.round(mean)} ms) describes nobody's actual experience. Dashboards and SLOs use percentiles for this reason.`; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd)); upd();

    const q = H.panel(root, "Why the tail matters more as systems grow", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">A page load fans out to several backend calls (DB queries, services, cache lookups). Each call has a 1% chance of being slower than its p99. The page is only as fast as its slowest call.</p>
      <div class="ctl" style="max-width:420px"><label for="fo-n">Backend calls per page load <output id="fo-o">10</output></label><input type="range" id="fo-n" min="1" max="100" value="10"></div>
      <div id="dots" style="display:grid;grid-template-columns:repeat(20, 1fr);gap:4px;max-width:420px;margin:14px 0" aria-hidden="true"></div>
      <div class="callout" id="fo-v"></div>`;
    const dots = q.querySelector("#dots");
    for (let i = 0; i < 100; i++) dots.appendChild(H.el(`<i style="aspect-ratio:1;border-radius:50%;background:var(--line)"></i>`));
    function fo() {
      const n = +q.querySelector("#fo-n").value, pr = 1 - Math.pow(0.99, n), k = Math.round(pr * 100);
      q.querySelector("#fo-o").textContent = n;
      [...dots.children].forEach((d, i) => d.style.background = i < k ? "var(--signal)" : "var(--compute)");
      q.querySelector("#fo-v").innerHTML = `<b>${k} of 100</b> page loads hit at least one p99-slow call (1 − 0.99<sup>${n}</sup> = ${(pr * 100).toFixed(1)}%). With many calls per page, your p99 becomes most users' typical experience.`;
    }
    q.querySelector("#fo-n").addEventListener("input", fo); fo();
  }

  /* ---------------- 0.4 Queues and Little's law ---------------- */
  function erlangW(lam, c, mu) {
    const a = lam / mu, rho = a / c;
    if (rho >= 1) return Infinity;
    let sum = 0, term = 1;
    for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; sum += term; }
    const last = term * a / c; // a^c / c!
    const pc = last / (1 - rho);
    const C = pc / (sum + pc);
    return C / (c * mu - lam) + 1 / mu;
  }
  function queueing(root) {
    const MU = 25; // per worker: 40 ms average service time
    const p = H.panel(root, "A server is a queue", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="qu-l">Requests arriving per second <output id="qu-lo"></output></label><input type="range" id="qu-l" min="5" max="220" value="60"></div>
        <div class="ctl"><label for="qu-c">Workers (uvicorn processes) <output id="qu-co"></output></label><input type="range" id="qu-c" min="1" max="8" value="3"></div>
      </div>
      <p class="note">Each request needs about 40 ms of a worker, so one worker serves at most 25 requests/s. The animation runs 10× slower than real time.</p>
      <canvas id="qcv" style="width:100%;height:170px;display:block;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)" aria-label="Animated queue of requests waiting for workers"></canvas>
      <div class="readout" id="qr"></div>
      <div class="svgwrap" id="qcurve"></div><div class="callout" id="qv"></div>`;
    const cv = p.querySelector("#qcv"), ctx = cv.getContext("2d");
    let lam = 60, c = 3, sim = null, raf = 0, last = 0, measured = [];
    function resetSim() { sim = { t: 0, next: 0, queue: [], servers: new Array(c).fill(null), done: [] }; measured = []; }
    const r = rng(42);
    const expo = rate => -Math.log(1 - r()) / rate;
    function stepSim(dt) {
      sim.t += dt;
      while (sim.next <= sim.t) { sim.queue.push({ arr: sim.next, x: -10 }); sim.next += expo(lam); }
      for (let i = 0; i < c; i++) {
        const s = sim.servers[i];
        if (s && s.end <= sim.t) { measured.push(s.end - s.arr); if (measured.length > 300) measured.shift(); sim.done.push({ x: 0, y: i, life: 0.5 }); sim.servers[i] = null; }
        if (!sim.servers[i] && sim.queue.length) { const j = sim.queue.shift(); sim.servers[i] = { arr: j.arr, end: sim.t + expo(MU) }; }
      }
      sim.done.forEach(d => d.life -= dt); sim.done = sim.done.filter(d => d.life > 0);
      if (sim.queue.length > 400) sim.queue.length = 400;
    }
    function draw() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const ink = css("--ink"), comp = css("--compute"), sig = css("--signal"), mut = css("--muted"), line = css("--line-strong");
      const sx = w - 150, rowH = Math.min(18, (h - 20) / c), y0 = h / 2 - (rowH * c) / 2;
      ctx.font = "12px " + css("--f-mono"); ctx.fillStyle = mut;
      ctx.fillText("queue", 14, 18); ctx.fillText("workers", sx, Math.max(14, y0 - 6));
      for (let i = 0; i < c; i++) {
        ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.strokeRect(sx, y0 + i * rowH + 1, 70, rowH - 3);
        if (sim.servers[i]) { ctx.fillStyle = comp; ctx.fillRect(sx + 2, y0 + i * rowH + 3, 66, rowH - 7); }
      }
      const qy = h / 2, maxShow = Math.floor((sx - 30) / 11);
      sim.queue.slice(0, maxShow).forEach((j, i) => { ctx.beginPath(); ctx.fillStyle = i > 20 ? sig : ink; ctx.arc(sx - 14 - i * 11, qy, 4.2, 0, 7); ctx.fill(); });
      if (sim.queue.length > maxShow) { ctx.fillStyle = sig; ctx.fillText("+" + (sim.queue.length - maxShow) + " more", 14, h - 10); }
      sim.done.forEach(d => { ctx.globalAlpha = Math.max(0, d.life * 2); ctx.beginPath(); ctx.fillStyle = comp; ctx.arc(sx + 80 + (0.5 - d.life) * 140, y0 + d.y * rowH + rowH / 2, 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1; });
    }
    function loop(t) {
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      stepSim(dt / 10); draw();
      if (document.body.contains(cv)) raf = requestAnimationFrame(loop);
    }
    let tick = 0;
    function readout() {
      const rho = lam / (c * MU), W = erlangW(lam, c, MU);
      const meas = measured.length > 20 ? measured.reduce((a, b) => a + b, 0) / measured.length : null;
      const cls = rho >= 1 ? "bad" : rho > .8 ? "warn" : "good";
      p.querySelector("#qr").innerHTML = `<div><div class="k">Capacity</div><div class="v">${c * MU}/s</div></div><div><div class="k">Utilization ρ</div><div class="v ${cls}">${Math.round(rho * 100)}%</div></div><div><div class="k">Latency (theory)</div><div class="v ${cls}">${W === Infinity ? "∞" : H.fmtMs(W * 1000)}</div></div><div><div class="k">Latency (simulated)</div><div class="v">${meas ? H.fmtMs(meas * 1000) : "…"}</div></div><div><div class="k">In system L = λW</div><div class="v">${W === Infinity ? "growing" : (lam * W).toFixed(1)}</div></div>`;
    }
    function curve() {
      const Wd = 720, Hd = 220, x0 = 46, y0 = 16, x1 = Wd - 16, y1 = Hd - 34, ymax = 600;
      const s = H.svg("svg", { viewBox: `0 0 ${Wd} ${Hd}`, role: "img", "aria-label": "Latency versus utilization curve" });
      const X = u => x0 + u * (x1 - x0), Y = ms => y1 - Math.min(ms, ymax) / ymax * (y1 - y0);
      [0, 200, 400, 600].forEach(v => { H.svg("line", { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: "var(--line)" }, s); const t = H.svg("text", { x: x0 - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)", class: "mono" }, s); t.textContent = v + "ms"; });
      [0, .25, .5, .7, .9, 1].forEach(u => { const t = H.svg("text", { x: X(u), y: y1 + 16, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", class: "mono" }, s); t.textContent = Math.round(u * 100) + "%"; });
      const xl = H.svg("text", { x: (x0 + x1) / 2, y: Hd - 2, "text-anchor": "middle", "font-size": 11.5, fill: "var(--muted)" }, s); xl.textContent = "utilization (arrival rate ÷ capacity)";
      H.svg("rect", { x: X(.7), y: y0, width: X(1) - X(.7), height: y1 - y0, fill: "var(--signal-soft)" }, s);
      const dz = H.svg("text", { x: X(.85), y: y0 + 14, "text-anchor": "middle", "font-size": 11, fill: "var(--signal)", "font-weight": 600 }, s); dz.textContent = "danger zone";
      let d = "";
      for (let i = 0; i <= 200; i++) { const u = i / 200 * 0.995; const w = erlangW(u * c * MU, c, MU) * 1000; d += (i ? "L" : "M") + X(u).toFixed(1) + " " + Y(w).toFixed(1); }
      H.svg("path", { d, fill: "none", stroke: "var(--compute)", "stroke-width": 2.5 }, s);
      const rho = Math.min(lam / (c * MU), 0.995), W = erlangW(Math.min(lam, c * MU * 0.995), c, MU) * 1000;
      H.svg("circle", { cx: X(rho), cy: Y(W), r: 7, fill: "var(--signal)", stroke: "var(--surface)", "stroke-width": 2 }, s);
      const host = p.querySelector("#qcurve"); host.innerHTML = ""; host.appendChild(s);
      const v = p.querySelector("#qv"), real = lam / (c * MU);
      if (real >= 1) { v.className = "callout bad"; v.textContent = "More requests arrive than the workers can finish. The queue grows without limit and every new request waits longer than the last. This is how an overloaded API falls over: not slower, but unbounded."; }
      else if (real > .8) { v.className = "callout warn"; v.textContent = "Above ~80% utilization, a tiny traffic bump makes latency jump. Teams plan capacity so peak traffic stays around 60–70%."; }
      else { v.className = "callout good"; v.textContent = "Comfortable: requests rarely wait. Notice the curve stays almost flat until about 70%, then turns into a hockey stick."; }
    }
    function upd() {
      lam = +p.querySelector("#qu-l").value; const nc = +p.querySelector("#qu-c").value;
      p.querySelector("#qu-lo").textContent = lam + "/s"; p.querySelector("#qu-co").textContent = nc;
      if (nc !== c) { c = nc; const old = sim; resetSim(); if (old) sim.queue = old.queue; }
      readout(); curve();
    }
    resetSim(); p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd)); upd();
    raf = requestAnimationFrame(loop);
    const iv = setInterval(() => { if (!document.body.contains(cv)) { clearInterval(iv); return; } readout(); }, 700);
  }

  /* ---------------- 0.5 Back-of-the-envelope ---------------- */
  const PRESETS = {
    "Side project": { dau: 3, req: 30, w: 10, peak: 3, bytes: 3, resp: 20, yrs: 3 },
    "Local news site": { dau: 5.3, req: 25, w: 1, peak: 4, bytes: 3.3, resp: 120, yrs: 5 },
    "Chat app": { dau: 6.3, req: 120, w: 35, peak: 3, bytes: 2.5, resp: 4, yrs: 5 },
    "Photo sharing at scale": { dau: 8.7, req: 60, w: 3, peak: 3, bytes: 6.3, resp: 300, yrs: 10 }
  };
  function envelope(root) {
    const p = H.panel(root, "Size a system in two minutes", "Try it");
    p.innerHTML = `<div class="controls" id="pre"></div>
      <div class="controls">
        <div class="ctl"><label for="e-dau">Daily active users <output id="o-dau"></output></label><input type="range" id="e-dau" min="2" max="9" step="0.1"></div>
        <div class="ctl"><label for="e-req">Requests per user per day <output id="o-req"></output></label><input type="range" id="e-req" min="1" max="300"></div>
        <div class="ctl"><label for="e-w">Share that are writes <output id="o-w"></output></label><input type="range" id="e-w" min="1" max="60"></div>
        <div class="ctl"><label for="e-peak">Peak ÷ average traffic <output id="o-peak"></output></label><input type="range" id="e-peak" min="1" max="10" step="0.5"></div>
        <div class="ctl"><label for="e-bytes">Data stored per write <output id="o-bytes"></output></label><input type="range" id="e-bytes" min="2" max="7" step="0.1"></div>
        <div class="ctl"><label for="e-resp">Average response size <output id="o-resp"></output></label><input type="range" id="e-resp" min="1" max="500"></div>
        <div class="ctl"><label for="e-yrs">Keep data for <output id="o-yrs"></output></label><input type="range" id="e-yrs" min="1" max="10"></div>
      </div>
      <div class="readout" id="er"></div>
      <h4 style="font-size:14px;margin:16px 0 4px">Does it fit on one good VM? <span class="note" style="font-weight:400">(8 vCPU, 32 GB RAM, 1 TB SSD, about €150/month)</span></h4>
      <div id="fit"></div><div class="callout" id="ev"></div>`;
    const pre = p.querySelector("#pre");
    const set = v => { Object.entries(v).forEach(([k, x]) => p.querySelector("#e-" + k).value = x); upd(); };
    Object.entries(PRESETS).forEach(([n, v]) => { const b = H.el(`<button class="btn" type="button">${n}</button>`); b.onclick = () => set(v); pre.appendChild(b); });
    function upd() {
      const g = k => +p.querySelector("#e-" + k).value;
      const dau = Math.pow(10, g("dau")), req = g("req"), w = g("w") / 100, peak = g("peak"), bytes = Math.pow(10, g("bytes")), resp = g("resp") * 1000, yrs = g("yrs");
      p.querySelector("#o-dau").textContent = H.fmtNum(dau); p.querySelector("#o-req").textContent = req; p.querySelector("#o-w").textContent = Math.round(w * 100) + "%";
      p.querySelector("#o-peak").textContent = peak + "×"; p.querySelector("#o-bytes").textContent = H.fmtBytes(bytes); p.querySelector("#o-resp").textContent = H.fmtBytes(resp); p.querySelector("#o-yrs").textContent = yrs + (yrs > 1 ? " years" : " year");
      const avg = dau * req / 86400, pk = avg * peak, wps = pk * w;
      const perDay = dau * req * w * bytes, total = perDay * 365 * yrs;
      const mbps = pk * resp * 8 / 1e6;
      p.querySelector("#er").innerHTML = [["Average req/s", H.fmtNum(avg)], ["Peak req/s", H.fmtNum(pk)], ["Peak writes/s", H.fmtNum(wps)], ["New data per day", H.fmtBytes(perDay)], ["Data after " + yrs + "y", H.fmtBytes(total)], ["Peak bandwidth", mbps >= 1000 ? (mbps / 1000).toFixed(1) + " Gbps" : Math.round(mbps) + " Mbps"]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
      const caps = [["API requests", pk, 2000, "req/s", "Level 2 · scale out"], ["Database writes", wps, 3000, "writes/s", "Levels 5–6 · replicas, sharding"], ["Storage", total, 1e12, "", "Level 3 · object storage"], ["Bandwidth", mbps, 1000, "Mbps", "Level 3 · CDN"]];
      const fit = p.querySelector("#fit"); fit.innerHTML = "";
      let worst = null;
      caps.forEach(([n, v, cap, u, lvl]) => {
        const pct = v / cap * 100; if (!worst || pct > worst.pct) worst = { n, pct, lvl };
        const col = pct > 100 ? "var(--bad)" : pct > 60 ? "var(--xp)" : "var(--ok)";
        fit.appendChild(H.el(`<div style="display:grid;grid-template-columns:130px minmax(0,1fr) 70px;gap:10px;align-items:center;padding:4px 0;font-size:13px"><span>${n}</span><span style="height:12px;background:var(--line);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, Math.max(1, pct))}%;background:${col}"></i></span><span class="mono" style="text-align:right;color:${col}">${pct > 999 ? ">999" : Math.round(pct)}%</span></div>`));
      });
      const v = p.querySelector("#ev");
      if (worst.pct <= 60) { v.className = "callout good"; v.textContent = "One well-run VM handles this with room to spare. Most products live here for a long time. Spend your effort on backups, deploys and monitoring (Level 1), not on distributed systems."; }
      else if (worst.pct <= 100) { v.className = "callout warn"; v.textContent = `It fits, but ${worst.n.toLowerCase()} is close to the limit. Plan the next step now: ${worst.lvl}.`; }
      else { v.className = "callout bad"; v.textContent = `${worst.n} needs ${Math.round(worst.pct / 100)}× what one machine gives. This is where the rest of the course comes in: ${worst.lvl}.`; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd));
    set(PRESETS["Side project"]);

    H.add(root, `<div class="keys"><div class="key"><b>1 day ≈ 100,000 s</b>86,400 rounds to 10⁵. So 1M requests/day ≈ 12 req/s.</div><div class="key"><b>Peak ≈ 2–5× average</b>Consumer traffic follows the sun; design for the peak, pay for the average.</div><div class="key"><b>Reads ≫ writes</b>Most apps read 10–100× more than they write. That is why caches and replicas work.</div><div class="key"><b>Round hard</b>You want the order of magnitude, not three significant figures.</div></div>`);

    const c = H.panel(root, "Sizing challenge", "Do it");
    const done = H.flag("badge:estimator");
    c.innerHTML = `<p style="margin-top:0">A messaging app has <b>2 million</b> daily active users. Each sends <b>40 messages</b> a day. Peak traffic is <b>3×</b> the average. Roughly how many messages per second must the database accept at peak?</p>
      <form id="chf" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start" novalidate><div><input id="cha" inputmode="numeric" placeholder="messages per second" style="padding:8px 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);width:200px" aria-describedby="che"><div id="che" style="font-size:13px;color:var(--bad);margin-top:4px" hidden></div></div><button class="btn primary" type="submit">Check my estimate</button></form>
      <div id="chr"></div>`;
    const f = c.querySelector("#chf"), inp = c.querySelector("#cha"), err = c.querySelector("#che"), res = c.querySelector("#chr");
    const solution = `<p class="note" style="margin-bottom:0">Working: 2M × 40 = 80M messages/day. 80M ÷ 100k s ≈ 800/s on average (exact: 926/s). × 3 at peak ≈ <b>2,400–2,800 writes/s</b>. That is near the limit of a single Postgres primary on one VM, so a real chat app plans for batching writes or partitioning early.</p>`;
    if (done) res.innerHTML = `<div class="callout good">You already solved this one.</div>` + solution;
    inp.addEventListener("input", () => { err.hidden = true; });
    f.addEventListener("submit", e => {
      e.preventDefault();
      const n = parseFloat(inp.value.replace(/[, _]/g, "").replace(/k$/i, "000"));
      if (!inp.value.trim() || !isFinite(n) || n <= 0) { err.hidden = false; err.textContent = "Enter a number, like 1500"; return; }
      const truth = 2e6 * 40 / 86400 * 3; const ratio = n / truth;
      if (ratio > 0.7 && ratio < 1.45) { res.innerHTML = `<div class="callout good"><b>Right order of magnitude.</b> The exact answer is about ${Math.round(truth).toLocaleString()} writes/s.</div>` + solution; H.award("estimator"); }
      else { res.innerHTML = `<div class="callout bad">${ratio < 1 ? "Too low" : "Too high"} by about ${ratio < 1 ? (1 / ratio).toFixed(0) : ratio.toFixed(0)}×. Hint: messages per day ÷ seconds per day gives the average, then apply the peak factor.</div>`; }
    });
  }

  /* ---------------- helpers for lab solutions ---------------- */
  function bars(rows) {
    const max = Math.max(...rows.map(r => r[1]));
    return `<div style="display:grid;gap:4px;margin:10px 0">${rows.map(([l, v, k]) => `<div style="display:grid;grid-template-columns:minmax(0,150px) minmax(0,1fr) 60px;gap:8px;align-items:center;font-size:13px"><span>${l}</span><span style="height:12px;background:var(--line);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(1, v / max * 100)}%;background:${k === "net" ? "var(--signal)" : "var(--compute)"}"></i></span><span class="mono" style="text-align:right">${v} ms</span></div>`).join("")}</div>`;
  }
  function rampCharts(rows) {
    const W = 340, Hh = 220, x0 = 44, x1 = W - 12, y0 = 28, y1 = Hh - 40;
    const X = v => x0 + v / 160 * (x1 - x0);
    const axisX = () => [0, 40, 80, 120, 160].map(v => `<text x="${X(v)}" y="${y1 + 15}" text-anchor="middle" font-size="10.5" fill="var(--muted)" class="mono">${v}</text>`).join("") + `<text x="${(x0 + x1) / 2}" y="${Hh - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">offered load (req/s)</text>`;
    const Y1 = v => y1 - v / 160 * (y1 - y0);
    let a = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Offered versus achieved throughput"><text x="${x0}" y="16" font-size="12" font-weight="600" fill="var(--ink)">Throughput: what got done</text>`;
    [0, 40, 80, 120, 160].forEach(v => { a += `<line x1="${x0}" x2="${x1}" y1="${Y1(v)}" y2="${Y1(v)}" stroke="var(--line)"/><text x="${x0 - 6}" y="${Y1(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" class="mono">${v}</text>`; });
    a += `<line x1="${X(0)}" y1="${Y1(0)}" x2="${X(160)}" y2="${Y1(160)}" stroke="var(--faint)" stroke-dasharray="4 4"/><text x="${X(112)}" y="${Y1(128)}" font-size="10.5" fill="var(--muted)">if it kept up</text>`;
    a += `<line x1="${x0}" x2="${x1}" y1="${Y1(50)}" y2="${Y1(50)}" stroke="var(--signal)" stroke-dasharray="3 3"/><text x="${x1}" y="${Y1(50) - 5}" text-anchor="end" font-size="10.5" fill="var(--signal)">1 worker: 50 req/s max</text>`;
    a += `<path d="${rows.map((r, i) => (i ? "L" : "M") + X(r[0]).toFixed(1) + " " + Y1(r[1]).toFixed(1)).join(" ")}" fill="none" stroke="var(--compute)" stroke-width="2.5"/>`;
    rows.forEach(r => { a += `<circle cx="${X(r[0])}" cy="${Y1(r[1])}" r="3.5" fill="var(--compute)"/>`; });
    a += axisX() + `</svg>`;
    const lo = 1, hi = 4, Y2 = ms => y1 - (Math.log10(Math.max(10, ms)) - lo) / (hi - lo) * (y1 - y0);
    let b = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="p95 latency by offered load, log scale"><text x="${x0}" y="16" font-size="12" font-weight="600" fill="var(--ink)">p95 latency (log scale)</text>`;
    [[10, "10ms"], [100, "100ms"], [1000, "1s"], [10000, "10s"]].forEach(([v, t]) => { b += `<line x1="${x0}" x2="${x1}" y1="${Y2(v)}" y2="${Y2(v)}" stroke="var(--line)"/><text x="${x0 - 6}" y="${Y2(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" class="mono">${t}</text>`; });
    rows.forEach(r => { const c = r[2] >= 1000 ? "var(--bad)" : r[2] >= 100 ? "var(--xp)" : "var(--ok)"; b += `<rect x="${X(r[0]) - 7}" y="${Y2(r[2])}" width="14" height="${y1 - Y2(r[2])}" rx="2" fill="${c}"/>`; });
    b += axisX() + `</svg>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0">${a}${b}</div>`;
  }

  Course.register({
    id: 0,
    blurb: "How a request actually travels, what things cost in time, how queues behave, and how to size a system before you build it.",
    examBadge: "lvl0",
    lessons: [
      {
        id: "0.1", sources: [["An overview of HTTP", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", "MDN Web Docs"], ["What is DNS?", "https://www.cloudflare.com/learning/dns/what-is-dns/", "Cloudflare Learning Center"], ["What happens in a TLS handshake?", "https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/", "Cloudflare Learning Center"], ["High Performance Browser Networking", "https://hpbn.co/", "Ilya Grigorik, O'Reilly (free online): chapters on TCP and TLS"]], title: "What happens when you press Enter", minutes: 25,
        lede: "Every system design question starts here. Watch one request leave the browser, cross the internet, pass through nginx and FastAPI to Postgres, and come back.",
        render(r) {
          journey(r);
          H.keys(r, [["Round trips are the unit of cost", "A new HTTPS connection needs DNS + TCP + TLS before any data: often three round trips."], ["Distance beats code", "For a far-away user, the network is 90%+ of the time. Your Python is a rounding error."], ["Reuse connections", "Keep-alive and HTTP/2 skip the handshakes on repeat requests. That is the 'Repeat request' mode."], ["Hence CDNs and regions", "If you cannot reduce round trips, move the endpoint closer to the user (Level 3)."]]);
          H.yourApp(r, "In practice", "When nginx terminates TLS in front of an app server, the hop to the app is plain HTTP on a private network, so the expensive handshakes happen once per client connection. Check <code>keepalive_timeout</code> in nginx and that clients reuse connections, then measure the real phases with <code>curl -w</code> in the lab.");
        },
        check: { q: "A user in Sydney opens your Frankfurt-hosted app for the first time and it feels slow. What dominates the time before the first byte arrives?", opts: ["The Postgres query, because the first request always runs with a cold database cache", "Several network round trips: DNS, TCP and TLS handshakes, then the request", "nginx parsing and buffering the request before handing it to FastAPI", "Python's slower execution compared with a compiled language such as Go"], a: 1, why: "Each round trip to Sydney costs ~285 ms, and a cold HTTPS request needs about three before the response starts. Server work is ~8 ms. The fixes are fewer round trips (connection reuse, HTTP/2 or 3) and shorter distance (CDN, a closer region)." }
      },
      {
        id: "0.2", sources: [["Latency numbers every programmer should know", "https://colin-scott.github.io/personal_website/research/interactive_latency.html", "Interactive version of Jeff Dean's numbers"], ["System Design Primer: appendix", "https://github.com/donnemartin/system-design-primer#appendix", "Powers of two and latency tables"], ["Relationship loading techniques (the N+1 problem)", "https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html", "SQLAlchemy 2.0 documentation"]], title: "Latency numbers to know by heart", minutes: 25,
        lede: "System design is mostly about avoiding slow things. These numbers explain why caches, indexes, co-location and CDNs exist.",
        render(r) {
          latency(r);
          H.keys(r, [["Memory ≫ disk ≫ network", "Each step down the ladder is 10–1000× slower. Good designs keep hot data high on the ladder."], ["Co-locate app and database", "Every query pays a round trip. Same machine or same zone, never across regions."], ["Count queries, not lines of code", "N+1 queries is the most common performance bug in real APIs."], ["Physics is the floor", "Light in fibre takes ~50 ms to cross the Atlantic and back. Only geography can beat it."]]);
          H.yourApp(r, "In practice", "Turn on SQL logging in development (for example <code>echo=True</code> in SQLAlchemy, or Postgres's <code>log_min_duration_statement</code>) and count the queries behind your busiest endpoint. More than a handful per request usually means an N+1.");
        },
        check: { q: "An endpoint makes 120 small queries (one per item in a list), each about 1 ms. What is the best fix?", opts: ["Move to a VM with more CPU cores so the queries run in parallel", "Run more uvicorn workers so each request finishes sooner", "Fetch all items in one query with a JOIN or WHERE id = ANY(...)", "Put Postgres on a faster NVMe SSD to cut each query's time"], a: 2, hints: ["CPU is not the bottleneck: the time is spent waiting on 120 round trips.", "More workers help throughput across requests, not the latency of one request.", "", "The data is probably already in memory. The cost is the number of round trips."], why: "The cost is 120 round trips, not CPU or disk. One batched query does the same work in one round trip. Recognising the N+1 pattern is worth more than any hardware upgrade." }
      },
      {
        id: "0.3", sources: [["The Tail at Scale", "https://research.google/pubs/the-tail-at-scale/", "Dean and Barroso, Communications of the ACM, 2013"], ["Monitoring Distributed Systems", "https://sre.google/sre-book/monitoring-distributed-systems/", "Google SRE book, chapter 6"], ["Histograms and summaries", "https://prometheus.io/docs/practices/histograms/", "Prometheus documentation"]], title: "Percentiles: the mean lies", minutes: 20,
        lede: "Latency is a distribution, not a number. Learn to read p50, p95 and p99, and why the slowest 1% matters more than it looks.",
        render(r) {
          percentiles(r);
          H.keys(r, [["p50 = typical", "Half of requests are faster than this."], ["p99 = the tail", "1 in 100 requests is slower. Your most active users hit it every session."], ["Never alert on the mean", "One 10-second request and 99 fast ones average to something that looks fine."], ["Fan-out amplifies the tail", "More calls per page means more users see the p99. Microservices make this worse."]]);
          H.yourApp(r, "In practice", "Log request duration in middleware and look at p95/p99 per endpoint, not averages. In Level 10 you will turn these into SLOs.");
        },
        check: { q: "Your dashboard shows average latency of 80 ms, but users still say the app feels slow. What should you check first?", opts: ["The p95 and p99 latency per endpoint", "The average CPU usage across all the servers", "The total number of requests served per day", "The size and layer count of your Docker images"], a: 0, why: "An 80 ms mean can hide a p99 of several seconds. Percentiles show what real users experience in the tail, which is where complaints come from." }
      },
      {
        id: "0.4", sources: [["Little's Law as Viewed on Its 50th Anniversary", "https://pubsonline.informs.org/doi/10.1287/opre.1110.0940", "John D. C. Little, Operations Research, 2011"], ["Handling Overload", "https://sre.google/sre-book/handling-overload/", "Google SRE book, chapter 21"], ["Server Workers: Uvicorn with workers", "https://fastapi.tiangolo.com/deployment/server-workers/", "FastAPI documentation"]], title: "Throughput, queues and Little's law", minutes: 30,
        lede: "Every server is a queue in front of a fixed number of workers. Push the arrival rate up and see why latency explodes long before 100% CPU.",
        render(r) {
          queueing(r);
          H.keys(r, [["Throughput vs latency", "Throughput is requests per second finished. Latency is how long each one takes. Overload turns one into the other."], ["Little's law: L = λ × W", "Requests in the system = arrival rate × time each spends. 100 req/s × 0.2 s = 20 in flight."], ["Run at 60–70%", "Leave headroom for spikes. Past ~80% utilization, queues dominate."], ["Add workers or reduce work", "Capacity = workers ÷ time per request. Both levers work; caching reduces the work."]]);
          H.yourApp(r, "In practice", "A Python app server such as Uvicorn uses one CPU core per worker process. With gunicorn or <code>uvicorn --workers N</code> you get N workers; a common start is one per core. In the lab you will find the knee of the curve with k6.");
        },
        check: { q: "Your API sits at 90% CPU at peak. Average latency is still OK. Why would an SRE be worried?", opts: ["Sustained 90% CPU wears out the processor and shortens the hardware's life", "Latency grows non-linearly near full load, so a small spike causes queues", "Docker throttles containers once the host goes above about 85% CPU", "High CPU on the API is the standard sign that the database is already down"], a: 1, why: "Queueing theory: wait time grows like 1 ÷ (1 − utilization). At 90%, a 10% spike pushes you past capacity and the queue grows without bound. Headroom is the cheapest reliability feature." }
      },
      {
        id: "0.5", sources: [["System Design Primer: back-of-the-envelope calculations", "https://github.com/donnemartin/system-design-primer#back-of-the-envelope-calculations", "Donne Martin"], ["System Design Interview, Volume 1", "https://bytebytego.com/", "Alex Xu, chapter 2: Back-of-the-envelope estimation"]], title: "Back-of-the-envelope estimation", minutes: 30,
        lede: "Before choosing an architecture, turn 'lots of users' into requests per second, gigabytes and megabits. Then check whether one machine is enough.",
        render(r) {
          envelope(r);
          H.yourApp(r, "In practice", "Fill in your own numbers: expected users in a year, actions per session, what each write stores. You will probably find one VM is fine for a long time, and the lab asks you to verify that with a load test.");
        },
        check: { q: "Roughly how many requests per second is 1 million requests per day, on average?", opts: ["About 1", "About 12", "About 120", "About 1,200"], a: 1, why: "1,000,000 ÷ 86,400 ≈ 11.6. Rounding a day to 100,000 seconds gives 10, close enough. Peak might be 30–50 req/s, which one small VM handles easily." }
      }
    ],
    exam: [
      { q: "Which sequence happens before the first byte of an HTTPS request reaches a new server?", opts: ["TLS handshake first, so the DNS lookup and TCP connection are encrypted", "DNS lookup, TCP handshake, TLS handshake", "TCP handshake to the resolver, then the DNS lookup, then TLS", "Only a TLS handshake, because HTTPS replaces DNS and TCP"], a: 1, why: "You need the IP (DNS) before you can open a TCP connection, and TLS runs on top of TCP." },
      { q: "A cross-Atlantic round trip is about 85 ms. A cold HTTPS request needs ~3 round trips before the response begins. Roughly what is the minimum time to first byte?", opts: ["~10 ms", "~85 ms", "~250 ms", "~2 s"], a: 2, why: "3 × 85 ms ≈ 255 ms, before any server work. This is why CDNs terminate TLS close to users." },
      { q: "Which is fastest?", opts: ["A Postgres query over the network", "Reading a block from an NVMe SSD", "Reading from RAM", "A round trip between two servers in one datacenter"], a: 2, why: "RAM is ~100 ns. SSD is ~20 µs, a datacenter round trip ~500 µs, a query ~1 ms." },
      { q: "What does p99 = 1.2 s mean?", opts: ["Every request takes 1.2 s, measured over the slowest 99% of traffic", "The average request takes 1.2 s once the fastest 1% are excluded", "1% of requests take 1.2 s or longer", "The server is 99% utilized, and requests wait about 1.2 s for a worker"], a: 2, why: "99% of requests are faster than 1.2 s; the slowest 1% take at least that long." },
      { q: "A service handles 200 req/s and each request spends 50 ms in the system. How many requests are in flight on average?", opts: ["4", "10", "40", "250"], a: 1, why: "Little's law: L = λW = 200 × 0.05 = 10." },
      { q: "One worker handles a request in ~40 ms. How many workers do you need for 300 req/s at a healthy ~70% utilization?", opts: ["About 4", "About 8", "About 18", "About 60"], a: 2, why: "One worker does 25 req/s. 300 ÷ 25 = 12 workers at 100%. At 70%: 12 ÷ 0.7 ≈ 17–18." },
      { q: "An app has 500k daily users making 20 requests each, with a 3× peak. What is the peak request rate?", opts: ["~35 req/s", "~350 req/s", "~3,500 req/s", "~35,000 req/s"], a: 1, why: "500k × 20 = 10M/day ÷ 86,400 ≈ 116 req/s average × 3 ≈ 350 req/s." },
      { q: "Why do read-heavy apps benefit so much from caching and read replicas?", opts: ["Writes are cheaper than reads, so moving reads elsewhere frees the most capacity", "Reads usually outnumber writes 10–100×, so serving reads cheaply removes most of the load", "Caches and replicas make writes durable sooner, so the primary does less work", "Replicas split the stored data between them, so each server stores and scans less"], a: 1, why: "Most traffic is reads. Taking them off the primary database removes most of its work (Levels 3 and 5)." }
    ],
    lab: {
      title: "Measure, don't guess",
      time: "about 5 hours",
      folder: "level-0-measure/",
      needs: "Docker Desktop (or Docker on your VM), a terminal, curl",
      intro: `<p>You will run a small FastAPI + Postgres service, dissect real HTTPS requests into their phases, then load-test the service until it breaks and find the knee of the latency curve from Lesson 0.4.</p><p>Everything runs locally with Docker Compose. k6, the load-testing tool, runs from its official Docker image, so you do not need to install it.</p><p>Every step has a <b>worked solution</b> under it with sample output and how to read it. Try first, then compare.</p>`,
      steps: [
        { id: "l0-1", why: "You need a running system to measure. Choosing the port first avoids clashes with whatever else runs on your machine.", title: "Pick a port and start the stack",
          body: `<p>The API is published on port 8000 of your machine. If that port is taken, choose another: every command in this lab uses the <code>API_PORT</code> variable, so you set it once.</p>${H.code(`cd level-0-measure
export API_PORT=8000            # use 8001, 18000... if 8000 is taken
docker compose up -d --build
curl -s localhost:$API_PORT/health`)}<p>New terminal? Run the <code>export</code> line again, or put <code>API_PORT=8001</code> in <code>.env</code> (copy it from <code>.env.example</code>) so Compose always picks it up.</p>`,
          expect: `<code>{"status":"ok","db":true}</code>. If <code>db</code> is false, wait a few seconds for Postgres to finish starting.`,
          solution: `<p><b>What happened:</b> Compose built the API image, started Postgres, waited for its health check, then started the API, which created and filled a 10,000-row table on first start.</p>
            <p><b>"port is already allocated"</b> means another process (often another project's container) holds the port. Find it with <code>lsof -i :8000</code> (macOS/Linux) or <code>docker ps</code>, or just pick a different <code>API_PORT</code>. Only the left side of <code>"${"$"}{API_PORT}:8000"</code> changes; inside Docker the app always listens on 8000.</p>` },
        { id: "l0-2", why: "Lesson 0.1 claimed that every new connection costs round trips before any data flows. Measuring real sites shows how large those costs are, and curl timings are a debugging tool you will use for years.", title: "Dissect a real HTTPS request",
          body: `<p><code>curl-format.txt</code> prints the phases from Lesson 0.1. Run it against two sites, twice each.</p>${H.code(`curl -w "@curl-format.txt" -o /dev/null -s https://www.cloudflare.com
curl -w "@curl-format.txt" -o /dev/null -s https://www.abc.net.au`)}`,
          expect: "Five timestamps per request. The second run of each usually shows a near-zero DNS lookup because the answer is cached.",
          solution: `<p><b>The numbers are cumulative.</b> Each one is "seconds since the start", not the length of that phase. Subtract neighbours to get each phase:</p>
            ${H.code(`      DNS lookup:  0.012s   -> DNS        = 12 ms
     TCP connect:  0.058s   -> TCP        = 58 - 12  = 46 ms   (one round trip)
   TLS handshake:  0.107s   -> TLS        = 107 - 58 = 49 ms   (one more round trip)
 Request sent at:  0.107s
Time to 1st byte:  0.161s   -> server + 1 round trip = 161 - 107 = 54 ms
           Total:  0.163s`)}
            <div class="sol-bars">${bars([["DNS", 12, "net"], ["TCP handshake", 46, "net"], ["TLS handshake", 49, "net"], ["Request → 1st byte", 54, "net"], ["Download", 2, "srv"]])}</div>
            <p>TCP and TLS each cost about one round trip (~46–49 ms here), exactly the pattern from Lesson 0.1. Time to first byte is one more round trip plus the server's work.</p>
            <p><b>If both sites look equally fast:</b> the "far" site is being served from a content delivery network (CDN) edge server near you, not from Australia. That is the point of a CDN, and Level 3 covers it.</p>` },
        { id: "l0-3", why: "Rare slow requests are invisible in small samples. Watching them appear only at scale is why latency is measured with many samples and percentiles.", title: "See the long tail",
          body: `<p><code>/tail</code> is usually fast, but 2% of requests are slow. Rare events need many samples, so send 200 requests and look at the slowest few.</p>${H.code(`for i in $(seq 1 200); do curl -s -o /dev/null -w "%{time_total}\\n" localhost:$API_PORT/tail; done | sort -n | tail -8
# count the slow ones:
for i in $(seq 1 200); do curl -s -o /dev/null -w "%{time_total}\\n" localhost:$API_PORT/tail; done | awk '$1 > 0.4' | wc -l`)}`,
          expect: "Most times are 0.005–0.02 s. The last 2–6 lines of the sorted list are 0.5–1.0 s.",
          solution: `${H.code(`0.014
0.015
0.017
0.021
0.583      <- the slow 2%
0.711
0.802
0.946`)}
            <p><b>Why 20 requests showed nothing:</b> with a 2% chance per request, the chance that 20 requests contain <i>no</i> slow one is 0.98<sup>20</sup> ≈ 67%. With 200 requests it drops to 0.98<sup>200</sup> ≈ 2%, and you expect about 4 slow ones.</p>
            <p><b>Lesson:</b> to measure a p99 (the 99th percentile) you need hundreds of requests at the very least; a handful of manual tests will tell you the tail does not exist.</p>
            <p>Fast requests take 10–20 ms rather than 1–5 ms on Docker Desktop because traffic passes through its virtual machine (VM) network layer. That overhead is the same for every request, so it does not change the shape.</p>` },
        { id: "l0-4", why: "Load-testing tools measure thousands of requests and report percentiles, which is how latency is judged in production.", title: "Measure percentiles with k6",
          body: `<p>Send a steady 30 requests per second for 30 seconds. k6 uses <i>virtual users</i> (VUs): simulated clients, each sending one request at a time.</p>${H.code(`# Linux
docker run --rm -i --network host -e TARGET=http://localhost:$API_PORT/tail grafana/k6 run - < k6/steady.js
# Docker Desktop (Mac/Windows)
docker run --rm -i -e TARGET=http://host.docker.internal:$API_PORT/tail grafana/k6 run - < k6/steady.js`)}<p>While it runs, k6 only shows a progress line. The report appears when it finishes.</p>`,
          expect: "A STEADY LOAD REPORT with a histogram: almost all requests in the first two or three rows, plus a small cluster around 500 ms–1 s.",
          solution: `<p>Sample report from the reference run:</p>${H.code(`  offered 30 req/s for 20s  ->  completed 601 requests (29.4 req/s), dropped 0

        <5ms | ███████████████████████████████████████ 321
      5-10ms | ████████████████████████████████ 264
    50-100ms |  4
    500ms-1s |  10

  p50 (median)     4.8 ms
  p95              6.9 ms
  p99            649.4 ms
  average         17.2 ms   <- 3.5x the median, yet describes no real request`, [6, 10, 11])}
            <ul><li><b>The histogram is two humps</b>: the normal requests and the slow 2%. Real systems look like this (cache hits vs misses, lock waits).</li><li><b>p95 looks perfect, p99 does not.</b> The slow requests are fewer than 5%, so only the p99 sees them.</li><li><b>The average lies</b>: 17 ms is neither the typical request (5 ms) nor the slow one (650 ms).</li></ul>` },
        { id: "l0-5", why: "Every server has a maximum throughput. Finding it on purpose tells you how much traffic you can take and what overload looks like before your users find out.", title: "Find the knee of the curve",
          body: `<p><code>/work</code> uses 20 ms of CPU per request, and the app runs one worker process. <code>k6/ramp.js</code> raises the offered load from 10 to 150 req/s over 2 minutes, then holds for 20 s.</p>${H.code(`# Linux
docker run --rm -i --network host -e TARGET=http://localhost:$API_PORT/work grafana/k6 run - < k6/ramp.js
# Docker Desktop
docker run --rm -i -e TARGET=http://host.docker.internal:$API_PORT/work grafana/k6 run - < k6/ramp.js`)}`,
          expect: "A RAMP REPORT where achieved throughput stops rising around 50 req/s and the p95 bars jump from tens of milliseconds to seconds. k6 also warns that it reached its VU limit.",
          solution: `<p><b>Reading the live progress line:</b></p>${H.code(`running (2m16.0s), 298/300 VUs, 10811 complete and 0 interrupted iterations
ramp   [  97% ] 298/300 VUs  2m16.0s/2m20s  150.00 iters/s`)}
            <ul><li><b>298/300 VUs</b>: 298 simulated users are each stuck waiting for a response. That number is how many requests are in flight. Near the limit means the server is saturated.</li><li><b>150.00 iters/s</b> is the rate k6 is <i>trying</i> to send, not what the server handles.</li></ul>
            <p><b>The report from the reference run (one worker):</b></p>${H.code(`  offered   achieved   median    p95
     10-30       20     22ms    24ms
     30-50       40     22ms   118ms
     50-70       52    1.14s   4.60s   <- can't keep up
     70-90       60    3.23s  10.00s   <- can't keep up
   130-150       57    3.37s  10.00s   <- can't keep up
  peak VUs in use: 300   dropped iterations: 5569`, [4])}
            <div class="sol-charts">${rampCharts([[20, 20, 24], [40, 40, 118], [60, 52, 4600], [80, 60, 10000], [100, 56, 10000], [120, 58, 10000], [140, 57, 10000], [150, 58, 10000]])}</div>
            <ul><li><b>Achieved stops at ~55 req/s</b>: one worker can do 1 ÷ 0.020 s = 50 CPU-bound requests per second. Offering more does not get more done.</li><li><b>p95 goes from 24 ms to 10 s</b> (k6's timeout) over a small increase in load: the hockey stick from Lesson 0.4.</li><li><b>Dropped iterations</b>: k6 ran out of VUs because every one was waiting, so it could not send the requests it wanted to. Real users would see timeouts and errors.</li></ul>` },
        { id: "l0-6", why: "Worker processes are the first lever for capacity. Watching the limit move confirms the model: capacity = workers ÷ time per request.", title: "Add workers and rerun",
          body: `<p>Set <code>WORKERS=4</code> in <code>.env</code> (copy it from <code>.env.example</code>, keep your <code>API_PORT</code>), recreate the API, rerun the ramp.</p>${H.code(`cp .env.example .env   # then edit WORKERS=4 and API_PORT
docker compose up -d api
docker run --rm -i --network host -e TARGET=http://localhost:$API_PORT/work grafana/k6 run - < k6/ramp.js
# (Docker Desktop: same as step 5 with host.docker.internal)`)}<p>Run <code>docker stats</code> in a second terminal to watch CPU.</p>`,
          expect: "The knee moves up roughly in proportion to the workers, as long as your machine has that many free CPU cores. With 4 workers it may not appear before 150 req/s at all: the report then says \"No knee\" and VUs stay low.",
          solution: `<p><b>Reference run with 2 workers on a 2-core machine</b> (k6 itself shares the same cores):</p>${H.code(`  offered   achieved   median    p95
     50-70       60     27ms    42ms
     70-90       79     50ms   178ms
    90-110       90    779ms   2.16s   <- can't keep up
   130-150       80    3.71s   4.05s   <- can't keep up`)}
            <ul><li>The ceiling moved from ~55 to ~85 req/s. Not quite 2× because k6 was competing for the same two cores.</li><li><b>If you saw "VUs stayed at 50 or below"</b>: the server kept up, so each request finished quickly and few VUs were ever waiting. Low VUs = no queue. (An earlier version of the script pre-started 50 idle VUs, which is why 50 was the floor; the new version starts with 5.)</li><li><b>To find the new knee</b>, raise the target: <code>-e END=400</code>. With 4 workers and 4 free cores expect roughly 180–200 req/s.</li><li><b>No change at all?</b> Docker Desktop may be limited to 2 CPUs in Settings → Resources, or <code>API_CPUS</code> in <code>.env</code> is low.</li></ul>` },
        { id: "l0-7", why: "Little's law links throughput, latency and concurrency. It is how you size worker pools and database connection pools from numbers you can measure.", title: "Check Little's law on real numbers",
          body: `<p>Little's law says: requests in flight (L) = throughput (λ, lambda) × time each request spends in the system (W). The steady report prints all three. Then apply it to the saturated ramp: you know L (VUs in use) and λ (achieved req/s), so work out W.</p>`,
          expect: "Steady test: L well below 1. Saturated ramp: W of several seconds, of which only 20 ms is real work.",
          solution: `<p><b>Steady test (reference numbers):</b> λ = 29.4 req/s, W = 17.2 ms = 0.0172 s, so L = 29.4 × 0.0172 ≈ 0.5. On average half a request is in progress: the server is idle most of the time.</p>
            <p><b>Saturated ramp, with your own numbers:</b> 298 VUs in use and the server achieving ~55 req/s:</p>${H.code(`W = L / λ = 298 / 55 ≈ 5.4 seconds per request

real work per request   = 0.02 s
waiting in the queue    = 5.4 - 0.02 ≈ 5.38 s   (99.6% of the time!)`)}
            <p>That matches the report: median 3.4 s, p95 at the 10 s timeout. Almost all of a saturated server's latency is <b>queueing</b>, not work. Adding work capacity (workers) or removing work (caching) fixes it; making the code 10% faster barely does.</p>
            <p><b>Where you will use this:</b> sizing pools. If an endpoint handles 200 req/s and each holds a database connection for 50 ms, it needs L = 200 × 0.05 = 10 connections busy on average, so a pool of 20 gives headroom (Level 4).</p>` },
        { id: "l0-8", why: "Estimating before you build stops you from both over-engineering and being surprised by growth.", title: "Size your own app",
          body: `<p>Open Lesson 0.5 and enter realistic numbers for your app one year from now. Write down peak req/s, peak writes/s and storage. Compare peak req/s with what one worker handled in step 5.</p>`,
          expect: "A short note: how many workers your app needs at peak, and whether one VM is enough. Keep it; you will revisit it in Level 2.",
          solution: `<p><b>Worked example:</b> 5,000 daily active users (DAU) × 60 requests each = 300,000 requests/day ≈ 3.5 req/s on average. With a 5× peak, about 17 req/s.</p>
            <p>A typical database-backed FastAPI endpoint uses 5–10 ms of CPU, so one worker handles roughly 100–200 req/s. At 17 req/s peak that is ~10–15% utilization: <b>one VM with 2–4 workers is plenty</b>, with room for 5–10× growth.</p>
            <p>Your real numbers will differ; what matters is the habit: estimate, then check the estimate with a load test before buying anything.</p>` }
      ]
    }
  });
})();
