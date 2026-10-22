/* Level 7 — Distributed systems theory */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };

  /* ---------------- 7.1 What goes wrong ---------------- */
  const FAILS = {
    ok: { n: "Everything works", req: "ok", srv: "charged", resp: "ok", client: "200 OK after 40 ms", charged: true },
    reqlost: { n: "Request lost", req: "lost", srv: "never saw it", resp: "none", client: "timeout after 2 s", charged: false },
    crash: { n: "Server crashed first", req: "ok", srv: "crashed before charging", resp: "none", client: "timeout after 2 s", charged: false },
    slow: { n: "Server slow", req: "ok", srv: "charges after 5 s (GC pause, overload)", resp: "late", client: "timeout after 2 s", charged: true },
    resplost: { n: "Response lost", req: "ok", srv: "charged", resp: "lost", client: "timeout after 2 s", charged: true }
  };
  function ambiguity(root) {
    const p = H.panel(root, "From the client's side, every failure looks the same", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="am-s"></div></div><div class="svgwrap" id="am-svg"></div><div class="readout" id="am-r"></div><div class="callout" id="am-v"></div>`;
    let k = "resplost";
    function draw() {
      const F = FAILS[k];
      const s = H.svg("svg", { viewBox: "0 0 680 230", role: "img", "aria-label": "Sequence diagram of a request and response" });
      const defs = H.svg("defs", {}, s); const mk = H.svg("marker", { id: "am-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.6 }, mk);
      [[150, "Client (your API)"], [530, "Payment provider"]].forEach(([x, t]) => { H.svg("rect", { x: x - 85, y: 8, width: 170, height: 34, rx: 8, fill: "var(--surface)", stroke: "var(--line-strong)" }, s); const tt = H.svg("text", { x, y: 30, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); tt.textContent = t; H.svg("line", { x1: x, x2: x, y1: 42, y2: 222, stroke: "var(--line-strong)", "stroke-dasharray": "4 4" }, s); });
      const arrow = (x1, y1, x2, y2, col, cut, label) => {
        const ex = cut ? (x1 + x2) / 2 : x2, ey = cut ? (y1 + y2) / 2 : y2;
        H.svg("line", { x1, y1, x2: ex, y2: ey, stroke: col, "stroke-width": 2, "marker-end": cut ? "" : "url(#am-ar)" }, s);
        if (cut) { const t = H.svg("text", { x: ex, y: ey + 6, "text-anchor": "middle", "font-size": 18, "font-weight": 700, fill: "var(--bad)" }, s); t.textContent = "✕"; }
        const l = H.svg("text", { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8, "text-anchor": "middle", "font-size": 12, fill: col }, s); l.textContent = label;
      };
      arrow(150, 64, 530, 90, "var(--compute)", F.req === "lost", "POST /charge €50");
      const st = H.svg("text", { x: 545, y: 120, "font-size": 12, fill: F.charged ? "var(--bad)" : "var(--muted)" }, s); st.textContent = F.srv;
      if (F.resp === "ok") arrow(530, 140, 150, 166, "var(--ok)", false, "200 charged");
      if (F.resp === "lost") arrow(530, 140, 150, 166, "var(--ok)", true, "200 charged");
      if (F.resp === "late") arrow(530, 196, 150, 216, "var(--muted)", false, "200 charged (too late)");
      if (k !== "ok") { H.svg("rect", { x: 30, y: 178, width: 112, height: 24, rx: 6, fill: "var(--xp-soft)", stroke: "var(--xp)" }, s); const t = H.svg("text", { x: 86, y: 194, "text-anchor": "middle", "font-size": 12, fill: "var(--xp)", "font-weight": 600 }, s); t.textContent = "timeout (2 s)"; }
      const h = p.querySelector("#am-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#am-r"), [["What the client saw", F.client, k === "ok" ? "good" : "warn"], ["Was the card charged?", F.charged ? "Yes" : "No", F.charged && k !== "ok" ? "bad" : "good"]]);
      const v = p.querySelector("#am-v");
      v.className = "callout " + (k === "ok" ? "good" : "warn");
      v.textContent = k === "ok" ? "When it works, you get an answer. Now pick a failure." : "The client sees exactly the same thing in four very different situations: a timeout. In two of them the card was charged, in two it was not, and there is no way to tell which from the client. Retrying blindly risks charging twice; not retrying risks never charging. The fix is to make the operation safe to retry (Lesson 7.5).";
    }
    seg(p.querySelector("#am-s"), Object.entries(FAILS).map(([a, b]) => [a, b.n]), k, v => { k = v; draw(); });
    draw();

    const q = H.panel(root, "Clocks lie a little", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Two servers store a user's display name and resolve conflicts with 'last write wins' using their own clocks. The user changes the name to 'A' on server 1, then 50 ms later to 'B' on server 2.</p>
      <div class="ctl" style="max-width:460px"><label for="ck-o">Server 2's clock is off by <output id="ck-oo"></output></label><input type="range" id="ck-o" min="-200" max="200" step="5" value="0"></div>
      <div class="readout" id="ck-r"></div><div class="callout" id="ck-v"></div>`;
    function ck() {
      const off = +q.querySelector("#ck-o").value; q.querySelector("#ck-oo").textContent = (off > 0 ? "+" : "") + off + " ms";
      const t1 = 1000, t2 = 1050 + off, win = t2 > t1 ? "B" : "A";
      readout(q.querySelector("#ck-r"), [["Write 'A' stamped", t1 + " ms"], ["Write 'B' stamped", t2 + " ms"], ["Final name", "'" + win + "'", win === "B" ? "good" : "bad"]]);
      const v = q.querySelector("#ck-v"); v.className = "callout " + (win === "B" ? "good" : "bad");
      v.textContent = win === "B" ? "The later change won, as it should. But only because the clocks were close enough." : `Server 2's clock is ${-off} ms slow, so the later write carries the earlier timestamp and silently loses. NTP typically keeps servers within a few milliseconds of each other, but it can drift further, jump, or go wrong without anyone noticing. Never rely on wall-clock time alone to order events across machines.`;
    }
    q.querySelector("#ck-o").addEventListener("input", ck); ck();
  }

  /* ---------------- 7.2 CAP and PACELC ---------------- */
  function cap(root) {
    const p = H.panel(root, "Cut the network: consistency or availability?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Three replicas of an account balance. A network partition cuts Virginia off from the other two.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">When partitioned, the system chooses</div><div class="seg" id="cp-m"></div></div><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="cp-cut"> Partition the network</label></div>
      <div class="svgwrap" id="cp-svg"></div>
      <div class="controls"><button class="btn" type="button" id="cp-wf">Withdraw €30 via Frankfurt</button><button class="btn" type="button" id="cp-wv">Withdraw €30 via Virginia</button><button class="btn" type="button" id="cp-rv">Read balance via Virginia</button><button class="btn" type="button" id="cp-reset">Reset</button></div>
      <div id="cp-log" style="display:grid;gap:4px;font-size:14px"></div><div class="callout" id="cp-v"></div>`;
    let mode = "cp", st;
    function reset() { st = { FRA: 100, LON: 100, VIR: 100 }; p.querySelector("#cp-log").innerHTML = ""; draw(); verdict(); }
    function cut() { return p.querySelector("#cp-cut").checked; }
    function log(ok, t) { const l = p.querySelector("#cp-log"); l.prepend(H.el(`<div class="callout ${ok ? "good" : "bad"}" style="margin:0;padding:6px 10px"></div>`)); l.firstChild.textContent = t; while (l.children.length > 5) l.lastChild.remove(); }
    function draw() {
      const s = H.svg("svg", { viewBox: "0 0 680 170", role: "img", "aria-label": "Three replicas, one possibly cut off" });
      const pos = { FRA: [90, 40], LON: [90, 110], VIR: [480, 75] };
      const c = cut();
      H.svg("line", { x1: 250, y1: 60, x2: 480, y2: 90, stroke: c ? "var(--bad)" : "var(--line-strong)", "stroke-width": 2, "stroke-dasharray": c ? "6 6" : "" }, s);
      H.svg("line", { x1: 250, y1: 130, x2: 480, y2: 100, stroke: c ? "var(--bad)" : "var(--line-strong)", "stroke-width": 2, "stroke-dasharray": c ? "6 6" : "" }, s);
      H.svg("line", { x1: 170, y1: 76, x2: 170, y2: 110, stroke: "var(--line-strong)", "stroke-width": 2 }, s);
      if (c) { const t = H.svg("text", { x: 365, y: 70, "text-anchor": "middle", "font-size": 22, fill: "var(--bad)", "font-weight": 700 }, s); t.textContent = "✕"; }
      Object.entries(pos).forEach(([n, [x, y]]) => {
        const diverged = st[n] !== st.FRA || st[n] !== st.VIR;
        H.svg("rect", { x, y, width: 160, height: 36, rx: 8, fill: "var(--surface)", stroke: diverged ? "var(--bad)" : "var(--data)", "stroke-width": 2 }, s);
        const t = H.svg("text", { x: x + 80, y: y + 23, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); t.textContent = `${{ FRA: "Frankfurt", LON: "London", VIR: "Virginia" }[n]}: €${st[n]}`;
      });
      const h = p.querySelector("#cp-svg"); h.innerHTML = ""; h.appendChild(s);
    }
    function withdraw(at) {
      if (!cut()) { st.FRA -= 30; st.LON -= 30; st.VIR -= 30; draw(); return log(true, `Withdrawal via ${at} replicated to all three. Balance €${st.FRA}.`); }
      if (at !== "VIR") { st.FRA -= 30; st.LON -= 30; draw(); return log(true, `Frankfurt and London are a majority (2 of 3), so the write succeeds there. Virginia does not know.`); }
      if (mode === "cp") return log(false, "Virginia cannot reach a majority, so it refuses the write: 'service unavailable, try later'. Consistent, not available.");
      st.VIR -= 30; draw(); log(true, `Virginia accepts the withdrawal on its own. Available, but now the replicas disagree.`);
    }
    function readV() {
      if (cut() && mode === "cp") return log(false, "Virginia cannot confirm it has the latest value, so it refuses the read (or must be told stale reads are fine).");
      log(st.VIR === st.FRA, `Virginia answers €${st.VIR}${st.VIR !== st.FRA ? `, while Frankfurt says €${st.FRA}. A stale or conflicting answer.` : "."}`);
    }
    function verdict() {
      const v = p.querySelector("#cp-v");
      if (!cut()) { v.className = "callout"; v.textContent = "No partition: every replica gets every write. CAP only forces a choice while the network is partitioned."; return; }
      if (mode === "cp") { v.className = "callout good"; v.textContent = "Consistency over availability: the side without a majority stops serving writes (and linearizable reads). Nobody ever sees conflicting balances. etcd, ZooKeeper and Postgres with synchronous replication behave like this."; }
      else { v.className = "callout warn"; v.textContent = "Availability over consistency: every side keeps working, and the replicas diverge. When the partition heals, conflicts must be reconciled (here, two withdrawals might overdraw the account). Dynamo-style stores such as Cassandra lean this way, and many apps accept it for data like shopping carts."; }
    }
    seg(p.querySelector("#cp-m"), [["cp", "Consistency (CP)"], ["ap", "Availability (AP)"]], mode, v => { mode = v; reset(); });
    p.querySelector("#cp-cut").onchange = () => { if (!cut() && (st.VIR !== st.FRA)) log(false, `Partition healed with conflicting balances (Frankfurt €${st.FRA}, Virginia €${st.VIR}). Someone has to decide which is right.`); draw(); verdict(); };
    p.querySelector("#cp-wf").onclick = () => withdraw("FRA"); p.querySelector("#cp-wv").onclick = () => withdraw("VIR"); p.querySelector("#cp-rv").onclick = readV; p.querySelector("#cp-reset").onclick = () => { p.querySelector("#cp-cut").checked = false; reset(); };
    reset();

    const q = H.panel(root, "PACELC: the trade-off when nothing is broken", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Daniel Abadi's extension of CAP: if Partitioned, choose Availability or Consistency; Else (normal operation), choose Latency or Consistency. Replicas in Frankfurt, London and Virginia; the client is in Frankfurt.</p>
      <div class="controls"><div class="seg" id="pc-m"></div></div><div class="readout" id="pc-r"></div><div class="callout" id="pc-v"></div>`;
    let pm = "quorum";
    const PM = { one: ["Ack from the local replica only", 2, "Seconds until replicas catch up", "warn", "Lowest latency; a read elsewhere may be stale. Latency chosen over consistency (the 'EL' in PACELC)."], quorum: ["Ack from a majority (2 of 3)", 14, "None for majority reads", "good", "Frankfurt + London answer fast; Virginia catches up. A common middle ground: consistent, moderately fast."], all: ["Ack from all three", 85, "None", "warn", "Every write waits for Virginia across the Atlantic. Consistent everywhere, slow, and one slow replica slows everything ('EC')."] };
    function pc() { const P = PM[pm]; readout(q.querySelector("#pc-r"), [["Write latency", "~" + P[1] + " ms", P[1] > 50 ? "bad" : P[1] > 10 ? "warn" : "good"], ["Stale reads possible", P[2], P[3]]]); const v = q.querySelector("#pc-v"); v.className = "callout " + P[3]; v.textContent = P[4]; }
    seg(q.querySelector("#pc-m"), Object.entries(PM).map(([k, v]) => [k, v[0]]), pm, v => { pm = v; pc(); });
    pc();
  }

  /* ---------------- 7.3 Consistency models ---------------- */
  const MODELS = ["Linearizable", "Causal", "Read-your-writes", "Monotonic reads", "Eventual"];
  const HIST = {
    good: { n: "Everyone sees the latest", rows: [["Alice", [[0, 3, "write x = 1", "w"]]], ["Bob", [[4, 6, "read x → 1", "r"]]]], ok: [1, 1, 1, 1, 1], why: "Every read returns the most recent completed write. This is what a single machine gives you, and what linearizability promises for a distributed system." },
    stale: { n: "Stale after a completed write", rows: [["Alice", [[0, 3, "write x = 1 ✓", "w"]]], ["Bob", [[4, 6, "read x → 0", "r"]]]], ok: [0, 1, 1, 1, 1], why: "Bob's read started after Alice's write finished, yet returned the old value. Not linearizable. It is allowed by weaker models: Bob never saw anything that depends on x = 1, and he is not Alice." },
    own: { n: "Your own write vanished", rows: [["Alice", [[0, 3, "write x = 1 ✓", "w"], [4, 6, "read x → 0", "r"]]]], ok: [0, 0, 0, 1, 1], why: "Alice cannot see her own change. Violates read-your-writes (and causality, since her read depends on her write). Lesson 5.2's lagging replica bug." },
    back: { n: "Time goes backwards", rows: [["Writer", [[0, 1, "x = 1", "w"], [2, 3, "x = 2", "w"]]], ["Bob", [[4, 5, "read → 2", "r"], [6, 7, "read → 1", "r"]]]], ok: [0, 0, 1, 0, 1], why: "Bob saw 2 and then 1: his second read hit a replica that was further behind. Violates monotonic reads." },
    cause: { n: "Answer before the question", rows: [["Alice", [[0, 2, "post: 'Lunch?'", "w"]]], ["Bob", [[3, 4, "sees post", "r"], [5, 7, "reply: 'Yes!'", "w"]]], ["Carol", [[8, 10, "sees 'Yes!' but not 'Lunch?'", "r"]]]], ok: [0, 0, 1, 1, 1], why: "Bob's reply depends on Alice's post, but Carol sees the reply without the post. Violates causal consistency. Each user's own view is fine, which is why weaker guarantees miss it." }
  };
  function consistency(root) {
    const p = H.panel(root, "Which guarantees does this history break?", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="cm-s"></div></div><div class="svgwrap" id="cm-svg"></div><div id="cm-t" style="display:flex;flex-wrap:wrap;gap:6px;margin:10px 0"></div><div class="callout" id="cm-v"></div>`;
    let k = "stale";
    function draw() {
      const Hs = HIST[k], rows = Hs.rows;
      const s = H.svg("svg", { viewBox: `0 0 700 ${30 + rows.length * 46}`, role: "img", "aria-label": "Timeline of operations by client" });
      const X = t => 90 + t * 58;
      H.svg("line", { x1: 90, x2: 690, y1: 18, y2: 18, stroke: "var(--line)" }, s); const tl = H.svg("text", { x: 690, y: 12, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" }, s); tl.textContent = "time →";
      rows.forEach(([who, ops], i) => {
        const y = 30 + i * 46;
        const t = H.svg("text", { x: 8, y: y + 20, "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); t.textContent = who;
        ops.forEach(([a, b, label, kind]) => { H.svg("rect", { x: X(a), y, width: X(b) - X(a), height: 30, rx: 6, fill: kind === "w" ? "var(--data-soft)" : "var(--compute-soft)", stroke: kind === "w" ? "var(--data)" : "var(--compute)" }, s); const lt = H.svg("text", { x: X(a) + 8, y: y + 20, "font-size": 12, fill: "var(--ink)" }, s); lt.textContent = label; });
      });
      const h = p.querySelector("#cm-svg"); h.innerHTML = ""; h.appendChild(s);
      p.querySelector("#cm-t").innerHTML = MODELS.map((m, i) => `<span class="pill" style="font-size:12px;padding:5px 10px;${Hs.ok[i] ? "background:var(--ok-soft);color:var(--ok)" : "background:var(--bad-soft);color:var(--bad)"}">${Hs.ok[i] ? "✓ allowed by" : "✕ violates"} ${m}</span>`).join("");
      const v = p.querySelector("#cm-v"); v.className = "callout " + (Hs.ok[0] ? "good" : "warn"); v.textContent = Hs.why;
    }
    seg(p.querySelector("#cm-s"), Object.entries(HIST).map(([a, b]) => [a, b.n]), k, v => { k = v; draw(); });
    draw();
    H.add(root, `<div class="keys">
      <div class="key"><b>Linearizable</b>Behaves like one copy: once a write completes, every later read sees it. Needs coordination (consensus or a single leader) and pays in latency.</div>
      <div class="key"><b>Causal</b>Anything that depends on something else is seen after it. The strongest model that stays available during partitions.</div>
      <div class="key"><b>Read-your-writes, monotonic reads</b>Per-user guarantees that fix the most visible replica-lag bugs cheaply.</div>
      <div class="key"><b>Eventual</b>If writes stop, replicas converge. Says nothing about what you see before then.</div></div>`);
  }

  /* ---------------- 7.4 Raft ---------------- */
  function raft(root) {
    const p = H.panel(root, "A five-node Raft cluster you can break", "Try it");
    p.innerHTML = `<div class="controls">
        <button class="btn primary" type="button" id="rf-w">Client write</button>
        <button class="btn danger" type="button" id="rf-kl">Kill the leader</button>
        <button class="btn danger" type="button" id="rf-part">Partition: leader + 1 vs 3</button>
        <button class="btn" type="button" id="rf-heal">Heal and revive all</button>
        <div class="ctl" style="min-width:160px;flex:0 1 200px"><label for="rf-sp">Speed <output id="rf-spo"></output></label><input type="range" id="rf-sp" min="0.05" max="0.6" step="0.05" value="0.2"></div>
      </div>
      <p class="note">Click a node to kill or revive it. Time runs slower than real Raft so you can follow it (election timeouts 150–300 ms, heartbeats every 50 ms, in simulated time).</p>
      <div class="svgwrap minw"><svg id="rf-svg" viewBox="0 0 760 360" role="img" aria-label="Raft cluster: five nodes, their roles, terms and logs"></svg></div>
      <div id="rf-ev" style="display:grid;gap:3px;font-size:13px;margin-top:8px" aria-live="polite"></div>`;
    const N = 5, svg = p.querySelector("#rf-svg");
    let nodes, msgs, now, groups, letter, events;
    const rand = (a, b) => a + Math.random() * (b - a);
    function reset() {
      nodes = Array.from({ length: N }, (_, i) => ({ id: i, role: "F", term: 0, votedFor: null, log: [], commit: -1, deadline: rand(150, 300), votes: new Set(), next: [], match: [], hb: 0, alive: true }));
      msgs = []; now = 0; groups = null; letter = 0; events = [];
    }
    function ev(t) { events.unshift(`t=${Math.round(now)} ms · ${t}`); events = events.slice(0, 6); p.querySelector("#rf-ev").innerHTML = events.map((e, i) => `<div style="opacity:${1 - i * 0.13}">${e}</div>`).join(""); }
    const canTalk = (a, b) => nodes[a].alive && nodes[b].alive && (!groups || groups[a] === groups[b]);
    function send(from, to, m) { if (!canTalk(from, to)) return; msgs.push(Object.assign({ from, to, sent: now, at: now + rand(15, 35) }, m)); }
    const lastTerm = n => (n.log.length ? n.log[n.log.length - 1].term : 0);
    function stepDown(n, term) { if (term > n.term) { n.term = term; n.votedFor = null; } if (n.role !== "F") { n.role = "F"; } }
    function startElection(n) {
      n.role = "C"; n.term++; n.votedFor = n.id; n.votes = new Set([n.id]); n.deadline = now + rand(150, 300);
      ev(`S${n.id + 1} timed out and starts an election for term ${n.term}`);
      for (let j = 0; j < N; j++) if (j !== n.id) send(n.id, j, { type: "RV", term: n.term, lastIndex: n.log.length - 1, lastTerm: lastTerm(n) });
    }
    function becomeLeader(n) {
      n.role = "L"; n.next = Array(N).fill(n.log.length); n.match = Array(N).fill(-1); n.match[n.id] = n.log.length - 1; n.hb = 0;
      ev(`S${n.id + 1} won a majority of votes and is leader for term ${n.term}`);
    }
    function sendAppend(n, j) {
      const prev = n.next[j] - 1;
      send(n.id, j, { type: "AE", term: n.term, prev, prevTerm: prev >= 0 ? n.log[prev].term : 0, entries: n.log.slice(n.next[j]).map(e => ({ ...e })), commit: n.commit });
    }
    function deliver(m) {
      const n = nodes[m.to];
      if (!n.alive) return;
      if (m.term > n.term) stepDown(n, m.term);
      if (m.type === "RV") {
        const upToDate = m.lastTerm > lastTerm(n) || (m.lastTerm === lastTerm(n) && m.lastIndex >= n.log.length - 1);
        const grant = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate;
        if (grant) { n.votedFor = m.from; n.deadline = now + rand(150, 300); }
        send(n.id, m.from, { type: "RVR", term: n.term, granted: grant });
      } else if (m.type === "RVR") {
        if (n.role === "C" && m.term === n.term && m.granted) { n.votes.add(m.from); if (n.votes.size > N / 2) becomeLeader(n); }
      } else if (m.type === "AE") {
        if (m.term < n.term) { send(n.id, m.from, { type: "AER", term: n.term, ok: false, match: -1 }); return; }
        if (n.role !== "F") n.role = "F";
        n.deadline = now + rand(150, 300); n.leader = m.from;
        if (m.prev >= 0 && (n.log.length <= m.prev || n.log[m.prev].term !== m.prevTerm)) { send(n.id, m.from, { type: "AER", term: n.term, ok: false, match: -1 }); return; }
        const before = n.log.length;
        n.log = n.log.slice(0, m.prev + 1).concat(m.entries);
        if (before > n.log.length || (before > m.prev + 1 && m.entries.length && before !== n.log.length)) ev(`S${n.id + 1} discarded uncommitted entries that conflicted with the leader's log`);
        const newCommit = Math.min(m.commit, n.log.length - 1);
        if (newCommit > n.commit) n.commit = newCommit;
        send(n.id, m.from, { type: "AER", term: n.term, ok: true, match: m.prev + m.entries.length });
      } else if (m.type === "AER") {
        if (n.role !== "L" || m.term !== n.term) return;
        if (m.ok) { n.match[m.from] = Math.max(n.match[m.from], m.match); n.next[m.from] = n.match[m.from] + 1; }
        else n.next[m.from] = Math.max(0, n.next[m.from] - 1);
        for (let k = n.log.length - 1; k > n.commit; k--) {
          if (n.log[k].term !== n.term) break;
          const cnt = n.match.filter((x, j) => (j === n.id ? n.log.length - 1 : x) >= k).length;
          if (cnt > N / 2) { n.commit = k; ev(`Entry '${n.log[k].val}' is on a majority: committed by leader S${n.id + 1}`); break; }
        }
      }
    }
    function tick(dt) {
      now += dt;
      const due = msgs.filter(m => m.at <= now); msgs = msgs.filter(m => m.at > now);
      due.forEach(m => { if (canTalk(m.from, m.to)) deliver(m); });
      nodes.forEach(n => {
        if (!n.alive) return;
        if (n.role === "L") { n.match[n.id] = n.log.length - 1; if (now >= n.hb) { n.hb = now + 50; for (let j = 0; j < N; j++) if (j !== n.id) sendAppend(n, j); } }
        else if (now >= n.deadline) startElection(n);
      });
    }
    const POS = Array.from({ length: N }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [190 + Math.cos(a) * 125, 180 + Math.sin(a) * 125]; });
    const COL = { F: "var(--compute)", C: "var(--xp)", L: "var(--data)" };
    function render() {
      let out = "";
      if (groups) out += `<path d="M120 40 C 300 120, 300 240, 120 340" fill="none" stroke="var(--bad)" stroke-width="2.5" stroke-dasharray="7 6"/>`;
      msgs.forEach(m => { const a = POS[m.from], b = POS[m.to], f = Math.min(1, (now - m.sent) / (m.at - m.sent)); const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; const c = m.type === "RV" || m.type === "RVR" ? "var(--xp)" : "var(--data)"; out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.type === "AE" && m.entries.length ? 5 : 3}" fill="${c}" opacity="0.85"/>`; });
      nodes.forEach((n, i) => {
        const [x, y] = POS[i], col = n.alive ? COL[n.role] : "var(--bad)";
        const frac = n.role === "L" || !n.alive ? 0 : Math.max(0, Math.min(1, (n.deadline - now) / 300));
        const R = 30, ang = frac * 2 * Math.PI, ex = x + R * Math.sin(ang), ey = y - R * Math.cos(ang);
        out += `<g data-n="${i}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="26" fill="${n.alive ? "var(--surface)" : "var(--bad-soft)"}" stroke="${col}" stroke-width="${n.role === "L" ? 5 : 2.5}"/>`;
        if (frac > 0) out += `<path d="M${x} ${y - R} A ${R} ${R} 0 ${ang > Math.PI ? 1 : 0} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="var(--line-strong)" stroke-width="2"/>`;
        out += `<text x="${x}" y="${y - 2}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">S${i + 1}</text><text x="${x}" y="${y + 13}" text-anchor="middle" font-size="10.5" fill="${col}" class="mono">${n.alive ? { F: "follower", C: "candidate", L: "LEADER" }[n.role] : "dead"}</text></g>`;
        out += `<text x="${x}" y="${y + 44}" text-anchor="middle" font-size="10.5" fill="var(--muted)" class="mono">term ${n.term}</text>`;
      });
      out += `<text x="400" y="30" font-size="12" font-weight="600" fill="var(--ink)">Logs (filled = committed)</text>`;
      nodes.forEach((n, i) => {
        const y = 56 + i * 58;
        out += `<text x="400" y="${y + 16}" font-size="12" font-weight="600" fill="${n.alive ? "var(--ink)" : "var(--bad)"}">S${i + 1}</text>`;
        const show = n.log.slice(-10), off = n.log.length - show.length;
        show.forEach((e, k) => { const idx = off + k, committed = idx <= n.commit; out += `<rect x="${430 + k * 32}" y="${y}" width="28" height="24" rx="4" fill="${committed ? "var(--ok-soft)" : "var(--surface)"}" stroke="${committed ? "var(--ok)" : "var(--xp)"}" stroke-dasharray="${committed ? "" : "3 2"}"/><text x="${444 + k * 32}" y="${y + 16}" text-anchor="middle" font-size="11" class="mono" fill="var(--ink)">${e.val}</text><text x="${444 + k * 32}" y="${y + 36}" text-anchor="middle" font-size="9" class="mono" fill="var(--muted)">t${e.term}</text>`; });
      });
      svg.innerHTML = out;
      svg.querySelectorAll("g[data-n]").forEach(g => g.onclick = () => { const n = nodes[+g.dataset.n]; n.alive = !n.alive; if (n.alive) { n.role = "F"; n.deadline = now + rand(150, 300); ev(`S${n.id + 1} restarted as a follower`); } else ev(`S${n.id + 1} crashed`); });
    }
    let last = 0;
    function loop(t) {
      if (!document.body.contains(svg)) return;
      const speed = +p.querySelector("#rf-sp").value;
      const dt = Math.min(50, (t - (last || t))) * speed; last = t;
      const steps = Math.max(1, Math.ceil(dt / 2)); for (let k = 0; k < steps; k++) tick(dt / steps);
      render(); requestAnimationFrame(loop);
    }
    const leader = () => nodes.find(n => n.alive && n.role === "L" && !nodes.some(o => o.alive && o.role === "L" && o.term > n.term));
    p.querySelector("#rf-w").onclick = () => {
      const L = leader(); if (!L) return ev("No leader right now: the write is rejected. Clients retry.");
      const val = String.fromCharCode(97 + (letter++ % 26)); L.log.push({ term: L.term, val }); L.match[L.id] = L.log.length - 1;
      ev(`Client wrote '${val}' to leader S${L.id + 1}; it is replicating`);
    };
    p.querySelector("#rf-kl").onclick = () => { const L = leader(); if (!L) return ev("There is no leader to kill yet."); L.alive = false; ev(`Leader S${L.id + 1} crashed. Followers will time out and elect a new one.`); };
    p.querySelector("#rf-part").onclick = () => {
      const L = leader(); if (!L) return ev("Wait for a leader first.");
      const other = (L.id + 1) % N; groups = nodes.map(n => (n.id === L.id || n.id === other ? 0 : 1));
      ev(`Partition: S${L.id + 1} (leader) and S${other + 1} are cut off from the other three`);
    };
    p.querySelector("#rf-heal").onclick = () => { groups = null; nodes.forEach(n => { if (!n.alive) { n.alive = true; n.role = "F"; n.deadline = now + rand(150, 300); } }); ev("Network healed; every node is running"); };
    p.querySelector("#rf-sp").addEventListener("input", () => { p.querySelector("#rf-spo").textContent = (+p.querySelector("#rf-sp").value).toFixed(2) + "×"; });
    p.querySelector("#rf-spo").textContent = "0.20×";
    reset(); requestAnimationFrame(loop);
    H.add(root, `<div class="panel"><div class="panel-t"><h3>Things to try</h3></div><ol style="margin:0;padding-left:20px;display:grid;gap:6px;font-size:14.5px">
      <li>Wait for a leader. Click <b>Client write</b> a few times: entries appear dashed (uncommitted) and turn green once a majority has them.</li>
      <li><b>Kill the leader.</b> Followers' timers run out, one becomes a candidate with a higher term, and a new leader appears within a few hundred milliseconds of simulated time. Committed entries survive.</li>
      <li><b>Partition</b> the leader with one follower. Write a few entries: the old leader appends them but can never commit them (only 2 of 5). The other three elect a new leader with a higher term and commit their own writes.</li>
      <li><b>Heal.</b> The old leader sees the higher term, steps down, and its uncommitted entries are overwritten by the new leader's log. Nothing that was committed is ever lost.</li>
      <li>Kill three of the five nodes: no majority, so no leader can be elected and writes stop. That is the price of consistency.</li></ol></div>`);
  }

  /* ---------------- 7.5 Ordering and idempotency ---------------- */
  function idempotency(root) {
    const p = H.panel(root, "Retrying a payment safely", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">The client pays for order #1042. The provider charges the card, but the response is lost; the client times out and retries.</p>
      <div class="controls"><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="id-k"> Send an Idempotency-Key header with each attempt</label><button class="btn primary" type="button" id="id-go">Run the payment</button></div>
      <div id="id-log" style="display:grid;gap:5px;font-size:14px"></div><div class="readout" id="id-r"></div><div class="callout" id="id-v" hidden></div>`;
    p.querySelector("#id-go").onclick = async () => {
      const key = p.querySelector("#id-k").checked, log = p.querySelector("#id-log"), v = p.querySelector("#id-v"); log.innerHTML = ""; v.hidden = true;
      const seen = new Map(); let charges = 0;
      const line = (t, c) => { log.appendChild(H.el(`<div style="padding:5px 10px;border-left:3px solid var(--${c})"></div>`)); log.lastChild.textContent = t; };
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise(r => setTimeout(r, 450));
        const hdr = key ? " Idempotency-Key: 9f1c…" : "";
        line(`Attempt ${attempt}: POST /charges {order: 1042, amount: €50}${hdr}`, "compute");
        await new Promise(r => setTimeout(r, 350));
        if (key && seen.has("9f1c")) { line(`Server: key 9f1c… already processed: returns the stored response (charge ch_1). No new charge.`, "ok"); }
        else { charges++; seen.set("9f1c", "ch_" + charges); line(`Server: charges the card (charge ch_${charges})${key ? " and stores the response under key 9f1c…" : ""}`, charges > 1 ? "bad" : "ok"); }
        await new Promise(r => setTimeout(r, 300));
        if (attempt < 3) line("Network: the response is lost. Client times out and retries.", "xp"); else line("Network: response delivered. Client: done.", "ok");
      }
      readout(p.querySelector("#id-r"), [["Card charged", charges + "×", charges > 1 ? "bad" : "good"]]);
      v.hidden = false; v.className = "callout " + (charges > 1 ? "bad" : "good");
      v.textContent = charges > 1 ? "Three charges for one order. Retries over an unreliable network give at-least-once delivery, so the operation runs as many times as it is delivered." : "One charge. The client generated a unique key once per logical operation and reused it on every retry; the server stored the outcome under that key and replayed it. At-least-once delivery plus an idempotent operation is how systems get 'exactly-once' effects. Stripe's API works exactly like this.";
    };

    const q = H.panel(root, "Lamport clocks: ordering without trusting wall time", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Each process keeps a counter. Rule: increment it for every event; stamp every message with it; on receiving a message, set the counter to max(own, received) + 1. If one event could have caused another, it always has the smaller number.</p>
      <div class="controls" id="lc-b"></div><div class="svgwrap" id="lc-svg"></div><div class="callout" id="lc-v">Create events and messages; watch the counters.</div>`;
    const P = 3; let clk, evs;
    function lreset() { clk = [0, 0, 0]; evs = []; ldraw(); }
    function lclick(kind, a, b) {
      if (kind === "local") { clk[a]++; evs.push({ p: a, c: clk[a], label: "e" }); }
      else { clk[a]++; const sent = clk[a]; evs.push({ p: a, c: sent, label: "send→P" + (b + 1) }); clk[b] = Math.max(clk[b], sent) + 1; evs.push({ p: b, c: clk[b], label: "recv←P" + (a + 1), from: evs.length - 1 }); q.querySelector("#lc-v").textContent = `P${a + 1} sent at ${sent}; P${b + 1} received and jumped to max(own, ${sent}) + 1 = ${clk[b]}. The receive is always numbered after the send, whatever the machines' real clocks say.`; }
      ldraw();
    }
    [["P1 event", "local", 0], ["P2 event", "local", 1], ["P3 event", "local", 2], ["P1 → P2", "msg", 0, 1], ["P2 → P3", "msg", 1, 2], ["P3 → P1", "msg", 2, 0]].forEach(([l, k, a, b]) => { const btn = H.el(`<button class="btn" type="button">${l}</button>`); btn.onclick = () => lclick(k, a, b); q.querySelector("#lc-b").appendChild(btn); });
    const rb = H.el(`<button class="btn" type="button">Reset</button>`); rb.onclick = lreset; q.querySelector("#lc-b").appendChild(rb);
    function ldraw() {
      const W = 700, s = H.svg("svg", { viewBox: `0 0 ${W} 170`, role: "img", "aria-label": "Three processes with Lamport timestamps" });
      for (let i = 0; i < P; i++) { const y = 30 + i * 55; H.svg("line", { x1: 60, x2: W - 10, y1: y, y2: y, stroke: "var(--line-strong)" }, s); const t = H.svg("text", { x: 10, y: y + 4, "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); t.textContent = "P" + (i + 1) + " (" + clk[i] + ")"; }
      const shown = evs.slice(-14), base = evs.length - shown.length;
      shown.forEach((e, k) => { const x = 90 + k * 43, y = 30 + e.p * 55; if (e.from !== undefined && e.from >= base) { const f = evs[e.from], fx = 90 + (e.from - base) * 43, fy = 30 + f.p * 55; H.svg("line", { x1: fx, y1: fy, x2: x, y2: y, stroke: "var(--signal)", "stroke-width": 1.5 }, s); } H.svg("circle", { cx: x, cy: y, r: 11, fill: "var(--surface)", stroke: "var(--data)", "stroke-width": 2 }, s); const t = H.svg("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: "var(--ink)", class: "mono" }, s); t.textContent = e.c; });
      const h = q.querySelector("#lc-svg"); h.innerHTML = ""; h.appendChild(s);
    }
    lreset();
  }

  Course.register({
    id: 7,
    blurb: "The ideas underneath every distributed system: why networks and clocks cannot be trusted, what CAP really says, what 'consistent' can mean, how consensus elects a leader safely, and how to make retries harmless.",
    examBadge: "lvl7",
    lessons: [
      { id: "7.1", sources: [["Designing Data-Intensive Applications, chapter 8", "https://dataintensive.net/", "The trouble with distributed systems: unreliable networks and clocks"], ["Timeouts, retries, and backoff with jitter", "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/", "Amazon Builders' Library"]],
        title: "Partial failure: networks and clocks", minutes: 20,
        lede: "On one machine, things work or crash. Across machines, some parts fail while others carry on, and you often cannot tell which. Start with the two things you cannot trust: the network and the clock.",
        render(r) { ambiguity(r); H.keys(r, [["Timeouts are guesses", "A timeout cannot tell lost, crashed, slow and 'done but the reply was lost' apart."], ["Messages can be lost, delayed, duplicated, reordered", "Design every protocol assuming all four."], ["Clocks drift and jump", "Wall-clock time is not a safe way to order events across machines."], ["Processes pause", "Garbage collection, VM migration or swapping can freeze a process for seconds."]]); },
        check: { q: "Your service calls a payment provider and gets a timeout. What do you know?", opts: ["The payment failed, so it is safe to send the same request again", "The payment succeeded, and only the provider's reply was slow", "Nothing certain: the request or reply was lost, or it is slow", "The provider is down and will reject any retries until it recovers"], a: 2, why: "All of these produce the same timeout. That is why the next step is making the call safe to retry, rather than guessing." } },
      { id: "7.2", sources: [["CAP Twelve Years Later: How the 'Rules' Have Changed", "https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/", "Eric Brewer, 2012"], ["Consistency Tradeoffs in Modern Distributed Database System Design", "https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf", "Daniel Abadi, IEEE Computer 2012 (PACELC)"], ["Please stop calling databases CP or AP", "https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html", "Martin Kleppmann"]],
        title: "CAP and PACELC, precisely", minutes: 25,
        lede: "CAP is quoted constantly and misunderstood almost as often. It only applies during a network partition, and it is a choice per operation, not a label for a product. PACELC covers the rest of the time.",
        render(r) { cap(r); H.keys(r, [["Partitions are not optional", "You do not choose P; networks fail. You choose what happens when they do."], ["CP", "The minority side refuses to serve, so nobody sees conflicting data."], ["AP", "Every side keeps serving, and the data diverges until reconciled."], ["Else: latency vs consistency", "Most of the time the real trade-off is how many replicas each write waits for."]]); },
        check: { q: "Which statement about CAP is accurate?", opts: ["You permanently pick two of the three properties when you first design the system", "During a partition, a replicated system must refuse some requests or risk inconsistency", "CAP proves that distributed databases can never offer consistency at all", "CAP is about CPU, availability and performance, and how those three trade off"], a: 1, why: "CAP is a statement about behaviour during a partition. Outside partitions, PACELC's latency/consistency trade-off is the one you live with." } },
      { id: "7.3", sources: [["Consistency models", "https://jepsen.io/consistency", "Jepsen: definitions and the hierarchy of models"], ["Designing Data-Intensive Applications, chapter 9", "https://dataintensive.net/", "Linearizability and ordering guarantees"]],
        title: "What 'consistent' can mean", minutes: 25,
        lede: "Consistency is not one thing. Linearizable, causal, read-your-writes, monotonic and eventual each forbid different surprises. Look at histories and see which promises they break.",
        render(r) { consistency(r); },
        check: { q: "A user posts a comment and immediately reloads, but the comment is missing; a minute later it appears. Which guarantee was missing?", opts: ["Monotonic reads", "Read-your-writes", "Causal consistency between different users", "Durability"], a: 1, why: "The user did not see their own completed write." } },
      { id: "7.4", sources: [["etcd: tuning", "https://etcd.io/docs/v3.5/tuning/", "Heartbeat (100 ms) and election timeout (1,000 ms) defaults, and how to size them"], ["etcd: API guarantees", "https://etcd.io/docs/v3.5/learning/api_guarantees/", "Linearizable reads by default; serializable reads may be stale"], ["In Search of an Understandable Consensus Algorithm (Raft)", "https://raft.github.io/raft.pdf", "Ongaro and Ousterhout, 2014"], ["The Raft website", "https://raft.github.io/", "Visualisations and implementations"], ["Designing Data-Intensive Applications, chapter 9", "https://dataintensive.net/", "Consensus and fault tolerance"]],
        title: "Consensus with Raft", minutes: 35,
        lede: "How do several machines agree on one leader and one order of writes, despite crashes and partitions? Raft is the algorithm inside etcd, Consul and many databases. Run it, then break it.",
        render(r) { raft(r); },
        check: { q: "In a 5-node Raft cluster, a partition separates the leader and one follower from the other three. What happens to writes sent to the old leader?", opts: ["They are committed normally, because the old leader still thinks it leads", "They are appended but never committed, and are discarded after healing", "They are lost immediately, because the one follower rejects every write", "They are forwarded to the majority side's new leader and committed there"], a: 1, why: "Committing needs a majority (3 of 5). The old leader has only 2, so its new entries stay uncommitted and are overwritten by the new leader's log." } },
      { id: "7.5", sources: [["Idempotent requests", "https://docs.stripe.com/api/idempotent_requests", "Stripe API reference: client-generated keys, stored responses, 24-hour retention"], ["Time, Clocks, and the Ordering of Events in a Distributed System", "https://lamport.azurewebsites.net/pubs/time-clocks.pdf", "Leslie Lamport, 1978"], ["Designing robust and predictable APIs with idempotency", "https://stripe.com/blog/idempotency", "Stripe engineering"], ["Making retries safe with idempotent APIs", "https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/", "Amazon Builders' Library"]],
        title: "Ordering and idempotency", minutes: 25,
        lede: "Two practical tools that fall out of the theory: logical clocks that order events without trusting wall time, and idempotency keys that make retries safe.",
        render(r) { idempotency(r); H.keys(r, [["At-most-once", "Never retry: no duplicates, but some operations never happen."], ["At-least-once", "Retry until acknowledged: nothing lost, duplicates possible."], ["'Exactly-once' = at-least-once + idempotency", "Deliver repeatedly, apply once."], ["Keys come from the client", "One key per logical operation, reused on every retry."]]); },
        check: { q: "How does an idempotency key prevent a double charge?", opts: ["It encrypts the request, so a captured repeat cannot be replayed later", "The server saves the first result under the key and returns it for repeats", "It tells the network layer to deliver the request exactly once to the server", "It rate-limits the client, so it cannot send the same charge twice in a row"], a: 1, why: "The key identifies the logical operation, so a retry is recognised and not executed twice." } }
    ],
    exam: [
      { q: "A request to another service times out. Which of these is NOT a possible explanation?", opts: ["The request was lost on the way to the other service", "The service processed it, but the response was lost", "The other service is slow and has not answered yet", "Each of these is possible; a timeout can't tell them apart"], a: 3, why: "From the caller's view all three are indistinguishable." },
      { q: "Why is ordering events by server wall-clock timestamps risky?", opts: ["Timestamps take more storage than sequence numbers in every event", "Clocks drift and jump, so a later event can carry an earlier timestamp", "Databases round timestamps to the second, so close events can tie", "It is not risky, because NTP keeps every clock in sync to the nanosecond"], a: 1, why: "Clock skew silently reorders events, and last-write-wins then drops the wrong write." },
      { q: "During a partition, a CP system's minority side will typically…", opts: ["Accept writes locally and reconcile them after the partition heals", "Refuse writes (and linearizable reads) until it can reach a majority", "Delete its local data and resync it from the majority", "Elect its own leader so both sides keep serving writes"], a: 1, why: "It gives up availability to avoid divergence." },
      { q: "PACELC adds which trade-off to CAP?", opts: ["Price versus performance when choosing hardware", "In normal operation, latency versus consistency", "Security versus speed for replication traffic", "Partitions versus replicas when sizing a cluster"], a: 1, why: "Even without failures, waiting for more replicas means more consistency and more latency." },
      { q: "Bob sees a reply to a post, but not the post itself. Which model is violated?", opts: ["Read-your-writes", "Causal consistency", "Monotonic reads", "Durability"], a: 1, why: "The reply causally depends on the post; causal consistency guarantees the post is visible first." },
      { q: "How many nodes can fail in a 5-node Raft cluster while it can still elect a leader and commit writes?", opts: ["1", "2", "3", "4"], a: 1, why: "A majority (3) must remain, so up to 2 can fail." },
      { q: "In Raft, when is a log entry committed?", opts: ["When the leader has written it to its own disk", "When it is stored on a majority of the cluster", "When every node in the cluster has stored it", "When the client receives the leader's response"], a: 1, why: "A majority guarantees any future leader will have the entry." },
      { q: "What does a Lamport clock guarantee?", opts: ["Its timestamps match real time across all the machines", "If A could have caused B, A gets a smaller timestamp than B", "Events on different machines never share the same timestamp", "The machines' physical clocks stop drifting once it is in use"], a: 1, why: "It captures causality, not wall-clock time." }
    ],
    lab: {
      title: "Raft in a real cluster, and payments that survive retries",
      time: "about 5 hours",
      folder: "level-7-consensus/",
      needs: "Docker Desktop (or Docker Engine), a terminal; two terminal windows for some steps",
      intro: `<p>Part one uses etcd, the consensus store behind Kubernetes and Patroni. Three containers form a Raft cluster; you will find the leader, kill it, cut a member off the network, lose the majority on purpose, and use leases and locks, the building blocks of leader election.</p><p>Part two is a tiny payments API with a network that loses responses. Without idempotency keys, retries double-charge; with them, they do not.</p><p>No ports are published. <code>./etcdctl.sh</code> runs etcdctl in a helper container on the cluster's network; <code>./member.sh etcd3 …</code> runs it inside one member.</p>`,
      vmIntro: "These checks cover the two practical lessons of this level that apply to a single server: time and retries.",
      vmChecks: [
        ["Is the clock synchronised?", "timedatectl show -p NTPSynchronized -p TimeUSec\nchronyc tracking 2>/dev/null | grep -E 'System time|Last offset' || true", "<code>NTPSynchronized=yes</code>, and if chrony is installed an offset of a few milliseconds or less."],
        ["Do outbound calls have timeouts?", "grep -rnE 'httpx|requests\\.(get|post)|aiohttp|urlopen' --include=*.py . | head -20", "Every call to another service passes a timeout (httpx and requests have no default read timeout in many setups). A call without one can hang a worker forever."],
        ["Are money-like operations idempotent?", "grep -rniE 'idempotency|Idempotency-Key|ON CONFLICT' --include=*.py . | head", "Any endpoint that charges, sends or creates something important accepts a client-supplied key (or uses a natural unique constraint) so a retry cannot do it twice."]
      ],
      steps: [
        { id: "l7-1", why: "Before relying on a consensus store you need to read its state: who the leader is, which term it is in, and whether members agree.", title: "Start a three-node etcd cluster",
          body: `${H.code(`cd level-7-consensus
docker compose up -d etcd1 etcd2 etcd3
docker compose ps                            # wait until all three say (healthy)
./etcdctl.sh member list -w table
./etcdctl.sh endpoint status -w table
./etcdctl.sh endpoint health`)}<p><code>./etcdctl.sh</code> talks to the whole cluster; <code>./member.sh etcd3 …</code> talks to one member from inside its container (you will need that in step 4). On Windows without a shell, use <code>docker compose run --rm cli &lt;args&gt;</code> and <code>docker compose exec etcd3 /usr/local/bin/etcdctl &lt;args&gt;</code>.</p>`,
          expect: "Three members, exactly one with IS LEADER = true, all on the same RAFT TERM and the same RAFT INDEX.",
          solution: `${H.code(`+-----------------+------------------+---------+-----------+-----------+------------+
|    ENDPOINT     |        ID        | VERSION | IS LEADER | RAFT TERM | RAFT INDEX |
+-----------------+------------------+---------+-----------+-----------+------------+
| etcd1:2379      | 5f84306dec307593 |  3.5.21 |      true |         2 |          8 |
| etcd2:2379      | fb5d4d4c6cbaa49a |  3.5.21 |     false |         2 |          8 |
| etcd3:2379      | cd8aed6aed9806e4 |  3.5.21 |     false |         2 |          8 |
+-----------------+------------------+---------+-----------+-----------+------------+
etcd1:2379 is healthy: successfully committed proposal: took = 4.2ms
(some columns trimmed)`, [3])}
            <ul><li><b>Which member leads is random.</b> Whoever's election timer fired first won. Note yours; later steps say "the leader", not "etcd1".</li><li><b>RAFT TERM</b> is the election number from lesson 7.4. Term 2 after a fresh start is normal: term 1 had no leader yet.</li><li><b>RAFT INDEX</b> is the position in the replicated log. Equal indexes mean every member has the same entries.</li><li><code>endpoint health</code> does more than ping: it commits a tiny proposal through Raft, so it only passes when a majority can agree. The container healthcheck in <code>compose.yaml</code> uses the same command.</li></ul>` },
        { id: "l7-2", why: "Writing and watching keys is how real systems (Kubernetes, Patroni) use etcd. Watching a key change live makes it concrete.", title: "Write, read and watch keys",
          body: `<p>Terminal 1 watches; terminal 2 writes.</p>${H.code(`# terminal 1
./etcdctl.sh watch config/ --prefix

# terminal 2
./etcdctl.sh put config/feature-x on
./etcdctl.sh put config/feature-x off
./etcdctl.sh del config/feature-x
./etcdctl.sh put greeting hello
./etcdctl.sh put greeting world
./etcdctl.sh get greeting -w fields          # note CreateRevision
./etcdctl.sh get greeting --rev=<CreateRevision>`)}`,
          expect: "Terminal 1 prints each PUT and DELETE the moment it happens. Reading greeting at its CreateRevision returns the old value, hello.",
          solution: `${H.code(`# terminal 1 (watch)
PUT
config/feature-x
on
PUT
config/feature-x
off
DELETE
config/feature-x

# terminal 2
"Revision" : 5
"Key" : "greeting"
"CreateRevision" : 4
"ModRevision" : 5
"Version" : 2
"Value" : "world"
$ ./etcdctl.sh get greeting --rev=4
greeting
hello`, [10, 11, 15])}
            <ul><li><b>Watch is the important part.</b> Kubernetes controllers and Patroni don't poll; they watch keys and react within milliseconds. That is why one store can coordinate a whole cluster.</li><li><b>Revision</b> is a cluster-wide counter that goes up by one for every change. It is the log position from lesson 7.4 made visible: every member applies changes in revision order.</li><li><code>--rev</code> reads the past. etcd keeps old versions (multi-version concurrency control, as Postgres does) until they are compacted, which is how a watcher that disconnects can resume from the revision it last saw without missing events.</li><li>Your revision numbers will differ; the pattern won't.</li></ul>` },
        { id: "l7-3", why: "Leader failure is the event Raft exists to handle. Seeing a new term and leader appear within seconds, with no data lost, is the core promise.", title: "Kill the leader",
          body: `<p>Replace <code>etcd1</code> with whichever member is your leader. <code>kill</code> sends SIGKILL, which is what a crash or power loss looks like.</p>${H.code(`./etcdctl.sh endpoint status -w table        # note the leader and RAFT TERM
docker compose kill etcd1
./etcdctl.sh endpoint status -w table        # the dead member shows an error after ~5 s
./etcdctl.sh get greeting
./etcdctl.sh put after-crash yes
docker compose logs etcd2 etcd3 | grep -E 'became leader|lost leader'
docker compose start etcd1
./etcdctl.sh endpoint status -w table`)}<p>Then compare a planned shutdown: <code>docker compose stop &lt;leader&gt;</code> (SIGTERM), check status, look for <code>leadership transfer</code> in its logs, and start it again.</p>`,
          expect: "A new leader with a term one higher, within about a second. greeting is still world. The restarted member rejoins as a follower and catches up to the same index.",
          solution: `${H.code(`kill at 16:47:08.875
16:47:09.925 fb5d4d4c6cbaa49a became candidate at term 3
16:47:09.926 fb5d4d4c6cbaa49a became leader at term 3
16:47:09.926 cd8aed6aed9806e4 lost leader 5f84306dec307593 at term 3
first successful write at 16:47:09.990            (about 1.1 s after the crash)

# graceful stop of the next leader
leadership transfer starting ... transferee-member-id: fb5d4d4c6cbaa49a
leadership transfer finished                     (about 0.1 s, no election timeout)`, [2, 5])}
            <ul><li><b>Why about one second?</b> Followers expect a heartbeat every 100 ms. Only after the election timeout (1,000 ms by default in etcd) with no heartbeat does one become a candidate. etcd's tuning guide sets these from network round-trip time: heartbeat about one round trip, election timeout at least ten.</li><li><b>No data lost.</b> Every write the client was told "OK" for was on a majority before the reply. The new leader was one of that majority; Raft's vote rule guarantees that only a member with all committed entries can win.</li><li><b>The term went up by one</b>, so any message from the old leader (if it came back confused) would be rejected as stale.</li><li><b>Planned shutdown is faster.</b> On SIGTERM a leader hands leadership to a caught-up follower first, so the gap is ~0.1 s instead of a full election timeout. This is one reason deploys should stop processes gracefully (Level 1's <code>stop_grace_period</code>) rather than kill them.</li></ul>` },
        { id: "l7-4", why: "A partitioned minority is where CAP becomes real: you will see a member refuse consistent reads but still answer stale ones.", title: "Cut one member off the network",
          body: `<p><code>docker network disconnect</code> unplugs etcd3's virtual network cable. The process keeps running; it just cannot reach the others. (If etcd3 is the leader, do it anyway and watch the majority elect a new one.)</p>${H.code(`docker network disconnect lab7 $(docker compose ps -q etcd3)

./etcdctl.sh put greeting from-majority                 # majority side: works
./member.sh etcd3 get greeting                          # linearizable read: waits 5 s, fails
./member.sh etcd3 get greeting --consistency=s          # serializable read: answers
./member.sh etcd3 put greeting from-minority            # write: fails
./member.sh etcd3 endpoint status -w table

docker network connect --alias etcd3 lab7 $(docker compose ps -q etcd3)
sleep 3
./member.sh etcd3 get greeting --consistency=s`)}`,
          expect: "The majority keeps working. On etcd3, normal reads and writes time out, the serializable read returns the old value, and status says no leader. After reconnecting, etcd3 returns the new value.",
          solution: `${H.code(`$ ./etcdctl.sh put greeting from-majority
OK
$ ./member.sh etcd3 get greeting
Error: context deadline exceeded                 (after 5.0 s)
$ ./member.sh etcd3 get greeting --consistency=s
greeting
hello                                            <- stale
$ ./member.sh etcd3 put greeting from-minority
Error: context deadline exceeded
$ ./member.sh etcd3 endpoint status -w table
| 127.0.0.1:2379 | ... | false | 3 | 12 | etcdserver: no leader |
# after reconnecting
greeting
from-majority`, [4, 7])}
            <ul><li><b>This is CP from lesson 7.2.</b> The minority cannot prove it has the latest data, so a normal (linearizable) read refuses rather than lie. etcd's API guarantees page: reads are linearizable by default and go through Raft.</li><li><b>Serializable reads trade that away.</b> They answer from the local copy: fast and available, but possibly stale, exactly as you saw. Use them only where stale is acceptable (dashboards, caches).</li><li><b>The term on etcd3 did not climb.</b> Its log shows <code>became pre-candidate</code> repeatedly: etcd's pre-vote (on by default) makes an isolated member ask "would anyone vote for me?" before starting a real election, so it does not come back with an inflated term and depose a healthy leader.</li><li><b>Catching up.</b> On reconnect the leader simply sends the missing log entries; no manual repair.</li><li>Your value may be <code>world</code> rather than <code>hello</code>: whatever was last committed before the cut.</li></ul>` },
        { id: "l7-5", why: "Losing the majority is the failure mode a CP system accepts. Watching writes stop, on purpose, shows exactly what you trade for consistency.", title: "Lose the majority",
          body: `${H.code(`docker compose stop etcd1 etcd2
./member.sh etcd3 put greeting alone                  # fails
./member.sh etcd3 get greeting                        # fails
./member.sh etcd3 get greeting --consistency=s        # answers (stale is possible)
docker compose ps                                     # etcd3 turns unhealthy within ~15 s

docker compose start etcd1
./member.sh etcd3 put greeting two-of-three           # works again
docker compose start etcd2
./etcdctl.sh endpoint status -w table`)}`,
          expect: "With one of three alive, nothing can be written or read consistently. As soon as a second member is back (two of three = majority), a leader is elected and writes succeed.",
          solution: `${H.code(`$ ./member.sh etcd3 put greeting alone
Error: context deadline exceeded
$ ./member.sh etcd3 get greeting --consistency=s
greeting
from-majority
$ ./member.sh etcd3 endpoint status -w table
| 127.0.0.1:2379 | ... | false | 4 | 14 | etcdserver: no leader |
# after starting etcd1
$ ./member.sh etcd3 put greeting two-of-three
OK`, [2, 10])}
            <ul><li><b>Majority, not "most of what's left".</b> The cluster has 3 members, so it needs 2 votes, whether the third is dead, partitioned or just slow. A survivor cannot tell those apart (lesson 7.1), so it must not act alone.</li><li><b>Sizing:</b> 3 members tolerate 1 failure, 5 tolerate 2, 7 tolerate 3. 4 members still tolerate only 1 (majority of 4 is 3), which is why clusters use odd sizes.</li><li><b>Production consequence.</b> If Kubernetes' etcd loses its majority, the API server cannot change anything: running pods keep running, but nothing new is scheduled. Back up etcd (<code>etcdctl snapshot save</code>) for exactly this case.</li><li>The term may read 4 or 5 rather than 3: stopping the leader handed off leadership once more before the cluster lost its majority.</li></ul>` },
        { id: "l7-6", why: "Leases and locks are how leaders are elected on top of etcd. Patroni's leader key from Level 5 is exactly this.", title: "Leases and leader election",
          body: `<p>A lease is a timer: keys attached to it are deleted when it expires.</p>${H.code(`./etcdctl.sh lease grant 15                    # prints: lease <ID> granted with TTL(15s)
./etcdctl.sh put service/leader node-a --lease=<ID>
./etcdctl.sh lease timetolive <ID> --keys
# wait 15 seconds
./etcdctl.sh lease timetolive <ID> --keys
./etcdctl.sh get service/leader`)}<p>Now an election with two candidates, in three terminals:</p>${H.code(`# terminal 1
./etcdctl.sh elect jobs-leader node-a          # becomes leader, keeps running
# terminal 2
./etcdctl.sh elect jobs-leader node-b          # waits
# terminal 3
./etcdctl.sh get jobs-leader --prefix
# terminal 1: press Ctrl-C, then watch terminal 2`)}`,
          expect: "The key disappears when the lease runs out. node-a wins first; node-b waits in line and becomes leader the moment node-a stops.",
          solution: `${H.code(`lease 7593a135856d2f04 granted with TTL(15s), remaining(14s), attached keys([service/leader])
lease 7593a135856d2f04 already expired
(get returns nothing)

# terminal 3: both candidates are queued as keys
jobs-leader/6e4a13584358218
node-a
jobs-leader/7593a135856d2f0e
node-b
# after Ctrl-C in terminal 1, terminal 2 prints
jobs-leader/7593a135856d2f0e
node-b`, [2, 11, 12])}
            <ul><li><b>Leader election = a key + a lease.</b> Each candidate writes a key under the election prefix, tied to its own lease. The one with the lowest creation revision leads; the others watch the key ahead of them.</li><li><b>Why a lease?</b> A leader that crashes cannot say "I quit". Its lease stops being renewed and expires, its key vanishes, and the next candidate takes over. With Ctrl-C the handover is instant because etcdctl deletes its key on the way out; after a crash you would wait for the lease TTL (60 s by default for <code>etcdctl elect</code>).</li><li><b>Patroni works this way.</b> The leader key in lesson 5.3 is a key with a TTL in etcd (or Consul or ZooKeeper). A replica is only promoted after that key expires, which is why an unplanned failover takes roughly the TTL.</li><li><b>The fencing caveat.</b> Expiry is measured on etcd's clock. A paused old leader can wake up still believing it leads, so anything it writes elsewhere should carry a fencing token (the key's revision works) that the storage checks.</li></ul>` },
        { id: "l7-7", why: "Double charges from retries are among the costliest bugs in production. Reproducing one and fixing it with a key makes the pattern stick.", title: "Double-charge, then fix it with idempotency keys",
          body: `<p>The payments API "loses" 20% of its responses: the charge commits, but the reply arrives after the client's 1-second timeout. Run three clients that differ only in their retry policy.</p>${H.code(`docker compose up -d --build db payments
docker compose build tools
docker compose run --rm tools python pay.py --orders 200 --retries 0     # never retry
docker compose run --rm tools python pay.py --orders 200                 # retry, no key
docker compose run --rm tools python pay.py --orders 200 --keys          # retry with a key
docker compose run --rm tools python pay.py --misuse                     # one key, two different bodies
docker compose --profile tools down -v                                   # clean up everything`)}<p>Read <code>payments/main.py</code>: the key path is about 25 lines.</p>`,
          expect: "Never retrying loses no money but leaves about 40 customers told 'failed' after being charged. Retrying without a key double-charges about 40–50 orders. With keys: exactly 200 charges for 200 orders, and every retry that gets through is answered from the stored response.",
          solution: `${H.code(`mode: no idempotency keys, --retries 0
  client saw success for:             162 orders
  charges in the database:            200            <- 38 charged, told "failed"

mode: no idempotency keys
  HTTP attempts sent (incl. retries): 243   retries: 43
  charges in the database:            243
  orders charged more than once:      39
  money overcharged:                  $1,426.21

mode: WITH idempotency keys
  HTTP attempts sent (incl. retries): 254   retries: 54
  client saw success for:             200 orders   replayed responses: 41
  charges in the database:            200
  orders charged more than once:      0

same key, same body:          200 {...charge_id: 201...}  Idempotent-Replayed=true
same key, different amount:   422 Idempotency-Key reused with a different request body`, [3, 8, 14])}
            <ul><li><b>The three delivery guarantees from lesson 7.5, measured.</b> At-most-once (no retry) loses certainty. At-least-once (retry) creates duplicates. At-least-once plus idempotency gives the effect of exactly-once.</li><li><b>The key is created once per order, by the client</b>, and reused on every retry. A new key per attempt would be useless: the server could not tell a retry from a new purchase.</li><li><b>One transaction.</b> Claiming the key, inserting the charge and storing the response commit together. If they were separate, a crash between them could leave a charge with no stored response (or a key with no charge). If two retries race, the second <code>INSERT … ON CONFLICT</code> waits for the first transaction, then replays its result.</li><li><b>Why 54 retries but only 41 replays?</b> A replayed response travels over the same unreliable network, so some are late too. The client just retries again with the same key; however many times it does, there is still one charge.</li><li><b>Reusing a key for a different request is refused</b> (Stripe does the same), because guessing which one the client meant is worse than an error.</li><li><b>Alternatives.</b> When the operation has a natural identity, a unique constraint does the same job (<code>UNIQUE (order_id)</code> on charges here). Keys are the general tool when it does not. Expire stored keys after your retry window (Stripe: 24 hours).</li><li>Your numbers vary run to run because the 20% is random.</li></ul>` }
      ]
    }
  });
})();
