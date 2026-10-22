/* Level 3 — Caching and CDNs */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------------- 3.1 The cache hierarchy ---------------- */
  const LAYERS = [
    { k: "browser", n: "Browser cache", hit: 0.3, cost: 0, what: "Files this user already downloaded. Free and instant, but only helps repeat visits by the same person." },
    { k: "cdn", n: "CDN edge", hit: 0.8, cost: 0, what: "Shared copies in a data centre near the user. Static files and public pages, for every user in that region." },
    { k: "proxy", n: "Reverse proxy cache (nginx)", hit: 0.4, cost: 1, what: "Whole responses cached in front of your app. Saves the app and database from repeated identical requests." },
    { k: "app", n: "Application cache (Redis)", hit: 0.9, cost: 1, what: "Objects and query results your code chooses to cache. Works for data that pages assemble in different ways." },
    { k: "db", n: "Database", hit: 1, cost: 15, what: "The source of truth. Has its own memory cache (shared buffers), but every query still costs parsing, planning and locks." }
  ];
  function hierarchy(root) {
    const p = H.panel(root, "Follow 10,000 requests per second down the layers", "Try it");
    p.innerHTML = `<div class="controls" id="hi-t" style="gap:8px 18px"></div>
      <div class="ctl" style="max-width:420px"><label for="hi-d">User's round trip to your origin server <output id="hi-do"></output></label><input type="range" id="hi-d" min="10" max="300" value="150"></div>
      <div id="hi-f" style="display:grid;gap:6px;margin:12px 0"></div>
      <div class="readout" id="hi-r"></div><div class="callout" id="hi-v"></div>`;
    const on = { browser: true, cdn: false, proxy: false, app: false, db: true };
    const tg = p.querySelector("#hi-t");
    LAYERS.slice(0, 4).forEach(L => { const l = H.el(`<label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" ${on[L.k] ? "checked" : ""}> ${L.n}</label>`); l.querySelector("input").onchange = e => { on[L.k] = e.target.checked; upd(); }; tg.appendChild(l); });
    function upd() {
      const rtt = +p.querySelector("#hi-d").value; p.querySelector("#hi-do").textContent = rtt + " ms";
      let remaining = 10000, lat = 0;
      const rows = [];
      LAYERS.forEach(L => {
        if (!on[L.k]) return;
        const arrive = remaining;
        const served = L.k === "db" ? arrive : arrive * L.hit;
        let at;
        if (L.k === "browser") at = 0; else if (L.k === "cdn") at = 15; else if (L.k === "proxy") at = rtt + 1; else if (L.k === "app") at = rtt + 2; else at = rtt + 2 + L.cost;
        if (L.k !== "browser" && !on.cdn && L.k !== "cdn") at = Math.max(at, rtt);
        lat += served / 10000 * at;
        rows.push({ L, arrive, served, at });
        remaining = arrive - served;
      });
      const f = p.querySelector("#hi-f"); f.innerHTML = "";
      rows.forEach(r => {
        const w = Math.max(0.6, r.arrive / 10000 * 100);
        f.appendChild(H.el(`<div style="display:grid;grid-template-columns:minmax(0,180px) minmax(0,1fr) 100px;gap:10px;align-items:center;font-size:13px">
          <span title="${r.L.what}"><b>${r.L.n}</b></span>
          <span style="height:22px;background:var(--line);border-radius:4px;position:relative;overflow:hidden"><i style="position:absolute;left:0;top:0;bottom:0;width:${w}%;background:${r.L.k === "db" ? "var(--data)" : "var(--compute)"};opacity:.85"></i><i style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(0.3, r.served / 10000 * 100)}%;background:var(--ok)"></i></span>
          <span class="mono" style="text-align:right">${Math.round(r.arrive).toLocaleString()}/s</span></div>`));
      });
      f.appendChild(H.el(`<div class="note">Bar = requests reaching that layer. Green part = served there. Hover a layer's name for what it can cache.</div>`));
      const dbq = rows.find(r => r.L.k === "db").arrive;
      readout(p.querySelector("#hi-r"), [["Average latency", Math.round(lat) + " ms", lat > 120 ? "bad" : lat > 50 ? "warn" : "good"], ["Requests reaching your servers", Math.round(rows.filter(r => r.L.k !== "browser" && r.L.k !== "cdn").reduce((a, r) => Math.max(a, r.arrive), 0)).toLocaleString() + "/s"], ["Database queries", Math.round(dbq).toLocaleString() + "/s", dbq > 3000 ? "bad" : dbq > 500 ? "warn" : "good"]]);
      const v = p.querySelector("#hi-v");
      const n = ["cdn", "proxy", "app"].filter(k => on[k]).length;
      if (n === 0) { v.className = "callout bad"; v.textContent = "Without shared caches, almost every request crosses the internet to your origin and runs a database query. The database becomes the bottleneck long before anything else."; }
      else if (!on.cdn && rtt > 100) { v.className = "callout warn"; v.textContent = "Your servers are protected, but far-away users still pay the full round trip. Only a CDN moves content closer to them."; }
      else if (n === 3) { v.className = "callout good"; v.textContent = "Each layer catches what it can, and only a sliver of traffic reaches the database. Real systems look like this: the cheapest, closest layer that can answer, does."; }
      else { v.className = "callout"; v.textContent = "Each layer you add takes load off everything behind it. Try different combinations and distances."; }
    }
    p.querySelector("#hi-d").addEventListener("input", upd); upd();
  }

  /* ---------------- 3.2 Patterns and hit ratio ---------------- */
  const PATTERNS = {
    aside: { n: "Cache-aside", read: [["App", "Cache", "1. get (miss)"], ["App", "DB", "2. read"], ["App", "Cache", "3. set with TTL"]], write: [["App", "DB", "1. write"], ["App", "Cache", "2. delete key"]],
      txt: "The application manages the cache itself: check it, fall back to the database, then fill it. The most common pattern. Only data that is actually read gets cached, and a cache outage only makes things slower.", con: "First read of anything is slow (a miss), and stale data is possible (Lesson 3.3)." },
    through: { n: "Read-through", read: [["App", "Cache", "1. get"], ["Cache", "DB", "2. on miss, cache loads it"]], write: [["App", "DB", "1. write"], ["App", "Cache", "2. invalidate"]],
      txt: "Same idea, but the cache layer (a library or caching service) loads missing data itself, so application code only talks to the cache.", con: "Needs a cache that knows how to query your database; less flexible." },
    wthrough: { n: "Write-through", read: [["App", "Cache", "1. get (usually a hit)"]], write: [["App", "Cache", "1. write"], ["Cache", "DB", "2. write, synchronously"]],
      txt: "Every write goes to the cache and the database together, so the cache is always fresh. Usually combined with cache-aside for reads.", con: "Writes are slower (two writes), and you cache data that may never be read." },
    wbehind: { n: "Write-behind", read: [["App", "Cache", "1. get"]], write: [["App", "Cache", "1. write (acknowledged)"], ["Cache", "DB", "2. later, in batches"]],
      txt: "Writes are acknowledged once they reach the cache and flushed to the database later. Very fast writes and fewer database operations.", con: "If the cache dies before flushing, acknowledged writes are lost. Use only where that is acceptable (counters, analytics)." }
  };
  function patterns(root) {
    const p = H.panel(root, "Four ways to put a cache in the path", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="pt-p"></div><div class="seg" id="pt-rw"></div></div><div class="svgwrap" id="pt-svg"></div><div class="callout" id="pt-v"></div>`;
    let pat = "aside", rw = "read";
    function draw() {
      const P = PATTERNS[pat], steps = P[rw];
      const X = { App: 110, Cache: 340, DB: 570 }, top = 16, Hh = 86 + steps.length * 46;
      const s = H.svg("svg", { viewBox: `0 0 680 ${Hh}`, role: "img", "aria-label": P.n + " " + rw + " path as a sequence of steps" });
      const defs = H.svg("defs", {}, s); const mk = H.svg("marker", { id: "pt-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "var(--signal)", "stroke-width": 1.6 }, mk);
      Object.entries(X).forEach(([n, x]) => {
        H.svg("rect", { x: x - 70, y: top, width: 140, height: 40, rx: 9, fill: n === "DB" ? "var(--data-soft)" : n === "Cache" ? "var(--compute-soft)" : "var(--surface)", stroke: n === "DB" ? "var(--data)" : n === "Cache" ? "var(--compute)" : "var(--line-strong)", "stroke-width": 1.5 }, s);
        const t = H.svg("text", { x, y: top + 25, "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: "var(--ink)" }, s); t.textContent = n === "DB" ? "Database" : n === "App" ? "Your app" : "Cache";
        H.svg("line", { x1: x, x2: x, y1: top + 40, y2: Hh - 8, stroke: "var(--line-strong)", "stroke-dasharray": "4 4" }, s);
      });
      steps.forEach(([a, b, label], i) => {
        const y = top + 40 + 34 + i * 46, x1 = X[a], x2 = X[b], dir = x2 > x1 ? 1 : -1;
        H.svg("line", { x1: x1 + dir * 6, x2: x2 - dir * 8, y1: y, y2: y, stroke: "var(--signal)", "stroke-width": 2, "marker-end": "url(#pt-ar)" }, s);
        const t = H.svg("text", { x: (x1 + x2) / 2, y: y - 8, "text-anchor": "middle", "font-size": 12.5, fill: "var(--signal)", "font-weight": 600 }, s); t.textContent = label;
      });
      const h = p.querySelector("#pt-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#pt-v"); v.innerHTML = `<b>${P.n}.</b> <span></span><br><b>Watch out:</b> <span></span>`; v.querySelectorAll("span")[0].textContent = P.txt; v.querySelectorAll("span")[1].textContent = P.con;
    }
    seg(p.querySelector("#pt-p"), Object.entries(PATTERNS).map(([k, v]) => [k, v.n]), pat, v => { pat = v; draw(); });
    seg(p.querySelector("#pt-rw"), [["read", "Read path"], ["write", "Write path"]], rw, v => { rw = v; draw(); });
    draw();

    const q = H.panel(root, "How big does the cache need to be?", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">10,000 products. Popularity follows a Zipf distribution, the usual shape of real traffic: a few items are very popular, most are rarely viewed. The cache evicts the least recently used item when full.</p>
      <div class="controls">
        <div class="ctl"><label for="zh-c">Cache size <output id="zh-co"></output></label><input type="range" id="zh-c" min="0" max="11" value="3"></div>
        <div class="ctl"><label for="zh-s">Popularity skew <output id="zh-so"></output></label><input type="range" id="zh-s" min="0.5" max="1.3" step="0.1" value="1.0"></div>
      </div><div class="svgwrap" id="zh-svg"></div><div class="readout" id="zh-r"></div><div class="callout" id="zh-v"></div>`;
    const SIZES = [10, 25, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 7500, 10000];
    function lruHit(cap, cdf, r) {
      const m = new Map(); let hit = 0; const N = 24000;
      for (let i = 0; i < N; i++) {
        const u = r(); let lo = 0, hi = cdf.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
        const k = lo;
        if (m.has(k)) { hit += i > 4000 ? 1 : 0; m.delete(k); m.set(k, 1); }
        else { m.set(k, 1); if (m.size > cap) m.delete(m.keys().next().value); }
      }
      return hit / (N - 4000);
    }
    let cache = {};
    function zupd() {
      const ci = +q.querySelector("#zh-c").value, sk = +q.querySelector("#zh-s").value;
      q.querySelector("#zh-co").textContent = SIZES[ci].toLocaleString() + " items (" + (SIZES[ci] / 100) + "%)"; q.querySelector("#zh-so").textContent = sk.toFixed(1);
      const key = sk.toFixed(1);
      if (!cache[key]) {
        const w = []; let tot = 0; for (let i = 1; i <= 10000; i++) { const x = 1 / Math.pow(i, sk); w.push(x); tot += x; }
        let acc = 0; const cdf = w.map(x => (acc += x / tot));
        const r = rng(5); cache[key] = SIZES.map(c => lruHit(c, cdf, r));
      }
      const hits = cache[key], h = hits[ci];
      const W = 720, Hh = 210, x0 = 44, x1 = W - 14, y0 = 14, y1 = Hh - 36;
      const X = i => x0 + i / (SIZES.length - 1) * (x1 - x0), Y = v => y1 - v * (y1 - y0);
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Hit ratio versus cache size" });
      [0, .25, .5, .75, 1].forEach(v => { H.svg("line", { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: "var(--line)" }, s); const t = H.svg("text", { x: x0 - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); t.textContent = Math.round(v * 100) + "%"; });
      SIZES.forEach((c, i) => { if (i % 2 === 0 || i === SIZES.length - 1) { const t = H.svg("text", { x: X(i), y: y1 + 15, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); t.textContent = c >= 1000 ? c / 1000 + "k" : c; } });
      const xl = H.svg("text", { x: (x0 + x1) / 2, y: Hh - 4, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, s); xl.textContent = "items the cache can hold (of 10,000)";
      H.svg("path", { d: hits.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" "), fill: "none", stroke: "var(--compute)", "stroke-width": 2.5 }, s);
      H.svg("circle", { cx: X(ci), cy: Y(h), r: 7, fill: "var(--signal)", stroke: "var(--surface)", "stroke-width": 2 }, s);
      const host = q.querySelector("#zh-svg"); host.innerHTML = ""; host.appendChild(s);
      const avg = h * 1 + (1 - h) * 50;
      readout(q.querySelector("#zh-r"), [["Hit ratio", Math.round(h * 100) + "%", h > .8 ? "good" : h > .5 ? "warn" : "bad"], ["Average latency (1 ms hit, 50 ms miss)", avg.toFixed(1) + " ms"], ["Database load", Math.round((1 - h) * 100) + "% of reads"]]);
      const v = q.querySelector("#zh-v");
      v.className = "callout " + (h > .8 ? "good" : "warn");
      v.textContent = sk >= 0.9 ? `Caching ${SIZES[ci] / 100}% of the items serves ${Math.round(h * 100)}% of reads, because a small set of items gets most of the traffic. The curve flattens fast: doubling a big cache buys little.` : "With flat popularity (low skew), every item is about equally likely, and the hit ratio only grows in proportion to the cache size. Caching helps far less for workloads like this.";
    }
    q.querySelectorAll("input").forEach(i => i.addEventListener("input", zupd)); zupd();
  }

  /* ---------------- 3.3 Invalidation ---------------- */
  const RACES = {
    ttl: { n: "TTL only", steps: [
      ["R", "Reader asks the cache for the price: miss", 10, null],
      ["R", "Reader loads $10 from the database and caches it for 60 s", 10, 10],
      ["W", "Writer changes the price to $12 in the database. Nothing touches the cache.", 12, 10],
      ["R", "Every reader for the next 60 s gets $10 from the cache", 12, 10],
      ["-", "The entry expires; the next reader loads $12", 12, 12]],
      v: ["warn", "Simple and safe, but every change is invisible for up to one TTL. Fine for data where 'a bit stale' is harmless (a product description), wrong for a price at checkout."] },
    del: { n: "Delete on write", steps: [
      ["R", "Reader asks the cache: miss", 10, null],
      ["R", "Reader loads $10 from the database (it is about to cache it)…", 10, null],
      ["W", "…meanwhile the writer updates the database to $12", 12, null],
      ["W", "The writer deletes the cache key (it is already empty)", 12, null],
      ["R", "The reader, still holding the old value, writes $10 into the cache", 12, 10],
      ["-", "The cache now says $10 while the database says $12, until the TTL expires", 12, 10]],
      v: ["bad", "This is the classic cache-aside race. It needs a read to straddle a write, so it is rare, but at thousands of requests per second rare things happen daily. Keep a TTL as a safety net so stale entries cannot live forever."] },
    upd: { n: "Update on write", steps: [
      ["W", "Writer 1 sets the price to $12 in the database", 12, 10],
      ["W", "Writer 2 sets the price to $15 in the database", 15, 10],
      ["W", "Writer 2 updates the cache to $15", 15, 15],
      ["W", "Writer 1, delayed, updates the cache to $12", 15, 12],
      ["-", "Cache $12, database $15: wrong until the TTL expires", 15, 12]],
      v: ["bad", "Two writers can update the database and the cache in different orders. Deleting the key on write is safer than setting it: a missing entry is reloaded, a wrong one is believed."] },
    lease: { n: "Delete + leases", steps: [
      ["R", "Reader misses; the cache hands it a lease token #7 for this key", 10, null],
      ["R", "Reader loads $10 from the database…", 10, null],
      ["W", "…writer updates the database to $12", 12, null],
      ["W", "Writer deletes the key, which also cancels lease #7", 12, null],
      ["R", "Reader tries to store $10 with lease #7: rejected, the lease is gone", 12, null],
      ["-", "The next reader misses and loads the correct $12", 12, 12]],
      v: ["good", "Facebook's memcache paper describes this fix: a value can only be stored with a lease that no write has invalidated in the meantime. Version numbers on cached values achieve the same idea."] }
  };
  function invalidation(root) {
    const p = H.panel(root, "Step through a cache going stale", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="iv-s"></div></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:10px 0" id="iv-state"></div>
      <div class="callout" id="iv-step" aria-live="polite"></div>
      <div class="controls"><button class="btn" type="button" id="iv-prev">← Back</button><button class="btn primary" type="button" id="iv-next">Next step →</button><span class="note" id="iv-n"></span></div>
      <div class="callout" id="iv-v" hidden></div>`;
    let k = "ttl", i = 0;
    function draw() {
      const R = RACES[k], st = R.steps[i];
      const stale = st[3] !== null && st[3] !== st[2];
      p.querySelector("#iv-state").innerHTML = `<div style="border:1.5px solid var(--data);border-radius:10px;padding:12px;background:var(--data-soft)"><div class="note">Database</div><div class="mono" style="font-size:26px;font-weight:600">$${st[2]}</div></div>
        <div style="border:1.5px solid ${stale ? "var(--bad)" : "var(--compute)"};border-radius:10px;padding:12px;background:${stale ? "var(--bad-soft)" : "var(--compute-soft)"}"><div class="note">Cache ${stale ? "· STALE" : ""}</div><div class="mono" style="font-size:26px;font-weight:600">${st[3] === null ? "(empty)" : "$" + st[3]}</div></div>`;
      const who = { R: "Reader", W: "Writer", "-": "Later" }[st[0]];
      p.querySelector("#iv-step").innerHTML = `<b>${who}:</b> `; p.querySelector("#iv-step").append(st[1]);
      p.querySelector("#iv-n").textContent = `Step ${i + 1} of ${R.steps.length}`;
      p.querySelector("#iv-prev").disabled = i === 0; p.querySelector("#iv-next").disabled = i === R.steps.length - 1;
      const v = p.querySelector("#iv-v"); v.hidden = i !== R.steps.length - 1; v.className = "callout " + R.v[0]; v.textContent = R.v[1];
    }
    seg(p.querySelector("#iv-s"), Object.entries(RACES).map(([a, b]) => [a, b.n]), k, v => { k = v; i = 0; draw(); });
    p.querySelector("#iv-next").onclick = () => { i++; draw(); }; p.querySelector("#iv-prev").onclick = () => { i--; draw(); };
    draw();
  }

  /* ---------------- 3.4 Stampedes and eviction ---------------- */
  function stampede(root) {
    const p = H.panel(root, "A hot key expires under load", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A dashboard summary is read 2,000 times a second. Computing it takes a 200 ms database query. It is cached for 10 s. The database can handle about 100 such queries at once before slowing down.</p>
      <div class="controls"><div class="seg" id="sp-m"></div></div>
      <div class="svgwrap" id="sp-svg"></div><div class="readout" id="sp-r"></div><div class="callout" id="sp-v"></div>`;
    let m = "none";
    const MODES = [["none", "No protection"], ["lock", "Lock (single flight)"], ["swr", "Serve stale while refreshing"], ["early", "Probabilistic early refresh"]];
    function draw() {
      const RPS = 2000, C = 0.2, TTL = 10, T = 32;
      const buckets = [], waitP = [];
      for (let b = 0; b < T * 10; b++) {
        const t = b / 10; let q = 0;
        const phase = t % TTL;
        if (m === "none") q = phase < C ? RPS * 0.1 : 0;
        else if (m === "lock" || m === "swr") q = phase < 0.1 ? 1 : 0;
        else q = (TTL - phase) <= 0.4 && (TTL - phase) > 0.3 ? 1 : 0;
        buckets.push(q);
      }
      const W = 720, Hh = 200, x0 = 46, x1 = W - 12, y0 = 14, y1 = Hh - 34, maxQ = 220;
      const X = t => x0 + t / T * (x1 - x0), Y = v => y1 - Math.min(v, maxQ) / maxQ * (y1 - y0);
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Database queries over time" });
      [0, 100, 200].forEach(v => { H.svg("line", { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: "var(--line)" }, s); const t = H.svg("text", { x: x0 - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); t.textContent = v; });
      H.svg("line", { x1: x0, x2: x1, y1: Y(100), y2: Y(100), stroke: "var(--signal)", "stroke-dasharray": "5 4" }, s);
      const dl = H.svg("text", { x: x1, y: Y(100) - 5, "text-anchor": "end", "font-size": 11, fill: "var(--signal)" }, s); dl.textContent = "database comfortable limit";
      [0, 10, 20, 30].forEach(t => { const tt = H.svg("text", { x: X(t), y: y1 + 15, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); tt.textContent = t + "s"; });
      const bw = (x1 - x0) / buckets.length;
      buckets.forEach((q, b) => { if (q > 0) H.svg("rect", { x: x0 + b * bw, y: Y(q), width: Math.max(2, bw - 0.5), height: Math.max(2, y1 - Y(q)), fill: q > 100 ? "var(--bad)" : "var(--compute)" }, s); });
      if (buckets.some(q => q > maxQ)) { const tt = H.svg("text", { x: X(0.4), y: y0 + 10, "font-size": 11, fill: "var(--bad)", "font-weight": 600 }, s); tt.textContent = "↑ 400 queries in one burst (off the chart)"; }
      const yl = H.svg("text", { x: x0, y: Hh - 4, "font-size": 11, fill: "var(--muted)" }, s); yl.textContent = "database queries started per 100 ms";
      const host = p.querySelector("#sp-svg"); host.innerHTML = ""; host.appendChild(s);
      const per = { none: [400, "200+ ms (and climbing)", "bad"], lock: [1, "200 ms for ~400 requests", "warn"], swr: [1, "~1 ms (stale for 200 ms)", "good"], early: [1, "~1 ms", "good"] }[m];
      readout(p.querySelector("#sp-r"), [["Queries per expiry", per[0], per[0] > 100 ? "bad" : "good"], ["Wait at expiry", per[1], per[2]]]);
      const v = p.querySelector("#sp-v");
      const t = {
        none: ["bad", "Every request in the 200 ms it takes to recompute sees a miss and runs the same query: about 400 identical queries at once. The database slows down, the recompute takes longer, more requests miss, and it can spiral into an outage. This is a cache stampede (also called the thundering herd or dog-piling)."],
        lock: ["warn", "The first request to miss takes a short lock (in Redis: SET key NX PX 2000) and recomputes; the others wait for its result or retry. One query instead of 400. The cost: those requests wait for the recompute."],
        swr: ["good", "Keep serving the old value while one request refreshes it in the background. Nobody waits and the database sees one query. HTTP has this built in: Cache-Control: stale-while-revalidate (RFC 5861), and nginx has proxy_cache_use_stale updating."],
        early: ["good", "Each request near the expiry time recomputes with a small, rising probability (the 'XFetch' algorithm from Vattani et al.). Usually one request refreshes the value slightly before it expires, so there is never a gap. No locks needed."]
      }[m];
      v.className = "callout " + t[0]; v.textContent = t[1];
    }
    seg(p.querySelector("#sp-m"), MODES, m, v => { m = v; draw(); });
    draw();

    const q = H.panel(root, "When the cache is full", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">A tiny Redis that holds 8 keys. Read keys to make them recent or frequent, then add a new one and see who gets evicted.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">maxmemory-policy</div><div class="seg" id="ev-p"></div></div></div>
      <div id="ev-keys" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:10px 0"></div>
      <div class="controls"><button class="btn primary" type="button" id="ev-add">SET a new key</button><button class="btn" type="button" id="ev-reset">Reset</button></div>
      <div class="callout" id="ev-v">Click a key to read it (GET). Then add a key.</div>`;
    let pol = "allkeys-lru", keys, clock, nextId;
    function reset() { clock = 10; nextId = 9; keys = Array.from({ length: 8 }, (_, i) => ({ id: "user:" + (i + 1), last: i + 1, hits: [6, 1, 3, 9, 1, 2, 5, 1][i], ttl: i % 3 === 0 ? 30 + i * 5 : null, flash: false })); render(); q.querySelector("#ev-v").className = "callout"; q.querySelector("#ev-v").textContent = "Click a key to read it (GET). Then add a key."; }
    function render() {
      const host = q.querySelector("#ev-keys"); host.innerHTML = "";
      keys.forEach(k => {
        const b = H.el(`<button type="button" class="opt" style="display:block;padding:8px 10px;${k.flash ? "border-color:var(--signal);background:var(--signal-soft)" : ""}"><div class="mono" style="font-weight:600">${k.id}</div><div class="note">last read t=${k.last} · reads ${k.hits}${k.ttl ? ` · TTL ${k.ttl}s` : " · no TTL"}</div></button>`);
        b.onclick = () => { clock++; k.last = clock; k.hits++; keys.forEach(x => x.flash = false); render(); };
        host.appendChild(b);
      });
    }
    q.querySelector("#ev-add").onclick = () => {
      clock++; const v = q.querySelector("#ev-v"); keys.forEach(x => x.flash = false);
      let victim = null;
      if (pol === "noeviction") { v.className = "callout bad"; v.textContent = "(error) OOM command not allowed when used memory > 'maxmemory'. Writes fail; reads keep working. Redis's default policy, sensible when Redis is a store rather than a cache."; render(); return; }
      if (pol === "allkeys-lru") victim = keys.reduce((a, b) => (b.last < a.last ? b : a));
      if (pol === "allkeys-lfu") victim = keys.reduce((a, b) => (b.hits < a.hits || (b.hits === a.hits && b.last < a.last) ? b : a));
      if (pol === "volatile-ttl") { const c = keys.filter(k => k.ttl); victim = c.length ? c.reduce((a, b) => (b.ttl < a.ttl ? b : a)) : null; if (!victim) { v.className = "callout bad"; v.textContent = "No keys have a TTL, so volatile-ttl has nothing it is allowed to evict: the write fails with OOM."; render(); return; } }
      const why = { "allkeys-lru": `it was read least recently (t=${victim.last})`, "allkeys-lfu": `it was read least often (${victim.hits} reads)`, "volatile-ttl": `among keys with a TTL, it was closest to expiring (${victim.ttl}s)` }[pol];
      keys.splice(keys.indexOf(victim), 1);
      keys.push({ id: "user:" + nextId++, last: clock, hits: 1, ttl: null, flash: true });
      v.className = "callout good"; v.textContent = `Evicted ${victim.id}: ${why}. ` + (pol === "allkeys-lru" ? "LRU suits most caches: what was used recently will probably be used again." : pol === "allkeys-lfu" ? "LFU protects keys that are popular over time, even if they were not touched in the last few seconds." : "volatile-* policies only evict keys that have an expiry, so keys without one are treated as permanent.");
      render();
    };
    q.querySelector("#ev-reset").onclick = reset;
    seg(q.querySelector("#ev-p"), [["noeviction", "noeviction (default)"], ["allkeys-lru", "allkeys-lru"], ["allkeys-lfu", "allkeys-lfu"], ["volatile-ttl", "volatile-ttl"]], pol, v => { pol = v; reset(); });
    reset();
  }

  /* ---------------- 3.5 Redis beyond caching ---------------- */
  function redisUses(root) {
    const p = H.panel(root, "Redis use cases you can poke", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="ru-m"></div></div><div id="ru-b"></div>`;
    const body = p.querySelector("#ru-b");
    const views = {
      rate() {
        body.innerHTML = `<p>Allow 5 requests per 10-second window per user. Click quickly.</p>${H.code(`INCR rate:alice:{window}      # count this request
EXPIRE rate:alice:{window} 10  # the counter disappears with the window
# allowed if the count is <= 5`)}<div class="controls"><button class="btn primary" type="button" id="rl-b">Send request</button><span class="mono" id="rl-c"></span></div><div id="rl-log" style="display:flex;flex-wrap:wrap;gap:4px"></div><p class="note">Every app server shares the same counter, so the limit holds across the whole fleet. Level 9 compares this fixed-window counter with token buckets and sliding windows.</p>`;
        let win = Math.floor(Date.now() / 10000), n = 0;
        const logEl = body.querySelector("#rl-log"), cEl = body.querySelector("#rl-c");
        const tick = () => { const w = Math.floor(Date.now() / 10000); if (w !== win) { win = w; n = 0; logEl.innerHTML = ""; } const left = 10 - Math.floor((Date.now() / 1000) % 10); cEl.textContent = `window resets in ${left}s · count ${n}`; };
        body.querySelector("#rl-b").onclick = () => { tick(); n++; const ok = n <= 5; logEl.appendChild(H.el(`<span class="pill ${ok ? "ok" : ""}" style="${ok ? "" : "background:var(--bad-soft);color:var(--bad)"}">${ok ? "200" : "429"}</span>`)); tick(); };
        const iv = setInterval(() => { if (!document.body.contains(cEl)) { clearInterval(iv); return; } tick(); }, 500); tick();
      },
      board() {
        body.innerHTML = `<p>A sorted set keeps members ordered by score, with O(log n) updates. A leaderboard is two commands.</p>${H.code(`ZINCRBY leaderboard 10 alice          # add points
ZREVRANGE leaderboard 0 4 WITHSCORES  # top 5, highest first`)}<div class="controls" id="lb-b"></div><ol id="lb-l" class="mono" style="font-size:14px"></ol>`;
        const sc = { alice: 40, bob: 55, chen: 30, dara: 20, eli: 10 };
        const lbl = body.querySelector("#lb-l");
        const draw = () => { lbl.innerHTML = Object.entries(sc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${k} — ${v}</li>`).join(""); };
        Object.keys(sc).forEach(k => { const b = H.el(`<button class="btn" type="button">+10 ${k}</button>`); b.onclick = () => { sc[k] += 10; draw(); }; body.querySelector("#lb-b").appendChild(b); });
        draw();
      },
      lock() {
        body.innerHTML = `<p>Two workers must not process the same invoice at once. Each takes a lock with a 10 s expiry so a crashed worker cannot hold it forever.</p>${H.code(`SET lock:invoice:42 worker-A NX PX 10000   # only succeeds if nobody holds it`)}
          <div class="controls"><button class="btn primary" type="button" id="lk-go">Play: worker A pauses for 15 s</button><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="lk-f"> Storage checks a fencing token</label></div><ol id="lk-l" style="font-size:14px;display:grid;gap:4px"></ol><div class="callout" id="lk-v" hidden></div>`;
        body.querySelector("#lk-go").onclick = async () => {
          const f = body.querySelector("#lk-f"), l = body.querySelector("#lk-l"), v = body.querySelector("#lk-v"); if (!f) return; const fenced = f.checked; l.innerHTML = ""; v.hidden = true;
          const steps = ["t=0  A takes the lock (token 33) and starts work", "t=1  A pauses: a long garbage-collection pause, or the VM is frozen", "t=10 The lock expires", "t=11 B takes the lock (token 34) and writes the invoice", fenced ? "t=15 A wakes up and writes with token 33: the storage has already seen 34, so it rejects A's write" : "t=15 A wakes up, still believes it holds the lock, and writes the invoice too"];
          for (const s of steps) { l.appendChild(H.el(`<li></li>`)); l.lastChild.textContent = s; await new Promise(r => setTimeout(r, 450)); }
          v.hidden = false; v.className = "callout " + (fenced ? "good" : "bad");
          v.textContent = fenced ? "Fencing tokens make the lock safe: every holder gets an increasing number, and the resource refuses writes with an older one. This is Martin Kleppmann's argument in 'How to do distributed locking'." : "Both workers wrote. A lock with an expiry cannot know that its holder is paused. Use Redis locks for efficiency (avoiding duplicate work), and protect correctness with fencing tokens or database constraints.";
        };
      },
      more() {
        body.innerHTML = `<div class="keys" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
          <div class="key"><b>Sessions</b>Strings with an expiry (<code>SETEX</code>). Lesson 2.2.</div>
          <div class="key"><b>Queues and streams</b>Lists (<code>LPUSH</code>/<code>BRPOP</code>) for simple job queues; Streams with consumer groups for durable, acknowledged messages (Level 8).</div>
          <div class="key"><b>Pub/sub</b>Fire-and-forget broadcast. Subscribers that are offline miss messages.</div>
          <div class="key"><b>Counters</b><code>INCR</code> is atomic, so concurrent increments never get lost.</div>
          <div class="key"><b>Geo and HyperLogLog</b>Nearby search and approximate unique counts with tiny memory.</div>
          <div class="key"><b>Durability is a setting</b>Redis lives in memory. RDB snapshots and the AOF log trade speed for how much you can lose in a crash.</div></div>`;
      }
    };
    seg(p.querySelector("#ru-m"), [["rate", "Rate limiting"], ["board", "Leaderboard"], ["lock", "Distributed lock"], ["more", "Everything else"]], "rate", v => views[v]());
    views.rate();
  }

  /* ---------------- 3.6 CDNs and HTTP caching ---------------- */
  const PRESETS = {
    asset: { n: "Hashed JS/CSS file", h: { pub: "public", ma: 31536000, sma: "", nocache: false, nostore: false, imm: true, swr: 0 } },
    html: { n: "HTML page", h: { pub: "public", ma: 0, sma: "", nocache: true, nostore: false, imm: false, swr: 0 } },
    list: { n: "Public product list API", h: { pub: "public", ma: 30, sma: 60, nocache: false, nostore: false, imm: false, swr: 30 } },
    acct: { n: "User's account page", h: { pub: "private", ma: 0, sma: "", nocache: false, nostore: true, imm: false, swr: 0 } }
  };
  function cdn(root) {
    const p = H.panel(root, "Build a Cache-Control header", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="cc-p"></div></div>
      <div class="controls" style="align-items:flex-start">
        <div><div class="note" style="margin-bottom:4px">Who may store it</div><div class="seg" id="cc-pub"></div></div>
        <div class="ctl"><label for="cc-ma">max-age (browser and CDN) <output id="cc-mao"></output></label><input type="range" id="cc-ma" min="0" max="7" value="0"></div>
        <div class="ctl"><label for="cc-swr">stale-while-revalidate <output id="cc-swro"></output></label><input type="range" id="cc-swr" min="0" max="3" value="0"></div>
      </div>
      <div class="controls"><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="cc-nc"> no-cache</label><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="cc-ns"> no-store</label><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="cc-im"> immutable</label><label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" id="cc-sm"> s-maxage = 1 hour (CDN only)</label></div>
      <div id="cc-h"></div><div id="cc-t" style="overflow-x:auto"></div><div class="callout" id="cc-v"></div>`;
    const MA = [0, 10, 60, 300, 3600, 86400, 604800, 31536000], MAL = ["0", "10 s", "1 min", "5 min", "1 hour", "1 day", "1 week", "1 year"];
    const SWR = [0, 30, 300, 86400], SWRL = ["off", "30 s", "5 min", "1 day"];
    let pub = "public";
    seg(p.querySelector("#cc-pub"), [["public", "public (any cache)"], ["private", "private (browser only)"]], pub, v => { pub = v; upd(); });
    function load(k) {
      const h = PRESETS[k].h; pub = h.pub; seg(p.querySelector("#cc-pub"), [["public", "public (any cache)"], ["private", "private (browser only)"]], pub, v => { pub = v; upd(); });
      p.querySelector("#cc-ma").value = MA.indexOf(h.ma); p.querySelector("#cc-swr").value = SWR.indexOf(h.swr);
      p.querySelector("#cc-nc").checked = h.nocache; p.querySelector("#cc-ns").checked = h.nostore; p.querySelector("#cc-im").checked = h.imm; p.querySelector("#cc-sm").checked = h.sma === 60 ? false : false;
      if (h.sma) p.querySelector("#cc-sm").checked = true;
      upd();
    }
    seg(p.querySelector("#cc-p"), Object.entries(PRESETS).map(([k, v]) => [k, v.n]), "asset", load);
    function upd() {
      const ma = MA[+p.querySelector("#cc-ma").value], swr = SWR[+p.querySelector("#cc-swr").value];
      const nc = p.querySelector("#cc-nc").checked, ns = p.querySelector("#cc-ns").checked, im = p.querySelector("#cc-im").checked, sm = p.querySelector("#cc-sm").checked;
      p.querySelector("#cc-mao").textContent = MAL[+p.querySelector("#cc-ma").value]; p.querySelector("#cc-swro").textContent = SWRL[+p.querySelector("#cc-swr").value];
      const parts = [];
      if (ns) parts.push("no-store"); else { parts.push(pub); if (nc) parts.push("no-cache"); parts.push("max-age=" + ma); if (sm && pub === "public") parts.push("s-maxage=3600"); if (swr) parts.push("stale-while-revalidate=" + swr); if (im) parts.push("immutable"); }
      p.querySelector("#cc-h").innerHTML = H.code("Cache-Control: " + parts.join(", "));
      const cdnMax = sm && pub === "public" ? 3600 : ma;
      const beh = (who, t) => {
        if (ns) return ["Not stored", "bad"];
        if (who === "cdn" && pub === "private") return ["Not stored (private)", "bad"];
        const max = who === "cdn" ? cdnMax : ma;
        if (nc || max === 0) return ["Stored, but asks the origin first (304 if unchanged)", "warn"];
        if (t <= max) return ["Served from cache, no request", "good"];
        if (swr && t <= max + swr) return ["Served stale instantly, refreshed in background", "good"];
        return ["Expired: asks the origin (304 if unchanged)", "warn"];
      };
      const times = [["30 s later", 30], ["2 hours later", 7200], ["2 days later", 172800]];
      p.querySelector("#cc-t").innerHTML = `<table class="hist" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><thead><tr><th style="text-align:left;padding:6px">When the same URL is requested…</th><th style="text-align:left;padding:6px">Browser</th><th style="text-align:left;padding:6px">CDN / shared cache</th></tr></thead><tbody>${times.map(([l, t]) => { const b = beh("browser", t), c = beh("cdn", t); return `<tr><td style="padding:6px;border-top:1px solid var(--line)">${l}</td><td style="padding:6px;border-top:1px solid var(--line);color:var(--${b[1] === "good" ? "ok" : b[1] === "bad" ? "bad" : "xp"})">${b[0]}</td><td style="padding:6px;border-top:1px solid var(--line);color:var(--${c[1] === "good" ? "ok" : c[1] === "bad" ? "bad" : "xp"})">${c[0]}</td></tr>`; }).join("")}</tbody></table>`;
      const v = p.querySelector("#cc-v");
      if (ma >= 86400 && !im && !ns) { v.className = "callout warn"; v.textContent = "Long lifetimes are only safe if the URL changes whenever the content does. Build tools do this by putting a content hash in the filename (app.3f9c1a.js). For files at fixed URLs, a long max-age means users keep the old version after you deploy."; }
      else if (pub === "public" && ns === false && nc === false && ma > 0 && PRESETS.acct && p.querySelector('#cc-p button[aria-pressed="true"]') && p.querySelector('#cc-p button[aria-pressed="true"]').textContent.includes("account")) { v.className = "callout bad"; v.textContent = "Danger: a public, cacheable personal page can be stored by a CDN and shown to other users. Personal data must be private or no-store."; }
      else if (ns) { v.className = "callout good"; v.textContent = "no-store: nothing keeps a copy anywhere. Right for personal or sensitive responses (account pages, tokens). Costs a full request every time."; }
      else if (nc) { v.className = "callout good"; v.textContent = "no-cache does not mean 'do not cache': caches keep a copy but must check with the origin before using it. With an ETag the check is a tiny 304 Not Modified response. Typical for HTML, so users always get the latest page that points at new hashed assets."; }
      else { v.className = "callout good"; v.textContent = "Fresh copies are served without contacting your servers at all. s-maxage lets the CDN keep things longer than browsers, because you can purge a CDN but not your users' browsers."; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd));
    load("asset");

    const q = H.panel(root, "A CDN in action", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Origin in Frankfurt. Each user connects to the nearest edge (about 10 ms away). Send requests and watch where they are answered.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Content</div><div class="seg" id="cd-c"></div></div><button class="btn" type="button" id="cd-p">Purge the CDN</button></div>
      <div class="svgwrap minw" id="cd-svg"></div>
      <div class="controls" id="cd-u"></div><div class="readout" id="cd-r"></div><div class="callout" id="cd-v">Click a city to send a request.</div>`;
    const CITIES = [["London", 15, 190, 95], ["New York", 85, 110, 120], ["Singapore", 160, 520, 175], ["São Paulo", 200, 170, 215], ["Sydney", 290, 600, 230]];
    let content = "static", cached = {}, originHits = 0, last = null;
    function cdraw() {
      const s = H.svg("svg", { viewBox: "0 0 680 270", role: "img", "aria-label": "CDN edges around the world and an origin in Frankfurt" });
      H.svg("rect", { x: 0, y: 0, width: 680, height: 270, rx: 12, fill: "var(--surface-2)" }, s);
      const ox = 330, oy = 85;
      CITIES.forEach(([n, , x, y]) => {
        const hot = last === n, hit = cached[n];
        H.svg("line", { x1: x, y1: y, x2: ox, y2: oy, stroke: hot && last && !last.hit ? "var(--signal)" : "var(--line)", "stroke-width": hot ? 2 : 1, "stroke-dasharray": "4 4" }, s);
        H.svg("circle", { cx: x, cy: y, r: 13, fill: hit ? "var(--ok)" : "var(--surface)", stroke: "var(--compute)", "stroke-width": 2 }, s);
        const t = H.svg("text", { x, y: y + 30, "text-anchor": "middle", "font-size": 12, fill: "var(--ink)", "font-weight": hot ? 700 : 500 }, s); t.textContent = n + " edge";
      });
      H.svg("rect", { x: ox - 46, y: oy - 20, width: 92, height: 40, rx: 8, fill: "var(--data-soft)", stroke: "var(--data)", "stroke-width": 2 }, s);
      const ot = H.svg("text", { x: ox, y: oy + 5, "text-anchor": "middle", "font-size": 12.5, "font-weight": 600, fill: "var(--ink)" }, s); ot.textContent = "Origin (FRA)";
      const lg = H.svg("text", { x: 14, y: 258, "font-size": 11, fill: "var(--muted)" }, s); lg.textContent = "green edge = holds a cached copy";
      const h = q.querySelector("#cd-svg"); h.innerHTML = ""; h.appendChild(s);
    }
    seg(q.querySelector("#cd-c"), [["static", "Product image (cacheable)"], ["dynamic", "Shopping cart (personal)"]], content, v => { content = v; cached = {}; cdraw(); });
    CITIES.forEach(([n, rtt]) => {
      const b = H.el(`<button class="btn" type="button">Request from ${n}</button>`);
      b.onclick = () => {
        let ms, hit = false;
        if (content === "static" && cached[n]) { ms = 10; hit = true; }
        else { ms = 10 + rtt + 5; originHits++; if (content === "static") cached[n] = true; }
        last = n; cdraw();
        readout(q.querySelector("#cd-r"), [["Latency", ms + " ms", ms < 50 ? "good" : ms < 150 ? "warn" : "bad"], ["Edge", hit ? "HIT" : "MISS", hit ? "good" : "warn"], ["Requests to origin so far", originHits]]);
        const v = q.querySelector("#cd-v");
        if (content === "dynamic") { v.className = "callout warn"; v.textContent = `Personal content cannot be shared, so the ${n} edge forwards it to Frankfurt every time (${ms} ms). A CDN still helps a little here: TLS is set up with the nearby edge, and the edge keeps warm connections to your origin.`; }
        else if (hit) { v.className = "callout good"; v.textContent = `Served by the ${n} edge in ~10 ms. The origin never saw it.`; }
        else { v.className = "callout warn"; v.textContent = `First request from ${n}: the edge had no copy, fetched it from Frankfurt (${ms} ms) and kept it. Click again.`; }
      };
      q.querySelector("#cd-u").appendChild(b);
    });
    q.querySelector("#cd-p").onclick = () => { cached = {}; cdraw(); const v = q.querySelector("#cd-v"); v.className = "callout"; v.textContent = "Purged: every edge forgets its copy, and the next request from each region goes back to the origin. Purging is how you fix a mistake fast; versioned URLs are how you avoid needing to."; };
    cdraw();
  }

  /* ---------------- module ---------------- */
  Course.register({
    id: 3,
    blurb: "The fastest request is the one you never make. Layers of caches, from the user's browser to Redis, and the hard part: keeping them correct.",
    examBadge: "lvl3",
    lessons: [
      { id: "3.1", sources: [["HTTP caching", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching", "MDN Web Docs"], ["Caching challenges and strategies", "https://aws.amazon.com/builders-library/caching-challenges-and-strategies/", "Amazon Builders' Library"], ["What is a CDN?", "https://www.cloudflare.com/learning/cdn/what-is-a-cdn/", "Cloudflare Learning Center"]],
        title: "The cache hierarchy", minutes: 20,
        lede: "Caches sit at every layer between a user and your database. Each one answers what it can and passes the rest on. Toggle them and watch the database load fall.",
        render(r) { hierarchy(r); H.keys(r, [["Closest wins", "A browser cache costs nothing, a CDN costs ~10 ms, your database costs the full trip plus a query."], ["Shared vs private", "CDNs and proxy caches serve many users, so they may only hold public data."], ["Caches protect capacity", "Most of their value is the load they keep away from your servers and database."], ["Every layer is another copy", "More copies, more places for stale data. Lesson 3.3."]]); },
        check: { q: "Users in Australia complain that images from your Frankfurt server load slowly. Which cache helps them most?", opts: ["A bigger Redis instance next to the Frankfurt servers", "A CDN with an edge near Australia", "More database indexes on the images table", "An nginx proxy cache on the Frankfurt server"], a: 1, why: "Only a CDN moves content closer to the user and removes the long round trip to Frankfurt. The others speed up the server side, which is not the problem." } },
      { id: "3.2", sources: [["Database Caching Strategies Using Redis: caching patterns", "https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html", "AWS whitepaper"], ["Caching challenges and strategies", "https://aws.amazon.com/builders-library/caching-challenges-and-strategies/", "Amazon Builders' Library"], ["Designing Data-Intensive Applications", "https://dataintensive.net/", "Martin Kleppmann: chapter 1 on read load and caching"]],
        title: "Caching patterns and hit ratio", minutes: 25,
        lede: "Cache-aside, read-through, write-through and write-behind decide who fills the cache and when. Then the hit ratio decides how much it actually helps.",
        render(r) { patterns(r); H.keys(r, [["Default to cache-aside", "Simple, lazy, and a cache outage only costs speed."], ["Write-behind risks data", "Acknowledged writes can be lost if the cache dies."], ["Skew is your friend", "With popular items, a small cache serves most reads."], ["Measure the hit ratio", "Redis reports keyspace_hits and keyspace_misses. Under ~80%, ask why."]]); },
        check: { q: "With cache-aside, what should the application do after updating a product in the database?", opts: ["Nothing, because Redis notices the database change and updates itself", "Delete the product's cache key so the next read loads the new value", "Restart Redis so every cached product is reloaded from the database", "Write the new value to the cache first, then to the database"], a: 1, why: "In cache-aside the application owns the cache. Deleting the key makes the next reader load the fresh value. (Setting it directly risks the race in Lesson 3.3.)" } },
      { id: "3.3", sources: [["Scaling Memcache at Facebook", "https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala", "Nishtala et al., NSDI 2013: leases and invalidation"], ["Two Hard Things", "https://martinfowler.com/bliki/TwoHardThings.html", "Martin Fowler on Phil Karlton's quote"]],
        title: "Invalidation: keeping caches correct", minutes: 20,
        lede: "'There are only two hard things in computer science: cache invalidation and naming things.' Step through the races that make it hard, and the fixes.",
        render(r) { invalidation(r); H.keys(r, [["Always set a TTL", "It bounds how long any mistake can survive."], ["Delete, don't set", "On writes, remove the key rather than writing the new value."], ["Races are rare, not impossible", "At scale, rare happens every day. Leases or versions close the gap."], ["Decide what 'stale' may mean", "Per data type: a description can be minutes old, a balance cannot."]]); },
        check: { q: "Why is deleting the cache key on a write safer than writing the new value into the cache?", opts: ["Deleting is faster than setting, so the write returns sooner and races less", "A missing key is simply reloaded; a set applied out of order leaves a wrong value", "Redis cannot overwrite an existing key, so a set after the write would fail", "Deleting removes the need for TTLs, because entries then never go stale"], a: 1, why: "Concurrent writers can set the cache in a different order than they wrote the database. A deleted entry just causes one extra database read." } },
      { id: "3.4", sources: [["Optimal Probabilistic Cache Stampede Prevention", "https://www.vldb.org/pvldb/vol8/p886-vattani.pdf", "Vattani, Chierichetti and Lowenstein, VLDB 2015"], ["HTTP Cache-Control Extensions for Stale Content (RFC 5861)", "https://www.rfc-editor.org/rfc/rfc5861", "stale-while-revalidate and stale-if-error"], ["Key eviction", "https://redis.io/docs/latest/develop/reference/eviction/", "Redis documentation"]],
        title: "Stampedes and eviction", minutes: 25,
        lede: "Two ways a cache hurts you: a popular entry expires and everyone rushes the database at once, or the cache fills up and something has to go.",
        render(r) { stampede(r); H.keys(r, [["One recompute per key", "Locks, stale-while-revalidate or early refresh, never a free-for-all."], ["Add jitter to TTLs", "Keys cached at the same moment should not all expire at the same moment."], ["Cap memory", "Set maxmemory and an eviction policy, or Redis grows until the machine runs out."], ["LRU for caches", "allkeys-lru fits most caches. noeviction fits Redis used as a store: data kept nowhere else, such as sessions, counters or queues."]]); },
        check: { q: "A popular key expires and the database receives hundreds of identical queries in the same second. What is the most direct fix?", opts: ["Raise the TTL from 10 s to 20 s, so the key expires half as often", "Make sure only one request recomputes the value (a lock or stale-while-revalidate)", "Add a read replica, so the identical queries are spread over two servers", "Switch the eviction policy to allkeys-lfu, so popular keys never expire"], a: 1, why: "The problem is concurrency at expiry. A longer TTL only makes it happen less often; single-flight recomputation removes it." } },
      { id: "3.5", sources: [["Understand Redis data types", "https://redis.io/docs/latest/develop/data-types/", "Redis documentation"], ["Redis persistence", "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/", "Redis documentation: RDB and AOF"], ["How to do distributed locking", "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html", "Martin Kleppmann: fencing tokens"]],
        title: "Redis beyond caching", minutes: 20,
        lede: "Redis is a data-structure server, so it ends up doing much more than caching. Try the most common jobs, including one that is easy to get subtly wrong.",
        render(r) { redisUses(r); H.keys(r, [["Atomic operations", "INCR, sorted sets and Lua scripts run atomically, which makes counters and limits safe."], ["Locks are for efficiency", "Use them to avoid duplicate work; protect correctness with fencing or the database."], ["It is memory first", "Persistence is configurable; decide what a crash may lose."], ["Not a free database", "If Redis becomes critical, it needs replicas, backups and monitoring like any database."]]); },
        check: { q: "Worker A holds a Redis lock with a 10 s expiry, then freezes for 15 s. Worker B takes the lock. What protects the shared resource from A's late write?", opts: ["A longer lock expiry, such as 60 s, that no garbage-collection pause will exceed", "A fencing token: an increasing number the resource checks, rejecting stale holders", "Two Redis servers holding the lock, so it survives one of them failing", "Redis persistence, so the lock is safely on disk before worker A pauses"], a: 1, why: "No expiry can be long enough for every pause. Fencing tokens let the resource itself reject stale lock holders." } },
      { id: "3.6", sources: [["Cache-Control", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control", "MDN Web Docs"], ["HTTP Caching (RFC 9111)", "https://www.rfc-editor.org/rfc/rfc9111", "IETF standard"], ["What is a CDN?", "https://www.cloudflare.com/learning/cdn/what-is-a-cdn/", "Cloudflare Learning Center"], ["ngx_http_proxy_module: proxy_cache", "https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache", "nginx reference"]],
        title: "CDNs and HTTP caching", minutes: 25,
        lede: "HTTP has caching built in. One response header tells browsers and CDNs whether to keep a copy, for how long, and whether to share it. Then a CDN puts those copies around the world.",
        render(r) { cdn(r); H.keys(r, [["Hash your assets", "app.3f9c1a.js can be cached for a year; a new deploy gets a new name."], ["no-cache ≠ no-store", "no-cache stores and revalidates; no-store keeps nothing."], ["Personal = private", "Never let a shared cache store a personal response."], ["CDNs help dynamic sites too", "TLS close to the user and warm connections to your origin."]]); },
        check: { q: "Which header is right for a JavaScript bundle named app.3f9c1a.js?", opts: ["Cache-Control: no-store, so users always get the newest code", "Cache-Control: public, max-age=31536000, immutable", "Cache-Control: private, no-cache, so each browser revalidates it", "No header at all, so browsers apply their own heuristics"], a: 1, why: "The hash in the name changes whenever the content does, so the file at this URL never changes and can be cached for as long as possible." } }
    ],
    exam: [
      { q: "Which layer can serve a public image to many users without any request reaching your servers?", opts: ["Redis, in front of the application", "The database's buffer cache", "A CDN edge", "The application's in-process memory"], a: 2, why: "CDN edges hold shared copies near users; the origin only sees misses." },
      { q: "What happens in cache-aside on a miss?", opts: ["The cache notices the miss and loads the value from the database itself", "The application reads the database, then stores the result in the cache", "The request fails, and the client retries once the cache is warm", "The read is queued until a background job fills the cache"], a: 1, why: "The application manages the cache: check, fall back to the database, fill." },
      { q: "Why does a small cache often achieve a high hit ratio?", opts: ["Caches compress values, so they hold most of the database", "Real traffic is skewed: a small set of popular items receives most requests", "Redis is faster than disks, so misses are cheap enough not to count", "Long TTLs keep entries around until most of them are requested"], a: 1, why: "Zipf-like popularity means caching the top items serves most reads." },
      { q: "What is the main risk of write-behind caching?", opts: ["Slow writes, because each one waits for both the cache and the database", "Acknowledged writes are lost if the cache fails before it flushes them", "Higher read latency, because each read must check the write queue first", "It cannot be used with Redis, which only supports the cache-aside pattern"], a: 1, why: "The database is updated later; the cache holds the only copy for a while." },
      { q: "In the classic cache-aside race, how does stale data end up in the cache?", opts: ["The TTL is too short, so the key expires while the writer is still updating the row", "A slow reader caches the old value after the writer has updated and deleted the key", "Redis drops keys under memory pressure and later reloads them from an old snapshot", "Two readers miss at once, and the second overwrites the first one's newer value"], a: 1, why: "The reader read before the write and cached after the delete." },
      { q: "Which technique prevents a cache stampede on a single hot key?", opts: ["Adding read replicas, so the burst of queries is spread out", "Serving the stale value while one request refreshes it", "Lowering the TTL, so each expiry affects fewer requests", "Using allkeys-random eviction, so hot keys are rarely evicted"], a: 1, why: "Only one request recomputes; the rest get the old value instantly." },
      { q: "What does Cache-Control: no-cache mean?", opts: ["Never store the response anywhere, not even in the browser's cache", "Caches may store it but must revalidate with the origin before each use", "Only the browser may cache it; CDNs and shared proxies may not keep it", "Cache it for a default period of one hour, then revalidate with the origin"], a: 1, why: "no-store forbids storing; no-cache requires revalidation." },
      { q: "Redis is configured with maxmemory and the default policy. It is full. What happens on SET?", opts: ["The least recently used key is evicted to make room", "A random key is evicted to make room", "The write fails with an out-of-memory error", "Redis crashes and restarts with an empty dataset"], a: 2, why: "The default policy is noeviction: reads continue, writes are refused." }
    ],
    lab: {
      title: "Cache it, then break it",
      time: "about 5 hours",
      folder: "level-3-caching/",
      needs: "Docker Desktop (or Docker Engine), a terminal, curl",
      intro: `<p>A FastAPI product catalogue with a deliberately slow database query sits behind nginx acting as a small CDN. You will add Redis caching and measure it, serve stale data on purpose, cause a cache stampede and fix it, cache whole responses at the edge, and fill Redis until it evicts.</p><p>Only nginx publishes a port: <code>EDGE_PORT</code> in <code>.env</code> (default 8080).</p>`,
      vmChecks: [
        ["Static assets are cached for a long time", "curl -sI https://your-domain/assets/<a-hashed-file>.js | grep -iE 'cache-control|etag'", "<code>Cache-Control: public, max-age=31536000, immutable</code> on files with a hash in the name."],
        ["HTML is always revalidated", "curl -sI https://your-domain/ | grep -iE 'cache-control|etag|last-modified'", "<code>no-cache</code> (or a short max-age) plus an ETag or Last-Modified, so users get new releases immediately."],
        ["Personal API responses are never shared", "curl -sI -H 'Cookie: <your session>' https://your-domain/api/me | grep -i cache-control", "<code>private</code> or <code>no-store</code>. A missing header is risky if a CDN is ever added in front."],
        ["If Redis runs on the VM, it is bounded and private", "docker compose exec redis redis-cli CONFIG GET maxmemory*\ndocker ps --format '{{.Names}}\\t{{.Ports}}' | grep -i redis", "A non-zero <code>maxmemory</code> with a policy you chose, and no published port."]
      ],
      steps: [
        { id: "l3-1", why: "You cannot judge a cache without a baseline. This measures the cost of going to the database every time.", title: "Start the stack and measure the slow path",
          body: `${H.code(`cd level-3-caching
cp .env.example .env               # change EDGE_PORT if 8080 is taken
export EDGE_PORT=8080
docker compose up -d --build
curl -s localhost:$EDGE_PORT/products/42; echo
# 80% of requests go to 100 popular products, 20% to the rest (like real traffic)
docker run --rm -i --network host -e BASE=http://localhost:$EDGE_PORT/products grafana/k6 run - < k6/products.js
# Docker Desktop: -e BASE=http://host.docker.internal:$EDGE_PORT/products and no --network host`)}`,
          expect: "Every request takes at least 100 ms: the product query includes a deliberate 100 ms of database work.",
          solution: `${H.code(`  PRODUCTS LOAD REPORT  http://localhost:8080/products
  offered 50 req/s for 30s  ->  completed 1501, failed 0
  p50  104.0 ms   p95  105.8 ms   p99  108.5 ms   avg 104.2 ms`)}
            <p>Every request pays the full database cost, even for the same popular products again and again. In production this would be an expensive join or aggregate; here it is <code>pg_sleep(0.1)</code> so the numbers are predictable.</p>` },
        { id: "l3-2", why: "Cache-aside is the pattern you will use most. Measuring the hit ratio tells you whether a cache is earning its keep.", title: "Add cache-aside with Redis",
          body: `${H.code(`curl -s -X POST localhost:$EDGE_PORT/stats/reset
docker run --rm -i --network host -e BASE=http://localhost:$EDGE_PORT/cached/products grafana/k6 run - < k6/products.js
curl -s localhost:$EDGE_PORT/stats; echo
curl -si localhost:$EDGE_PORT/cached/products/42 | grep -iE 'x-cache|x-db-ms'`)}<p>Read <code>cached_product()</code> in <code>app/main.py</code>: the whole pattern is about ten lines.</p>`,
          expect: "p50 drops to a few milliseconds. <code>/stats</code> shows a hit ratio around 80% after the first 30 seconds; the misses are mostly the unpopular products.",
          solution: `${H.code(`  p50    2.2 ms   p95  105.6 ms   p99  108.7 ms   avg 29.9 ms
{"db_queries":396,"cache_hits":1105,"cache_misses":396,...,"hit_ratio":0.74,...}
x-cache: HIT`)}
            <ul><li><b>The median is a cache hit</b>, the p95 is a miss. The hit ratio is the share of requests that never touch the database.</li><li>The 100 popular products are cached after their first request. The other 20% of traffic is spread over 9,900 products, so most of those are first-time misses: exactly the long-tail shape from the Lesson 3.2 chart.</li><li>Reset the stats and run it again straight away: the hit ratio climbs (0.80 in the reference run), because some of the long tail is still cached from the first run (each entry lives for <code>CACHE_TTL</code>, 60 s).</li><li>The average dropped from 104 ms to 30 ms, and the database did a quarter of the work.</li></ul>` },
        { id: "l3-3", why: "Every cache serves stale data in some situations. Seeing it happen, and seeing the fix, is the only way to make it a deliberate choice.", title: "Serve stale data, then invalidate",
          body: `${H.code(`curl -s localhost:$EDGE_PORT/cached/products/7; echo        # MISS, then cached
curl -s -X PUT "localhost:$EDGE_PORT/products/7?invalidate=false" -H 'content-type: application/json' -d '{"price_cents": 99999}'; echo
curl -s localhost:$EDGE_PORT/cached/products/7; echo        # still the old price
curl -s -X PUT "localhost:$EDGE_PORT/products/7?invalidate=true" -H 'content-type: application/json' -d '{"price_cents": 12345}'; echo
curl -s localhost:$EDGE_PORT/cached/products/7; echo        # new price`)}`,
          expect: "After the first update the cached endpoint keeps returning the old price (for up to 60 s). After the second, it returns 12345 immediately.",
          solution: `<ul><li>Without invalidation, the cache keeps serving the old value until the TTL expires: that is the 'TTL only' strategy from Lesson 3.3.</li><li>With <code>invalidate=true</code> the update deletes <code>product:7</code> after writing the database, so the next read is a miss that loads the new price.</li><li>The deleting code is in <code>update_product()</code>. Notice that it deletes rather than sets the key, for the reason in Lesson 3.3's 'update on write' race.</li></ul>` },
        { id: "l3-4", why: "Stampedes are one of the most common ways a cache turns into an outage. Reproducing one makes the fix obvious.", title: "Cause a stampede, then stop it",
          body: `<p><code>/hot</code> returns an 'expensive report' (200 ms of database work), cached for 5 s, under 200 req/s.</p>${H.code(`curl -s -X POST localhost:$EDGE_PORT/stats/reset
docker run --rm -i --network host -e TARGET=http://localhost:$EDGE_PORT/hot -e RATE=200 -e DURATION=30s grafana/k6 run - < k6/steady.js
curl -s localhost:$EDGE_PORT/stats; echo
# now enable protection: in .env set STAMPEDE_PROTECTION=lock
docker compose up -d api
curl -s -X POST localhost:$EDGE_PORT/stats/reset
docker run --rm -i --network host -e TARGET=http://localhost:$EDGE_PORT/hot -e RATE=200 -e DURATION=30s grafana/k6 run - < k6/steady.js
curl -s localhost:$EDGE_PORT/stats; echo`)}`,
          expect: "Without protection, <code>hot_recomputes</code> is in the hundreds for 30 s (dozens per expiry) and the p99 is hundreds of milliseconds. With the lock it is about 6, one per 5-second period, and the p99 is a few milliseconds.",
          solution: `${H.code(`                 hot_recomputes    p50      p95      p99
no protection         211         1.3 ms   3.1 ms   307 ms
lock + stale            6         1.4 ms   2.2 ms   5.7 ms`, [2, 3])}
            <ul><li><b>Without protection</b>, every request arriving during the 200 ms recompute misses and recomputes too: 200 req/s × 0.2 s ≈ 40 duplicate queries per expiry, about 35 per expiry in the reference run. Those requests all wait 200 ms or more, which is the p99. The extra load also makes each recompute slower, widening the window; with a heavier query this spirals.</li><li><b>With protection</b> the value has a <i>soft</i> expiry. The first request after it takes a Redis lock (<code>SET … NX PX</code>) and recomputes; everyone else keeps getting the previous value (<code>X-Cache: STALE</code>) until the new one lands. One recompute per period, and nobody waits.</li><li>This is stale-while-revalidate implemented by hand. Amazon's 'Caching challenges and strategies' calls the same idea soft and hard TTLs.</li></ul>` },
        { id: "l3-5", why: "Response caching at the edge removes requests before they reach your code at all. It is exactly what a CDN does, so you can see its behaviour locally.", title: "Cache whole responses at the edge",
          body: `${H.code(`curl -sI localhost:$EDGE_PORT/catalog | grep -iE 'cache-control|x-cache-status'
curl -sI localhost:$EDGE_PORT/catalog | grep -iE 'x-cache-status'
curl -sI localhost:$EDGE_PORT/me/cart | grep -iE 'cache-control|x-cache-status'
curl -s -X POST localhost:$EDGE_PORT/stats/reset
docker run --rm -i --network host -e TARGET=http://localhost:$EDGE_PORT/catalog -e RATE=100 -e DURATION=30s grafana/k6 run - < k6/steady.js
curl -s localhost:$EDGE_PORT/stats; echo`)}`,
          expect: "<code>/catalog</code> shows <code>MISS</code> then <code>HIT</code>. <code>/me/cart</code> is never cached. After 3,000 requests to <code>/catalog</code>, the API itself served only about 3 of them.",
          solution: `${H.code(`Cache-Control: public, max-age=10
X-Cache-Status: MISS
X-Cache-Status: HIT
Cache-Control: private, no-store
X-Cache-Status: MISS
{"catalog_origin_hits": 3, ...}`, [6])}
            <ul><li>nginx (<code>nginx/edge.conf</code>) obeys the API's <code>Cache-Control</code> header: <code>public, max-age=10</code> means "any cache may keep this for 10 s". So the API is asked roughly once every 10 s, whatever the traffic: 3 times for 3,000 requests in the reference run.</li><li>Only <code>/catalog</code> and <code>/me/*</code> pass through the edge cache. Like a real CDN, you choose which paths are eligible, and the response headers decide the rest. Other routes show no <code>X-Cache-Status</code> header at all.</li><li><code>private, no-store</code> on the cart means nginx never stores it: personal data must never be served to another user from a shared cache.</li><li><code>proxy_cache_lock</code>, <code>proxy_cache_use_stale updating</code> and <code>proxy_cache_background_update</code> give the edge its own stampede protection. Right after an expiry you may see <code>STALE</code> (or <code>UPDATING</code> under heavy load): the previous copy served while a single background request refreshes it.</li></ul>` },
        { id: "l3-6", why: "Caches must be bounded, and the eviction policy decides what happens when they are full. The default surprises many people.", title: "Fill Redis until it evicts",
          body: `<p>This lab's Redis is capped at 8 MB with <code>allkeys-lru</code>.</p>${H.code(`docker compose exec api python fill_redis.py 50000
docker compose exec redis redis-cli INFO stats | grep -E 'evicted_keys|keyspace_(hits|misses)'
docker compose exec redis redis-cli INFO memory | grep -E '^used_memory_human|^maxmemory_human'
docker compose exec redis redis-cli CONFIG SET maxmemory-policy noeviction
docker compose exec api python fill_redis.py 5000`)}`,
          expect: "<code>evicted_keys</code> is in the tens of thousands and memory stays at the cap. With <code>noeviction</code> every write fails with an out-of-memory (OOM) error.",
          solution: `${H.code(`wrote 50000 keys, errors: 0
evicted_keys:18728
used_memory_human:8.00M
maxmemory_human:8.00M
OK
wrote 0 keys, errors: 5000 (first: command not allowed when used memory > 'maxmemory'.)`)}
            <ul><li>With <code>allkeys-lru</code>, Redis quietly drops the least recently used keys to make room, which is what you want from a cache.</li><li><code>noeviction</code> is Redis's default. It is right when Redis holds data you cannot lose (sessions, queues), and wrong for a cache, where a full cache would start rejecting writes.</li><li>Set it back with <code>CONFIG SET maxmemory-policy allkeys-lru</code>, or just restart Redis.</li></ul>` },
        { id: "l3-7", why: "Redis's data structures make several common features a couple of commands each. Trying them builds the instinct for when to reach for Redis.", title: "Use Redis for more than caching",
          body: `${H.code(`docker compose exec redis redis-cli
ZINCRBY leaderboard 50 alice
ZINCRBY leaderboard 80 bob
ZINCRBY leaderboard 65 chen
ZREVRANGE leaderboard 0 2 WITHSCORES
SET lock:invoice:42 worker-A NX PX 10000
SET lock:invoice:42 worker-B NX PX 10000
PTTL lock:invoice:42
exit
for i in $(seq 1 8); do curl -s -o /dev/null -w "%{http_code} " localhost:$EDGE_PORT/limited; done; echo`)}`,
          expect: "The leaderboard comes back highest first. The second lock attempt returns <code>(nil)</code>. The rate-limited endpoint returns five 200s, then 429s.",
          solution: `<ul><li><b>Sorted sets</b> keep members ordered by score on every write, so 'top N' is instant even with millions of players.</li><li><b>SET … NX PX</b> only succeeds if the key does not exist and gives it an expiry: the basic building block of a Redis lock. Remember Lesson 3.5: it prevents duplicate work, but correctness needs fencing.</li><li><code>/limited</code> uses <code>INCR</code> + <code>EXPIRE</code> on a per-client, per-window key: a fixed-window rate limiter shared by every API replica. Level 9 builds better ones.</li><li>Finish with <code>docker compose down</code>.</li></ul>` }
      ]
    }
  });
})();
