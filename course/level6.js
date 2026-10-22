/* Level 6 — Sharding */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function hash32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0; }

  /* ---------------- 6.1 Do you need to shard? ---------------- */
  const RUNGS = [
    ["Fix queries and indexes", "Level 4. Often a 10–1000× win for an afternoon's work.", (d) => true],
    ["Scale the database server up", "More CPU, RAM, faster disks. Today's largest cloud database servers have hundreds of cores and terabytes of RAM.", (d) => d.writes <= 30000 && d.size <= 20000],
    ["Add read replicas and caching", "Levels 3 and 5. Removes most read load from the primary.", (d) => d.writes <= 30000 && d.size <= 20000],
    ["Partition big tables inside one database", "Postgres declarative partitioning splits a table by range, list or hash on the same server: faster maintenance, easy deletion of old data.", (d) => d.writes <= 30000 && d.size <= 20000],
    ["Archive or move cold data", "Old rows to cheaper storage; keep the hot set small.", (d) => d.writes <= 30000 && d.size <= 40000],
    ["Split by function", "Move one large, separate domain (say, analytics events) to its own database.", (d) => d.writes <= 60000 && d.size <= 60000],
    ["Shard: split rows across many databases", "The last resort. Every rung above stays useful after you shard.", (d) => true]
  ];
  function ladder(root) {
    const p = H.panel(root, "Climb the ladder before you shard", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="ld-w">Peak writes per second <output id="ld-wo"></output></label><input type="range" id="ld-w" min="2" max="5.3" step="0.05" value="3"></div>
        <div class="ctl"><label for="ld-s">Data size <output id="ld-so"></output></label><input type="range" id="ld-s" min="1" max="5.3" step="0.05" value="2.3"></div>
      </div><p class="note">Thresholds are rough orders of magnitude for a single, well-tuned Postgres server on large cloud hardware. Real limits depend heavily on the workload.</p>
      <ol id="ld-l" style="list-style:none;padding:0;margin:10px 0;display:grid;gap:6px"></ol><div class="callout" id="ld-v"></div>`;
    function upd() {
      const writes = Math.round(Math.pow(10, +p.querySelector("#ld-w").value)), size = Math.round(Math.pow(10, +p.querySelector("#ld-s").value));
      p.querySelector("#ld-wo").textContent = writes.toLocaleString(); p.querySelector("#ld-so").textContent = size >= 1000 ? (size / 1000).toFixed(size >= 10000 ? 0 : 1) + " TB" : size + " GB";
      const d = { writes, size };
      const first = RUNGS.findIndex((r, i) => i > 0 && r[2](d) && i < RUNGS.length - 1);
      const need = RUNGS.slice(1, -1).every(r => !r[2](d));
      p.querySelector("#ld-l").innerHTML = RUNGS.map((r, i) => { const ok = i === 0 || (i < RUNGS.length - 1 ? r[2](d) : need); const shard = i === RUNGS.length - 1; return `<li style="display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;align-items:start;padding:8px 10px;border-radius:8px;border:1.5px solid ${shard && need ? "var(--bad)" : ok ? "var(--ok)" : "var(--line)"};background:${shard && need ? "var(--bad-soft)" : ok ? "var(--ok-soft)" : "var(--surface)"};opacity:${ok || shard ? 1 : .55}"><span class="mono" style="font-weight:600">${i + 1}</span><span><b>${r[0]}</b><br><span class="note">${r[1]}</span></span></li>`; }).join("");
      const v = p.querySelector("#ld-v");
      if (need) { v.className = "callout bad"; v.textContent = "No single machine handles this write rate or data size: this is the point where companies shard. Notion split its Postgres into 480 logical shards on 32 machines; Figma sharded its largest tables when they approached the limits of the biggest instances available."; }
      else { v.className = "callout good"; v.textContent = "A single primary (plus replicas and caches) can handle this. Sharding now would add permanent complexity, cross-shard queries, transactions and operations, for no benefit. Most companies never need it."; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd)); upd();
  }

  /* ---------------- 6.2 Range vs hash ---------------- */
  function partitioning(root) {
    const p = H.panel(root, "Pick a shard key and a strategy", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">An orders table split across 4 shards. Watch where the data lives, where today's writes land, and how many shards one typical query must visit.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Shard key</div><div class="seg" id="pa-k"></div></div><div><div class="note" style="margin-bottom:4px">Strategy</div><div class="seg" id="pa-s"></div></div></div>
      <div class="svgwrap" id="pa-svg"></div><div class="readout" id="pa-r"></div><div class="callout" id="pa-v"></div>`;
    let key = "user", strat = "hash";
    const r = rng(9);
    const rows = Array.from({ length: 4000 }, (_, i) => { const day = Math.floor(Math.pow(r(), 0.7) * 365); const c = r(); return { user: 1 + Math.floor(r() * 50000), day, country: c < 0.45 ? "US" : c < 0.65 ? "DE" : c < 0.75 ? "GB" : c < 0.83 ? "FR" : c < 0.9 ? "CY" : "other" }; });
    const ORDER = ["CY", "DE", "FR", "GB", "US", "other"];
    function shardOf(row) {
      if (strat === "hash") return hash32(String(row[key])) % 4;
      if (key === "user") return Math.min(3, Math.floor((row.user - 1) / 12500));
      if (key === "day") return Math.min(3, Math.floor(row.day / 91.25));
      return Math.min(3, Math.floor(ORDER.indexOf(row.country) / 1.5));
    }
    function draw() {
      const data = [0, 0, 0, 0], today = [0, 0, 0, 0];
      rows.forEach(rw => { const s = shardOf(rw); data[s]++; if (rw.day >= 362) today[s]++; });
      const W = 720, Hh = 190, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Rows and today's writes per shard" });
      const maxD = Math.max(...data), maxT = Math.max(1, ...today);
      for (let i = 0; i < 4; i++) {
        const x = 30 + i * 172;
        H.svg("rect", { x, y: 10, width: 150, height: 150, rx: 8, fill: "var(--surface-2)", stroke: "var(--line-strong)" }, s);
        const t = H.svg("text", { x: x + 75, y: 180, "text-anchor": "middle", "font-size": 12.5, "font-weight": 600, fill: "var(--ink)" }, s); t.textContent = "shard " + i;
        const dh = data[i] / maxD * 120; H.svg("rect", { x: x + 22, y: 150 - dh, width: 46, height: dh, rx: 3, fill: "var(--data)" }, s);
        const th = today[i] / maxT * 120; H.svg("rect", { x: x + 82, y: 150 - th, width: 46, height: th, rx: 3, fill: today[i] / maxT > 0.7 && today.filter(v => v > 0).length < 3 ? "var(--bad)" : "var(--signal)" }, s);
        const a = H.svg("text", { x: x + 45, y: 146 - dh, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); a.textContent = data[i];
        const b = H.svg("text", { x: x + 105, y: 146 - th, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); b.textContent = today[i];
      }
      const host = p.querySelector("#pa-svg"); host.innerHTML = ""; host.appendChild(s);
      const query = { user: "orders of user 42", day: "orders from the last 7 days", country: "orders from Cyprus" }[key];
      const qShards = key === "day" && strat === "hash" ? "up to 4 shards" : "1 shard";
      const otherQ = key === "user" ? "orders from the last 7 days" : "orders of user 42";
      const imbalance = Math.max(...data) / (data.reduce((a, b) => a + b) / 4), hot = Math.max(...today) / Math.max(1, today.reduce((a, b) => a + b) / 4);
      readout(p.querySelector("#pa-r"), [["Data imbalance (max ÷ average)", imbalance.toFixed(2) + "×", imbalance > 1.5 ? "bad" : imbalance > 1.15 ? "warn" : "good"], ["Today's writes (max ÷ average)", hot.toFixed(2) + "×", hot > 2 ? "bad" : hot > 1.3 ? "warn" : "good"], [`'${query}'`, qShards, qShards === "1 shard" ? "good" : "warn"], [`'${otherQ}'`, "all 4 shards", "warn"]]);
      const v = p.querySelector("#pa-v");
      let t;
      if (key === "day" && strat === "range") t = ["bad", "Range by date puts all of today's writes on one shard (the red bar) while the others sit idle: a hot shard. Range partitioning by time is great for deleting old data and time-range queries, terrible for spreading writes."];
      else if (key === "day" && strat === "hash") t = ["warn", "Hashing the date spreads days around, but every order from one day still lands on the same shard, and 'last 7 days' must ask 4 shards. Time is rarely a good shard key."];
      else if (key === "country") t = ["bad", "Low-variety keys make lumpy shards: the US alone is almost half the data, and a key with 6 values can never spread over more than 6 shards. Choose a key with many distinct values."];
      else if (strat === "range") t = ["warn", "Range by user ID is balanced for old users, but new users get the highest IDs, so all sign-ups land on the last shard. Fine if IDs are random (UUIDs), risky if they increase."];
      else t = ["good", "Hashing the user ID spreads both data and today's writes evenly, and every query for one user goes to one shard. The price: queries across users (reports, 'last 7 days') must ask every shard. Notion chose workspace ID for exactly this reason: almost every query is about one workspace."];
      v.className = "callout " + t[0]; v.textContent = t[1];
      const legend = H.el(`<div class="note" style="margin-top:4px"><span style="color:var(--data)">■</span> rows stored &nbsp; <span style="color:var(--signal)">■</span> today's writes</div>`); host.appendChild(legend);
    }
    seg(p.querySelector("#pa-k"), [["user", "user_id"], ["day", "created_at"], ["country", "country"]], key, v => { key = v; draw(); });
    seg(p.querySelector("#pa-s"), [["hash", "Hash"], ["range", "Range"]], strat, v => { strat = v; draw(); });
    draw();
  }

  /* ---------------- 6.3 Consistent hashing ---------------- */
  function ring(root) {
    const p = H.panel(root, "Add a server: how many keys have to move?", "Try it");
    p.innerHTML = `<div class="controls"><div><div class="note" style="margin-bottom:4px">Placement</div><div class="seg" id="rg-m"></div></div>
        <div class="ctl"><label for="rg-v">Virtual nodes per server <output id="rg-vo"></output></label><input type="range" id="rg-v" min="1" max="64" value="1"></div></div>
      <div class="controls"><button class="btn primary" type="button" id="rg-add">Add server</button><button class="btn" type="button" id="rg-rm">Remove server</button><span class="note" id="rg-n"></span></div>
      <div style="display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:16px;align-items:center" class="rg-grid"><div class="svgwrap" id="rg-svg"></div><div><div class="readout" id="rg-r"></div><div id="rg-bars"></div></div></div>
      <div class="callout" id="rg-v"></div><style>@media(max-width:700px){.rg-grid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
    const KEYS = Array.from({ length: 600 }, (_, i) => "key" + i);
    const COLS = ["#0B8478", "#6046D0", "#D9481F", "#B87A0A", "#2E7D9A", "#C2185B", "#5D7A1F", "#7A5C3E"];
    let mode = "ring", n = 4, vn = 1, prev = null, moved = null;
    function owners() {
      if (mode === "mod") return KEYS.map(k => hash32(k) % n);
      const pts = []; for (let s = 0; s < n; s++) for (let v = 0; v < vn; v++) pts.push([hash32("server" + s + "#" + v), s]);
      pts.sort((a, b) => a[0] - b[0]);
      return KEYS.map(k => { const h = hash32(k); let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < h) lo = m + 1; else hi = m; } return pts[lo % pts.length][1]; });
    }
    function draw(change) {
      vn = +p.querySelector("#rg-v").value; p.querySelector("#rg-vo").textContent = vn;
      const own = owners();
      if (change && prev) { moved = own.filter((o, i) => o !== prev[i]).length; } else if (!change) moved = null;
      prev = own;
      const s = H.svg("svg", { viewBox: "0 0 300 300", role: "img", "aria-label": "Hash ring with servers and keys" });
      const cx = 150, cy = 150, R = 120;
      H.svg("circle", { cx, cy, r: R, fill: "none", stroke: "var(--line-strong)", "stroke-width": 1.5 }, s);
      KEYS.forEach((k, i) => { const a = hash32(k) / 4294967296 * Math.PI * 2 - Math.PI / 2; H.svg("circle", { cx: cx + Math.cos(a) * (R - 10), cy: cy + Math.sin(a) * (R - 10), r: 2.2, fill: COLS[own[i] % COLS.length] }, s); });
      if (mode === "ring") for (let sv = 0; sv < n; sv++) for (let v = 0; v < vn; v++) { const a = hash32("server" + sv + "#" + v) / 4294967296 * Math.PI * 2 - Math.PI / 2; H.svg("circle", { cx: cx + Math.cos(a) * R, cy: cy + Math.sin(a) * R, r: vn > 16 ? 3 : 6, fill: COLS[sv % COLS.length], stroke: "var(--surface)", "stroke-width": 1.5 }, s); }
      else { const t = H.svg("text", { x: cx, y: cy + 5, "text-anchor": "middle", "font-size": 13, fill: "var(--muted)" }, s); t.textContent = "hash(key) % " + n; }
      const h = p.querySelector("#rg-svg"); h.innerHTML = ""; h.appendChild(s);
      const counts = Array.from({ length: n }, (_, i) => own.filter(o => o === i).length), avg = KEYS.length / n, imb = Math.max(...counts) / avg;
      readout(p.querySelector("#rg-r"), [["Keys moved by the last change", moved === null ? "-" : `${moved} of ${KEYS.length} (${Math.round(moved / KEYS.length * 100)}%)`, moved === null ? "" : moved / KEYS.length > 0.5 ? "bad" : "good"], ["Most loaded ÷ average", imb.toFixed(2) + "×", imb > 1.5 ? "bad" : imb > 1.2 ? "warn" : "good"]]);
      p.querySelector("#rg-bars").innerHTML = counts.map((c, i) => `<div style="display:grid;grid-template-columns:70px minmax(0,1fr) 40px;gap:8px;align-items:center;font-size:12.5px"><span>server ${i}</span><span style="height:10px;background:var(--line);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${c / Math.max(...counts) * 100}%;background:${COLS[i % COLS.length]}"></i></span><span class="mono">${c}</span></div>`).join("");
      p.querySelector("#rg-n").textContent = n + " servers";
      const v = p.querySelector("#rg-v");
      if (mode === "mod") { v.className = "callout " + (moved ? "bad" : "warn"); v.textContent = moved ? `With hash % N, changing N reassigns almost every key (${Math.round(moved / KEYS.length * 100)}% here): nearly all data must move between servers, or nearly every cache entry becomes a miss.` : "hash(key) % N is perfectly simple. Now add or remove a server."; }
      else if (vn < 8) { v.className = "callout warn"; v.textContent = (moved ? `Only ${Math.round(moved / KEYS.length * 100)}% of keys moved: just the ones in the arc the new server took over. ` : "Each key belongs to the next server clockwise. ") + "But with one point per server, arcs are uneven, and so is the load. Raise the virtual nodes."; }
      else { v.className = "callout good"; v.textContent = (moved ? `${Math.round(moved / KEYS.length * 100)}% of keys moved, close to the ideal 1/N. ` : "") + "Each server owns many small arcs (virtual nodes), so load evens out, and adding a server takes a little from every other server instead of a lot from one neighbour. Dynamo, Cassandra and many caches use this."; }
    }
    seg(p.querySelector("#rg-m"), [["ring", "Consistent hashing ring"], ["mod", "hash % N"]], mode, v => { mode = v; prev = null; draw(false); });
    p.querySelector("#rg-v").addEventListener("input", () => { prev = null; draw(false); });
    p.querySelector("#rg-add").onclick = () => { if (n < 8) { n++; draw(true); } };
    p.querySelector("#rg-rm").onclick = () => { if (n > 2) { n--; draw(true); } };
    draw(false);
  }

  /* ---------------- 6.4 Hot keys ---------------- */
  function hotkeys(root) {
    const p = H.panel(root, "One celebrity, one hot shard", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A social app shards by user ID across 8 shards. One account is followed by millions and attracts 30% of all writes (likes, comments).</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Mitigation</div><div class="seg" id="hk-m"></div></div></div>
      <div id="hk-b" style="display:grid;gap:5px;margin:10px 0"></div><div class="callout" id="hk-v"></div>`;
    let m = "none";
    function draw() {
      const base = Array(8).fill(70 / 8), hot = 3;
      const load = base.slice();
      if (m === "none") load[hot] += 30;
      else if (m === "salt") for (let i = 0; i < 8; i++) load[i] += 30 / 8;
      else if (m === "cache") load[hot] += 30 * 0.15;
      else if (m === "own") { load.push(30); }
      const max = Math.max(...load);
      p.querySelector("#hk-b").innerHTML = load.map((l, i) => `<div style="display:grid;grid-template-columns:110px minmax(0,1fr) 54px;gap:8px;align-items:center;font-size:13px"><span>${i === 8 ? "dedicated shard" : "shard " + i}${i === hot && m !== "salt" ? " ★" : ""}</span><span style="height:14px;background:var(--line);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${l / 40 * 100}%;background:${l > 20 ? "var(--bad)" : l > 13 ? "var(--xp)" : "var(--ok)"}"></i></span><span class="mono">${l.toFixed(1)}%</span></div>`).join("");
      const t = {
        none: ["bad", `Shard 3 holds the celebrity and takes ${max.toFixed(0)}% of all writes, more than three times its share. Adding more shards does not help: one key always lives on one shard.`],
        salt: ["good", "Split the hot key into sub-keys (celebrity#0 … celebrity#7) spread over all shards; each write picks one at random. Writes even out. The cost: reading the total now means asking all 8 sub-keys and adding them up, so only do this for keys you know are hot."],
        cache: ["warn", "If the hot traffic is mostly reads, a cache in front absorbs it. Writes still hit the one shard (shown), so this helps read-heavy hot keys, not write-heavy ones."],
        own: ["warn", "Give the celebrity a dedicated shard. Simple, and isolates the noise from everyone else, but it needs a lookup table of exceptions in your router, and that one shard can still saturate."]
      }[m];
      const v = p.querySelector("#hk-v"); v.className = "callout " + t[0]; v.textContent = t[1];
    }
    seg(p.querySelector("#hk-m"), [["none", "None"], ["salt", "Split the key (salting)"], ["cache", "Cache reads"], ["own", "Dedicated shard"]], m, v => { m = v; draw(); });
    draw();

    const q = H.panel(root, "Rebalancing: move whole partitions, not keys", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Create many more partitions than servers up front (here 24), and assign partitions to servers. Adding a server means moving a few whole partitions to it; a key's partition never changes.</p>
      <div class="controls"><button class="btn primary" type="button" id="rb-add">Add server</button><button class="btn" type="button" id="rb-reset">Reset to 3 servers</button></div>
      <div id="rb-g" style="display:grid;gap:8px;margin:10px 0"></div><div class="callout" id="rb-v"></div>`;
    let servers;
    function reset() { servers = [[], [], []]; for (let i = 0; i < 24; i++) servers[i % 3].push({ id: i, moved: false }); rdraw(null); }
    function rdraw(moved) {
      q.querySelector("#rb-g").innerHTML = servers.map((sv, i) => `<div style="display:grid;grid-template-columns:80px minmax(0,1fr);gap:8px;align-items:center"><b style="font-size:13px">server ${i}</b><span style="display:flex;flex-wrap:wrap;gap:4px">${sv.map(pt => `<span class="mono" style="font-size:11px;padding:3px 6px;border-radius:5px;border:1px solid ${pt.moved ? "var(--signal)" : "var(--line-strong)"};background:${pt.moved ? "var(--signal-soft)" : "var(--surface)"}">p${pt.id}</span>`).join("")}</span></div>`).join("");
      const v = q.querySelector("#rb-v");
      if (moved === null) { v.className = "callout"; v.textContent = "24 partitions over 3 servers: 8 each. Add a server."; }
      else { v.className = "callout good"; v.textContent = `Moved ${moved} whole partitions (${Math.round(moved / 24 * 100)}% of the data) to the new server, taken evenly from the others. Every key stays in its partition, so the router only needs the small partition → server map updated. Kafka, Elasticsearch and Notion's 480 logical shards all work this way. Choose the partition count generously: changing it later is a full reshuffle.`; }
    }
    q.querySelector("#rb-add").onclick = () => {
      if (servers.length >= 8) return;
      servers.forEach(sv => sv.forEach(pt => pt.moved = false));
      const target = Math.floor(24 / (servers.length + 1)); const ns = []; let moved = 0;
      while (ns.length < target) { const donor = servers.reduce((a, b) => (b.length > a.length ? b : a)); const pt = donor.pop(); pt.moved = true; ns.push(pt); moved++; }
      servers.push(ns); rdraw(moved);
    };
    q.querySelector("#rb-reset").onclick = reset;
    reset();
  }

  /* ---------------- 6.5 Living with shards ---------------- */
  function living(root) {
    const p = H.panel(root, "Scatter-gather and the tail", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A query that is not keyed by the shard key must ask every shard and wait for the slowest. Each shard answers in 5 ms typically, but 1% of the time takes 200 ms.</p>
      <div class="ctl" style="max-width:420px"><label for="sg-n">Shards asked <output id="sg-no"></output></label><input type="range" id="sg-n" min="1" max="64" value="1"></div>
      <div class="readout" id="sg-r"></div><div class="callout" id="sg-v"></div>`;
    function upd() {
      const n = +p.querySelector("#sg-n").value; p.querySelector("#sg-no").textContent = n;
      const slow = 1 - Math.pow(0.99, n);
      readout(p.querySelector("#sg-r"), [["Chance the query is slow", (slow * 100).toFixed(1) + "%", slow > .2 ? "bad" : slow > .05 ? "warn" : "good"], ["Typical latency", (slow > .5 ? "200 ms" : "5 ms")], ["Load on the cluster", n + " queries for 1 answer"]]);
      const v = p.querySelector("#sg-v"); v.className = "callout " + (n === 1 ? "good" : slow > .2 ? "bad" : "warn");
      v.textContent = n === 1 ? "A query by shard key touches one shard: fast, and it scales with the number of shards." : `Asking ${n} shards means waiting for the slowest of ${n}: ${(slow * 100).toFixed(0)}% of these queries hit a slow shard. This is 'The Tail at Scale' again (Lesson 0.3). It also multiplies load, so scatter-gather queries do not get faster as you add shards. Keep them rare, or serve them from a separate copy built for them (a search index or analytics store).`;
    }
    p.querySelector("#sg-n").addEventListener("input", upd); upd();

    const q = H.panel(root, "Unique IDs without a central counter", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Each shard's own auto-increment would hand out the same numbers. Twitter's Snowflake scheme packs time, a machine number and a counter into one 64-bit integer, so any server can mint IDs alone and they still sort by time.</p>
      <div class="controls"><div class="ctl"><label for="sf-m">Machine ID <output id="sf-mo"></output></label><input type="range" id="sf-m" min="0" max="1023" value="7"></div><button class="btn primary" type="button" id="sf-g">Generate an ID</button></div>
      <div id="sf-out"></div><div class="callout">41 bits of milliseconds since a chosen epoch (about 69 years), 10 bits of machine ID (1,024 machines), 12 bits of sequence (4,096 IDs per millisecond per machine). The standard alternative is UUIDv7 (RFC 9562): 128 bits, a 48-bit millisecond timestamp first, then randomness. Both keep new rows clustered at the end of B-tree indexes, unlike random UUIDv4.</div>`;
    const EPOCH = 1288834974657; let seq = 0, lastMs = 0;
    function gen() {
      const mid = +q.querySelector("#sf-m").value; q.querySelector("#sf-mo").textContent = mid;
      const ms = Date.now(); if (ms === lastMs) seq = (seq + 1) & 4095; else { seq = 0; lastMs = ms; }
      const t = BigInt(ms - EPOCH), id = (t << 22n) | (BigInt(mid) << 12n) | BigInt(seq);
      const bin = id.toString(2).padStart(63, "0");
      q.querySelector("#sf-out").innerHTML = `<div class="mono" style="font-size:20px;font-weight:600;margin:6px 0">${id.toString()}</div>
        <div class="mono" style="font-size:11.5px;overflow-wrap:anywhere;line-height:1.8"><span style="background:var(--compute-soft);color:var(--compute);padding:2px 0">${bin.slice(0, 41)}</span><span style="background:var(--data-soft);color:var(--data);padding:2px 0">${bin.slice(41, 51)}</span><span style="background:var(--xp-soft);color:var(--xp);padding:2px 0">${bin.slice(51)}</span></div>
        <div class="note"><span style="color:var(--compute)">timestamp</span> ${new Date(ms).toISOString()} · <span style="color:var(--data)">machine</span> ${mid} · <span style="color:var(--xp)">sequence</span> ${seq}</div>`;
    }
    q.querySelector("#sf-g").onclick = gen; q.querySelector("#sf-m").addEventListener("input", gen); gen();
    H.add(root, `<div class="keys">
      <div class="key"><b>Keep transactions on one shard</b>Choose the shard key so related rows (a workspace and its pages) live together. Cross-shard transactions need two-phase commit, which is slow and fragile.</div>
      <div class="key"><b>Joins across shards are your problem</b>Denormalise, or fetch from each shard and join in the application.</div>
      <div class="key"><b>Off-the-shelf sharding</b>Citus (a Postgres extension) and Vitess (for MySQL) route queries and move shards for you.</div>
      <div class="key"><b>Resharding is a project</b>Plan the partition count and the router before you need them.</div></div>`);
  }

  Course.register({
    id: 6,
    blurb: "When one database server cannot hold the data or take the writes, rows are split across many. Choosing how to split decides what stays easy and what becomes hard forever.",
    examBadge: "lvl6",
    lessons: [
      { id: "6.1", sources: [["Designing Data-Intensive Applications, chapter 6", "https://dataintensive.net/", "Martin Kleppmann: partitioning"], ["Table Partitioning", "https://www.postgresql.org/docs/16/ddl-partitioning.html", "PostgreSQL 16 documentation"], ["Herding elephants: lessons learned from sharding Postgres at Notion", "https://www.notion.com/blog/sharding-postgres-at-notion", "Notion engineering"], ["How Figma's databases team lived to tell the scale", "https://www.figma.com/blog/how-figmas-databases-team-lived-to-tell-the-scale/", "Figma engineering"]],
        title: "Do you need to shard?", minutes: 15,
        lede: "Sharding splits rows across many database servers. It is the most powerful scaling tool and the most expensive to live with, so it comes last. See what comes first.",
        render(r) { ladder(r); H.keys(r, [["Partitioning ≠ sharding", "Partitioning splits a table on one server; sharding splits it across servers."], ["Exhaust the ladder", "Every earlier rung is cheaper and stays useful after sharding."], ["Writes and size force it", "Reads can be scaled with replicas and caches; writes and storage cannot."], ["Real companies waited", "Notion and Figma ran single Postgres primaries for years before sharding."]]); },
        check: { q: "Your app is read-heavy and the database CPU is at 85%, mostly from repeated reads. What comes before sharding?", opts: ["Nothing: at 85% CPU it is time to shard", "Indexes, caching and read replicas", "Switching to a NoSQL database that scales reads", "Hash partitioning of the busiest tables across servers"], a: 1, why: "Read load is the easiest to remove: fix queries, cache, add replicas. Sharding is for when writes or data size outgrow one primary." } },
      { id: "6.2", sources: [["Designing Data-Intensive Applications, chapter 6", "https://dataintensive.net/", "Partitioning of key-value data"], ["Table Partitioning: methods", "https://www.postgresql.org/docs/16/ddl-partitioning.html", "Range, list and hash in PostgreSQL"]],
        title: "Range or hash: choosing the shard key", minutes: 25,
        lede: "The shard key decides which server owns each row. A good one spreads data and writes evenly and keeps each common query on one shard. Try three keys and two strategies.",
        render(r) { partitioning(r); H.keys(r, [["Many distinct values", "A key with few values (country, status) cannot spread evenly."], ["Match the main query", "Pick the key most queries filter on (user, tenant, workspace)."], ["Avoid monotonic ranges", "Time or auto-increment IDs with range sharding create a hot last shard."], ["Hash loses ranges", "Hashing spreads load but range queries on the key must visit every shard."]]); },
        check: { q: "A multi-tenant SaaS app: nearly every query is about one customer account. What is the natural shard key?", opts: ["created_at, so recent data sits together", "The customer (tenant) ID", "A random number per row, for an even spread", "The customer's country, to keep data in-region"], a: 1, why: "Keying by tenant keeps all of one customer's data and queries on one shard, which is what Notion did with workspace ID." } },
      { id: "6.3", sources: [["Chord: A Scalable Peer-to-peer Lookup Protocol", "https://www.cs.princeton.edu/courses/archive/fall13/cos518/papers/chord.pdf", "Stoica et al., SIGCOMM 2001: consistent hashing on a ring"], ["Dynamo: Amazon's Highly Available Key-value Store", "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", "DeCandia et al., 2007: virtual nodes"], ["Designing Data-Intensive Applications, chapter 6", "https://dataintensive.net/", "Rebalancing partitions"]],
        title: "Consistent hashing", minutes: 20,
        lede: "hash(key) % N is simple until N changes, then almost everything moves. Consistent hashing arranges servers and keys on a ring so adding a server moves only its share.",
        render(r) { ring(r); H.keys(r, [["Modulo reshuffles", "Changing N moves about (N−1)/N of keys."], ["The ring moves ~1/N", "Only keys in the new server's arcs change owner."], ["Virtual nodes", "Many points per server smooth the load and spread the moves."], ["Used everywhere", "Cassandra, DynamoDB's ancestors, memcached clients, load balancers."]]); },
        check: { q: "You have 10 cache servers using hash(key) % 10 and add an 11th. Roughly what share of keys now map to a different server?", opts: ["About 9%", "About 50%", "About 91%", "None"], a: 2, why: "With modulo, a key keeps its server only if hash % 10 equals hash % 11, which is rare: about 10/11 of keys move. Consistent hashing would move about 1/11." } },
      { id: "6.4", sources: [["Designing Data-Intensive Applications, chapter 6", "https://dataintensive.net/", "Skewed workloads and relieving hot spots; fixed number of partitions"], ["Herding elephants (Notion)", "https://www.notion.com/blog/sharding-postgres-at-notion", "480 logical shards on 32 machines"]],
        title: "Hot keys and rebalancing", minutes: 20,
        lede: "Even a perfect hash cannot split one very popular key. And when you add servers, you want to move as little as possible. See the standard answers to both.",
        render(r) { hotkeys(r); },
        check: { q: "Why do systems like Kafka and Elasticsearch create many more partitions than servers?", opts: ["To use more disks in parallel on each server, which makes every write faster", "So adding servers moves whole partitions, and no key changes partition", "Because each server can hold only one partition of each topic or index", "So each query visits more partitions and its work is spread more widely"], a: 1, why: "Fixed partitions make rebalancing a matter of reassigning partitions, with no per-key rehashing." } },
      { id: "6.5", sources: [["The Tail at Scale", "https://research.google/pubs/the-tail-at-scale/", "Dean and Barroso, 2013"], ["Announcing Snowflake", "https://blog.x.com/engineering/en_us/a/2010/announcing-snowflake", "Twitter engineering, 2010"], ["UUIDs (RFC 9562)", "https://www.rfc-editor.org/rfc/rfc9562", "Including time-ordered UUIDv7"], ["What is Citus?", "https://docs.citusdata.com/en/stable/get_started/what_is_citus.html", "Distributed Postgres"], ["What is Vitess?", "https://vitess.io/docs/overview/whatisvitess/", "Sharding for MySQL"]],
        title: "Living with shards", minutes: 20,
        lede: "Once data is split, some things become permanently harder: queries across shards, transactions across shards, and unique IDs. Here is how teams cope.",
        render(r) { living(r); },
        check: { q: "Why do Snowflake IDs and UUIDv7 put the timestamp in the most significant bits?", opts: ["To make the IDs shorter when they are encoded as text", "So IDs sort roughly by creation time and new rows go to the end of indexes", "Because databases reject primary keys that do not start with a time", "So the IDs cannot be guessed, since the time changes constantly"], a: 1, why: "Time-ordered IDs keep B-tree inserts sequential and allow sorting by ID ≈ sorting by time, while any server can generate them independently." } }
    ],
    exam: [
      { q: "What distinguishes sharding from table partitioning in Postgres?", opts: ["Nothing: the two terms describe the same feature in different databases", "Sharding spreads data over several servers; partitioning stays within one", "Partitioning applies only to indexes, while sharding applies to tables", "Sharding is only possible in NoSQL databases; partitioning is the SQL version"], a: 1, why: "Partitioning helps manage one server's data; sharding adds servers." },
      { q: "Which shard key is most likely to create a hot shard for writes when used with range sharding?", opts: ["A random UUID", "A hashed user ID", "created_at (time)", "A tenant ID, with many tenants"], a: 2, why: "All new writes have the latest time, so they all land on the last range." },
      { q: "With hash-based sharding on user_id, which query must visit every shard?", opts: ["Every order placed by user 42 this year", "Updating user 42's email address", "Counting all orders placed yesterday", "Deleting user 42 together with their orders"], a: 2, why: "Yesterday's orders belong to many users spread over all shards." },
      { q: "Consistent hashing with virtual nodes mainly improves…", opts: ["The strength of the hash, which makes the keys harder to guess", "Load balance, and how few keys move when servers are added", "Query planning, because each shard knows exactly which keys it holds", "Transaction isolation between keys that live on different servers"], a: 1, why: "Many points per server smooth both ownership and rebalancing." },
      { q: "A single key receives 30% of all writes. Which technique spreads those writes?", opts: ["Adding more shards, so each one owns less of the key space", "Splitting the key into salted sub-keys across shards", "A longer cache TTL in front of that key", "Switching from hash sharding to range sharding"], a: 1, why: "One key always maps to one shard; splitting it into several keys is the only way to spread its writes." },
      { q: "A scatter-gather query asks 50 shards, each with a 1% chance of a slow response. Roughly how often is the whole query slow?", opts: ["1%", "About 10%", "About 40%", "100%"], a: 2, why: "1 − 0.99^50 ≈ 0.39." },
      { q: "Why is a cross-shard transaction expensive?", opts: ["It needs a coordinator protocol such as two-phase commit, adding round trips", "Shards cannot store transactions, so each step goes to a separate log first", "It requires Serializable isolation on every shard, which locks whole tables", "It is not expensive: the shards run it exactly like a local transaction"], a: 0, why: "Coordinating commit across servers adds latency and blocking when a participant or coordinator fails." },
      { q: "What is a downside of random UUIDv4 primary keys compared with UUIDv7 or Snowflake IDs?", opts: ["They are not guaranteed to be unique, so inserts must check for duplicates", "Inserts land at random places in the B-tree index, hurting cache locality and write speed", "They cannot be generated by clients, so every insert needs a database round trip", "They are only 32 bits long, so large tables run out of IDs"], a: 1, why: "Time-ordered IDs append at the end of the index; random ones scatter writes across it." }
    ],
    lab: {
      title: "Shard it yourself",
      time: "about 5 hours",
      folder: "level-6-sharding/",
      needs: "Docker Desktop (or Docker Engine), a terminal",
      intro: `<p>Three plain <code>postgres:16</code> containers act as shards, and a <code>tools</code> container runs a small Python shard router (<code>scripts/router.py</code>) that you will read and extend. You will spread 100,000 users across shards, measure what adding a fourth shard costs with modulo and with a consistent-hashing ring, actually migrate the rows, run a scatter-gather query, tame a hot key, and generate unique IDs without coordination.</p><p>This is what libraries like Citus or Vitess do for you. Building a tiny version once makes their documentation, and their limits, much easier to understand.</p>`,
      vmIntro: "A single-VM app rarely needs sharding. These checks tell you how far away it is.",
      vmChecks: [
        ["How big is the data, and how fast is it growing?", "docker compose exec db psql -U <user> -d <db> -c \"SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size, n_live_tup FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;\"", "Sizes in megabytes or a few gigabytes: years away from needing sharding. Re-run monthly to see the growth rate."],
        ["What is the write rate?", "docker compose exec db psql -U <user> -d <db> -c \"SELECT sum(n_tup_ins + n_tup_upd + n_tup_del) AS rows_written_since_stats_reset FROM pg_stat_user_tables;\" -c \"SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();\"", "Divide rows written by seconds since the reset for an average write rate. Hundreds per second are trivial for one Postgres server."],
        ["Are IDs safe to shard later?", "docker compose exec db psql -U <user> -d <db> -c \"SELECT table_name, column_name, data_type, column_default FROM information_schema.columns WHERE column_name = 'id' AND table_schema = 'public';\"", "Either is fine today. Auto-increment (bigserial) IDs would need to change if you ever shard; UUIDs (ideally v7) would not."]
      ],
      steps: [
        { id: "l6-1", why: "You need a router before you can shard anything. Reading one line by line removes the magic.", title: "Start three shards and read the router",
          body: `${H.code(`cd level-6-sharding
docker compose up -d                        # shard0, shard1, shard2
docker compose build tools
docker compose run --rm tools python router.py`)}<p>Open <code>scripts/router.py</code>. It is about 40 lines: a stable hash, a modulo placement, and a ring with 64 virtual nodes per shard.</p>`,
          expect: "Five users printed with the shard that owns each one.",
          solution: `${H.code(`user     1 -> shard 0   (modulo would say shard 2)
user     2 -> shard 0   (modulo would say shard 2)
user     3 -> shard 2   (modulo would say shard 1)
user    42 -> shard 2   (modulo would say shard 0)
user  1000 -> shard 1   (modulo would say shard 0)`)}
            <ul><li>The router uses BLAKE2 rather than Python's <code>hash()</code>, which changes every time Python starts. A shard function must give the same answer forever, on every machine.</li><li><code>shard_for()</code> with the ring: hash the key, find the first ring point clockwise (<code>bisect</code>), and that point's shard owns the key.</li><li>Every shard has the identical schema (<code>sql/schema.sql</code>). The shards know nothing about each other; all the intelligence is in the router.</li></ul>` },
        { id: "l6-2", why: "Even distribution is the first property a shard key must have. Measuring it, rather than assuming it, is what you would do before choosing a key in production.", title: "Load 100,000 users with each strategy",
          body: `${H.code(`docker compose run --rm tools python load_users.py --strategy mod
docker compose run --rm tools python load_users.py --strategy ring     # keep this one`)}`,
          expect: "Both spread users fairly evenly. Modulo is almost perfectly even; the ring is about 10% uneven.",
          solution: `${H.code(`mod:   shard 0: 33,505   shard 1: 33,251   shard 2: 33,244   most loaded / average = 1.005
ring:  shard 0: 29,838   shard 1: 33,021   shard 2: 37,141   most loaded / average = 1.114`)}
            <ul><li>Modulo of a good hash is nearly perfect. The ring is lumpier because shard boundaries fall at pseudo-random points; 64 virtual nodes per shard keep it to roughly 10%; more virtual nodes would even it further.</li><li>So why prefer the ring? The next step.</li><li>Loading used <code>COPY</code>, Postgres's bulk-load path: 100,000 rows in a fraction of a second.</li></ul>` },
        { id: "l6-3", why: "Adding capacity is the reason to shard, and the placement scheme decides whether that is a small move or a full reshuffle.", title: "Plan a fourth shard: modulo vs ring",
          body: `${H.code(`docker compose run --rm tools python plan.py --from 3 --to 4`)}`,
          expect: "Modulo would move about three quarters of all users. The ring moves about a quarter, close to the ideal.",
          solution: `${H.code(` mod: 74,936 of 100,000 users move (75%)
ring: 26,157 of 100,000 users move (26%)
ideal: 25% (only the new shard's fair share)`, [1, 2])}
            <ul><li>With <code>hash % 3</code> → <code>hash % 4</code>, a user stays put only when both give the same remainder, which happens about a quarter of the time. Three quarters of the data would cross the network, and during the move most lookups would go to the wrong shard.</li><li>With the ring, only users in the arcs the new shard takes over move. Every other user keeps its shard, so the migration is smaller and most traffic is unaffected.</li></ul>` },
        { id: "l6-4", why: "Moving live rows between databases, and proving none were lost or duplicated, is the real operational work of resharding.", title: "Add shard 3 and migrate on the ring",
          body: `${H.code(`docker compose --profile grow up -d shard3
docker compose run --rm tools python migrate.py --from 3 --to 4`)}<p>Read <code>scripts/migrate.py</code>: it copies each batch to the new owner, checks the rows arrived, and only then deletes them from the old shard.</p>`,
          expect: "About 26,000 users move to shard 3, a share from each existing shard. Every shard reports 0 misplaced users and the total is still 100,000.",
          solution: `${H.code(`  shard 0 -> shard 3: moved 6,557 users
  shard 1 -> shard 3: moved 9,288 users
  shard 2 -> shard 3: moved 10,312 users
  shard 0: 23,281 users, misplaced: 0
  shard 1: 23,733 users, misplaced: 0
  shard 2: 26,829 users, misplaced: 0
  shard 3: 26,157 users, misplaced: 0
moved 26,157 users in 1.1 s; total now 100,000`)}
            <ul><li><b>Copy, verify, delete</b>: there is no transaction spanning two databases, so the order matters. If the script dies after copying but before deleting, you have duplicates (safe to clean up); the opposite order could lose users.</li><li><b>This was offline.</b> In production, writes keep arriving during a migration. Real tools (Vitess, Citus, or a custom process like Notion's) copy, then stream ongoing changes (Level 8's change data capture), then switch the router at a precise moment.</li><li>The new shard took different amounts from each old shard because ring arcs are uneven; more virtual nodes would even this out.</li></ul>` },
        { id: "l6-5", why: "Scatter-gather queries are the main thing sharding makes slower. Seeing the slowest shard dominate explains why teams avoid them.", title: "Run a scatter-gather query",
          body: `${H.code(`docker compose run --rm tools python scatter.py --shards 4
docker compose run --rm tools python scatter.py --shards 4 --slow-shard 2`)}<p>The 'top 10 users by points' query is not keyed by user ID, so every shard must be asked for its own top 10 and the results merged.</p>`,
          expect: "Normally the scatter-gather takes a little longer than a single-shard lookup. When one shard is slow 10% of the time, the scatter-gather p95 jumps to about 300 ms while the single-shard p95 stays around a millisecond.",
          solution: `${H.code(`single-shard lookup (1 of 4 shards):  median    0.2 ms   p95    0.4 ms
scatter-gather top 10 (4 shards):     median    0.8 ms   p95    1.3 ms

with shard 2 sometimes slow:
single-shard lookup (1 of 4 shards):  median    0.2 ms   p95    1.0 ms
scatter-gather top 10 (4 shards):     median    0.8 ms   p95  301.8 ms`, [6])}
            <ul><li>A scatter-gather finishes when the <i>slowest</i> shard answers, so one unhealthy shard slows every such query. Single-shard queries only suffer if they happen to need that shard.</li><li><b>The arithmetic:</b> a quarter of single lookups go to shard 2 and 10% of those are slow, so 2.5% of lookups are slow: fewer than the 5% a p95 ignores. Every scatter-gather asks shard 2, so 10% of them are slow and the p95 is a slow one. This is the fan-out effect from Lesson 0.3.</li><li>Merging per-shard top-10 lists is correct because the global top 10 must be among them. Not every query decomposes this neatly: medians, distinct counts and joins across shards need more work.</li><li>The usual answer for cross-shard reporting: keep a separate copy of the data built for it (a warehouse such as ClickHouse or BigQuery, or a search index), fed by change data capture.</li></ul>` },
        { id: "l6-6", why: "Hot keys defeat any hash function. Splitting one is the standard fix, and doing it shows the read-side cost you pay for it.", title: "Spread a hot key",
          body: `<p>A celebrity (user 42) receives 30% of all 'likes'. Each like increments a counter row on the shard that owns its key.</p>${H.code(`docker compose run --rm tools python hotkey.py --mode plain
docker compose run --rm tools python hotkey.py --mode salted --salt 8
docker compose run --rm tools python hotkey.py --mode salted --salt 32`)}`,
          expect: "Plain: one shard takes nearly half of all writes. Salted with 8 sub-keys: better but still lumpy. Salted with 32: close to even, and reading the total takes 32 lookups.",
          solution: `${H.code(`plain       shard 0 16.0%   shard 1 16.4%   shard 2 49.0%   shard 3 18.6%   read 1 key on 1 shard = 29,916
salt  8     shard 0 27.3%   shard 1 31.4%   shard 2 19.0%   shard 3 22.3%   read 8 keys on 3 shards = 30,135
salt 32     shard 0 21.7%   shard 1 22.9%   shard 2 28.4%   shard 3 27.0%   read 32 keys on 4 shards = 30,135`, [1, 3])}
            <ul><li><b>Plain:</b> every like for user 42 updates one row on one shard. That shard does 49% of all writes, and its row lock serialises them. The number after <code>=</code> is the celebrity's total, read back from the shards.</li><li><b>8 sub-keys</b>: <code>likes:42#0</code> … <code>likes:42#7</code> are hashed independently, and 8 random positions happened to land on only 3 of the 4 shards. Too few sub-keys behave like too few virtual nodes.</li><li><b>32 sub-keys</b>: writes are close to even. The price is on the read side: the celebrity's total is the sum of 32 rows. That is why salting is only applied to keys known to be hot (and the counts are cached).</li></ul>` },
        { id: "l6-7", why: "Every sharded system needs IDs that are unique across shards. Generating them concurrently on several workers proves the scheme works without coordination.", title: "Generate IDs on every shard at once",
          body: `${H.code(`docker compose run --rm tools python ids.py --workers 4 --per-worker 5000
docker compose --profile grow down -v       # finish: removes the shards and their data`)}`,
          expect: "All 20,000 Snowflake IDs are unique and increase over time on each worker. The per-shard auto-increment values collide: only 5,000 distinct values.",
          solution: `${H.code(`20,000 IDs from 4 workers
  snowflake IDs unique:            True  (20,000 distinct)
  per-shard auto-increment unique: False (5,000 distinct)
  each worker's IDs increase over time: True
  decode 2110276562589843456: time 07:48:34 UTC, worker 0, sequence 0`, [2, 3])}
            <ul><li>Each shard's <code>bigserial</code> counted 1, 2, 3… independently, so every value appears four times. Auto-increment IDs only work while there is one database.</li><li>Snowflake IDs are unique because the worker ID is part of every ID, and ordered because the time comes first. No worker ever talked to another.</li><li>The catch: each worker needs a unique worker ID (Twitter assigned them through ZooKeeper), and clocks must not jump backwards. UUIDv7 avoids worker IDs by using random bits instead, at the cost of 128 bits instead of 64.</li></ul>` }
      ]
    }
  });
})();
