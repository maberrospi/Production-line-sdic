/* Level 4 — Databases */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /* ---------------- 4.1 Choosing a data model ---------------- */
  const NEEDS = [
    ["rel", "Entities linked to each other that you query together (customers, orders, products)"],
    ["acid", "Changes to several rows that must all succeed or all fail (money, stock)"],
    ["flex", "Records whose fields vary or change often"],
    ["kv", "Simple lookups by a key at very high volume (sessions, carts, feature flags)"],
    ["graph", "Questions that follow many hops of relationships (friends of friends, fraud rings)"],
    ["search", "Free-text search with relevance ranking, typo tolerance and facets"],
    ["ts", "Timestamped metrics or events, appended and aggregated by time window"],
    ["wide", "Enormous write volume spread across many machines or regions, queried by key"],
    ["olap", "Analytical queries scanning billions of rows (dashboards, BI reports)"]
  ];
  const STORES = [
    { n: "Relational", ex: "PostgreSQL, MySQL", fit: { rel: 3, acid: 3, flex: 2, kv: 2, ts: 1, search: 1 }, note: "Joins, constraints, transactions. Postgres's JSONB handles flexible fields, and it has built-in full-text search." },
    { n: "Document", ex: "MongoDB, Couchbase", fit: { flex: 3, kv: 2, rel: 1, acid: 1 }, note: "Self-contained documents with flexible structure. Joins across documents are weaker." },
    { n: "Key-value", ex: "Redis, DynamoDB", fit: { kv: 3, wide: 2 }, note: "Get and put by key, extremely fast. Little else." },
    { n: "Wide-column", ex: "Cassandra, ScyllaDB, Bigtable", fit: { wide: 3, ts: 2, kv: 2 }, note: "Writes spread over many nodes and regions. Queries must be designed around the partition key in advance." },
    { n: "Graph", ex: "Neo4j, Amazon Neptune", fit: { graph: 3, rel: 1 }, note: "Traversing relationships is the primary operation." },
    { n: "Search engine", ex: "Elasticsearch, OpenSearch", fit: { search: 3, olap: 1 }, note: "Inverted indexes for ranking and fuzzy matching. Usually fed from your main database, not the source of truth." },
    { n: "Time-series", ex: "TimescaleDB, InfluxDB, Prometheus", fit: { ts: 3, olap: 1 }, note: "Compression and time-window aggregation for append-heavy data." },
    { n: "Columnar analytics", ex: "ClickHouse, BigQuery, Snowflake", fit: { olap: 3, ts: 2 }, note: "Store each column separately, so scanning a few columns of billions of rows is fast. Poor at single-row updates." }
  ];
  function models(root) {
    const p = H.panel(root, "What does your workload need?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Tick everything that applies to one application.</p><div id="dm-n" style="display:grid;gap:6px"></div><div id="dm-r" style="display:grid;gap:6px;margin-top:14px"></div><div class="callout" id="dm-v"></div>`;
    const sel = new Set(["rel", "acid"]);
    const host = p.querySelector("#dm-n");
    NEEDS.forEach(([k, l]) => { const e = H.el(`<label style="display:flex;gap:8px;align-items:flex-start;font-size:14px"><input type="checkbox" ${sel.has(k) ? "checked" : ""} style="margin-top:4px"> <span></span></label>`); e.querySelector("span").textContent = l; e.querySelector("input").onchange = ev => { ev.target.checked ? sel.add(k) : sel.delete(k); upd(); }; host.appendChild(e); });
    function upd() {
      const scored = STORES.map(s => { let sc = 0, cov = 0; sel.forEach(k => { if (s.fit[k]) { sc += s.fit[k]; cov++; } }); return { s, sc, cov }; }).sort((a, b) => b.sc - a.sc);
      const max = Math.max(1, ...scored.map(x => x.sc));
      p.querySelector("#dm-r").innerHTML = scored.slice(0, 5).map(({ s, sc, cov }) => `<div style="display:grid;grid-template-columns:minmax(0,170px) minmax(0,1fr);gap:10px;align-items:center;font-size:13px"><span><b>${s.n}</b><br><span class="note">${s.ex}</span></span><span><span style="display:block;height:10px;background:var(--line);border-radius:99px;overflow:hidden"><i style="display:block;height:100%;width:${sc / max * 100}%;background:var(--data)"></i></span><span class="note">${cov}/${sel.size} needs · ${esc(s.note)}</span></span></div>`).join("");
      const pg = ["rel", "acid", "flex", "kv"], special = [...sel].filter(k => !pg.includes(k));
      const v = p.querySelector("#dm-v");
      if (!sel.size) { v.className = "callout"; v.textContent = "Tick at least one need."; }
      else if (!special.length) { v.className = "callout good"; v.textContent = "One relational database covers all of this. Postgres in particular handles flexible fields (JSONB) and key lookups at the scale of most products. Start here; a second database is a second thing to run, back up and keep consistent."; }
      else { v.className = "callout warn"; v.textContent = `Keep a relational database as the source of truth, and add a specialised store only for the needs it does badly (${special.map(k => ({ graph: "graph traversal", search: "search", ts: "time-series", wide: "massive distributed writes", olap: "analytics" })[k]).join(", ")}). Feed it from the main database (Level 8 shows how, with change data capture). Using several stores side by side is called polyglot persistence.`; }
    }
    upd();
  }

  /* ---------------- 4.2 How indexes work ---------------- */
  function btree(root) {
    const p = H.panel(root, "Search a B-tree", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="bt-k">Find key <output id="bt-ko"></output></label><input type="range" id="bt-k" min="1" max="96" value="57"></div>
        <div><div class="note" style="margin-bottom:4px">Query</div><div class="seg" id="bt-m"></div></div>
      </div><div class="svgwrap minw" id="bt-svg"></div><div class="readout" id="bt-r"></div>
      <div class="ctl" style="max-width:420px;margin-top:8px"><label for="bt-n">Now scale the table up: rows <output id="bt-no"></output></label><input type="range" id="bt-n" min="3" max="10" value="6"></div>
      <div class="readout" id="bt-s"></div><div class="callout" id="bt-v"></div>`;
    let mode = "eq";
    seg(p.querySelector("#bt-m"), [["eq", "id = key"], ["range", "id BETWEEN key AND key+10"]], mode, v => { mode = v; draw(); });
    const keys = Array.from({ length: 48 }, (_, i) => (i + 1) * 2);
    const leaves = []; for (let i = 0; i < 12; i++) leaves.push(keys.slice(i * 4, i * 4 + 4));
    const inner = [[0, 4], [4, 8], [8, 12]];
    function draw() {
      const k = +p.querySelector("#bt-k").value; p.querySelector("#bt-ko").textContent = k;
      const hi = mode === "range" ? k + 10 : k;
      const li = Math.min(11, Math.max(0, leaves.findIndex(l => l[3] >= k)));
      let lj = li; if (mode === "range") { while (lj < 11 && leaves[lj][3] < hi) lj++; }
      const ii = Math.floor(li / 4);
      const W = 760, s = H.svg("svg", { viewBox: `0 0 ${W} 250`, role: "img", "aria-label": "A three-level B-tree with the search path highlighted" });
      const node = (x, y, w, label, on) => { H.svg("rect", { x, y, width: w, height: 30, rx: 5, fill: on ? "var(--signal-soft)" : "var(--surface)", stroke: on ? "var(--signal)" : "var(--line-strong)", "stroke-width": on ? 2 : 1 }, s); const t = H.svg("text", { x: x + w / 2, y: y + 19, "text-anchor": "middle", "font-size": 11, fill: "var(--ink)", class: "mono" }, s); t.textContent = label; };
      const lw = 56, gap = (W - 20 - lw * 12) / 11, lx = i => 10 + i * (lw + gap);
      const ix = j => { const a = lx(inner[j][0]), b = lx(inner[j][1] - 1) + lw; return (a + b) / 2 - 70; };
      inner.forEach((r, j) => { const mid = ix(j) + 70; for (let i = r[0]; i < r[1]; i++) H.svg("line", { x1: mid, y1: 120, x2: lx(i) + lw / 2, y2: 190, stroke: j === ii && i === li ? "var(--signal)" : "var(--line)", "stroke-width": j === ii && i === li ? 2 : 1 }, s); H.svg("line", { x1: W / 2, y1: 40, x2: mid, y2: 90, stroke: j === ii ? "var(--signal)" : "var(--line)", "stroke-width": j === ii ? 2 : 1 }, s); });
      node(W / 2 - 80, 10, 160, "root: <34 | <66 | ≥66", true);
      inner.forEach((r, j) => node(ix(j), 90, 140, leaves.slice(r[0], r[1]).slice(1).map(l => "<" + l[0]).join(" | "), j === ii));
      leaves.forEach((l, i) => node(lx(i), 190, lw, l[0] + "…" + l[3], i >= li && i <= lj));
      if (mode === "range") for (let i = li; i < lj; i++) H.svg("path", { d: `M${lx(i) + lw} 232 L${lx(i + 1)} 232`, stroke: "var(--signal)", "stroke-width": 2, fill: "none" }, s);
      const t = H.svg("text", { x: 10, y: 246, "font-size": 11, fill: "var(--muted)" }, s); t.textContent = mode === "range" ? "range scans walk sideways along the linked leaf pages" : "every lookup reads one page per level";
      const host = p.querySelector("#bt-svg"); host.innerHTML = ""; host.appendChild(s);
      const pages = 2 + (lj - li + 1);
      readout(p.querySelector("#bt-r"), [["Pages read with the index", pages, "good"], ["Pages read by a full scan", 12, "warn"]]);
      const n = Math.pow(10, +p.querySelector("#bt-n").value); p.querySelector("#bt-no").textContent = n >= 1e9 ? n / 1e9 + " billion" : n >= 1e6 ? n / 1e6 + " million" : n.toLocaleString();
      const depth = Math.max(1, Math.ceil(Math.log(n / 200) / Math.log(300)) + 1), scan = Math.ceil(n / 60);
      readout(p.querySelector("#bt-s"), [["Index depth (≈300 keys per page)", depth + " levels", "good"], ["Index lookup", "~" + (depth + 1) + " page reads", "good"], ["Full table scan (≈60 rows per 8 KB page)", "~" + scan.toLocaleString() + " pages", scan > 10000 ? "bad" : "warn"]]);
      const v = p.querySelector("#bt-v"); v.className = "callout good";
      v.textContent = `Each page holds hundreds of keys, so the tree stays shallow: ${n >= 1e9 ? "a billion" : n.toLocaleString()} rows need only ${depth} levels. An index turns "read every page" into "read a handful". The price: every insert and update must also update each index, and indexes take disk and memory.`;
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", draw)); draw();

    const q = H.panel(root, "Does this index help this query?", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Table <code>orders(id, customer_id, status, created_at, total)</code>. Pick an index and a query.</p>
      <div class="controls" style="align-items:flex-start"><div><div class="note" style="margin-bottom:4px">Index</div><div class="seg" id="ci-i"></div></div></div>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Query</div><div class="seg" id="ci-q"></div></div></div>
      <div id="ci-sql"></div><div class="callout" id="ci-v"></div>`;
    const IDX = { a: [["customer_id"], []], b: [["status", "created_at"], []], c: [["created_at", "status"], []], d: [["customer_id", "created_at"], ["total"]] };
    const IDXL = { a: "(customer_id)", b: "(status, created_at)", c: "(created_at, status)", d: "(customer_id, created_at) INCLUDE (total)" };
    const QS = {
      q1: { sql: "SELECT * FROM orders WHERE customer_id = 42", eq: ["customer_id"], range: null, order: null, cols: ["*"] },
      q2: { sql: "SELECT * FROM orders WHERE status = 'shipped' AND created_at > now() - interval '7 days'", eq: ["status"], range: "created_at", order: null, cols: ["*"] },
      q3: { sql: "SELECT * FROM orders WHERE status = 'shipped'", eq: ["status"], range: null, order: null, cols: ["*"] },
      q4: { sql: "SELECT created_at, total FROM orders WHERE customer_id = 42 ORDER BY created_at DESC LIMIT 10", eq: ["customer_id"], range: null, order: "created_at", cols: ["created_at", "total", "customer_id"] },
      q5: { sql: "SELECT * FROM orders WHERE created_at > now() - interval '1 day'", eq: [], range: "created_at", order: null, cols: ["*"] }
    };
    let ix = "b", qq = "q2";
    function analyse() {
      const [cols, inc] = IDX[ix], Q = QS[qq];
      const access = [], filt = []; let stopped = false, rangeUsed = false;
      cols.forEach(c => {
        if (stopped) { if (Q.eq.includes(c) || Q.range === c) filt.push(c); return; }
        if (Q.eq.includes(c)) access.push(c + " (=)");
        else if (Q.range === c) { access.push(c + " (range)"); rangeUsed = true; stopped = true; }
        else stopped = true;
      });
      const pred = [...Q.eq, Q.range].filter(Boolean);
      const unmatched = pred.filter(c => !cols.includes(c));
      let orderOk = false;
      if (Q.order) { const eqPrefix = cols.findIndex(c => !Q.eq.includes(c)); orderOk = eqPrefix >= 0 && cols[eqPrefix] === Q.order; }
      const all = cols.concat(inc);
      const onlyIdx = !Q.cols.includes("*") && Q.cols.every(c => all.includes(c)) && !unmatched.length;
      q.querySelector("#ci-sql").innerHTML = H.code(`CREATE INDEX ON orders ${IDXL[ix]};\n${Q.sql};`);
      const v = q.querySelector("#ci-v");
      if (!access.length) { v.className = "callout bad"; v.innerHTML = `<b>Not usable to find rows.</b> The query does not constrain the index's first column (<code>${cols[0]}</code>), so there is no starting point in the sorted order. Like a phone book sorted by surname when you only know the first name. Expect a sequential scan.`; return; }
      let msg = `<b>Index used.</b> It narrows the search using ${access.join(", then ")}.`;
      if (filt.length) msg += ` <code>${filt.join(", ")}</code> comes after a range condition, so it can only filter entries within the range, not narrow it further. Put equality columns first and the range column last.`;
      if (unmatched.length) msg += ` <code>${unmatched.join(", ")}</code> is not in the index, so those rows are checked after fetching them from the table.`;
      if (Q.order) msg += orderOk ? " The index is already sorted by <code>created_at</code> within each customer, so ORDER BY … LIMIT 10 reads just 10 entries and stops: no sort step." : " The results still need sorting afterwards.";
      if (onlyIdx) msg += " Every column the query needs is in the index, so Postgres can answer from the index alone (an <b>index-only scan</b>) without visiting the table.";
      v.className = "callout " + (filt.length || unmatched.length ? "warn" : "good"); v.innerHTML = msg;
    }
    seg(q.querySelector("#ci-i"), Object.keys(IDX).map(k => [k, IDXL[k]]), ix, v => { ix = v; analyse(); });
    seg(q.querySelector("#ci-q"), [["q1", "customer = 42"], ["q2", "status + last 7 days"], ["q3", "status only"], ["q4", "customer's latest 10"], ["q5", "last day only"]], qq, v => { qq = v; analyse(); });
    analyse();
  }

  /* ---------------- 4.3 Reading query plans ---------------- */
  function plans(root) {
    const p = H.panel(root, "Explain this query", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Table <code>orders</code>: 5 million rows. Plans are modelled on PostgreSQL 16 <code>EXPLAIN ANALYZE</code> output; real numbers depend on your data, hardware and settings.</p>
      <div class="controls"><div class="seg" id="pl-q"></div></div>
      <div class="controls" id="pl-c"></div>
      <div id="pl-sql"></div><div id="pl-plan"></div><div class="callout" id="pl-v"></div>`;
    let qk = "cust", idx = false, sel = 1;
    function controls() {
      const c = p.querySelector("#pl-c");
      if (qk === "status") c.innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="pl-i" ${idx ? "checked" : ""}> Index on <code>status</code></label><div class="ctl"><label for="pl-s">Share of orders with this status <output id="pl-so"></output></label><input type="range" id="pl-s" min="0" max="7" value="${sel}"></div>`;
      else if (qk === "cust") c.innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="pl-i" ${idx ? "checked" : ""}> Index on <code>customer_id</code></label>`;
      else c.innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="pl-i" ${idx ? "checked" : ""}> Index on <code>orders.customer_id</code></label>`;
      c.querySelectorAll("input").forEach(i => i.addEventListener("input", () => { idx = c.querySelector("#pl-i").checked; if (c.querySelector("#pl-s")) sel = +c.querySelector("#pl-s").value; draw(); }));
    }
    const SH = [0.001, 0.005, 0.01, 0.03, 0.08, 0.2, 0.5, 0.9];
    function draw() {
      let sql, plan, msg, cls;
      if (qk === "pk") {
        sql = "SELECT * FROM orders WHERE id = 1234567;";
        plan = `Index Scan using orders_pkey on orders  (cost=0.43..8.45 rows=1 width=41) (actual time=0.021..0.022 rows=1 loops=1)
  Index Cond: (id = 1234567)
  Buffers: shared hit=4
Planning Time: 0.08 ms
Execution Time: 0.04 ms`;
        msg = "The primary key always has an index. Four 8 KB pages (three index levels and one table page) and the row is found in microseconds."; cls = "good";
      } else if (qk === "cust") {
        sql = "SELECT * FROM orders WHERE customer_id = 42;";
        plan = idx ? `Bitmap Heap Scan on orders  (cost=4.98..195.6 rows=50 width=41) (actual time=0.04..0.11 rows=48 loops=1)
  Recheck Cond: (customer_id = 42)
  Heap Blocks: exact=48
  Buffers: shared hit=51
  ->  Bitmap Index Scan on orders_customer_id_idx  (cost=0.00..4.97 rows=50 width=0) (actual time=0.03..0.03 rows=48 loops=1)
        Index Cond: (customer_id = 42)
Execution Time: 0.14 ms` : `Gather  (cost=1000.00..71872.5 rows=50 width=41) (actual time=0.9..212.4 rows=48 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Parallel Seq Scan on orders  (cost=0.00..70867.5 rows=21 width=41) (actual time=4.1..205.3 rows=16 loops=3)
        Filter: (customer_id = 42)
        Rows Removed by Filter: 1666651
        Buffers: shared hit=2112 read=37130
Execution Time: 212.5 ms`;
        msg = idx ? "With an index: find the 48 matching entries, collect their table locations into a bitmap, then visit those pages in physical order. 0.14 ms." : "Without an index every one of the 5 million rows is read and 4,999,952 are thrown away (Rows Removed by Filter). Postgres even uses 3 processes in parallel, and it still takes 200 ms. 'Rows Removed by Filter' in the millions is the classic sign of a missing index.";
        cls = idx ? "good" : "bad";
      } else if (qk === "status") {
        const sh = SH[sel], rows = Math.round(5e6 * sh);
        sql = `SELECT * FROM orders WHERE status = 'refunded';   -- ${(sh * 100).toFixed(sh < 0.01 ? 1 : 0)}% of rows`;
        const method = !idx ? "seq" : sh <= 0.01 ? "index" : sh <= 0.2 ? "bitmap" : "seq";
        if (method === "index") plan = `Index Scan using orders_status_idx on orders  (cost=0.43..${(rows * 0.9).toFixed(0)}.0 rows=${rows} width=41) (actual time=0.03..${(rows * 0.0006).toFixed(1)} rows=${rows} loops=1)
  Index Cond: (status = 'refunded')`;
        else if (method === "bitmap") plan = `Bitmap Heap Scan on orders  (rows=${rows}) (actual time=${(rows * 0.00002).toFixed(1)}..${(rows * 0.00028).toFixed(1)} rows=${rows} loops=1)
  Recheck Cond: (status = 'refunded')
  ->  Bitmap Index Scan on orders_status_idx  (rows=${rows})
        Index Cond: (status = 'refunded')`;
        else plan = `Seq Scan on orders  (cost=0.00..101804.0 rows=${rows} width=41) (actual time=0.01..${(380 + rows * 0.00004).toFixed(0)} rows=${rows} loops=1)
  Filter: (status = 'refunded')
  Rows Removed by Filter: ${(5e6 - rows).toLocaleString("en-US").replace(/,/g, "")}`;
        p.querySelector("#pl-so") && (p.querySelector("#pl-so").textContent = (sh * 100).toFixed(sh < 0.01 ? 1 : 0) + "%");
        msg = !idx ? "No index, so a sequential scan is the only option." : method === "index" ? "Very selective: walking the index and fetching each row is cheapest." : method === "bitmap" ? "Moderately selective: Postgres builds a bitmap of matching pages first, then reads them in physical order, so it never visits the same page twice." : "The index exists but is ignored: when a large share of rows match, reading the whole table sequentially is cheaper than jumping between index and table for each row. The planner decides from column statistics (refreshed by ANALYZE). An index on a column with few distinct values rarely helps common values.";
        cls = !idx ? "bad" : method === "seq" ? "warn" : "good";
      } else {
        sql = "SELECT c.name, o.total FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.country = 'CY';";
        plan = idx ? `Nested Loop  (rows=4100) (actual time=0.05..9.8 rows=4093 loops=1)
  ->  Index Scan using customers_country_idx on customers c  (rows=82) (actual rows=81 loops=1)
        Index Cond: (country = 'CY')
  ->  Index Scan using orders_customer_id_idx on orders o  (rows=50) (actual rows=51 loops=81)
        Index Cond: (customer_id = c.id)
Execution Time: 10.2 ms` : `Hash Join  (rows=4100) (actual time=15.3..388.0 rows=4093 loops=1)
  Hash Cond: (o.customer_id = c.id)
  ->  Seq Scan on orders o  (rows=5000000) (actual rows=5000000 loops=1)
  ->  Hash  (rows=82)
        ->  Index Scan using customers_country_idx on customers c  (rows=82) (actual rows=81 loops=1)
              Index Cond: (country = 'CY')
Execution Time: 388.4 ms`;
        msg = idx ? "Nested loop: for each of the 81 Cypriot customers (loops=81), look up their orders through the index. Great when the outer side is small." : "Hash join: load the 81 customers into an in-memory hash table, then stream all 5 million orders past it. Sensible for big joins, wasteful here, because nothing lets Postgres jump to the right orders. Index foreign keys you join on.";
        cls = idx ? "good" : "warn";
      }
      p.querySelector("#pl-sql").innerHTML = H.code(sql);
      p.querySelector("#pl-plan").innerHTML = H.code(plan);
      const v = p.querySelector("#pl-v"); v.className = "callout " + cls; v.textContent = msg;
    }
    seg(p.querySelector("#pl-q"), [["pk", "By primary key"], ["cust", "A customer's orders"], ["status", "Orders by status"], ["join", "Join with customers"]], qk, v => { qk = v; idx = false; controls(); draw(); });
    controls(); draw();
    H.add(root, `<div class="keys">
      <div class="key"><b>Read inside out</b>The most indented node runs first; its output feeds the line above.</div>
      <div class="key"><b>Estimated vs actual rows</b><code>rows=50</code> is the guess, <code>actual … rows=48</code> the truth. Big mismatches mean stale statistics: run <code>ANALYZE</code>.</div>
      <div class="key"><b>loops</b>Times the node ran. Actual time and rows are per loop, so multiply.</div>
      <div class="key"><b>Buffers</b>With <code>EXPLAIN (ANALYZE, BUFFERS)</code>: hit = from memory, read = from disk.</div></div>`);
  }

  /* ---------------- 4.4 Transactions and isolation ---------------- */
  const SCEN = {
    lost: { n: "Lost update", start: "items.stock = 10. Two shoppers buy the last items at once; the app reads the stock, subtracts 1, writes it back.",
      steps: lv => {
        const atomic = lv === "atomic";
        const s = [
          ["T1", atomic ? "BEGIN;" : "BEGIN; SELECT stock FROM items WHERE id = 1;", atomic ? "" : "→ 10"],
          ["T2", atomic ? "BEGIN;" : "BEGIN; SELECT stock FROM items WHERE id = 1;", atomic ? "" : "→ 10"],
          ["T1", atomic ? "UPDATE items SET stock = stock - 1 WHERE id = 1;" : "UPDATE items SET stock = 9 WHERE id = 1;   -- app computed 10 − 1", "row locked by T1"],
          ["T2", atomic ? "UPDATE items SET stock = stock - 1 WHERE id = 1;" : "UPDATE items SET stock = 9 WHERE id = 1;", "waits for T1's row lock…"],
          ["T1", "COMMIT;", "stock = 9"]
        ];
        if (lv === "rc") s.push(["T2", "(continues) UPDATE 1; COMMIT;", "stock = 9 — one sale vanished"]);
        else if (atomic) s.push(["T2", "(continues: re-reads the committed row, computes 9 − 1) UPDATE 1; COMMIT;", "stock = 8 ✓"]);
        else s.push(["T2", "ERROR: could not serialize access due to concurrent update", "T2 rolls back; the app retries: reads 9, writes 8 ✓"]);
        return s;
      },
      out: { rc: ["bad", "Lost update. Both transactions read 10 and wrote 9; T1's sale disappeared. Read Committed (Postgres's default) does not prevent this when the application reads, computes and writes back."], rr: ["good", "Repeatable Read notices that the row changed after T2's snapshot and aborts T2. Correct, but the application must retry on this error."], ser: ["good", "Same as Repeatable Read here: T2 is aborted and must be retried."], atomic: ["good", "The usual fix at Read Committed: let the database do the arithmetic (stock = stock − 1). T2 waits for the row lock, then re-reads the committed value. SELECT … FOR UPDATE, which locks the row when reading it, works too."] } },
    nrr: { n: "Non-repeatable read", start: "accounts.balance = 100. A report reads the balance twice inside one transaction while a payment happens.",
      steps: lv => [["T1", "BEGIN; SELECT balance FROM accounts WHERE id = 7;", "→ 100"], ["T2", "UPDATE accounts SET balance = 50 WHERE id = 7; COMMIT;", "balance = 50"], ["T1", "SELECT balance FROM accounts WHERE id = 7;", lv === "rc" || lv === "atomic" ? "→ 50 (changed!)" : "→ 100 (same snapshot)"], ["T1", "COMMIT;", ""]],
      out: { rc: ["warn", "At Read Committed every statement sees the latest committed data, so two reads in one transaction can disagree. A report summing many rows can produce totals that never existed at any single moment."], atomic: ["warn", "Same as Read Committed: atomic updates do not change what reads see."], rr: ["good", "Repeatable Read gives the whole transaction one snapshot taken at its first query. Reports and backups (pg_dump) use this so their view is consistent."], ser: ["good", "Serializable also reads from one snapshot."] } },
    skew: { n: "Write skew", start: "A hospital rule: at least one doctor must be on call. Alice and Bob are both on call, and both feel ill.",
      steps: lv => {
        const s = [["T1", "BEGIN; SELECT count(*) FROM doctors WHERE on_call;", "→ 2, so Alice may leave"], ["T2", "BEGIN; SELECT count(*) FROM doctors WHERE on_call;", "→ 2, so Bob may leave"], ["T1", "UPDATE doctors SET on_call = false WHERE name = 'Alice';", "different rows: no lock conflict"], ["T2", "UPDATE doctors SET on_call = false WHERE name = 'Bob';", ""], ["T1", "COMMIT;", ""]];
        s.push(lv === "ser" ? ["T2", "COMMIT; → ERROR: could not serialize access due to read/write dependencies among transactions", "retry: count = 1, so Bob stays ✓"] : ["T2", "COMMIT;", "nobody is on call"]);
        return s;
      },
      out: { rc: ["bad", "Write skew: each transaction checked a condition, then wrote a different row, and together they broke the rule. Row locks never conflicted because the two writes touched different rows."], atomic: ["bad", "Atomic updates do not help: the problem is a decision based on a read of other rows."], rr: ["bad", "Repeatable Read (snapshot isolation) still allows write skew: both snapshots said 2. Fixes: SELECT … FOR UPDATE on the rows you base the decision on, a database constraint, or Serializable."], ser: ["good", "Serializable detects that no one-at-a-time order could produce this outcome and aborts one transaction. Its cost: you must retry aborted transactions, and there is some overhead tracking reads."] } },
    dirty: { n: "Dirty read", start: "T2 changes a price but has not committed yet. Can T1 see it?",
      steps: lv => [["T2", "BEGIN; UPDATE products SET price = 1 WHERE id = 3;", "not committed"], ["T1", "SELECT price FROM products WHERE id = 3;", "→ 25 (the committed value)"], ["T2", "ROLLBACK;", "the change never happened"]],
      out: { rc: ["good", "Postgres never shows uncommitted data, at any isolation level (even if you ask for Read Uncommitted, you get Read Committed). Other databases do allow dirty reads at Read Uncommitted."], atomic: ["good", "No dirty reads in Postgres."], rr: ["good", "No dirty reads in Postgres."], ser: ["good", "No dirty reads in Postgres."] } }
  };
  function isolation(root) {
    const p = H.panel(root, "Two transactions, one timeline", "Try it");
    p.innerHTML = `<div class="controls"><div><div class="note" style="margin-bottom:4px">Scenario</div><div class="seg" id="is-s"></div></div></div>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Isolation level (PostgreSQL)</div><div class="seg" id="is-l"></div></div></div>
      <p class="note" id="is-start"></p><div id="is-t" style="overflow-x:auto"></div>
      <div class="controls"><button class="btn" type="button" id="is-p">← Back</button><button class="btn primary" type="button" id="is-n">Next step →</button><button class="btn" type="button" id="is-a">Show all</button></div>
      <div class="callout" id="is-v" hidden></div>`;
    let sc = "lost", lv = "rc", i = 0;
    function draw() {
      const S = SCEN[sc], st = S.steps(lv);
      p.querySelector("#is-start").textContent = S.start;
      p.querySelector("#is-t").innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px"><thead><tr><th style="text-align:left;padding:6px;width:50%">Transaction 1</th><th style="text-align:left;padding:6px">Transaction 2</th></tr></thead><tbody>${st.map((r, k) => { const vis = k <= i; const cell = `<div class="mono" style="font-size:12.5px">${esc(r[1])}</div>${r[2] ? `<div style="font-size:12.5px;color:var(--${/✓/.test(r[2]) ? "ok" : /vanished|nobody|changed/.test(r[2]) ? "bad" : "muted"})">${esc(r[2])}</div>` : ""}`; return `<tr style="opacity:${vis ? 1 : .15};${k === i ? "background:var(--signal-soft)" : ""}"><td style="padding:6px;border-top:1px solid var(--line);vertical-align:top">${r[0] === "T1" ? cell : ""}</td><td style="padding:6px;border-top:1px solid var(--line);vertical-align:top">${r[0] === "T2" ? cell : ""}</td></tr>`; }).join("")}</tbody></table>`;
      p.querySelector("#is-p").disabled = i === 0; p.querySelector("#is-n").disabled = i >= st.length - 1;
      const v = p.querySelector("#is-v"); const o = S.out[lv]; v.hidden = i < st.length - 1; v.className = "callout " + o[0]; v.textContent = o[1];
    }
    seg(p.querySelector("#is-s"), Object.entries(SCEN).map(([k, v]) => [k, v.n]), sc, v => { sc = v; i = 0; draw(); });
    seg(p.querySelector("#is-l"), [["rc", "Read Committed (default)"], ["rr", "Repeatable Read"], ["ser", "Serializable"], ["atomic", "Read Committed + atomic UPDATE"]], lv, v => { lv = v; i = 0; draw(); });
    p.querySelector("#is-n").onclick = () => { i++; draw(); }; p.querySelector("#is-p").onclick = () => { i--; draw(); };
    p.querySelector("#is-a").onclick = () => { i = SCEN[sc].steps(lv).length - 1; draw(); };
    draw();
  }

  /* ---------------- 4.5 Connection pooling ---------------- */
  function pooling(root) {
    const p = H.panel(root, "How many database connections do you really need?", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="cp-a">App instances (containers/pods) <output id="cp-ao"></output></label><input type="range" id="cp-a" min="1" max="40" value="4"></div>
        <div class="ctl"><label for="cp-w">Worker processes per instance <output id="cp-wo"></output></label><input type="range" id="cp-w" min="1" max="16" value="4"></div>
        <div class="ctl"><label for="cp-p">Pool size per worker <output id="cp-po"></output></label><input type="range" id="cp-p" min="1" max="20" value="10"></div>
      </div><div class="controls">
        <div class="ctl"><label for="cp-q">Queries per second (total) <output id="cp-qo"></output></label><input type="range" id="cp-q" min="100" max="20000" step="100" value="2000"></div>
        <div class="ctl"><label for="cp-t">Average time a query holds a connection <output id="cp-to"></output></label><input type="range" id="cp-t" min="1" max="50" value="5"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="cp-b"> Put PgBouncer in transaction pooling mode in front (20 server connections)</label>
      <div class="svgwrap" id="cp-svg" style="margin-top:10px"></div><div class="readout" id="cp-r"></div><div class="callout" id="cp-v"></div>`;
    function upd() {
      const g = id => +p.querySelector(id).value;
      const a = g("#cp-a"), w = g("#cp-w"), ps = g("#cp-p"), qps = g("#cp-q"), t = g("#cp-t"), pgb = p.querySelector("#cp-b").checked;
      p.querySelector("#cp-ao").textContent = a; p.querySelector("#cp-wo").textContent = w; p.querySelector("#cp-po").textContent = ps; p.querySelector("#cp-qo").textContent = qps.toLocaleString(); p.querySelector("#cp-to").textContent = t + " ms";
      const opened = a * w * ps, busy = qps * t / 1000, server = pgb ? 20 : opened, max = 100;
      const W = 720, Hh = 90, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Connections opened versus Postgres limit" });
      const scale = Math.max(opened, max * 1.3, busy * 1.2), X = v => 10 + Math.min(1, v / scale) * (W - 20);
      const bar = (y, v, label, col) => { H.svg("rect", { x: 10, y, width: Math.max(2, X(v) - 10), height: 18, rx: 4, fill: col }, s); const tx = H.svg("text", { x: Math.min(X(v) + 6, W - 200), y: y + 13, "font-size": 11.5, fill: "var(--ink)" }, s); tx.textContent = label; };
      bar(6, opened, `app connections: ${opened}`, "var(--compute)");
      bar(32, server, `connections Postgres must serve: ${server}`, server > max - 3 ? "var(--bad)" : "var(--data)");
      bar(58, busy, `actually busy at any moment: ${busy.toFixed(1)}`, "var(--ok)");
      H.svg("line", { x1: X(max), x2: X(max), y1: 2, y2: 82, stroke: "var(--signal)", "stroke-width": 2, "stroke-dasharray": "5 4" }, s);
      const ml = H.svg("text", { x: X(max) + 4, y: 88, "font-size": 11, fill: "var(--signal)" }, s); ml.textContent = "max_connections = 100";
      const host = p.querySelector("#cp-svg"); host.innerHTML = ""; host.appendChild(s);
      readout(p.querySelector("#cp-r"), [["Busy connections (λ × W)", busy.toFixed(1)], ["Connections Postgres serves", server, server > 97 ? "bad" : "good"], ["Idle share", Math.max(0, Math.round((1 - busy / server) * 100)) + "%"]]);
      const v = p.querySelector("#cp-v");
      if (busy > server) { v.className = "callout bad"; v.textContent = `Queries need ${busy.toFixed(0)} connections at once but only ${server} exist, so queries queue for a connection. Either queries must get faster or the pool larger (if Postgres has the CPU for it).`; }
      else if (server > 97) { v.className = "callout bad"; v.textContent = `${opened} connections exceed Postgres's default limit of 100 (3 of which are reserved for superusers): new connections fail with 'FATAL: sorry, too many clients already'. Yet only about ${busy.toFixed(0)} are busy at once. Each Postgres connection is a separate process with its own memory, so raising max_connections is not free. Shrink per-worker pools or add PgBouncer.`; }
      else if (pgb) { v.className = "callout good"; v.textContent = `Apps keep their ${opened} cheap client connections to PgBouncer, which lends one of 20 real Postgres connections only for the duration of each transaction. Caveat: session state (SET, session advisory locks, LISTEN, temp tables) does not survive between transactions in this mode.`; }
      else { v.className = "callout good"; v.textContent = "Within limits. Size pools from Little's law: busy connections = queries per second × seconds per query, plus headroom. The PostgreSQL wiki suggests that a database server is usually most efficient with roughly (CPU cores × 2) + disks actively running queries."; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd)); upd();
  }

  Course.register({
    id: 4,
    blurb: "Most system design decisions eventually land on the database. Choose the right kind, make queries fast with indexes, keep data correct under concurrency, and stop drowning it in connections.",
    examBadge: "lvl4",
    lessons: [
      { id: "4.1", sources: [["Designing Data-Intensive Applications, chapter 2", "https://dataintensive.net/", "Martin Kleppmann: data models and query languages"], ["Polyglot Persistence", "https://martinfowler.com/bliki/PolyglotPersistence.html", "Martin Fowler"], ["JSON types", "https://www.postgresql.org/docs/16/datatype-json.html", "PostgreSQL 16 documentation"], ["Full text search", "https://www.postgresql.org/docs/16/textsearch.html", "PostgreSQL 16 documentation"]],
        title: "Choosing a data model", minutes: 20,
        lede: "Relational, document, key-value, wide-column, graph, search, time-series, columnar. Each fits some workloads well. Pick what you need and see which fit.",
        render(r) { models(r); H.keys(r, [["Default to relational", "Joins, constraints and transactions solve more problems than they create."], ["One source of truth", "Specialised stores are usually copies fed from it."], ["Shape follows queries", "Key-value and wide-column stores need access patterns decided up front."], ["Every extra database costs", "Backups, monitoring, upgrades and consistency between them."]]); },
        check: { q: "You need full-text product search with typo tolerance and facets, and orders with transactions. A common, sound design is…", opts: ["Store everything in Elasticsearch, which handles both search and transactions", "Postgres as the source of truth, with a search engine fed from it for search", "MongoDB for the orders and Redis's full-text module for the search", "Two independent databases that the app writes to separately on every change"], a: 1, why: "Keep transactional data in a database built for it, and maintain a search index as a derived copy. Writing two stores independently from the app risks them drifting apart (Level 8)." } },
      { id: "4.2", sources: [["Use The Index, Luke", "https://use-the-index-luke.com/", "Markus Winand: SQL indexing for developers"], ["Indexes", "https://www.postgresql.org/docs/16/indexes.html", "PostgreSQL 16 documentation"], ["Designing Data-Intensive Applications, chapter 3", "https://dataintensive.net/", "B-trees and LSM-trees"]],
        title: "How indexes work", minutes: 25,
        lede: "An index is a sorted copy of some columns, organised as a shallow tree. It turns 'read the whole table' into 'read four pages'. Column order decides which queries it can help.",
        render(r) { btree(r); H.keys(r, [["B-trees read, LSM-trees write", "Postgres and MySQL use B-trees. Cassandra and RocksDB use LSM-trees: writes go to memory and are merged to disk later, so writes are cheap and reads may check several files."], ["Equality first, range last", "In a composite index, put columns you compare with = before the one you range over."], ["Leftmost prefix", "An index on (a, b) helps queries on a, or a and b, but not b alone."], ["Indexes cost writes", "Each index is updated on every insert and update. Index what your queries need."]]); },
        check: { q: "Index on (status, created_at). Which query can use it to narrow the search?", opts: ["WHERE created_at > now() - interval '1 day'", "WHERE status = 'shipped' AND created_at > now() - interval '1 day'", "WHERE total > 100 AND created_at > now() - interval '1 day'", "WHERE customer_id = 7 ORDER BY status, created_at"], a: 1, why: "The index is sorted by status first, then created_at within each status. A query must constrain status to have a starting point." } },
      { id: "4.3", sources: [["Using EXPLAIN", "https://www.postgresql.org/docs/16/using-explain.html", "PostgreSQL 16 documentation"], ["Use The Index, Luke: execution plans", "https://use-the-index-luke.com/sql/explain-plan/postgresql/getting-an-execution-plan", "Markus Winand"]],
        title: "Reading query plans", minutes: 25,
        lede: "EXPLAIN ANALYZE shows exactly how Postgres ran a query: which indexes, which join method, how many rows at each step. Learn to read the four plans you will see most.",
        render(r) { plans(r); },
        check: { q: "A plan shows 'Seq Scan on orders … Rows Removed by Filter: 4,999,950' for a query returning 50 rows. What does that usually mean?", opts: ["The table has too many dead rows and needs a VACUUM", "A suitable index on the filtered column is missing", "The server needs more RAM to keep the table cached", "The query is already optimal: 50 rows always cost a full scan"], a: 1, why: "Reading 5 million rows to keep 50 means nothing let Postgres jump to the matching rows. An index on the filter column would." } },
      { id: "4.4", sources: [["Transaction Isolation", "https://www.postgresql.org/docs/16/transaction-iso.html", "PostgreSQL 16 documentation"], ["A Critique of ANSI SQL Isolation Levels", "https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/", "Berenson, Bernstein, Gray et al., 1995"], ["Designing Data-Intensive Applications, chapter 7", "https://dataintensive.net/", "Transactions, weak isolation levels, write skew"]],
        title: "Transactions and isolation", minutes: 30,
        lede: "Transactions promise all-or-nothing changes. Isolation levels decide what concurrent transactions can see of each other. Step through the four classic anomalies at each PostgreSQL level.",
        render(r) { isolation(r); H.keys(r, [["ACID", "Atomic (all or nothing), Consistent (rules hold), Isolated (concurrency control), Durable (survives crashes)."], ["Postgres default: Read Committed", "Each statement sees the latest committed data. Watch out for read-modify-write in application code."], ["Let the database compute", "UPDATE … SET x = x − 1, or SELECT … FOR UPDATE, avoids lost updates."], ["Stronger levels need retries", "Repeatable Read and Serializable abort conflicting transactions; your code must retry them."]]); },
        check: { q: "At Read Committed, two requests each run: SELECT balance; then UPDATE accounts SET balance = <value computed in Python>. What can go wrong?", opts: ["Dirty reads: each request sees the other's uncommitted balance", "A lost update: one change overwrites the other", "A deadlock every time, because both rows are locked in opposite order", "Nothing: Read Committed takes a lock on rows that were SELECTed"], a: 1, why: "Both read the same old value and write back their own result; the first write is lost. Use an atomic UPDATE (balance = balance − x), SELECT … FOR UPDATE, or a stronger level with retries." } },
      { id: "4.5", sources: [["Connections and Authentication: max_connections", "https://www.postgresql.org/docs/16/runtime-config-connection.html", "PostgreSQL 16 documentation"], ["PgBouncer features and pool modes", "https://www.pgbouncer.org/features.html", "PgBouncer documentation"], ["Number Of Database Connections", "https://wiki.postgresql.org/wiki/Number_Of_Database_Connections", "PostgreSQL wiki"]],
        title: "Connection pooling", minutes: 20,
        lede: "Every app worker opening its own pool of connections adds up fast, and Postgres connections are expensive processes. Size pools from the work actually being done.",
        render(r) { pooling(r); H.keys(r, [["Connections ≠ concurrency", "Most connections sit idle. Busy connections = queries/s × time per query."], ["Postgres connections are processes", "Each one costs memory; hundreds of them cost CPU switching between them."], ["Transaction pooling", "PgBouncer shares a few real connections among many clients, one transaction at a time."], ["Scaling out multiplies pools", "10 more app replicas = 10 more pools. Budget connections before autoscaling."]]); },
        check: { q: "20 app replicas × 4 workers × pool size 10 against Postgres with max_connections = 100. What happens as replicas start?", opts: ["Everything works, because idle connections do not count against max_connections", "Connections past the limit fail with 'too many clients', though few queries run", "Postgres raises max_connections automatically as more clients start to connect", "Queries slow down a little as the extra connections queue up inside Postgres"], a: 1, why: "800 potential connections far exceed 100. Reduce per-worker pools or put PgBouncer in front so many clients share a few server connections." } }
    ],
    exam: [
      { q: "When is a document database a better default than Postgres?", opts: ["Whenever the data has relationships between entities, such as users and orders", "When records are self-contained, vary widely in structure and are rarely joined", "When you need multi-row transactions with strong guarantees", "Never: Postgres's JSON columns make document databases unnecessary"], a: 1, why: "Documents shine for self-contained, flexible records. Joins and multi-entity transactions favour relational databases." },
      { q: "Roughly how many page reads does a B-tree lookup need in a table of 100 million rows?", opts: ["1", "3–5", "About 1,000", "About 1.5 million"], a: 1, why: "With hundreds of keys per page, the tree is only 3–4 levels deep." },
      { q: "Index (customer_id, created_at). Query: WHERE customer_id = 7 ORDER BY created_at DESC LIMIT 10. Why is this fast?", opts: ["The table is small enough to stay cached in memory, so any query on it is fast", "The index orders each customer's rows by created_at, so Postgres reads just 10", "LIMIT 10 always lets Postgres stop after ten rows, whatever indexes there are", "Postgres caches the results of repeated queries, so later runs return instantly"], a: 1, why: "The equality prefix plus the index order removes both the search and the sort." },
      { q: "With an index on status, why might Postgres still choose a sequential scan for WHERE status = 'delivered'?", opts: ["The index is probably corrupt and needs to be rebuilt with REINDEX", "70% of rows match, so one pass over the table beats millions of lookups", "Postgres cannot use indexes on text columns for equality comparisons", "Sequential scans are always faster than index scans on modern SSDs"], a: 1, why: "For non-selective conditions, random index-then-table reads cost more than one sequential pass." },
      { q: "In EXPLAIN ANALYZE, a node shows actual rows=51 loops=81. How many rows did it produce in total?", opts: ["51", "81", "About 4,100", "132"], a: 2, why: "Per-loop figures: 51 × 81 ≈ 4,131 rows." },
      { q: "Which PostgreSQL isolation level prevents write skew?", opts: ["Read Committed", "Repeatable Read", "Serializable", "None of them"], a: 2, why: "Repeatable Read is snapshot isolation, which allows write skew. Serializable (SSI) detects it and aborts a transaction." },
      { q: "What does a Repeatable Read transaction in Postgres do when it tries to update a row another transaction updated and committed after its snapshot?", opts: ["Overwrites the other transaction's change, because its snapshot came first", "Fails with 'could not serialize access due to concurrent update' and must be retried", "Waits until the other transaction's snapshot is released, then succeeds", "Re-reads the newer value and applies its update on top of it"], a: 1, why: "It cannot safely apply its update on a snapshot that is out of date, so it aborts." },
      { q: "An endpoint serves 400 queries/s, each holding a connection for 25 ms. Roughly how many connections are busy at once?", opts: ["4", "10", "40", "400"], a: 1, why: "Little's law: 400 × 0.025 = 10." }
    ],
    lab: {
      title: "Make Postgres fast and correct",
      time: "about 6 hours",
      folder: "level-4-databases/",
      needs: "Docker Desktop (or Docker Engine), a terminal",
      intro: `<p>Everything runs inside containers: Postgres 16 with <code>pg_stat_statements</code>, a <code>tools</code> container with Python scripts, and PgBouncer. You will load 2 million orders, make slow queries fast with the right indexes, read plans, reproduce lost updates and write skew with real concurrent transactions, and hit the connection limit.</p><p>No ports are published at all: you reach Postgres with <code>docker compose exec</code>, just as you would on a server. Commands use <code>psql</code> through a small helper: <code>./psql.sh</code>.</p>`,
      vmChecks: [
        ["Find your slowest and most frequent queries", "# 1. is pg_stat_statements loaded and installed?\ndocker compose exec -e PGOPTIONS='-c default_transaction_read_only=on' db psql -U <user> -d <db> \\\n  -c \"SHOW shared_preload_libraries;\" -c \"SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';\"\n# 2. only if both show it: the queries that cost the most time in total\ndocker compose exec -e PGOPTIONS='-c default_transaction_read_only=on' db psql -U <user> -d <db> \\\n  -c \"SELECT round(total_exec_time) AS total_ms, calls, round(mean_exec_time::numeric,1) AS mean_ms, left(query,80) FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;\"", "<code>PGOPTIONS</code> makes the session read-only, so a mistyped command can only fail. If <code>shared_preload_libraries</code> doesn't list <code>pg_stat_statements</code>, or the extension isn't installed, there are no statistics to read yet. Enabling them is a planned change, not part of this check: add <code>shared_preload_libraries=pg_stat_statements</code> to the database's start command (as in this lab's compose file), restart it, run <code>CREATE EXTENSION pg_stat_statements</code> once (for example in a migration), then give it a day of normal traffic. Top entries should have small mean times; anything above ~50 ms that runs often deserves an EXPLAIN."],
        ["Spot tables read by full scans", "docker compose exec db psql -U <user> -d <db> -c \"SELECT relname, seq_scan, seq_tup_read, idx_scan, n_live_tup FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 10;\"", "Large tables (n_live_tup in the hundreds of thousands or more) should show far more idx_scan than seq_scan."],
        ["Connections vs the limit", "docker compose exec db psql -U <user> -d <db> -c \"SHOW max_connections;\" -c \"SELECT state, count(*) FROM pg_stat_activity GROUP BY state;\"", "Total well below max_connections, mostly <code>idle</code>. Many <code>idle in transaction</code> rows mean the app leaves transactions open, which holds locks and blocks vacuum."],
        ["Long-running transactions", "docker compose exec db psql -U <user> -d <db> -c \"SELECT pid, now() - xact_start AS age, state, left(query,60) FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY age DESC LIMIT 5;\"", "Nothing older than a few seconds during normal operation."]
      ],
      steps: [
        { id: "l4-1", why: "Index and planner behaviour only shows up with realistic amounts of data. Two million rows is enough to make bad queries visibly slow on a laptop.", title: "Start and load two million orders",
          body: `${H.code(`cd level-4-databases
docker compose up -d --build
./psql.sh -f /sql/seed.sql          # ~20–60 s
./psql.sh -c "\\dt+"`)}<p>Look at <code>sql/seed.sql</code>: customers, orders (with a realistic status mix), items and doctors.</p>`,
          expect: "Four tables. <code>orders</code> has 2,000,000 rows and takes around 120 MB.",
          solution: `${H.code(`   table   |  rows
-----------+---------
 customers |  100000
 doctors   |       2
 items     |       1
 orders    | 2000000
real    0m23s`)}
            <ul><li>All 2 million rows come from one <code>INSERT … SELECT … FROM generate_series(…)</code>: generating test data inside the database is far faster than inserting rows one by one from a script.</li><li><code>VACUUM ANALYZE</code> at the end refreshes the planner's statistics (how many rows, how values are distributed). Plans in the next steps depend on them.</li><li>The foreign key from orders to customers did <b>not</b> create an index on <code>orders.customer_id</code>. Postgres only indexes primary keys and unique constraints automatically. That is the next step.</li></ul>` },
        { id: "l4-2", why: "Finding a missing index from a plan, and proving the fix, is the single most valuable database skill in day-to-day work.", title: "Make a customer lookup fast",
          body: `${H.code(`./psql.sh -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 4242;"
./psql.sh -c "CREATE INDEX orders_customer_id_idx ON orders (customer_id);"
./psql.sh -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE customer_id = 4242;"`)}`,
          expect: "Before: a (parallel) sequential scan removing about two million rows, tens to hundreds of milliseconds. After: a bitmap or index scan finishing in well under a millisecond.",
          solution: `${H.code(`Gather  (actual time=15.4..100.1 rows=18 loops=1)
  Workers Launched: 2
  Buffers: shared hit=14666 read=2001
  ->  Parallel Seq Scan on orders  (actual time=18.7..83.4 rows=6 loops=3)
        Filter: (customer_id = 4242)
        Rows Removed by Filter: 666661
Execution Time: 100.175 ms

Bitmap Heap Scan on orders  (actual time=0.339..0.415 rows=18 loops=1)
  Recheck Cond: (customer_id = 4242)
  Buffers: shared hit=17 read=4
  ->  Bitmap Index Scan on orders_customer_id_idx  (actual time=0.022..0.022 rows=18 loops=1)
Execution Time: 0.473 ms`, [6, 7, 12])}
            <ul><li><b>Before:</b> three processes (the main one plus 2 parallel workers, <code>loops=3</code>) each scanned a third of the table and threw away 666,661 rows apiece to find 18. About 16,700 pages read.</li><li><b>After:</b> 21 pages and 0.47 ms, roughly 200 times faster. On a busy server the difference is bigger still, because the slow version also pushes other data out of memory.</li><li>Index the foreign keys you join or filter on. It is the most common missing index.</li></ul>` },
        { id: "l4-3", why: "Composite indexes are where most indexing mistakes happen. Comparing column orders on the same query makes the 'equality first, range last' rule concrete.", title: "Get a composite index right",
          body: `<p>A support dashboard counts cancelled orders from the last 30 days. Try both column orders for the same index.</p>${H.code(`Q="SELECT count(*) FROM orders WHERE status = 'cancelled' AND created_at > now() - interval '30 days';"
./psql.sh -c "CREATE INDEX orders_created_status ON orders (created_at, status);"
./psql.sh -c "VACUUM ANALYZE orders;"
./psql.sh -c "EXPLAIN (ANALYZE, BUFFERS) $Q"
./psql.sh -c "DROP INDEX orders_created_status;"
./psql.sh -c "CREATE INDEX orders_status_created ON orders (status, created_at);"
./psql.sh -c "VACUUM ANALYZE orders;"
./psql.sh -c "EXPLAIN (ANALYZE, BUFFERS) $Q"`)}`,
          expect: "Both plans use an index-only scan, but (created_at, status) reads hundreds of pages and (status, created_at) about a dozen, roughly 15–20 times faster.",
          solution: `${H.code(`(created_at, status)
  Index Only Scan using orders_created_status  (actual time=0.055..8.053 rows=1658 loops=1)
    Index Cond: ((created_at > (now() - '30 days')) AND (status = 'cancelled'))
    Buffers: shared hit=1 read=774
  Execution Time: 8.200 ms

(status, created_at)
  Index Only Scan using orders_status_created  (actual time=0.046..0.268 rows=1658 loops=1)
    Index Cond: ((status = 'cancelled') AND (created_at > (now() - '30 days')))
    Buffers: shared hit=1 read=12
  Execution Time: 0.472 ms`, [4, 10])}
            <ul><li><b>(created_at, status)</b>: the range comes first, so Postgres must read every index entry from the last 30 days (about 165,000 orders of all statuses) and check each one's status. 775 pages.</li><li><b>(status, created_at)</b>: equality first. Postgres jumps to the 'cancelled' section, which is sorted by date, and reads only the last 30 days of it. 13 pages.</li><li>Both are <b>index-only scans</b> with <code>Heap Fetches: 0</code>: <code>count(*)</code> needs no table columns, and after VACUUM the visibility map tells Postgres every row is visible, so the table is never touched.</li><li>Rule of thumb from <i>Use The Index, Luke</i>: equality columns first, range column last.</li></ul>` },
        { id: "l4-4", why: "Seeing the planner ignore an index on purpose explains why 'just add an index' does not always work, and why statistics matter.", title: "Watch the planner ignore an index",
          body: `${H.code(`./psql.sh -c "CREATE INDEX orders_status_idx ON orders (status);"
./psql.sh -c "SELECT status, count(*), round(100.0*count(*)/sum(count(*)) over (), 1) AS pct FROM orders GROUP BY status;"
./psql.sh -c "EXPLAIN SELECT * FROM orders WHERE status = 'cancelled';"
./psql.sh -c "EXPLAIN SELECT * FROM orders WHERE status = 'delivered';"`)}`,
          expect: "'cancelled' (about 1% of rows) uses the index (a bitmap scan). 'delivered' (about 70%) uses a sequential scan, even though the index exists.",
          solution: `${H.code(`   status   |  count  | pct
------------+---------+------
 delivered  | 1400212 | 70.0
 shipped    |  399742 | 20.0
 processing |  179940 |  9.0
 cancelled  |   20106 |  1.0

Bitmap Heap Scan on orders  (cost=232.60..18036.69 rows=20667 width=35)
  Recheck Cond: (status = 'cancelled'::text)
  ->  Bitmap Index Scan on orders_status_idx

Seq Scan on orders  (cost=0.00..41667.00 rows=1393600 width=35)
  Filter: (status = 'delivered'::text)`, [8, 12])}
            <ul><li>The planner estimates how many rows each value matches from statistics gathered by ANALYZE (it guessed 20,667 cancelled and 1,393,600 delivered, close to reality).</li><li>For 1% of rows, jumping through the index is cheaper. For 70%, reading the table front to back is cheaper than 1.4 million index-then-table hops, so the index is ignored. That is the right decision, not a bug.</li><li>Takeaway: an index on a low-variety column (status, boolean flags) only helps the rare values. A <i>partial index</i> such as <code>CREATE INDEX ON orders (created_at) WHERE status = 'cancelled'</code> targets exactly those, at a fraction of the size.</li></ul>` },
        { id: "l4-5", why: "The N+1 pattern is the most common performance bug in ORM-based APIs. Measuring it yourself makes it easy to spot in code reviews.", title: "Measure the N+1 problem",
          body: `${H.code(`docker compose run --rm tools python n_plus_one.py`)}<p>Read <code>scripts/n_plus_one.py</code>: the same report built with one query per customer, then with one query in total.</p>`,
          expect: "The N+1 version runs 201 queries; the JOIN version runs 1 and is many times faster, even though the database is on the same machine.",
          solution: `${H.code(`N+1:   201 queries      48.9 ms
JOIN:    1 query         8.9 ms
same results: True   speed-up: 6x`)}
            <ul><li>Each of the 201 queries is fast on its own. The cost is 201 round trips, each with its own parsing, planning and network hop.</li><li>Here the database is on the same machine, so a round trip costs microseconds. Across a real network (0.5–1 ms per round trip) the N+1 version takes 100–200 ms more while the JOIN barely changes: the gap grows with distance and with N.</li><li>In SQLAlchemy, eager loading (<code>selectinload</code>, <code>joinedload</code>) fixes this; <code>raiseload</code> makes accidental lazy loads fail loudly in tests.</li></ul>` },
        { id: "l4-6", why: "Lost updates silently corrupt data under concurrency, and they never appear in single-user testing. Reproducing one, and each fix, shows exactly what each option buys.", title: "Lose updates, then stop losing them",
          body: `<p>20 threads each sell 50 items from a stock of 1,000. The stock should end at 0.</p>${H.code(`docker compose run --rm tools python lost_update.py --mode read-modify-write
docker compose run --rm tools python lost_update.py --mode atomic
docker compose run --rm tools python lost_update.py --mode for-update
docker compose run --rm tools python lost_update.py --mode repeatable-read`)}`,
          expect: "Read-modify-write ends well above 0 (hundreds of sales lost). The other three end at exactly 0; repeatable-read reports how many serialization failures it retried.",
          solution: `${H.code(`read-modify-write   final stock = 929   lost updates: 929   retries:     0   0.9 s
atomic              final stock =   0   lost updates:   0   retries:     0   0.8 s
for-update          final stock =   0   lost updates:   0   retries:     0   2.1 s
repeatable-read     final stock =   0   lost updates:   0   retries: 11615   6.0 s`, [1])}
            <ul><li><b>Read-modify-write lost 929 of 1,000 sales.</b> Threads kept reading the same stock value and writing back the same result. Nothing errored; the data is just wrong. That is why this bug survives testing.</li><li><b>Atomic UPDATE</b> is the fastest correct fix: the database reads and writes the row under one lock.</li><li><b>SELECT … FOR UPDATE</b> locks the row at read time, so other threads wait their turn. Correct, slower, and needed when the logic between read and write is complex.</li><li><b>Repeatable Read</b> is correct too, but every conflict aborts a transaction that must be retried: 11,615 retries for 1,000 sales under this extreme contention. Stronger isolation is not free.</li></ul>` },
        { id: "l4-7", why: "Write skew is the anomaly that snapshot isolation does not prevent, and it hides in business rules. Seeing Serializable catch it shows when the stronger level is worth its cost.", title: "Break a business rule with write skew",
          body: `${H.code(`docker compose run --rm tools python write_skew.py --level "repeatable read"
docker compose run --rm tools python write_skew.py --level serializable`)}`,
          expect: "At Repeatable Read both doctors go off call (0 left). At Serializable one transaction fails with a serialization error and 1 doctor stays on call.",
          solution: `${H.code(`isolation level: repeatable read
  Alice: sees 2 doctors on call
  Bob: sees 2 doctors on call
  Alice: goes off call / Bob: goes off call
  Alice: COMMIT ok
  Bob: COMMIT ok
doctors on call afterwards: 0 []  ->  RULE BROKEN

isolation level: serializable
  ...
  Alice: COMMIT ok
  Bob: ERROR could not serialize access due to read/write dependencies among transactions
  Bob: retrying the whole transaction
  Bob: sees 1 doctors on call
  Bob: stays on call
doctors on call afterwards: 1 ['Bob']  ->  rule held`, [7, 12, 17])}
            <ul><li>At Repeatable Read each transaction sees its own snapshot (2 on call), and they update <i>different</i> rows, so no lock ever conflicts. Snapshot isolation simply does not look for this pattern.</li><li>Serializable tracks what each transaction read. It sees that Bob's decision relied on a row Alice changed, so no one-at-a-time order could produce this result, and it aborts Bob. On retry, Bob sees 1 doctor and stays.</li><li>Without Serializable, protect such rules with <code>SELECT … FOR UPDATE</code> on the rows the decision is based on, or with a constraint the database can check.</li></ul>` },
        { id: "l4-8", why: "Connection limits are a common outage when apps scale out. Hitting the limit on purpose, then fixing it with a pooler, prepares you for that day.", title: "Hit the connection limit, then pool",
          body: `${H.code(`docker compose run --rm tools python connections.py --dsn "postgresql://lab:lab@db:5432/lab" --clients 150
docker compose run --rm tools python connections.py --dsn "postgresql://lab:lab@pgbouncer:6432/lab" --clients 500
./psql.sh -h pgbouncer -p 6432 -d pgbouncer -c "SHOW POOLS;"`)}`,
          expect: "Direct: about 100 clients succeed (fewer if PgBouncer is already holding connections) and the rest fail with 'too many clients already'. Through PgBouncer: all 500 succeed, sharing 20 server connections, taking longer because they queue.",
          solution: `${H.code(`150 clients -> db:5432/lab
  succeeded: 99   failed: 51   took 0.8 s
  51 x FATAL: sorry, too many clients already
500 clients -> pgbouncer:6432/lab
  succeeded: 500   failed: 0   took 13.4 s

 database | user | cl_active | cl_waiting | sv_active | sv_idle | pool_mode
 lab      | lab  |         0 |          0 |         0 |      20 | transaction`, [2, 3, 5])}
            <ul><li><b>Direct:</b> Postgres accepts up to <code>max_connections</code> (100 here; the lab user is a superuser so it may also use the 3 reserved slots). The rest are refused immediately. If PgBouncer is already holding its 20 connections, fewer direct ones succeed.</li><li><b>Through PgBouncer:</b> all 500 clients connect. Only 20 queries run at once and the rest wait their turn (<code>cl_waiting</code> during the run), so it takes 500 × 0.5 s ÷ 20 ≈ 12.5 s. Waiting is far better than failing.</li><li>In production you would also lower each app's own pool, because those clients now cost almost nothing.</li></ul>` }
      ]
    }
  });
})();
