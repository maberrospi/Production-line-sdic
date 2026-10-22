/* Level 8 — Async and events */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const txt = (parent, x, y, s, attrs) => { const t = H.svg("text", Object.assign({ x, y, "font-size": 12, fill: "var(--ink)" }, attrs || {}), parent); t.textContent = s; return t; };
  const KEYC = ["var(--compute)", "var(--data)", "var(--signal)", "var(--xp)", "var(--ok)", "var(--bad)"];

  /* ---------------- 8.1 Why async: queues and logs ---------------- */
  function burst(root) {
    const p = H.panel(root, "A traffic burst meets your workers", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Sign-ups normally arrive at 40 per second. A marketing email lands and for 15 seconds they arrive at 300 per second. Each sign-up needs a welcome email that takes a worker 50 ms to send (20 per second per worker).</p>
      <div class="controls"><div class="seg" id="bu-m"></div>
      <div class="ctl" style="min-width:200px"><label for="bu-w">Workers <output id="bu-wo"></output></label><input type="range" id="bu-w" min="1" max="16" value="4"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="bu-b"> Bound the queue at 1,500</label></div>
      <div class="svgwrap" id="bu-svg"></div><div class="readout" id="bu-r"></div><div class="callout" id="bu-v"></div>`;
    let mode = "queue";
    function run() {
      const w = +p.querySelector("#bu-w").value, cap = w * 20, bounded = p.querySelector("#bu-b").checked;
      p.querySelector("#bu-wo").textContent = `${w} (${cap}/s)`;
      const T = 120, arr = [], done = [], depth = [];
      let q = 0, failed = 0, rejected = 0, maxQ = 0, maxWait = 0, drained = 0;
      for (let t = 0; t < T; t++) {
        const a = t >= 20 && t < 35 ? 300 : 40; arr.push(a);
        if (mode === "sync") { const ok = Math.min(a, cap); failed += a - ok; done.push(ok); depth.push(0); continue; }
        let inq = a; if (bounded && q + inq > 1500) { rejected += q + inq - 1500; inq = 1500 - q; }
        q += inq; const d = Math.min(q, cap); q -= d; done.push(d); depth.push(q);
        maxQ = Math.max(maxQ, q); maxWait = Math.max(maxWait, q / cap); if (q > 0) drained = t + 1;
      }
      const W = 680, Hh = 220, x = t => 46 + t / T * (W - 70), yR = v => Hh - 30 - v / 320 * (Hh - 50), yQ = v => Hh - 30 - v / Math.max(1600, maxQ * 1.2) * (Hh - 50);
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Arrivals, completions and queue depth over two minutes" });
      [0, 100, 200, 300].forEach(v => { H.svg("line", { x1: 46, x2: W - 24, y1: yR(v), y2: yR(v), stroke: "var(--line)" }, s); txt(s, 40, yR(v) + 4, v, { "text-anchor": "end", "font-size": 10, fill: "var(--muted)" }); });
      txt(s, 46, 14, "per second", { "font-size": 10, fill: "var(--muted)" });
      [0, 30, 60, 90, 120].forEach(t => txt(s, x(t), Hh - 12, t + "s", { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }));
      const path = (vals, f) => vals.map((v, t) => `${t ? "L" : "M"}${x(t).toFixed(1)} ${f(v).toFixed(1)}`).join("");
      if (mode === "queue") { H.svg("path", { d: path(depth, yQ) + `L${x(T - 1)} ${yQ(0)}L${x(0)} ${yQ(0)}Z`, fill: "var(--xp-soft)", stroke: "none" }, s); H.svg("path", { d: path(depth, yQ), fill: "none", stroke: "var(--xp)", "stroke-width": 2 }, s);
        if (maxQ > 0) { const tp = depth.indexOf(Math.max(...depth)); txt(s, x(tp), yQ(maxQ) - 7, `${Math.round(maxQ).toLocaleString()} waiting`, { "text-anchor": "middle", "font-size": 11, fill: "var(--xp)", "font-weight": 600 }); } }
      H.svg("path", { d: path(arr, yR), fill: "none", stroke: "var(--muted)", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, s);
      H.svg("path", { d: path(done, yR), fill: "none", stroke: "var(--ok)", "stroke-width": 2 }, s);
      H.svg("line", { x1: 46, x2: W - 24, y1: yR(cap), y2: yR(cap), stroke: "var(--bad)", "stroke-dasharray": "2 3" }, s);
      txt(s, W - 26, yR(cap) - 4, `capacity ${cap}/s`, { "text-anchor": "end", "font-size": 10, fill: "var(--bad)" });
      const lg = [["var(--muted)", "arriving"], ["var(--ok)", "handled"]].concat(mode === "queue" ? [["var(--xp)", "waiting in queue"]] : []);
      lg.forEach(([c, l], i) => { H.svg("rect", { x: 120 + i * 120, y: 6, width: 10, height: 10, fill: c }, s); txt(s, 134 + i * 120, 15, l, { "font-size": 11 }); });
      const h = p.querySelector("#bu-svg"); h.innerHTML = ""; h.appendChild(s);
      if (mode === "sync") {
        readout(p.querySelector("#bu-r"), [["Sign-ups that got an error", failed.toLocaleString(), failed ? "bad" : "good"], ["Longest wait", "0 s", "good"]]);
        const v = p.querySelector("#bu-v"); v.className = "callout " + (failed ? "bad" : "good");
        v.textContent = failed ? `Doing the work inside the request means anything above ${cap}/s fails right now: ${failed.toLocaleString()} users saw an error. To survive the burst you would need ${Math.ceil(300 / 20)} workers sitting idle the rest of the time.` : "Enough workers to absorb the peak. It works, but most of them idle outside the burst.";
      } else {
        readout(p.querySelector("#bu-r"), [["Sign-ups lost", (rejected).toLocaleString(), rejected ? "warn" : "good"], ["Deepest queue", Math.round(maxQ).toLocaleString()], ["Longest wait for the email", maxWait.toFixed(1) + " s", maxWait > 60 ? "bad" : maxWait > 10 ? "warn" : "good"]]);
        const v = p.querySelector("#bu-v");
        if (cap <= 40) { v.className = "callout bad"; v.textContent = `Average arrivals (40/s) are at or above capacity (${cap}/s), so the queue never drains. A queue absorbs bursts; it cannot fix too little capacity. Add workers.`; }
        else if (maxQ === 0) { v.className = "callout good"; v.textContent = `${w} workers keep up even at the peak, so nothing ever waits. It works, but most of that capacity idles outside the burst.`; }
        else if (rejected) { v.className = "callout warn"; v.textContent = `The bounded queue filled and pushed back: ${rejected.toLocaleString()} sign-ups were refused at the door instead of piling up forever. That is backpressure: the producer finds out immediately (and can retry later) rather than everything slowing down.`; }
        else { v.className = "callout good"; v.textContent = `Every sign-up was accepted instantly; the emails just went out up to ${maxWait.toFixed(1)} s later. The queue turned a burst the workers could not handle into a backlog they had cleared by t = ${drained} s. This is queue-based load leveling.`; }
      }
    }
    seg(p.querySelector("#bu-m"), [["sync", "Do it in the request"], ["queue", "Put it on a queue"]], mode, v => { mode = v; run(); });
    p.querySelector("#bu-w").addEventListener("input", run); p.querySelector("#bu-b").addEventListener("change", run); run();
  }

  function queueVsLog(root) {
    const p = H.panel(root, "A queue or a log?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Eight order events. Two teams want them: Email sends a receipt, Analytics counts revenue. Each team runs its own consumer.</p>
      <div class="controls"><div class="seg" id="ql-m"></div><button class="btn" type="button" id="ql-e">Email reads one</button><button class="btn" type="button" id="ql-a">Analytics reads one</button><button class="btn" type="button" id="ql-r">Analytics replays from the start</button><button class="btn" type="button" id="ql-x">Reset</button></div>
      <div class="svgwrap" id="ql-svg"></div><div class="callout" id="ql-v"></div>`;
    let mode = "queue", st;
    const reset = () => { st = { q: [1, 2, 3, 4, 5, 6, 7, 8], got: { e: [], a: [] }, off: { e: 0, a: 0 }, msg: "" }; draw(); };
    function read(who) {
      if (mode === "queue") { if (!st.q.length) { st.msg = "The queue is empty: every message was taken by someone and deleted."; } else { const m = st.q.shift(); st.got[who].push(m); st.msg = `${who === "e" ? "Email" : "Analytics"} took order ${m}. It is gone from the queue, so the other team will never see it.`; } }
      else { if (st.off[who] >= 8) st.msg = `${who === "e" ? "Email" : "Analytics"} is at the end of the log.`; else { const m = st.off[who] + 1; st.off[who]++; st.got[who].push(m); st.msg = `${who === "e" ? "Email" : "Analytics"} read order ${m} and moved its own offset to ${st.off[who]}. The event stays in the log for everyone else.`; } }
      draw();
    }
    function draw() {
      const W = 680, Hh = 190, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": mode === "queue" ? "A queue with messages being taken" : "A log with two offsets" });
      txt(s, 20, 22, mode === "queue" ? "Queue (messages are deleted once taken)" : "Log (messages stay; each group keeps an offset)", { "font-weight": 600 });
      for (let i = 0; i < 8; i++) {
        const present = mode === "queue" ? st.q.includes(i + 1) : true, x = 20 + i * 58;
        H.svg("rect", { x, y: 40, width: 50, height: 36, rx: 6, fill: present ? "var(--data-soft)" : "transparent", stroke: present ? "var(--data)" : "var(--line)", "stroke-dasharray": present ? "" : "4 3" }, s);
        txt(s, x + 25, 63, present ? "order " + (i + 1) : "", { "text-anchor": "middle", "font-size": 11 });
        if (mode === "log") txt(s, x + 25, 92, "offset " + i, { "text-anchor": "middle", "font-size": 9, fill: "var(--muted)", class: "mono" });
      }
      if (mode === "log") [["e", "Email", "var(--compute)"], ["a", "Analytics", "var(--signal)"]].forEach(([k, n, c]) => { const x = 20 + Math.min(st.off[k], 8) * 58 - 4; H.svg("line", { x1: x, x2: x, y1: 36, y2: 98, stroke: c, "stroke-width": 3 }, s); txt(s, x + 4, k === "e" ? 34 : 110, `${n} offset ${st.off[k]}`, { "font-size": 10, fill: c, "font-weight": 600 }); });
      [["e", "Email has", 135, "var(--compute)"], ["a", "Analytics has", 165, "var(--signal)"]].forEach(([k, n, y, c]) => { txt(s, 20, y, n, { "font-size": 12, fill: c, "font-weight": 600 }); txt(s, 130, y, st.got[k].length ? st.got[k].join(", ") : "nothing yet", { "font-size": 12, class: "mono" }); });
      const h = p.querySelector("#ql-svg"); h.innerHTML = ""; h.appendChild(s);
      p.querySelector("#ql-r").disabled = mode === "queue";
      const v = p.querySelector("#ql-v"); v.className = "callout";
      v.textContent = st.msg || (mode === "queue" ? "Competing consumers: each message goes to exactly one of them. Great for sharing work, wrong for two teams that each need every event." : "Every team gets every event, at its own pace, and can rewind. A new team can start from offset 0 next year and see the full history (as long as retention keeps it).");
    }
    p.querySelector("#ql-e").onclick = () => read("e"); p.querySelector("#ql-a").onclick = () => read("a");
    p.querySelector("#ql-r").onclick = () => { if (mode === "log") { st.off.a = 0; st.got.a = []; st.msg = "Analytics reset its offset to 0. Nothing was deleted, so it can re-read everything: handy after a bug fix that changes how revenue is counted."; draw(); } };
    p.querySelector("#ql-x").onclick = reset;
    seg(p.querySelector("#ql-m"), [["queue", "Queue"], ["log", "Log"]], mode, v => { mode = v; reset(); });
    reset();
  }

  /* ---------------- 8.2 Kafka: partitions, keys, consumer groups ---------------- */
  function kafkaGroups(root) {
    const p = H.panel(root, "Partitions, keys and a consumer group", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Six customers place orders. The key is the customer, so each customer's events always land in the same partition. Change the partitions and the number of consumers in the group.</p>
      <div class="controls"><div class="ctl" style="min-width:180px"><label for="kg-p">Partitions <output id="kg-po"></output></label><input type="range" id="kg-p" min="1" max="6" value="3"></div>
      <div class="ctl" style="min-width:180px"><label for="kg-c">Consumers in the group <output id="kg-co"></output></label><input type="range" id="kg-c" min="1" max="6" value="2"></div>
      <button class="btn" type="button" id="kg-prod">Produce 12 orders</button><button class="btn" type="button" id="kg-cons">Each consumer reads 2</button><button class="btn" type="button" id="kg-kill">Consumer 1 crashes</button></div>
      <div class="svgwrap" id="kg-svg"></div><div class="readout" id="kg-r"></div><div class="callout" id="kg-v"></div>`;
    const hash = k => { let h = 0; for (const ch of "customer-" + k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
    let st, seq = 0, note = "";
    function reset() { const P = +p.querySelector("#kg-p").value; st = { P, parts: Array.from({ length: P }, () => []), committed: Array(P).fill(0), dead: new Set() }; seq = 0; note = "Produce some orders, then let the group read them. Try more consumers than partitions, and crash one."; draw(); }
    function consumers() { const C = +p.querySelector("#kg-c").value; return Array.from({ length: C }, (_, i) => i).filter(i => !st.dead.has(i)); }
    function assignment() { // range assignor: contiguous blocks
      const live = consumers(), a = {}; live.forEach(c => a[c] = []);
      const n = live.length, P = st.P, per = Math.floor(P / n), extra = P % n; let next = 0;
      live.forEach((c, i) => { const k = per + (i < extra ? 1 : 0); for (let j = 0; j < k; j++) a[c].push(next++); });
      return a;
    }
    function produce() { for (let i = 0; i < 12; i++) { const cust = seq % 6; st.parts[hash(cust) % st.P].push({ cust, seq: seq++ }); } note = "Same colour = same customer. Every customer's orders sit in one partition, in the order they were placed."; draw(); }
    function consume() { const a = assignment(); let n = 0; Object.values(a).forEach(ps => { let budget = 2; ps.forEach(pi => { while (budget > 0 && st.committed[pi] < st.parts[pi].length) { st.committed[pi]++; budget--; n++; } }); }); note = n ? `The group processed ${n} orders. Each consumer only reads its own partitions and commits its offset as it goes.` : "Nothing new to read."; draw(); }
    function draw() {
      const C = +p.querySelector("#kg-c").value; p.querySelector("#kg-po").textContent = st.P; p.querySelector("#kg-co").textContent = C;
      const a = assignment(), owner = {}; Object.entries(a).forEach(([c, ps]) => ps.forEach(pi => owner[pi] = +c));
      const rowH = 34, W = 680, Hh = 40 + st.P * rowH + 70, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Topic partitions with messages and consumer assignment" });
      txt(s, 20, 20, "Topic 'orders'", { "font-weight": 600 }); txt(s, 560, 20, "read by", { "font-size": 11, fill: "var(--muted)" });
      for (let pi = 0; pi < st.P; pi++) {
        const y = 32 + pi * rowH; txt(s, 20, y + 20, "P" + pi, { class: "mono", "font-weight": 700 });
        H.svg("rect", { x: 48, y, width: 490, height: 26, rx: 4, fill: "var(--surface)", stroke: "var(--line)" }, s);
        st.parts[pi].slice(-20).forEach((m, k) => { const off = st.parts[pi].length > 20 ? st.parts[pi].length - 20 + k : k, done = off < st.committed[pi]; H.svg("rect", { x: 52 + k * 24, y: y + 3, width: 21, height: 20, rx: 3, fill: KEYC[m.cust], opacity: done ? 0.3 : 1 }, s); });
        const lag = st.parts[pi].length - st.committed[pi];
        const o = owner[pi]; txt(s, 560, y + 18, o === undefined ? "nobody!" : "consumer " + (o + 1), { "font-size": 12, fill: o === undefined ? "var(--bad)" : "var(--ink)", "font-weight": 600 });
        txt(s, 650, y + 18, "lag " + lag, { "font-size": 10, fill: lag ? "var(--xp)" : "var(--muted)", "text-anchor": "middle", class: "mono" });
      }
      const ly = 40 + st.P * rowH + 6;
      for (let k = 0; k < 6; k++) { H.svg("rect", { x: 20 + k * 108, y: ly, width: 12, height: 12, rx: 2, fill: KEYC[k] }, s); txt(s, 36 + k * 108, ly + 10, "customer-" + (k + 1), { "font-size": 11 }); }
      const cy = ly + 34; for (let c = 0; c < C; c++) { const dead = st.dead.has(c), idle = !dead && (!a[c] || !a[c].length), x = 20 + c * 108; H.svg("rect", { x, y: cy - 14, width: 100, height: 24, rx: 12, fill: dead ? "var(--bad-soft)" : idle ? "transparent" : "var(--compute-soft)", stroke: dead ? "var(--bad)" : idle ? "var(--line-strong)" : "var(--compute)", "stroke-dasharray": idle ? "4 3" : "" }, s); txt(s, x + 50, cy + 2, `C${c + 1} ${dead ? "crashed" : idle ? "idle" : "P" + a[c].join(",P")}`, { "text-anchor": "middle", "font-size": 11 }); }
      const h = p.querySelector("#kg-svg"); h.innerHTML = ""; h.appendChild(s);
      const live = consumers(), idleN = live.filter(c => !a[c].length).length, totalLag = st.parts.reduce((t, pp, i) => t + pp.length - st.committed[i], 0);
      readout(p.querySelector("#kg-r"), [["Consumers doing work", `${live.length - idleN} of ${C}`, idleN ? "warn" : "good"], ["Max parallelism", `${st.P} (one per partition)`], ["Total lag", totalLag, totalLag ? "warn" : "good"]]);
      const v = p.querySelector("#kg-v"); v.className = "callout " + (idleN ? "warn" : "");
      v.textContent = (note ? note + " " : "") + (idleN ? `${idleN} consumer${idleN > 1 ? "s are" : " is"} idle: a partition is read by only one consumer in a group, so more consumers than partitions adds nothing. Choose the partition count for the parallelism you will need.` : st.dead.size ? "The crashed consumer's partitions were reassigned to the survivors (a rebalance). They continue from its last committed offset." : "");
    }
    p.querySelector("#kg-p").addEventListener("input", reset);
    p.querySelector("#kg-c").addEventListener("input", () => { st.dead.clear(); note = "The group rebalanced: partitions were redistributed across the new set of consumers."; draw(); });
    p.querySelector("#kg-prod").onclick = produce; p.querySelector("#kg-cons").onclick = consume;
    p.querySelector("#kg-kill").onclick = () => { if (consumers().length > 1) { st.dead.add(consumers()[0]); note = ""; } else note = "It is the only consumer left: if it dies, nothing reads the topic and lag grows until it comes back."; draw(); };
    reset();
  }

  /* ---------------- 8.3 Delivery guarantees, retries, DLQs ---------------- */
  function commitOrder(root) {
    const p = H.panel(root, "Commit the offset before or after the work?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A consumer handles messages 1 to 6. Each one charges a card. It crashes once, at the point you choose, then restarts from the last committed offset.</p>
      <div class="controls"><div class="seg" id="co-m"></div><div class="ctl" style="min-width:230px"><label for="co-c">Crash while handling message <output id="co-co"></output></label><input type="range" id="co-c" min="1" max="6" value="3"></div></div>
      <div class="svgwrap" id="co-svg"></div><div class="readout" id="co-r"></div><div class="callout" id="co-v"></div>`;
    let mode = "after";
    function run() {
      const k = +p.querySelector("#co-c").value; p.querySelector("#co-co").textContent = k;
      const applied = Array(7).fill(0), seen = new Set(); let committed = 0;
      const apply = m => { if (mode === "idem") { if (seen.has(m)) return; seen.add(m); } applied[m]++; };
      // first run: up to the crash
      for (let m = 1; m <= 6; m++) {
        if (mode === "before") { committed = m; if (m === k) break; apply(m); }
        else { apply(m); if (m === k) break; committed = m; }
      }
      for (let m = committed + 1; m <= 6; m++) { apply(m); committed = m; }   // restart
      const W = 680, Hh = 120, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "How many times each message was applied" });
      for (let m = 1; m <= 6; m++) { const x = 30 + (m - 1) * 105, n = applied[m], c = n === 1 ? "var(--ok)" : n === 0 ? "var(--bad)" : "var(--xp)";
        H.svg("rect", { x, y: 20, width: 92, height: 60, rx: 8, fill: n === 1 ? "var(--ok-soft)" : n === 0 ? "var(--bad-soft)" : "var(--xp-soft)", stroke: c, "stroke-width": m === k ? 3 : 1 }, s);
        txt(s, x + 46, 44, "message " + m, { "text-anchor": "middle", "font-size": 12 }); txt(s, x + 46, 66, n === 0 ? "never charged" : n === 1 ? "charged once" : `charged ${n}×`, { "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: c });
        if (m === k) txt(s, x + 46, 100, "crash here", { "text-anchor": "middle", "font-size": 11, fill: "var(--bad)" }); }
      const h = p.querySelector("#co-svg"); h.innerHTML = ""; h.appendChild(s);
      const lost = applied.slice(1).filter(n => n === 0).length, dup = applied.slice(1).filter(n => n > 1).length;
      readout(p.querySelector("#co-r"), [["Lost", lost, lost ? "bad" : "good"], ["Duplicated", dup, dup ? "warn" : "good"], ["Guarantee", mode === "before" ? "at-most-once" : mode === "after" ? "at-least-once" : "effectively once"]]);
      const v = p.querySelector("#co-v"); v.className = "callout " + (lost ? "bad" : dup ? "warn" : "good");
      v.textContent = mode === "before" ? `The offset for message ${k} was saved before the charge ran. After the restart the consumer skips it: that customer was never charged. Nothing is duplicated, but things can silently vanish.` : mode === "after" ? `Message ${k} was charged, then the process died before saving the offset. On restart it is delivered again and charged twice. Nothing is lost, but anything can repeat. This is Kafka's default, and almost every queue's.` : `Same redelivery, but the handler records each message ID in the same database transaction as the charge and skips IDs it has seen. At-least-once delivery plus an idempotent handler: every message takes effect exactly once.`;
    }
    seg(p.querySelector("#co-m"), [["before", "Commit, then work"], ["after", "Work, then commit"], ["idem", "Work, then commit + dedupe"]], mode, v => { mode = v; run(); });
    p.querySelector("#co-c").addEventListener("input", run); run();
  }

  function poison(root) {
    const p = H.panel(root, "One bad message", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Message 4 in a partition has a malformed amount, so the handler throws every time. Messages arrive at 10 per second and the handler can do 15 per second. Watch the first 60 seconds.</p>
      <div class="controls"><div class="seg" id="po-m"></div></div><div class="readout" id="po-r"></div><div class="callout" id="po-v"></div>`;
    let mode = "dlq";
    function run() {
      const arrived = 600, R = {
        forever: [["Processed", "3", "bad"], ["Waiting (message 4 and all after it)", "597", "bad"], ["In the DLQ", "0"]],
        skip: [["Processed", "599", "good"], ["Stuck", "0", "good"], ["Lost without trace", "1", "bad"]],
        dlq: [["Processed", "599", "good"], ["Stuck", "0", "good"], ["In the DLQ, with the error attached", "1", "warn"]]
      }[mode];
      readout(p.querySelector("#po-r"), R);
      const v = p.querySelector("#po-v"); v.className = "callout " + (mode === "dlq" ? "good" : "bad");
      v.textContent = mode === "forever" ? `A partition is processed in order, so the consumer retries message 4 forever and everything behind it waits: ${arrived - 3} orders stuck and lag climbing. One poison message has stopped the pipeline.` : mode === "skip" ? "The pipeline flows, but the bad order disappears. Nobody knows it existed until a customer complains." : "Retry a few times (in case the failure was temporary), then move the message to a dead-letter queue with the error and its original position, and carry on. Alert on DLQ size, fix the bug, then replay the dead letters.";
    }
    seg(p.querySelector("#po-m"), [["forever", "Retry forever"], ["skip", "Log and skip"], ["dlq", "Retry 3×, then dead-letter"]], mode, v => { mode = v; run(); });
    run();
  }

  /* ---------------- 8.4 Dual writes, outbox and CDC ---------------- */
  const DW = {
    dbFirst: { n: "Save, then publish", steps: [["svc", "db", "INSERT order; COMMIT"], ["svc", "bus", "publish OrderPlaced"]] },
    pubFirst: { n: "Publish, then save", steps: [["svc", "bus", "publish OrderPlaced"], ["svc", "db", "INSERT order; COMMIT"]] },
    outbox: { n: "Outbox + CDC", steps: [["svc", "db", "INSERT order + outbox row; COMMIT"], ["cdc", "db", "read the WAL"], ["cdc", "bus", "publish OrderPlaced"]] }
  };
  function dualWrite(root) {
    const p = H.panel(root, "Two writes, one crash", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="dw-m"></div></div><div class="controls"><div class="seg" id="dw-c"></div></div>
      <div class="svgwrap" id="dw-svg"></div><div class="readout" id="dw-r"></div><div class="callout" id="dw-v"></div>`;
    let mode = "dbFirst", crash = "between";
    function draw() {
      const D = DW[mode], cols = { svc: 110, db: 330, cdc: 450, bus: 590 }, W = 680, Hh = 70 + D.steps.length * 46 + 20;
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Sequence of writes with a crash point" });
      const defs = H.svg("defs", {}, s), mk = H.svg("marker", { id: "dw-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.6 }, mk);
      const names = { svc: "Orders service", db: "Postgres", cdc: "Debezium", bus: "Kafka" };
      Object.entries(cols).forEach(([k, x]) => { if (k === "cdc" && mode !== "outbox") return; H.svg("rect", { x: x - 58, y: 8, width: 116, height: 30, rx: 8, fill: "var(--surface)", stroke: "var(--line-strong)" }, s); txt(s, x, 28, names[k], { "text-anchor": "middle", "font-weight": 600 }); H.svg("line", { x1: x, x2: x, y1: 38, y2: Hh - 6, stroke: "var(--line-strong)", "stroke-dasharray": "4 4" }, s); });
      let saved = false, published = false, dead = false;
      D.steps.forEach(([from, to, label], i) => {
        const y = 66 + i * 46, crashedHere = (crash === "between" && i === 1 && from === "svc") || (crash === "broker" && to === "bus");
        if (dead && from === "svc") { txt(s, (cols[from] + cols[to]) / 2, y, "(never happens)", { "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }); return; }
        if (crash === "between" && i === 1 && from === "svc") { dead = true; H.svg("rect", { x: cols.svc - 50, y: y - 16, width: 100, height: 24, rx: 6, fill: "var(--bad-soft)", stroke: "var(--bad)" }, s); txt(s, cols.svc, y, "process dies", { "text-anchor": "middle", "font-size": 12, fill: "var(--bad)", "font-weight": 700 }); txt(s, (cols.svc + cols[to]) / 2 + 40, y, "(never happens)", { "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }); return; }
        const ok = !(crash === "broker" && to === "bus" && mode !== "outbox");
        const delayed = crash === "broker" && to === "bus" && mode === "outbox";
        H.svg("line", { x1: cols[from], y1: y, x2: cols[to] + (cols[to] > cols[from] ? -6 : 6), y2: y, stroke: ok ? (to === "bus" ? "var(--signal)" : "var(--data)") : "var(--bad)", "stroke-width": 2, "marker-end": "url(#dw-ar)", "stroke-dasharray": ok ? "" : "5 4" }, s);
        txt(s, (cols[from] + cols[to]) / 2, y - 7, label + (!ok ? " ✕ broker down" : delayed ? " (retried until the broker is back)" : ""), { "text-anchor": "middle", "font-size": 11, fill: ok ? "var(--ink)" : "var(--bad)" });
        if (to === "db" && label.includes("COMMIT")) saved = true;
        if (to === "bus" && ok) published = true;
        if (!ok && mode === "pubFirst") dead = true;
      });
      const h = p.querySelector("#dw-svg"); h.innerHTML = ""; h.appendChild(s);
      const consistent = saved === published;
      readout(p.querySelector("#dw-r"), [["Order in the database", saved ? "Yes" : "No", saved ? "" : "warn"], ["Event other services saw", published ? "Yes" : "No", published ? "" : "warn"], ["Do they agree?", consistent ? "Yes" : "No", consistent ? "good" : "bad"]]);
      const v = p.querySelector("#dw-v"); v.className = "callout " + (consistent ? "good" : "bad");
      v.textContent = consistent
        ? (mode === "outbox" ? (crash === "none" ? "The order and its event commit in one local transaction. Debezium reads the committed outbox row from the write-ahead log and publishes it." : "The order and its event were committed together, so whatever dies afterwards, the event is in the WAL and Debezium will publish it once it can (possibly twice after a relay crash, which is why consumers de-duplicate).") : "No failure: both writes happened. The trouble is only that nothing guarantees it.")
        : (saved ? "The order exists but no other service will ever hear about it: no shipment, no receipt, no analytics. Nothing will retry, because nothing knows." : "Other services are told about an order that does not exist. Shipping may pack a parcel for a phantom order.");
    }
    seg(p.querySelector("#dw-m"), Object.entries(DW).map(([k, d]) => [k, d.n]), mode, v => { mode = v; draw(); });
    seg(p.querySelector("#dw-c"), [["none", "No failure"], ["between", "Crash between the two writes"], ["broker", "Kafka is down"]], crash, v => { crash = v; draw(); });
    draw();
  }

  /* ---------------- 8.5 Event sourcing, CQRS, sagas ---------------- */
  function eventSourcing(root) {
    const p = H.panel(root, "Store what happened, derive the rest", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A bank account stored as events. The balance is not stored anywhere: it is computed by replaying events. Drag the slider to see the account at any point in its history.</p>
      <div class="controls"><button class="btn" type="button" id="es-d">Deposit €50</button><button class="btn" type="button" id="es-w">Withdraw €30</button><button class="btn" type="button" id="es-f">Charge a €5 fee</button>
      <div class="ctl" style="min-width:240px"><label for="es-t">Replay up to event <output id="es-to"></output></label><input type="range" id="es-t" min="1" max="4" value="4"></div></div>
      <div id="es-list" style="display:grid;gap:4px;font-size:13px"></div><div class="readout" id="es-r"></div><div class="callout" id="es-v"></div>`;
    const ev = [["AccountOpened", 0], ["Deposited", 100], ["Withdrew", -30], ["Deposited", 50]];
    function draw(toEnd) {
      const t = p.querySelector("#es-t"); t.max = ev.length; if (toEnd) t.value = ev.length; const n = +t.value; p.querySelector("#es-to").textContent = n;
      const list = p.querySelector("#es-list"); list.innerHTML = "";
      ev.forEach(([type, amt], i) => { const row = H.el(`<div class="mono" style="display:flex;gap:10px;padding:5px 10px;border-radius:6px;border:1px solid var(--line);${i < n ? "background:var(--data-soft)" : "opacity:.45"}"><span style="width:28px;color:var(--muted)">#${i + 1}</span><span style="flex:1"></span><span></span></div>`); row.children[1].textContent = type; row.children[2].textContent = amt ? (amt > 0 ? "+€" + amt : "−€" + -amt) : ""; list.appendChild(row); });
      const bal = ev.slice(0, n).reduce((b, e) => b + e[1], 0), deps = ev.slice(0, n).filter(e => e[0] === "Deposited").reduce((b, e) => b + e[1], 0), fees = ev.slice(0, n).filter(e => e[0] === "FeeCharged").reduce((b, e) => b - e[1], 0);
      readout(p.querySelector("#es-r"), [["Balance after event " + n, "€" + bal, bal < 0 ? "bad" : ""], ["Read model: total deposited", "€" + deps], ["Read model: fees paid", "€" + fees]]);
      p.querySelector("#es-v").className = "callout"; p.querySelector("#es-v").textContent = n < ev.length ? `This is the account as it was after event ${n}: a 'temporal query' you get for free. A table holding only the current balance could never answer it.` : "The two read models (total deposited, fees paid) are projections: separate views built from the same events, each shaped for one question. Writing events and reading projections is CQRS (Command Query Responsibility Segregation).";
    }
    p.querySelector("#es-d").onclick = () => { ev.push(["Deposited", 50]); draw(true); };
    p.querySelector("#es-w").onclick = () => { ev.push(["Withdrew", -30]); draw(true); };
    p.querySelector("#es-f").onclick = () => { ev.push(["FeeCharged", -5]); draw(true); };
    p.querySelector("#es-t").addEventListener("input", () => draw(false)); draw(true);
  }

  const SAGA = [["Create order (pending)", "Cancel order"], ["Reserve stock", "Release stock"], ["Charge card", "Refund card"], ["Book courier", "Cancel booking"]];
  function saga(root) {
    const p = H.panel(root, "A saga: four services, no shared transaction", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Placing an order touches four services, each with its own database. There is no transaction across them, so each step commits locally and every step has a compensating action that undoes it.</p>
      <div class="controls"><div class="seg" id="sg-f"></div></div><div class="controls"><div class="seg" id="sg-s"></div></div>
      <div class="svgwrap" id="sg-svg"></div><div class="callout" id="sg-v"></div>`;
    let fail = 3, style = "orch";
    function draw() {
      const W = 680, Hh = 230, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Saga steps and compensations" });
      const x = i => 30 + i * 160;
      if (style === "orch") { H.svg("rect", { x: 240, y: 6, width: 200, height: 28, rx: 8, fill: "var(--xp-soft)", stroke: "var(--xp)" }, s); txt(s, 340, 25, "Order saga orchestrator", { "text-anchor": "middle", "font-weight": 600, "font-size": 12 }); }
      SAGA.forEach(([f, c], i) => {
        const failed = i === fail, ran = fail === -1 || i <= fail, comp = fail !== -1 && i < fail;
        H.svg("rect", { x: x(i), y: 60, width: 140, height: 46, rx: 8, fill: failed ? "var(--bad-soft)" : ran ? "var(--ok-soft)" : "transparent", stroke: failed ? "var(--bad)" : ran ? "var(--ok)" : "var(--line)", "stroke-dasharray": ran ? "" : "4 3" }, s);
        txt(s, x(i) + 70, 80, f, { "text-anchor": "middle", "font-size": 11, "font-weight": 600 }); txt(s, x(i) + 70, 97, failed ? "fails" : ran ? "committed" : "never runs", { "text-anchor": "middle", "font-size": 10, fill: failed ? "var(--bad)" : "var(--muted)" });
        if (style === "orch" && ran) H.svg("line", { x1: 340, y1: 34, x2: x(i) + 70, y2: 60, stroke: "var(--xp)", "stroke-width": 1 }, s);
        if (style === "chor" && i < 3 && ran && !failed) { H.svg("line", { x1: x(i) + 140, y1: 83, x2: x(i + 1), y2: 83, stroke: "var(--signal)", "stroke-width": 2 }, s); txt(s, x(i) + 150, 74, "event", { "text-anchor": "middle", "font-size": 9, fill: "var(--signal)" }); }
        if (comp) { H.svg("rect", { x: x(i), y: 150, width: 140, height: 40, rx: 8, fill: "var(--xp-soft)", stroke: "var(--xp)" }, s); txt(s, x(i) + 70, 174, c, { "text-anchor": "middle", "font-size": 11, "font-weight": 600 }); H.svg("line", { x1: x(i) + 70, y1: 106, x2: x(i) + 70, y2: 150, stroke: "var(--xp)", "stroke-dasharray": "3 3" }, s); txt(s, x(i) + 70, 210, `compensation ${fail - i}`, { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); }
      });
      const h = p.querySelector("#sg-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#sg-v"); v.className = "callout " + (fail === -1 ? "good" : "warn");
      v.textContent = (fail === -1 ? "All four local transactions committed: the order is confirmed." : `'${SAGA[fail][0]}' failed, so the steps that already committed are undone in reverse order: ${SAGA.slice(0, fail).reverse().map(s => s[1].toLowerCase()).join(", then ")}. For a while, other users could see the stock reserved or the card charged: sagas give up isolation.`) + (style === "orch" ? " Orchestration: one component tells each service what to do next and tracks the saga's state, so the flow lives in one place." : " Choreography: each service reacts to the previous one's event. No central coordinator, but the overall flow is spread across services and harder to follow.");
    }
    seg(p.querySelector("#sg-f"), [[-1, "Everything succeeds"], [1, "Stock runs out"], [2, "Card declined"], [3, "No courier available"]], fail, v => { fail = +v; draw(); });
    seg(p.querySelector("#sg-s"), [["orch", "Orchestration"], ["chor", "Choreography"]], style, v => { style = v; draw(); });
    draw();
  }

  Course.register({
    id: 8,
    blurb: "Moving work out of the request: queues that absorb bursts, Kafka's partitioned log, what 'delivered' really guarantees, publishing events without losing them (outbox and CDC), and the patterns built on events.",
    examBadge: "lvl8",
    lessons: [
      { id: "8.1", sources: [["Queue-Based Load Leveling pattern", "https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling", "Azure Architecture Center"], ["The Log: What every software engineer should know about real-time data's unifying abstraction", "https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying", "Jay Kreps, LinkedIn Engineering, 2013"], ["Designing Data-Intensive Applications, chapter 11", "https://dataintensive.net/", "Stream processing: message brokers compared with logs"]],
        title: "Why async: queues and logs", minutes: 20,
        lede: "Some work does not need to finish before you answer the user: sending email, resizing images, updating analytics. Handing it to a queue lets the request return fast and lets workers absorb bursts. But 'queue' covers two different designs.",
        render(r) { burst(r); queueVsLog(r); H.keys(r, [["Load leveling", "A queue turns a burst into a backlog that workers drain at their own pace."], ["A queue cannot fix too little capacity", "If arrivals exceed throughput on average, the backlog grows forever."], ["Backpressure", "Bound the queue so producers are told 'not now' instead of everything slowing down."], ["Queue vs log", "A queue hands each message to one consumer and deletes it. A log keeps messages; every consumer group reads all of them and can replay."]]); H.yourApp(r, "In practice", "Start simple: a jobs table in the Postgres you already run, claimed with FOR UPDATE SKIP LOCKED (lab step 1), comfortably handles hundreds of jobs per second. Reach for a broker when other teams need the same events, or volume outgrows the database."); },
        check: { q: "Traffic averages 100 jobs per second and workers handle 80 per second. What will a queue do?", opts: ["Absorb it indefinitely, because that is what queues are for", "Grow without limit, because average arrivals exceed throughput", "Drop the extra 20 jobs per second once it is full by default", "Speed the workers up, because batching from a queue is faster"], a: 1, why: "A queue smooths bursts around an average you can handle. It cannot create capacity." } },
      { id: "8.2", sources: [["Apache Kafka introduction", "https://docs.confluent.io/kafka/introduction.html", "Topics, partitions, keys and ordering"], ["Kafka consumer", "https://docs.confluent.io/platform/current/clients/consumer.html", "Consumer groups, rebalancing, offsets, session timeout"], ["Designing Data-Intensive Applications, chapter 11", "https://dataintensive.net/", "Partitioned logs"]],
        title: "Kafka: partitions, keys and consumer groups", minutes: 25,
        lede: "Kafka is a log split into partitions. Partitions are how it scales, keys are how it keeps order, and consumer groups are how many machines share the reading.",
        render(r) { kafkaGroups(r); H.keys(r, [["Topic → partitions", "Each partition is an ordered, append-only log on disk. Messages get an offset: their position."], ["Key → partition", "hash(key) mod partitions. Same key, same partition, so one customer's events stay in order. There is no order across partitions."], ["Consumer group", "Partitions are divided among the group's members. One partition, one reader in the group, so partitions cap parallelism."], ["Offsets and lag", "Each group commits the offset it has processed up to. Lag = latest offset − committed offset: the backlog to watch."], ["Rebalance", "When a member joins, leaves or stops heartbeating (45 s by default), partitions are redistributed and processing pauses briefly."]]); },
        check: { q: "A topic has 4 partitions. You run 6 consumers in one group. What happens?", opts: ["Kafka splits the 4 partitions so each consumer gets two-thirds of one", "4 consumers get one partition each; 2 sit idle", "All 6 consumers read every message, since they are in one group", "Kafka adds 2 partitions to the topic so every consumer has one"], a: 1, why: "Within a group, each partition is read by exactly one consumer." } },
      { id: "8.3", sources: [["Kafka message delivery guarantees", "https://docs.confluent.io/kafka/design/delivery-semantics.html", "At-most-once, at-least-once, idempotent producer, transactions"], ["Exactly-once Semantics Are Possible: Here's How Kafka Does It", "https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/", "Neha Narkhede, Confluent, 2017"], ["Amazon SQS dead-letter queues", "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html", "AWS documentation: maxReceiveCount and redrive"]],
        title: "Delivery guarantees, retries and dead letters", minutes: 25,
        lede: "Every consumer does two things: the work, and recording that the work is done. Their order decides whether a crash loses messages or repeats them, and a single bad message can stall everything behind it.",
        render(r) { commitOrder(r); poison(r); H.keys(r, [["Commit, then work", "At-most-once: a crash loses messages."], ["Work, then commit", "At-least-once: a crash repeats messages. The default almost everywhere."], ["Make the handler idempotent", "Store processed message IDs in the same transaction as the effect (Level 7.5). Then repeats are harmless."], ["Kafka's exactly-once", "Covers Kafka-to-Kafka processing (transactions). Once you write to your own database, idempotency is your job."], ["Dead-letter queue", "Retry a few times, then park the message with its error. Alert on it; never let it block the stream."]]); },
        check: { q: "Your consumer writes to Postgres and then commits its Kafka offset. It crashes between the two. What happens next?", opts: ["The message is lost, because the consumer already received it", "The message is delivered again, so the handler must tolerate repeats", "Kafka rolls back the Postgres write, because the offset was not committed", "Nothing: Kafka consumers are exactly-once by default"], a: 1, why: "The offset was not committed, so the message is redelivered. Kafka cannot undo your database write." } },
      { id: "8.4", sources: [["Pattern: Transactional outbox", "https://microservices.io/patterns/data/transactional-outbox.html", "Chris Richardson, microservices.io"], ["Reliable Microservices Data Exchange With the Outbox Pattern", "https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/", "Gunnar Morling, Debezium blog, 2019"], ["Outbox Event Router", "https://debezium.io/documentation/reference/3.6/transformations/outbox-event-router.html", "Debezium 3.6 documentation"], ["Debezium connector for PostgreSQL", "https://debezium.io/documentation/reference/3.6/connectors/postgresql.html", "Logical decoding, replication slots, pgoutput"]],
        title: "Dual writes, the outbox and change data capture", minutes: 25,
        lede: "A service saves an order and publishes 'OrderPlaced'. Two systems, no shared transaction: whichever order you do them in, a crash in between leaves them disagreeing. The outbox pattern turns two writes into one.",
        render(r) { dualWrite(r); H.keys(r, [["The dual-write problem", "Writing to a database and a broker cannot be atomic, so a crash between them loses or invents events."], ["Outbox", "Insert the event into an outbox table in the same transaction as the business change. One write, all or nothing."], ["Change data capture (CDC)", "Debezium reads committed changes from Postgres's write-ahead log through a replication slot and publishes them. No polling, no extra load on queries."], ["Still at-least-once", "A relay crash can republish events, so consumers de-duplicate by event ID."], ["Watch the slot", "A replication slot holds WAL until it is read. If the connector is down for days, the disk fills."]]); },
        check: { q: "Why does the outbox pattern avoid the dual-write problem?", opts: ["Kafka joins the database transaction, so both writes commit together", "Order and event commit in one local transaction; the event is sent after", "The request retries the publish until Kafka accepts it, so none is lost", "It uses two-phase commit between Postgres and the Kafka broker"], a: 1, why: "Only one system is written to atomically. The relay publishes from what was committed, so nothing is lost, at worst repeated." } },
      { id: "8.5", sources: [["Event Sourcing", "https://martinfowler.com/eaaDev/EventSourcing.html", "Martin Fowler"], ["CQRS", "https://martinfowler.com/bliki/CQRS.html", "Martin Fowler, including when not to use it"], ["Sagas", "https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf", "Garcia-Molina and Salem, ACM SIGMOD 1987"], ["Pattern: Saga", "https://microservices.io/patterns/data/saga.html", "Chris Richardson: orchestration and choreography"]],
        title: "Event sourcing, CQRS and sagas", minutes: 25,
        lede: "Three patterns built on events. Each solves a real problem and each adds real complexity, so the skill is knowing when they pay for themselves.",
        render(r) { eventSourcing(r); saga(r); H.keys(r, [["Event sourcing", "Store every change as an immutable event; current state is a fold over them. Free audit trail and history, at the cost of versioning events forever."], ["CQRS", "Separate models for writing and reading. Fowler: most systems are better off with plain CRUD; apply it to a part, not the whole."], ["Saga", "A sequence of local transactions with compensations, for work spanning services that cannot share a transaction."], ["No isolation", "Mid-saga states are visible to others. Design for it (pending states, semantic locks)."], ["Orchestration vs choreography", "A coordinator that drives the steps vs services reacting to each other's events."]]); },
        check: { q: "A saga's third step fails. What does the saga do?", opts: ["Rolls back every service's database together in one atomic step", "Runs compensating actions for the steps that committed, in reverse", "Retries the whole saga from step one until every step succeeds", "Leaves the committed steps as they are and reports the failure"], a: 1, why: "There is no global transaction, so committed steps are undone semantically by their compensations." } }
    ],
    exam: [
      { q: "Which problem does putting work on a queue solve?", opts: ["Average load above capacity", "Short bursts above capacity", "Slow database queries", "Lost network packets"], a: 1, why: "Queues level bursts; sustained overload still needs more capacity." },
      { q: "Two teams each need every order event. What fits?", opts: ["One queue, with both teams' workers competing for messages", "A log (for example a Kafka topic) with one consumer group per team", "Two databases, each written by the order service", "A nightly job that copies the orders to each team"], a: 1, why: "Each consumer group reads the full log independently, at its own pace." },
      { q: "Why does Kafka give ordering per key but not per topic?", opts: ["It is a known bug in Kafka, fixed in more recent releases", "Each key maps to one partition, and order exists only within a partition", "Kafka sorts the messages in a topic by key rather than by arrival time", "Producers send messages to the brokers in a random order for balance"], a: 1, why: "Partitions are independent logs read in parallel." },
      { q: "Consumer lag on a partition is growing steadily. What does it mean?", opts: ["Messages are being lost before the consumers can read them", "The group is processing that partition slower than messages arrive", "The broker that leads that partition is down", "Someone reset the group's offsets to the beginning"], a: 1, why: "Lag = produced − processed. Growing lag means falling behind." },
      { q: "A consumer commits offsets after processing. What must the processing code tolerate?", opts: ["Messages arriving out of order within one partition", "The same message more than once", "Messages from other topics in the same batch", "Nothing: committing after processing is exactly-once"], a: 1, why: "After a crash, uncommitted messages are redelivered: at-least-once." },
      { q: "One message always throws. Without a dead-letter strategy, what happens to its partition?", opts: ["It continues normally, because Kafka skips messages that fail", "Everything behind it waits while it is retried", "Kafka deletes the message after three failed attempts", "Another consumer takes over the partition and processes it"], a: 1, why: "A partition is processed in order, so a poison message blocks it." },
      { q: "A service commits an order and then crashes before publishing the event. Which pattern prevents this?", opts: ["Retrying the original HTTP request", "A transactional outbox with CDC", "A bigger Kafka cluster", "Caching the event in Redis"], a: 1, why: "The event is committed with the order and published later from the log." },
      { q: "Which is a known drawback of sagas?", opts: ["They need two-phase commit between all the services involved", "Other transactions can see their intermediate states", "They only work when every step uses the same database", "A failed step leaves no way to undo the steps before it"], a: 1, why: "Each step commits locally, so others can see partial progress." }
    ],
    lab: {
      title: "A Postgres job queue, Kafka, and an outbox that never loses events",
      time: "about 5 to 6 hours",
      folder: "level-8-async-events/",
      needs: "Docker Desktop (or Docker Engine) with about 4 GB of memory free; two or three terminal windows",
      intro: `<p>Part A builds a job queue in Postgres three ways and breaks the first two. Part B runs a single Kafka broker: keys and partitions, a consumer group that grows and shrinks, lag, and replay. Part C publishes order events two ways, a naive dual write and an outbox read by Debezium, and Part D consumes them idempotently with a dead-letter topic.</p><p>No ports are published. <code>./psql.sh</code> runs psql in the database container, <code>./kafka.sh &lt;tool&gt;</code> runs Kafka's own command-line tools in the broker, and Python scripts run in a <code>tools</code> container.</p><p class="note">How the solutions were produced: the Postgres and Python parts were run for real. Kafka and Kafka Connect could not run where this lab was written, so the client code was run against a Kafka-protocol test broker and the connector configuration against Debezium 3.6.3's embedded engine. Partition numbers match real Kafka (same hash); CLI output formats come from the Kafka 4.3 source. Treat timings in Part B as approximate.</p>`,
      vmIntro: "Read-only checks for any VM that runs background jobs, a broker, or CDC.",
      vmChecks: [
        ["Are background workers supervised?", "docker ps --format '{{.Names}}\\t{{.Status}}' | grep -iE 'worker|consumer|celery|rq' || systemctl list-units --type=service | grep -iE 'worker|consumer'", "Each worker shows Up (or active) with a restart policy, so a crash restarts it instead of letting the backlog grow silently."],
        ["Is a job or event backlog growing?", "docker compose exec db psql -U postgres -c \"SELECT status, count(*) FROM jobs GROUP BY status\"   # adapt the table and user", "Queued counts that stay flat or shrink over a few minutes. A steadily growing number means workers are falling behind."],
        ["Are replication slots being read?", "docker compose exec db psql -U postgres -c \"SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained FROM pg_replication_slots\"", "Every slot active, with retained WAL small (megabytes). An inactive slot retaining gigabytes will eventually fill the disk: drop it or fix its consumer."],
        ["Is Kafka consumer lag under control?", "docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups", "LAG near zero, or rising and falling with traffic. A lag that only ever increases means a stuck or too-slow consumer."]
      ],
      steps: [
        { id: "l8-1", why: "Most apps need a background job queue long before they need Kafka, and the database you already run can be one. Doing it wrong sends every email four times, so it is worth seeing why the right version works.", title: "A job queue in Postgres, three ways",
          body: `${H.code(`cd level-8-async-events
docker compose up -d db
docker compose build tools
docker compose run --rm tools python jobs.py enqueue --jobs 1000
docker compose run --rm tools python jobs.py work --mode naive --workers 4
docker compose run --rm tools python jobs.py enqueue --jobs 1000
docker compose run --rm tools python jobs.py work --mode lock --workers 4
docker compose run --rm tools python jobs.py enqueue --jobs 1000
docker compose run --rm tools python jobs.py work --mode skip --workers 4`)}<p>Each job "sends an email" (10 ms of work) and records it in <code>job_runs</code>. Open <code>scripts/jobs.py</code> and compare the three queries in <code>claim()</code>.</p>`,
          expect: "naive: about 4,000 emails for 1,000 jobs. lock: no duplicates, but no faster than one worker. skip: no duplicates and about four times the throughput.",
          solution: `${H.code(`mode=naive workers=4: 1,000 jobs finished in 12.4s (81 jobs/s)
emails sent: 3,928   duplicate emails: 2,928

mode=lock workers=4: 1,000 jobs finished in 12.3s (81 jobs/s)
emails sent: 1,000   duplicate emails: 0

mode=skip workers=4: 1,000 jobs finished in 3.3s (299 jobs/s)
emails sent: 1,000   duplicate emails: 0`, [2, 4, 7])}
            <ul><li><b>naive</b> reads the oldest queued job, then marks it. Between those two statements, the other three workers read the same row. All four "send the email", so nearly every job ran four times: 3,928 emails for 1,000 jobs, 2,928 of them duplicates.</li><li><b>lock</b> adds <code>FOR UPDATE</code>. Now the other workers wait for the lock, then find the row already done and get nothing. Correct, but they queue behind each other: four workers, one worker's throughput.</li><li><b>skip</b> adds <code>SKIP LOCKED</code>: "give me the first queued row that nobody has locked". Each worker takes a different job instantly. The PostgreSQL docs describe exactly this use: avoiding lock contention "with multiple consumers accessing a queue-like table".</li><li>The lock lasts as long as the worker's transaction. That is what makes the next step work.</li><li>Throughput here is capped by the 10 ms of fake work (at most 100 jobs/s per worker); the queue itself is far from its limit.</li></ul>` },
        { id: "l8-2", why: "Workers crash and some jobs can never succeed. A queue is only trustworthy if a crashed job comes back and a broken one stops being retried.", title: "Crash a worker and feed it poison",
          body: `${H.code(`docker compose run --rm tools python jobs.py enqueue --jobs 1000 --poison 2
docker compose run --rm tools python jobs.py work --mode skip --workers 4 --crash-after 100
./psql.sh -c "SELECT job_id, worker FROM job_runs WHERE job_id = <the job it crashed on>"
./psql.sh -c "SELECT id, status, attempts, last_error FROM jobs WHERE status = 'dead'"`)}<p>Worker 0 dies in the middle of its 100th job (no rollback, like <code>kill -9</code>). Two jobs always throw.</p>`,
          expect: "All 998 good jobs done exactly once, including the one worker 0 was holding, which another worker finished. The two poison jobs end as dead after 3 attempts.",
          solution: `${H.code(`worker 0: crashing in the middle of job 397
mode=skip workers=4: 1,000 jobs finished in 3.9s (257 jobs/s)
jobs: 1,000   done: 998   queued: 0   dead: 2
emails sent: 998   duplicate emails: 0
  dead-lettered job 334 after 3 attempts: malformed address
  dead-lettered job 667 after 3 attempts: malformed address

 job_id | worker
--------+--------
    397 |      1`, [3, 10])}
            <ul><li><b>Crash recovery for free.</b> When worker 0's connection dropped, Postgres rolled back its open transaction: the lock vanished and job 397 was <code>queued</code> again. Another worker picked it up. No "visibility timeout" to tune, unlike SQS.</li><li><b>But at-least-once.</b> If job 397 had really sent an email before the crash, the customer got two. Database work inside the transaction is undone; outside effects are not. Make side effects idempotent (an email provider's idempotency key, a "sent" flag checked first).</li><li><b>Poison jobs.</b> The failure is recorded with a savepoint while the row is still locked, so no other worker grabs it mid-failure. After 3 attempts it becomes <code>dead</code>: a dead-letter state you can alert on and inspect, instead of retrying forever.</li><li>Ready-made libraries do this for you (for example procrastinate for Python, or River and Graphile Worker in other ecosystems), with the same SKIP LOCKED core.</li></ul>` },
        { id: "l8-3", why: "Keys decide which partition a message lands in, and partitions decide ordering and parallelism. Seeing where each key goes makes the rules concrete before you rely on them.", title: "Start Kafka and produce keyed messages",
          body: `${H.code(`docker compose up -d kafka
docker compose ps kafka                                  # wait for (healthy)
./kafka.sh kafka-topics.sh --create --topic orders --partitions 3
./kafka.sh kafka-topics.sh --describe --topic orders
docker compose run --rm tools python produce.py --count 30 --show`)}`,
          expect: "A topic with 3 partitions. Every customer's messages land in exactly one partition, in order. Partition 1 gets three customers and partition 2 only one.",
          solution: `${H.code(`Topic: orders  PartitionCount: 3  ReplicationFactor: 1
  seq   0  customer-1  -> partition 0, offset 0
  seq   1  customer-2  -> partition 2, offset 0
  seq   2  customer-3  -> partition 1, offset 0
  seq   3  customer-4  -> partition 1, offset 1
  seq   4  customer-5  -> partition 0, offset 1
  seq   5  customer-6  -> partition 1, offset 2
  seq   6  customer-1  -> partition 0, offset 2
  ...
  customer-1  -> partition(s) [0]  (5 messages)
  customer-2  -> partition(s) [2]  (5 messages)
  customer-3  -> partition(s) [1]  (5 messages)
  customer-4  -> partition(s) [1]  (5 messages)
  customer-5  -> partition(s) [0]  (5 messages)
  customer-6  -> partition(s) [1]  (5 messages)`, [10, 11, 12])}
            <ul><li><b>Partition = hash(key) mod 3.</b> The script uses the same murmur2 hash as Kafka's Java client, so your partitions will match these exactly.</li><li><b>Offsets are per partition.</b> customer-1 and customer-5 share partition 0 and interleave there; across partitions there is no order at all.</li><li><b>Uneven on purpose.</b> With only six keys, hashing put half the traffic in partition 1. With thousands of keys it evens out; with a few huge keys you get Level 6's hot-partition problem.</li><li>The producer uses <code>acks=all</code> (a write counts only once stored) and <code>enable.idempotence=true</code> (the broker drops duplicates caused by the producer's own retries). Both are defaults in recent Kafka clients; the script sets them so you can see them.</li><li>The <code>--describe</code> output also shows a leader and replicas; with one broker those are all broker 1.</li></ul>` },
        { id: "l8-4", why: "Consumer groups are how Kafka spreads work across machines. Watching partitions move as consumers come and go shows both the scaling limit and the rebalance pause.", title: "Grow and shrink a consumer group",
          body: `<p>Open three terminals in the lab folder.</p>${H.code(`# terminal 1
docker compose run --rm tools python consume.py --group billing --name A
# terminal 2 (after A has printed the 30 messages)
docker compose run --rm tools python consume.py --group billing --name B
# terminal 3
docker compose run --rm tools python consume.py --group billing --name C
# a fourth terminal, or reuse one after Ctrl-C:
docker compose run --rm tools python consume.py --group billing --name D
docker compose run --rm tools python produce.py --count 12
./kafka.sh kafka-consumer-groups.sh --describe --group billing`)}`,
          expect: "A starts with all three partitions and reads the 30 messages. Each new consumer triggers a rebalance that hands it partitions. With four consumers and three partitions, one is idle. The 12 new messages are split by partition owner.",
          solution: `${H.code(`[A] assigned partitions [0, 1, 2]
[A] p0 offset     0  customer-1  seq 0
...
[A] rebalance: giving up [0, 1, 2]
[A] assigned partitions [0, 1]
[B] assigned partitions [2]
...
[A] assigned partitions [0]
[B] assigned partitions [1]
[C] assigned partitions [2]
[D] assigned partitions none (idle)

GROUP   TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG  CONSUMER-ID   HOST  CLIENT-ID
billing orders 0          14              14              0    consumer-A-…  /…    consumer-A
billing orders 1          21              21              0    consumer-B-…  /…    consumer-B
billing orders 2          7               7               0    consumer-C-…  /…    consumer-C`, [11])}
            <ul><li><b>One partition, one reader per group.</b> D has nothing to do. The partition count is the ceiling on parallelism, so pick it for the consumers you will need later (adding partitions afterwards changes which partition each key maps to).</li><li><b>Rebalances pause work.</b> Every join or leave made everyone give up partitions and receive new ones. Here the client uses Kafka's default range-style assignment, which shuffles everything; the cooperative-sticky assignor and Kafka 4's new consumer protocol (KIP-848) move only what must move.</li><li><b>Ctrl-C vs crash.</b> A clean exit leaves the group at once. A crashed consumer holds its partitions until its session times out (45 s by default), and those partitions are not read in the meantime.</li><li><b>The table.</b> CURRENT-OFFSET is what the group has committed; LOG-END-OFFSET is the next offset to be written; LAG is the difference. Offsets 14, 21 and 7 are the 42 messages so far split by partition (exact if you followed the steps; the consumer ID and host columns are trimmed here).</li></ul>` },
        { id: "l8-5", why: "Lag is the number that tells you a consumer is falling behind, and replay is the superpower a log has over a queue. Both are routine operations on a real Kafka deployment.", title: "Build up lag, catch up, then replay",
          body: `${H.code(`# stop all consumers with Ctrl-C first
docker compose run --rm tools python produce.py --count 10000
./kafka.sh kafka-consumer-groups.sh --describe --group billing

# catch up with three consumers (three terminals), then describe again
docker compose run --rm tools python consume.py --group billing --name A --quiet

# stop them all, then rewind the group to the start of the topic
./kafka.sh kafka-consumer-groups.sh --group billing --topic orders --reset-offsets --to-earliest --dry-run
./kafka.sh kafka-consumer-groups.sh --group billing --topic orders --reset-offsets --to-earliest --execute
docker compose run --rm tools python consume.py --group billing --name A --quiet`)}`,
          expect: "With no consumers, LAG is 3,333, 5,000 and 1,667. Consumers bring it to 0. After the reset, the group re-reads all 10,042 messages, because nothing was deleted when they were first read.",
          solution: `${H.code(`Consumer group 'billing' has no active members.
GROUP   TOPIC  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
billing orders 0          14              3347            3333
billing orders 1          21              5021            5000
billing orders 2          7               1674            1667

GROUP   TOPIC  PARTITION  NEW-OFFSET
billing orders 0          0
billing orders 1          0
billing orders 2          0

[A] assigned partitions [0, 1, 2]
[A] processed 4,307 so far
[A] processed 8,687 so far
[A] stopped after 10,042 messages`, [3, 4, 5, 15])}
            <ul><li><b>Lag is the metric.</b> 10,000 messages arrived and nobody read them. In production you alert when lag keeps growing, not when it is merely non-zero.</li><li><b>Partition 1 has the most lag</b> because it holds three of the six customers. A busy key makes a busy partition, and only one consumer can work on it.</li><li><b>Reset requires an inactive group.</b> Try it while a consumer runs and Kafka refuses: "Assignments can only be reset if the group 'billing' is inactive". Use <code>--dry-run</code> first; it prints what would change.</li><li><b>Why replay matters.</b> Fix a bug in a consumer, rewind, and recompute. A new service can read the full history on day one. Both depend on retention (7 days by default), so treat the log as a buffer, not a database, unless you configure it to be one.</li><li>Throughput here is limited by committing after every message. Real consumers commit in batches, which is also why a crash repeats a batch (step 8).</li></ul>` },
        { id: "l8-6", why: "Saving to the database and then publishing is the most natural code to write, and it silently loses events. Measuring the loss makes the case for the outbox better than any diagram.", title: "Lose events with a dual write",
          body: `${H.code(`docker compose up -d --build orders
docker compose run --rm tools python place_orders.py --mode dual --count 500`)}<p>Read <code>orders/main.py</code>: in <code>dual</code> mode it commits the order, then publishes to the <code>orders.dual</code> topic. <code>CRASH_RATE=0.1</code> makes 10% of requests die between the two.</p>`,
          expect: "About 50 orders are saved in Postgres but never appear in Kafka.",
          solution: `${H.code(`mode: dual
  requests: 500   'crashed' after commit: 49
  orders saved in Postgres:  500
  events in 'orders.dual': 451
  orders nobody else heard about: 49`, [5])}
            <ul><li><b>49 customers will never get a shipment or a receipt</b>, and nothing will ever retry, because no part of the system knows the event is missing.</li><li>A 10% crash rate is exaggerated so you can see it; in production it is a deploy restart, an out-of-memory kill or a broker timeout at the wrong moment. Rare per request, certain over millions.</li><li>Swapping the order (publish first) does not help: a crash then announces an order that was never saved.</li><li>Retrying the publish inside the request narrows the window but cannot close it: the process can always die after the commit.</li></ul>` },
        { id: "l8-7", why: "The outbox plus change data capture is the standard fix for dual writes, and Debezium is the most widely used open-source CDC tool. Running it once shows what the moving parts are and what to monitor.", title: "Publish through an outbox with Debezium",
          body: `${H.code(`docker compose up -d connect
docker compose logs -f connect        # wait for "Kafka Connect started", then Ctrl-C
docker compose run --rm tools python register.py
docker compose run --rm tools python place_orders.py --mode outbox --count 500
./kafka.sh kafka-console-consumer.sh --topic outbox.event.order --from-beginning --max-messages 2 \\
  --formatter-property print.key=true
./psql.sh -c "SELECT slot_name, active, confirmed_flush_lsn FROM pg_replication_slots"`)}<p>Read <code>connect/outbox-connector.json</code>: the connector watches only <code>public.outbox</code>, and the <code>EventRouter</code> transform turns each row into a clean event.</p>`,
          expect: "500 orders, 500 events, none missing, even though about 50 requests still 'crashed' after their commit. Each message's key is the order ID and its value is the payload JSON. The replication slot is active.",
          solution: `${H.code(`PUT /connectors/orders-outbox/config -> 201
connector orders-outbox: RUNNING, task 0: RUNNING

mode: outbox
  requests: 500   'crashed' after commit: 50
  orders saved in Postgres:  500
  events in 'outbox.event.order': 500
  orders nobody else heard about: 0

e25b8865-149d-…	{"customer":"customer-0","event_id":"ada00a0b-7fa5-…","order_id":"e25b8865-149d-…","amount_cents":1000}

  slot_name  | active | confirmed_flush_lsn
-------------+--------+---------------------
 outbox_slot | t      | 0/2128500`, [8])}
            <ul><li><b>One write instead of two.</b> The order and its outbox row commit in the same transaction, so a crash afterwards cannot separate them. Debezium publishes from what Postgres committed.</li><li><b>How Debezium reads.</b> It is a logical replication client (Level 5): <code>wal_level=logical</code>, a publication for the outbox table and a replication slot. Postgres keeps WAL until the slot confirms it, so events survive a Debezium restart. That same property is why an abandoned slot fills the disk; it is in the VM checks.</li><li><b>The EventRouter</b> uses the outbox columns: <code>aggregatetype</code> picks the topic (<code>outbox.event.order</code>), <code>aggregateid</code> becomes the key (so one order's events stay in order), <code>payload</code> becomes the value, and the event <code>id</code> goes in a header (add <code>--formatter-property print.headers=true</code> to see it).</li><li><b>Still at-least-once.</b> If Connect crashes before flushing its offsets (every 5 s here), it re-sends the events since the last flush. That is why the next step de-duplicates.</li><li><b>Housekeeping.</b> The rows stay here so you can inspect them. Debezium's documentation suggests deleting each outbox row in the same transaction right after inserting it: the insert is already in the WAL, and the router ignores deletes.</li><li>The connector's state, if it is not RUNNING, is explained in <code>docker compose logs connect</code>. Your LSN and IDs will differ.</li></ul>` },
        { id: "l8-8", why: "Every consumer of an at-least-once stream must cope with repeats and with messages it cannot process. This is the code that makes the outbox safe end to end.", title: "An idempotent consumer with a dead-letter topic",
          body: `${H.code(`docker compose run --rm tools python place_orders.py --mode outbox --count 100 --poison 3

# 1. trusting consumer: crash mid-batch, then restart
docker compose run --rm tools python shipping.py --group naive --no-dedupe --crash-after 250 --commit-every 100
docker compose run --rm tools python shipping.py --group naive --no-dedupe

# 2. idempotent consumer: same crash, fresh tables
./psql.sh -c "TRUNCATE shipments, processed_events"
docker compose run --rm tools python shipping.py --crash-after 250 --commit-every 100
docker compose run --rm tools python shipping.py

./kafka.sh kafka-console-consumer.sh --topic outbox.event.order.DLQ --from-beginning --timeout-ms 5000 \\
  --formatter-property print.headers=true`)}<p>The second restart can take up to 45 seconds to receive partitions: the crashed member must time out of the group first.</p>`,
          expect: "Without de-duplication, the 50 events after the last commit are shipped twice. With it, the same 50 are recognised as duplicates and skipped. In both runs the 3 poison events end up in the dead-letter topic with their error.",
          solution: `${H.code(`# trusting consumer
crashing after 250 events; offsets were last committed at event 200
dead-lettered order 17eec719 after 3 tries: invalid amount -100
this run: {'shipped': 397, 'duplicate': 0, 'dead-lettered': 3}
shipments table: 647 shipments for 597 orders  <- 50 DUPLICATE shipments

# idempotent consumer
crashing after 250 events; offsets were last committed at event 200
this run: {'shipped': 347, 'duplicate': 50, 'dead-lettered': 3}
shipments table: 597 shipments for 597 orders

# dead-letter topic
error:invalid amount -100,source-offset:0:500	{"customer":"customer-0","event_id":"40b60e94-…",…,"amount_cents":-100}
… 6 messages: 3 from each run`, [5, 10])}
            <ul><li><b>Why 50 repeats.</b> Offsets were committed every 100 messages. The crash came at 250, so messages 201 to 250 were processed but not committed, and were delivered again. Committing in batches is normal for throughput; it sets how much repeats after a crash.</li><li><b>The fix is one INSERT.</b> <code>processed_events</code> has the event ID as its primary key. Claiming it in the same transaction as the shipment means "shipped" and "seen" commit together, so a repeat finds the ID and does nothing (the same idea as Level 7's idempotency keys).</li><li><b>597 orders:</b> the 500 from step 7 plus the 100 just placed, minus 3 poison ones. Your counts will match if you ran the steps in order.</li><li><b>Dead letters keep the evidence.</b> The original bytes plus the error and source offset. You see six because both runs dead-lettered the same three events: a replayed poison message fails again, which is correct. After fixing the cause, a small script can republish them to the main topic. Alert when the DLQ is not empty.</li><li><b>Clean up:</b> <code>docker compose --profile tools down -v</code> removes everything, including the replication slot.</li></ul>` }
      ]
    }
  });
})();
