/* Level 5 — Replication and high availability */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };

  /* ---------------- 5.1 Leader–follower replication ---------------- */
  function streaming(root) {
    const p = H.panel(root, "Watch the write-ahead log stream to replicas", "Try it");
    p.innerHTML = `<div class="controls">
        <button class="btn primary" type="button" id="st-w">Write a row</button>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="st-auto"> Steady writes (4 per second)</label>
      </div><div class="controls">
        <div class="ctl"><label for="st-l1">Replica 1 delay (same zone) <output id="st-l1o"></output></label><input type="range" id="st-l1" min="1" max="200" value="5"></div>
        <div class="ctl"><label for="st-l2">Replica 2 delay (other region, busy) <output id="st-l2o"></output></label><input type="range" id="st-l2" min="50" max="4000" step="50" value="900"></div>
      </div>
      <div class="svgwrap minw" id="st-svg"></div><div class="readout" id="st-r"></div><div class="callout" id="st-v">Write some rows and watch each replica apply them.</div>`;
    let seq = 0; const applied = [0, 0]; const inflight = [];
    const svgHost = p.querySelector("#st-svg");
    const s = H.svg("svg", { viewBox: "0 0 700 230", role: "img", "aria-label": "A primary streaming its log to two replicas" });
    svgHost.appendChild(s);
    const box = (x, y, t, sub, col) => { H.svg("rect", { x, y, width: 170, height: 64, rx: 10, fill: "var(--surface)", stroke: col, "stroke-width": 2 }, s); const a = H.svg("text", { x: x + 85, y: y + 26, "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: "var(--ink)" }, s); a.textContent = t; const b = H.svg("text", { x: x + 85, y: y + 46, "text-anchor": "middle", "font-size": 12, fill: "var(--muted)", class: "mono" }, s); b.textContent = sub; return b; };
    H.svg("path", { d: "M200 115 L500 50", stroke: "var(--line-strong)", fill: "none", "stroke-dasharray": "4 4" }, s);
    H.svg("path", { d: "M200 115 L500 180", stroke: "var(--line-strong)", fill: "none", "stroke-dasharray": "4 4" }, s);
    const tP = box(30, 83, "Primary", "log at #0", "var(--data)");
    const t1 = box(500, 18, "Replica 1", "applied #0", "var(--compute)");
    const t2 = box(500, 148, "Replica 2", "applied #0", "var(--compute)");
    const dots = H.svg("g", {}, s);
    function delay(i) { return +p.querySelector(i === 0 ? "#st-l1" : "#st-l2").value; }
    function write() { seq++; const now = performance.now(); [0, 1].forEach(i => inflight.push({ i, n: seq, t0: now, t1: now + delay(i) })); }
    function frame(now) {
      if (!document.body.contains(s)) return;
      dots.innerHTML = "";
      for (let k = inflight.length - 1; k >= 0; k--) {
        const m = inflight[k], f = Math.min(1, (now - m.t0) / Math.max(1, m.t1 - m.t0));
        if (f >= 1) { applied[m.i] = Math.max(applied[m.i], m.n); inflight.splice(k, 1); continue; }
        const x = 200 + f * 300, y = 115 + f * (m.i === 0 ? -65 : 65);
        H.svg("circle", { cx: x, cy: y, r: 5, fill: "var(--signal)" }, dots);
      }
      tP.textContent = "log at #" + seq; t1.textContent = "applied #" + applied[0]; t2.textContent = "applied #" + applied[1];
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const rep = () => {
      p.querySelector("#st-l1o").textContent = delay(0) + " ms"; p.querySelector("#st-l2o").textContent = delay(1) + " ms";
      const lag = [seq - applied[0], seq - applied[1]];
      readout(p.querySelector("#st-r"), [["Replica 1 behind by", lag[0] + " writes", lag[0] ? "warn" : "good"], ["Replica 2 behind by", lag[1] + " writes", lag[1] > 2 ? "bad" : lag[1] ? "warn" : "good"]]);
      if (seq) { const v = p.querySelector("#st-v"); v.className = "callout " + (lag[1] > 2 ? "warn" : "good"); v.textContent = lag[1] > 2 ? `Replica 2 is ${lag[1]} writes behind. A read sent there right now returns data that is ${delay(1)} ms old. This is replication lag, and with asynchronous replication it is normal: it grows with distance, load and slow disks.` : "Every change is first written to the primary's write-ahead log (WAL), then streamed to each replica, which replays it in the same order. Replicas are exact, read-only copies, just slightly behind."; }
    };
    let auto = null;
    p.querySelector("#st-w").onclick = () => { write(); rep(); };
    p.querySelector("#st-auto").onchange = e => { clearInterval(auto); if (e.target.checked) auto = setInterval(() => { if (!document.body.contains(s)) { clearInterval(auto); return; } write(); }, 250); };
    p.querySelectorAll("input[type=range]").forEach(i => i.addEventListener("input", rep));
    const iv = setInterval(() => { if (!document.body.contains(s)) { clearInterval(iv); return; } rep(); }, 200);
    rep();
  }

  /* ---------------- 5.2 Sync vs async, and lag you can see ---------------- */
  function syncAsync(root) {
    const p = H.panel(root, "Synchronous or asynchronous?", "Try it");
    p.innerHTML = `<div class="controls"><div><div class="note" style="margin-bottom:4px">synchronous_commit</div><div class="seg" id="sa-m"></div></div></div>
      <div class="controls"><div class="ctl"><label for="sa-r">Round trip to the replica <output id="sa-ro"></output></label><input type="range" id="sa-r" min="0" max="4" value="1"></div>
        <div class="ctl"><label for="sa-w">Writes per second <output id="sa-wo"></output></label><input type="range" id="sa-w" min="10" max="5000" step="10" value="500"></div></div>
      <div class="controls"><button class="btn danger" type="button" id="sa-crash">Primary crashes now</button><button class="btn danger" type="button" id="sa-rdown">The replica goes down</button></div>
      <div class="readout" id="sa-out"></div><div class="callout" id="sa-v"></div>`;
    const RTT = [[0.5, "0.5 ms (same zone)"], [1.5, "1.5 ms (another zone)"], [12, "12 ms (nearby region)"], [80, "80 ms (Europe ↔ US)"], [160, "160 ms (Europe ↔ Asia)"]];
    let mode = "off", ev = null;
    seg(p.querySelector("#sa-m"), [["off", "async (off/local)"], ["on", "on (replica flushed)"], ["remote_apply", "remote_apply (replica visible)"]], mode, v => { mode = v; ev = null; upd(); });
    function upd() {
      const [rtt, rl] = RTT[+p.querySelector("#sa-r").value], wps = +p.querySelector("#sa-w").value;
      p.querySelector("#sa-ro").textContent = rl; p.querySelector("#sa-wo").textContent = wps.toLocaleString();
      const local = 1.0, sync = mode !== "off";
      const commit = local + (sync ? rtt + (mode === "remote_apply" ? 0.5 : 0) : 0);
      const lagMs = rtt / 2 + 2, lost = Math.max(1, Math.round(wps * lagMs / 1000));
      readout(p.querySelector("#sa-out"), [["Commit latency", commit.toFixed(1) + " ms", commit > 20 ? "bad" : commit > 5 ? "warn" : "good"], ["Max commits/s per connection", Math.floor(1000 / commit).toLocaleString()], ["Committed data lost if the primary dies", sync ? "none" : "~" + lost + " transactions", sync ? "good" : "warn"]]);
      const v = p.querySelector("#sa-v");
      if (ev === "crash") { v.className = "callout " + (sync ? "good" : "bad"); v.textContent = sync ? "Every commit the application was told about is on the replica too. Promote it and nothing is lost." : `About ${lost} transactions had been confirmed to users but not yet shipped. When the replica is promoted they are gone: the users were told 'saved', and it was not. Asynchronous replication trades this window for speed.`; return; }
      if (ev === "rdown") { v.className = "callout " + (sync ? "bad" : "good"); v.textContent = sync ? "Every commit now waits for a replica that will never answer: writes hang. This is why synchronous setups name several standbys (synchronous_standby_names = 'ANY 1 (r1, r2)'): any one confirming is enough." : "The primary does not care: it keeps committing, and the replica catches up from the WAL when it returns (as long as the primary still has that WAL)."; return; }
      if (!sync) { v.className = "callout good"; v.textContent = "Asynchronous: the primary confirms a commit once it is safely on its own disk, then ships it. Fastest, and a replica outage does not affect writes. The cost is a small window of confirmed writes that a crash can lose."; }
      else if (rtt > 20) { v.className = "callout bad"; v.textContent = `Every commit now pays a ${rtt} ms round trip. A single connection can commit at most ${Math.floor(1000 / commit)} times per second. Synchronous replication across regions is rare for this reason; it is usually done within a region, across zones.`; }
      else { v.className = "callout good"; v.textContent = mode === "on" ? "Synchronous: a commit returns only after a standby has written it to durable storage. No confirmed data is lost if the primary dies. Within a region the cost is about a millisecond." : "remote_apply waits until the standby has also replayed the change, so reads on that standby immediately see it (read-your-writes across servers), at a little more latency."; }
    }
    p.querySelector("#sa-crash").onclick = () => { ev = "crash"; upd(); };
    p.querySelector("#sa-rdown").onclick = () => { ev = "rdown"; upd(); };
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", () => { ev = null; upd(); }));
    upd();

    const q = H.panel(root, "Replication lag that users can see", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">Reads go to a replica that is 500 ms behind. Maria changes her display name and the page reloads 100 ms later.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Read routing</div><div class="seg" id="ry-m"></div></div></div>
      <div id="ry-t" style="display:grid;gap:6px"></div><div class="callout" id="ry-v"></div>`;
    let r = "replica";
    function ry() {
      const rows = [["t=0 ms", "Maria saves her name as 'Maria K.'", "write → primary", "ok"]];
      if (r === "replica") rows.push(["t=100 ms", "The page reloads and reads her profile", "read → replica (still has the old row)", "bad"], ["t=100 ms", "She sees 'Maria' and thinks the save failed", "", "bad"], ["t=500 ms", "The replica catches up", "", "muted"]);
      if (r === "primary-after-write") rows.push(["t=100 ms", "The app remembers she wrote in the last 5 s and reads from the primary", "read → primary", "ok"], ["t=100 ms", "She sees 'Maria K.'", "", "ok"]);
      if (r === "lsn") rows.push(["t=100 ms", "The app stored the write's log position and asks the replica to wait until it has replayed that far", "read → replica (waits ~400 ms)", "ok"], ["t=500 ms", "She sees 'Maria K.' (slower, but correct)", "", "ok"]);
      if (r === "random") rows.push(["t=100 ms", "Her first read lands on a fresh replica", "'Maria K.'", "ok"], ["t=1500 ms", "She refreshes; the request lands on a lagging replica", "'Maria' (it went back in time)", "bad"]);
      q.querySelector("#ry-t").innerHTML = rows.map(([t, a, b, c]) => `<div style="display:grid;grid-template-columns:80px minmax(0,1fr) minmax(0,220px);gap:10px;font-size:14px;padding:6px 8px;border-left:3px solid var(--${c === "bad" ? "bad" : c === "ok" ? "ok" : "line-strong"})"><span class="mono">${t}</span><span>${a}</span><span class="note">${b}</span></div>`).join("");
      const v = q.querySelector("#ry-v");
      const txt = { replica: ["bad", "A read-your-writes violation: a user does not see their own change. With asynchronous replicas this happens unless the application handles it."], "primary-after-write": ["good", "A common fix: for a short time after a user writes, send that user's reads to the primary."], lsn: ["good", "A precise fix: remember the write's position in the log (LSN) and only read from a replica that has replayed past it. Postgres's remote_apply achieves the same at commit time."], random: ["bad", "Monotonic reads violated: two reads by the same user went to different replicas, and the second showed older data. Pin each user to one replica (for example by hashing the user ID)."] }[r];
      v.className = "callout " + txt[0]; v.textContent = txt[1];
    }
    seg(q.querySelector("#ry-m"), [["replica", "Always a replica"], ["primary-after-write", "Primary for 5 s after a write"], ["lsn", "Replica, but wait for the LSN"], ["random", "A random replica each time"]], r, v => { r = v; ry(); });
    ry();
  }

  /* ---------------- 5.3 Failover ---------------- */
  const FO = {
    auto: { n: "Primary crashes · automatic failover", steps: [
      [{ A: "primary", B: "replica", C: "replica" }, "A", "Normal. A is primary and holds the leader key in etcd, renewing it every 10 s (it expires after 30 s if not renewed). B and C stream from A.", false],
      [{ A: "dead", B: "replica", C: "replica" }, null, "A crashes. Writes fail. Reads from B and C still work.", false],
      [{ A: "dead", B: "replica", C: "replica" }, null, "A stops renewing its leader key. After the 30 s time-to-live it expires.", false],
      [{ A: "dead", B: "candidate", C: "replica" }, null, "B and C race for the key. Patroni only lets a healthy replica that is not too far behind take it: B wins.", false],
      [{ A: "dead", B: "primary", C: "replica" }, null, "B is promoted: it stops replaying and starts accepting writes on a new timeline. C now follows B.", false],
      [{ A: "dead", B: "primary", C: "replica" }, "B", "Clients find the new primary: HAProxy checks each node's Patroni API, where only the leader answers 200 on /primary, so traffic moves to B.", false],
      [{ A: "replica", B: "primary", C: "replica" }, "B", "A comes back. Patroni sees it no longer holds the key and rejoins it as a replica of B, using pg_rewind if it had diverged.", false]],
      v: ["good", "Total write outage: roughly the key's time-to-live plus a few seconds, with nobody woken up. With asynchronous replication, writes A had confirmed but not yet shipped are lost; synchronous replication to B would prevent that."] },
    manual: { n: "Primary crashes · manual failover", steps: [
      [{ A: "primary", B: "replica", C: "replica" }, "A", "Normal. A is primary; B and C stream from it.", false],
      [{ A: "dead", B: "replica", C: "replica" }, null, "03:12 · A crashes. Writes fail.", false],
      [{ A: "dead", B: "replica", C: "replica" }, null, "03:14 · The uptime monitor pages the on-call engineer.", false],
      [{ A: "dead", B: "replica", C: "replica" }, null, "03:31 · They are awake, logged in, and checking which replica is most up to date.", false],
      [{ A: "dead", B: "primary", C: "replica" }, null, "03:38 · SELECT pg_promote() on B. C is re-pointed at B by hand.", false],
      [{ A: "dead", B: "primary", C: "replica" }, "B", "03:45 · The application config is changed to B and redeployed. Writes work again.", false]],
      v: ["warn", "About 30 minutes of write outage at 3 a.m. Perfectly acceptable for many products (Level 1's 99.5–99.9%), and far simpler than automation. Practise it with a runbook."] },
    fenced: { n: "Network partition · with fencing", steps: [
      [{ A: "primary", B: "replica", C: "replica" }, "A", "Normal. A is primary and holds the leader key.", false],
      [{ A: "primary", B: "replica", C: "replica" }, "A", "A network fault cuts A off from etcd, B and C. A is still running, and some clients can still reach it.", true],
      [{ A: "readonly", B: "replica", C: "replica" }, "A", "A cannot renew its leader key. Before the key expires, Patroni on A demotes it to read-only: it would rather refuse writes than risk two primaries.", true],
      [{ A: "readonly", B: "primary", C: "replica" }, "B", "The key expires; B takes it and is promoted. Clients that can reach B write there. Clients stuck with A get errors, not silent divergence.", true],
      [{ A: "replica", B: "primary", C: "replica" }, "B", "The network heals. A rejoins as a replica of B.", false]],
      v: ["good", "Only one node can accept writes at any moment, because becoming or staying primary requires holding a lease in a consensus store (etcd uses Raft, Level 7). This is fencing: the old leader is prevented from acting as leader."] },
    split: { n: "Network partition · no fencing", steps: [
      [{ A: "primary", B: "replica", C: "replica" }, "A", "Normal. A is primary. A simple script promotes B if it cannot reach A for 10 s.", false],
      [{ A: "primary", B: "replica", C: "replica" }, "A", "A network fault separates A from B and C. A is fine and keeps serving the clients that can reach it.", true],
      [{ A: "primary", B: "primary", C: "replica" }, "A+B", "B cannot see A, so the script promotes B. Now there are two primaries, each accepting writes from different clients.", true],
      [{ A: "primary", B: "primary", C: "replica" }, "A+B", "Order 1001 is written on A, a different order 1001 on B. Balances diverge. This is split brain.", true],
      [{ A: "primary", B: "primary", C: "replica" }, "B", "The network heals. Both have unique writes the other lacks. There is no automatic way to merge them.", false]],
      v: ["bad", "Split brain: hours or days of manual reconciliation. GitHub's October 2018 incident started with a 43-second network partition and an automatic cross-data-centre failover; untangling the diverged writes caused 24 hours of degraded service. Never let a node promote itself based only on 'I cannot see the primary'."] }
  };
  function failover(root) {
    const p = H.panel(root, "Step through a failover", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="fo-s"></div></div><div class="svgwrap minw" id="fo-svg"></div>
      <div class="callout" id="fo-t" aria-live="polite"></div>
      <div class="controls"><button class="btn" type="button" id="fo-p">← Back</button><button class="btn primary" type="button" id="fo-n">Next →</button><span class="note" id="fo-c"></span></div>
      <div class="callout" id="fo-v" hidden></div>`;
    let k = "auto", i = 0;
    const COL = { primary: "var(--data)", replica: "var(--compute)", dead: "var(--bad)", candidate: "var(--xp)", readonly: "var(--xp)" };
    const LBL = { primary: "PRIMARY (read/write)", replica: "replica", dead: "down", candidate: "candidate", readonly: "read-only (demoted)" };
    function draw() {
      const F = FO[k], [roles, clients, text, part] = F.steps[i];
      const s = H.svg("svg", { viewBox: "0 0 700 240", role: "img", "aria-label": "Database cluster state" });
      const pos = { A: [60, 120], B: [300, 40], C: [300, 170] };
      H.svg("rect", { x: 520, y: 90, width: 150, height: 56, rx: 10, fill: "var(--surface-2)", stroke: "var(--line-strong)" }, s);
      const et = H.svg("text", { x: 595, y: 114, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); et.textContent = k === "manual" || k === "split" ? "(no consensus store)" : "etcd";
      const et2 = H.svg("text", { x: 595, y: 132, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, s); et2.textContent = k === "manual" || k === "split" ? "" : "leader key → " + (Object.keys(roles).find(n => roles[n] === "primary" && (k !== "fenced" || true)) || "none");
      if (part) H.svg("path", { d: "M185 10 L185 230", stroke: "var(--bad)", "stroke-width": 3, "stroke-dasharray": "8 6" }, s);
      Object.entries(pos).forEach(([n, [x, y]]) => {
        const r = roles[n];
        H.svg("rect", { x, y, width: 170, height: 56, rx: 10, fill: r === "dead" ? "var(--bad-soft)" : "var(--surface)", stroke: COL[r], "stroke-width": 2.5 }, s);
        const a = H.svg("text", { x: x + 85, y: y + 24, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: "var(--ink)" }, s); a.textContent = "Node " + n;
        const b = H.svg("text", { x: x + 85, y: y + 43, "text-anchor": "middle", "font-size": 11.5, fill: COL[r], "font-weight": 600 }, s); b.textContent = LBL[r];
      });
      if (clients) { const c = H.svg("text", { x: 20, y: 22, "font-size": 12, fill: "var(--signal)", "font-weight": 600 }, s); c.textContent = "clients write to: " + clients; }
      const h = p.querySelector("#fo-svg"); h.innerHTML = ""; h.appendChild(s);
      p.querySelector("#fo-t").textContent = text;
      p.querySelector("#fo-c").textContent = `Step ${i + 1} of ${F.steps.length}`;
      p.querySelector("#fo-p").disabled = i === 0; p.querySelector("#fo-n").disabled = i === F.steps.length - 1;
      const v = p.querySelector("#fo-v"); v.hidden = i !== F.steps.length - 1; v.className = "callout " + F.v[0]; v.textContent = F.v[1];
    }
    seg(p.querySelector("#fo-s"), Object.entries(FO).map(([a, b]) => [a, b.n]), k, v => { k = v; i = 0; draw(); });
    p.querySelector("#fo-n").onclick = () => { i++; draw(); }; p.querySelector("#fo-p").onclick = () => { i--; draw(); };
    draw();
  }

  /* ---------------- 5.4 Multi-leader and leaderless ---------------- */
  function leaderless(root) {
    const p = H.panel(root, "Two leaders, one conflict", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A document is replicated between a leader in Frankfurt and a leader in Virginia. At nearly the same moment, an editor in each region changes its title.</p>
      <div class="controls"><div><div class="note" style="margin-bottom:4px">Conflict resolution</div><div class="seg" id="ml-m"></div></div></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px" id="ml-b"></div><div class="callout" id="ml-v"></div>`;
    let m = "lww";
    function draw() {
      const b = p.querySelector("#ml-b");
      const res = { lww: ["“Q3 plan (final)”", "“Q3 plan (final)”"], merge: ["both kept: “Q3 plan (final)” | “Q3 roadmap”", "both kept"], home: ["“Q3 plan (final)”", "edit forwarded to Frankfurt → rejected, retry"] }[m];
      b.innerHTML = `<div style="border:1.5px solid var(--data);border-radius:10px;padding:10px"><b>Frankfurt</b><div class="note">12:00:00.120 sets title “Q3 roadmap”</div><div class="mono" style="margin-top:6px">${res[0]}</div></div>
        <div style="border:1.5px solid var(--data);border-radius:10px;padding:10px"><b>Virginia</b><div class="note">12:00:00.100 (by its clock) sets title “Q3 plan (final)”</div><div class="mono" style="margin-top:6px">${res[1]}</div></div>`;
      const v = p.querySelector("#ml-v");
      const t = { lww: ["bad", "Last write wins by timestamp: Frankfurt's edit is silently discarded. And Virginia's clock was 50 ms fast, so the edit that really happened last lost. LWW is simple and used widely (Cassandra uses it per column), but it quietly drops data."], merge: ["warn", "Keep both versions and let the application or the user resolve them later (CouchDB's conflicts, Riak's siblings), or use data types designed to merge automatically (CRDTs, as in collaborative editors). Correct, but the complexity moves into your code."], home: ["good", "Avoid conflicts: give each record a home region, and send all writes for it there. Most multi-region systems do this; true multi-leader writes to the same data are rare for good reason."] }[m];
      v.className = "callout " + t[0]; v.textContent = t[1];
    }
    seg(p.querySelector("#ml-m"), [["lww", "Last write wins"], ["merge", "Keep both, resolve later"], ["home", "One home region per record"]], m, v => { m = v; draw(); });
    draw();

    const q = H.panel(root, "Leaderless quorums: R + W > N", "Try it");
    q.innerHTML = `<p class="note" style="margin-top:0">In Dynamo-style databases (Cassandra, Riak, ScyllaDB) any replica accepts writes. A write is sent to all N replicas and succeeds when W confirm; a read asks R replicas and takes the newest answer.</p>
      <div class="controls">
        <div class="ctl"><label for="qu-n">N replicas <output id="qu-no"></output></label><input type="range" id="qu-n" min="1" max="7" value="3"></div>
        <div class="ctl"><label for="qu-w">W (write acks) <output id="qu-wo"></output></label><input type="range" id="qu-w" min="1" max="7" value="2"></div>
        <div class="ctl"><label for="qu-r">R (read replies) <output id="qu-ro"></output></label><input type="range" id="qu-r" min="1" max="7" value="2"></div>
      </div><div class="svgwrap" id="qu-svg"></div><div class="readout" id="qu-o"></div><div class="callout" id="qu-v"></div>`;
    function qd() {
      const n = +q.querySelector("#qu-n").value; const wi = q.querySelector("#qu-w"), ri = q.querySelector("#qu-r");
      wi.max = n; ri.max = n; if (+wi.value > n) wi.value = n; if (+ri.value > n) ri.value = n;
      const w = +wi.value, r = +ri.value;
      q.querySelector("#qu-no").textContent = n; q.querySelector("#qu-wo").textContent = w; q.querySelector("#qu-ro").textContent = r;
      const s = H.svg("svg", { viewBox: "0 0 700 150", role: "img", "aria-label": "Replicas with the latest write and the replicas a read contacts" });
      const gap = 680 / n;
      for (let i = 0; i < n; i++) {
        const x = 10 + i * gap + gap / 2, has = i < w, read = i >= n - r;
        H.svg("circle", { cx: x, cy: 60, r: 26, fill: has ? "var(--ok-soft)" : "var(--surface-2)", stroke: has ? "var(--ok)" : "var(--line-strong)", "stroke-width": 2 }, s);
        const t = H.svg("text", { x, y: 65, "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--ink)", class: "mono" }, s); t.textContent = has ? "v2" : "v1";
        if (read) { H.svg("rect", { x: x - 32, y: 98, width: 64, height: 22, rx: 6, fill: "var(--compute-soft)", stroke: "var(--compute)" }, s); const rt = H.svg("text", { x, y: 113, "text-anchor": "middle", "font-size": 11, fill: "var(--compute)", "font-weight": 600 }, s); rt.textContent = "read"; }
      }
      const lg = H.svg("text", { x: 10, y: 144, "font-size": 11, fill: "var(--muted)" }, s); lg.textContent = "green = got the new write (worst case: the first W)  ·  'read' = the replicas a read contacts (worst case: the last R)";
      const h = q.querySelector("#qu-svg"); h.innerHTML = ""; h.appendChild(s);
      const ok = r + w > n;
      readout(q.querySelector("#qu-o"), [["R + W", (r + w) + (ok ? " > " : " ≤ ") + n, ok ? "good" : "bad"], ["Writes survive", (n - w) + " replicas down"], ["Reads survive", (n - r) + " replicas down"]]);
      const v = q.querySelector("#qu-v");
      if (ok) { v.className = "callout good"; v.textContent = `Any ${r} replicas you read must include at least one of the ${w} that took the write, so a read sees the newest value. N=3, W=2, R=2 is the classic choice: one replica can be down for both reads and writes. (Edge cases such as sloppy quorums and concurrent writes still weaken this; DDIA chapter 5 covers them.)`; }
      else { v.className = "callout bad"; v.textContent = "The read and write sets can miss each other entirely: a read may return only stale replicas. Faster and more available, but only eventually consistent. Cassandra exposes this choice per query as consistency levels (ONE, QUORUM, ALL)."; }
    }
    q.querySelectorAll("input").forEach(i => i.addEventListener("input", qd)); qd();
  }

  /* ---------------- 5.5 What protects against what ---------------- */
  const PROT = [["zone", "Replica in another zone"], ["region", "Replica in another region"], ["nightly", "Nightly backups in a separate account"], ["pitr", "WAL archiving for point-in-time recovery"], ["delayed", "A delayed replica (1 hour behind)"]];
  const DIS = [
    ["disk", "The primary's disk dies"], ["zone", "A whole zone (data centre) goes down"], ["region", "The whole region goes down"],
    ["delete", "Someone runs DELETE FROM orders; (no WHERE)"], ["migration", "A bad migration corrupts a column"], ["attacker", "An attacker with your cloud credentials deletes everything in the account"]
  ];
  function protection(root) {
    const p = H.panel(root, "What protects against what?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Pick your protections. Each row shows the best recovery available for that disaster.</p><div class="controls" id="pr-c" style="gap:8px 18px"></div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px;min-width:560px" id="pr-t"></table></div><div class="callout" id="pr-v"></div>`;
    const on = new Set(["zone", "nightly"]);
    PROT.forEach(([k, l]) => { const e = H.el(`<label style="display:flex;gap:6px;align-items:center;font-size:14px"><input type="checkbox" ${on.has(k) ? "checked" : ""}> ${l}</label>`); e.querySelector("input").onchange = ev => { ev.target.checked ? on.add(k) : on.delete(k); draw(); }; p.querySelector("#pr-c").appendChild(e); });
    function best(d) {
      const opts = [];
      const backup = () => { if (on.has("pitr") && d !== "attacker") opts.push([1, "Restore base backup + replay WAL", "seconds–minutes", "~1 hour"]); if (on.has("nightly")) opts.push([2, "Restore last night's backup", "up to 24 h", "hours"]); };
      if (d === "disk") { if (on.has("zone") || on.has("region")) opts.push([0, "Fail over to a replica", "~0 (seconds if async)", "seconds–minutes"]); backup(); }
      if (d === "zone") { if (on.has("zone") || on.has("region")) opts.push([0, "Fail over to the replica in a healthy zone", "~0", "seconds–minutes"]); backup(); }
      if (d === "region") { if (on.has("region")) opts.push([0, "Fail over to the other region", "seconds (async lag)", "minutes"]); if (on.has("nightly")) opts.push([2, "Restore the backup in another region", "up to 24 h", "hours"]); }
      if (d === "delete" || d === "migration") { if (on.has("delayed")) opts.push([0, "Stop the delayed replica's replay before the mistake, promote or copy the rows back", "~0", "minutes–1 hour"]); backup(); }
      if (d === "attacker") { if (on.has("nightly")) opts.push([2, "Restore from the backups in the separate account", "up to 24 h", "hours–days"]); }
      opts.sort((a, b) => a[0] - b[0]);
      return opts[0] || null;
    }
    function draw() {
      let worst = 0;
      p.querySelector("#pr-t").innerHTML = `<thead><tr><th style="text-align:left;padding:6px">Disaster</th><th style="text-align:left;padding:6px">Best recovery</th><th style="text-align:left;padding:6px">Data lost (RPO)</th><th style="text-align:left;padding:6px">Downtime (RTO)</th></tr></thead><tbody>${DIS.map(([k, l]) => { const b = best(k); if (!b) worst = 2; else if (b[0] === 2) worst = Math.max(worst, 1); const col = !b ? "bad" : b[0] === 0 ? "ok" : b[0] === 1 ? "ok" : "xp"; return `<tr><td style="padding:6px;border-top:1px solid var(--line)">${l}</td><td style="padding:6px;border-top:1px solid var(--line);color:var(--${col})">${b ? b[1] : "Nothing: the data is gone"}</td><td style="padding:6px;border-top:1px solid var(--line)">${b ? b[2] : "everything"}</td><td style="padding:6px;border-top:1px solid var(--line)">${b ? b[3] : "-"}</td></tr>`; }).join("")}</tbody>`;
      const v = p.querySelector("#pr-v");
      if (worst === 2) { v.className = "callout bad"; v.textContent = "At least one disaster ends the business. Notice that replicas never help with mistakes or attackers: they copy a DELETE within milliseconds. Only backups (ideally in a separate account with separate credentials) and point-in-time recovery do."; }
      else if (worst === 1) { v.className = "callout warn"; v.textContent = "Everything is recoverable, but some disasters cost up to a day of data. WAL archiving shrinks that to seconds or minutes."; }
      else { v.className = "callout good"; v.textContent = "Every disaster has a recovery path. Replicas give fast failover for hardware and zone failures; backups and point-in-time recovery cover mistakes and attackers. Now test the restores (Level 1, step 7)."; }
    }
    draw();
  }

  Course.register({
    id: 5,
    blurb: "Copies of your database for availability, read scaling and safety: how they stay in sync, what lag does to users, how failover really works, and what replicas cannot protect you from.",
    examBadge: "lvl5",
    lessons: [
      { id: "5.1", sources: [["High Availability, Load Balancing, and Replication", "https://www.postgresql.org/docs/16/high-availability.html", "PostgreSQL 16 documentation, chapter 27"], ["Log-Shipping Standby Servers", "https://www.postgresql.org/docs/16/warm-standby.html", "PostgreSQL 16 documentation"], ["Designing Data-Intensive Applications, chapter 5", "https://dataintensive.net/", "Martin Kleppmann: replication"]],
        title: "Leader–follower replication", minutes: 20,
        lede: "The most common replication setup: one primary accepts writes and streams its log to replicas, which replay it. Watch the log flow and the lag appear.",
        render(r) { streaming(r); H.keys(r, [["Why replicate", "Survive machine failures, spread read load, and put data closer to users."], ["One writer", "Only the primary accepts writes, so there are no write conflicts to resolve."], ["Replicas are read-only", "Postgres calls them hot standbys: they serve queries while replaying."], ["Lag is normal", "Asynchronous replicas are always slightly behind; how far depends on load and distance."]]); },
        check: { q: "Why do read replicas help a read-heavy application but not a write-heavy one?", opts: ["Replicas usually run on faster machines, and that only helps with reads", "Reads spread across replicas, but every write still goes through one primary", "Replicas cache incoming writes and apply them to the primary in batches", "Writes are much cheaper than reads, so they rarely need extra capacity"], a: 1, why: "Replicas multiply read capacity. Write capacity is still one primary's; scaling writes needs sharding (Level 6)." } },
      { id: "5.2", sources: [["Log-Shipping Standby Servers: synchronous replication", "https://www.postgresql.org/docs/16/warm-standby.html#SYNCHRONOUS-REPLICATION", "PostgreSQL 16 documentation"], ["Replication settings", "https://www.postgresql.org/docs/16/runtime-config-replication.html", "PostgreSQL 16 documentation"], ["Designing Data-Intensive Applications, chapter 5", "https://dataintensive.net/", "Problems with replication lag"]],
        title: "Synchronous, asynchronous, and lag users can see", minutes: 25,
        lede: "Should a commit wait for a replica? That single setting trades write latency against losing confirmed data. And lag on asynchronous replicas creates bugs users notice.",
        render(r) { syncAsync(r); H.keys(r, [["Async", "Fast, replica outages don't block writes, a crash can lose recent commits."], ["Sync", "No confirmed commit is lost, each commit pays a round trip, writes stop if no synchronous standby answers."], ["Read your own writes", "After a user writes, read their data from the primary or a caught-up replica."], ["Monotonic reads", "Keep each user on the same replica so time never goes backwards."]]); },
        check: { q: "A user saves a setting, the page reloads, and the old value appears. Reads go to an async replica. What is the right fix?", opts: ["Add more replicas, so each one has less work and lags less", "Read that user's data from the primary for a short time after they write", "Move the primary to a faster machine, so writes finish sooner", "Increase the cache TTL, so the saved value is served from cache"], a: 1, why: "This is a read-your-writes violation caused by replication lag. Route the writer's reads to an up-to-date copy." } },
      { id: "5.3", sources: [["Patroni documentation", "https://patroni.readthedocs.io/en/latest/", "PostgreSQL high availability with etcd, Consul, ZooKeeper or Kubernetes"], ["October 21 post-incident analysis", "https://github.blog/news-insights/company-news/oct21-post-incident-analysis/", "GitHub, 2018"], ["pg_rewind", "https://www.postgresql.org/docs/16/app-pgrewind.html", "PostgreSQL 16 documentation"]],
        title: "Failover without split brain", minutes: 30,
        lede: "Promoting a replica is easy. Deciding when, making sure the old primary stops, and moving clients over is the hard part. Step through four failovers, one of which goes very wrong.",
        render(r) { failover(r); H.keys(r, [["Detection is a guess", "A timeout cannot tell a dead primary from a slow or cut-off one (Level 7)."], ["Leases, not opinions", "Hold a primary role only while holding a lock in a consensus store."], ["Fence the old leader", "It must stop accepting writes before anyone else starts."], ["Manual is legitimate", "A practised 30-minute manual failover beats a poorly understood automatic one."]]); },
        check: { q: "What is split brain?", opts: ["A replica falling so far behind that it must be rebuilt", "Two nodes both acting as primary and accepting different writes", "A query planner choosing different plans on primary and replica", "A primary whose data is mirrored across two disks that disagree"], a: 1, why: "Two primaries diverge, and merging their writes afterwards is manual and painful. Fencing and leases prevent it." } },
      { id: "5.4", sources: [["Dynamo: Amazon's Highly Available Key-value Store", "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", "DeCandia et al., SOSP 2007"], ["Dynamo (architecture)", "https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html", "Apache Cassandra documentation"], ["Designing Data-Intensive Applications, chapter 5", "https://dataintensive.net/", "Multi-leader and leaderless replication"]],
        title: "Multi-leader and leaderless replication", minutes: 25,
        lede: "Accepting writes in more than one place improves availability and latency, and creates conflicts. See how they are resolved, and how quorums keep leaderless systems consistent enough.",
        render(r) { leaderless(r); H.keys(r, [["Multi-leader", "Each region writes locally; conflicts must be detected and resolved."], ["Last write wins loses data", "Concurrent writes are silently dropped, and clocks decide who 'won'."], ["Leaderless quorums", "With R + W > N, reads overlap the latest write."], ["Prefer a home for each record", "Avoiding conflicts beats resolving them."]]); },
        check: { q: "N = 5 replicas, W = 3. What is the smallest R that guarantees a read overlaps the latest write?", opts: ["1", "2", "3", "5"], a: 2, why: "R + W must exceed N: R + 3 > 5, so R = 3." } },
      { id: "5.5", sources: [["Continuous Archiving and Point-in-Time Recovery", "https://www.postgresql.org/docs/16/continuous-archiving.html", "PostgreSQL 16 documentation"], ["recovery_min_apply_delay", "https://www.postgresql.org/docs/16/runtime-config-replication.html", "PostgreSQL 16 documentation: delayed standbys"], ["pgBackRest user guide", "https://pgbackrest.org/user-guide.html", "Backups, WAL archiving and restores"]],
        title: "Replicas are not backups", minutes: 20,
        lede: "Replicas protect against machines failing. Backups protect against people, bugs and attackers. Build a protection plan and test it against six disasters.",
        render(r) { protection(r); H.keys(r, [["Replicas copy mistakes", "A DELETE reaches every replica in milliseconds."], ["Point-in-time recovery", "Base backup + archived WAL = restore to any second."], ["Separate credentials", "Backups an attacker can delete with the same keys are not backups."], ["Managed databases", "RDS Multi-AZ or Cloud SQL HA give you failover and PITR as settings, at a price."]]); },
        check: { q: "Someone runs a bad UPDATE on production. You have two synchronous replicas and nightly backups. What gets the data back with the least loss?", opts: ["Fail over to one of the synchronous replicas", "Restore last night's backup", "Promote both replicas and compare their data", "Nothing can be done once the UPDATE has committed"], a: 1, why: "The replicas applied the bad UPDATE too. Nightly backups get you back to midnight; WAL archiving would let you restore to one second before the mistake." } }
    ],
    exam: [
      { q: "In Postgres streaming replication, what is sent from the primary to replicas?", opts: ["The SQL statements, which each replica re-executes", "The write-ahead log (WAL) records", "A full copy of each changed table every minute", "The IDs of committed rows, which replicas fetch on demand"], a: 1, why: "Replicas replay the same WAL the primary writes, producing an identical copy." },
      { q: "What is the main cost of synchronous replication?", opts: ["Replicas need more disk to store the extra commit confirmations they send", "Each commit waits for a standby; with no standby answering, writes stop", "Reads become slower, because each one checks that the replica is in sync", "Postgres supports it only for a replica in the same rack as the primary"], a: 1, why: "Durability across machines is paid for in commit latency and dependency on the standby." },
      { q: "With asynchronous replication, the primary dies. What may be lost when a replica is promoted?", opts: ["Nothing, because the replica receives each transaction before it commits", "Recently committed transactions that had not reached the replica", "The whole database, until the old primary's disk is recovered", "Only the indexes, which the new primary rebuilds from the tables"], a: 1, why: "The replica is slightly behind; the gap is lost." },
      { q: "Why does Patroni store the leader key in etcd with a time-to-live?", opts: ["To save memory, because etcd discards keys that are not renewed in time", "So only the lease holder acts as primary, and a node that can't renew demotes", "To speed up queries, because clients find the primary without asking every node", "To compress the write-ahead log that the replicas fetch from the primary"], a: 1, why: "A lease in a consensus store gives one agreed leader and enables fencing." },
      { q: "A replica is 2 seconds behind. A user writes, then immediately reads from that replica. Which guarantee is violated?", opts: ["Atomicity: the write was only partly applied", "Read-your-writes", "Durability: the write may have been lost", "Linearizable writes across the primary and replicas"], a: 1, why: "The user does not see their own write." },
      { q: "In a leaderless system with N = 3, which settings let both reads and writes succeed with one replica down while still overlapping?", opts: ["W=3, R=1", "W=2, R=2", "W=1, R=1", "W=3, R=3"], a: 1, why: "2 + 2 > 3 overlaps, and each tolerates one replica down." },
      { q: "Which protection recovers from DELETE FROM orders; run by mistake?", opts: ["A synchronous replica that confirms every commit", "A read replica in another region", "Point-in-time recovery or a delayed replica", "RAID 10 across four disks"], a: 2, why: "Replicas apply the DELETE immediately. Only something that preserves the past helps." },
      { q: "What is last-write-wins conflict resolution's main drawback?", opts: ["It is slow, because every write needs a cluster-wide timestamp first", "Concurrent writes are silently dropped, and clock skew picks the winner", "It requires a consensus protocol such as Raft on every single write", "It works only in single-leader databases such as Postgres or MySQL"], a: 1, why: "One write is dropped without anyone being told." }
    ],
    lab: {
      title: "Primary, replica, failover, point-in-time recovery",
      time: "about 6 hours",
      folder: "level-5-replication/",
      needs: "Docker Desktop (or Docker Engine), a terminal",
      intro: `<p>Two official <code>postgres:16</code> containers: a primary that archives its write-ahead log, and a replica built from it with <code>pg_basebackup</code>. You will watch streaming replication and lag, make replication synchronous and see writes stop, fail over by promoting the replica, and recover from a destructive DELETE with point-in-time recovery.</p><p>No ports are published. <code>./pg.sh primary …</code> and <code>./pg.sh replica …</code> run psql inside each container.</p>`,
      vmIntro: "If your database runs as a single container, these checks cover the backup side of this level and tell you what you would gain from a replica or a managed database.",
      vmChecks: [
        ["Is the WAL being archived (point-in-time recovery possible)?", "docker compose exec db psql -U <user> -d <db> -c \"SHOW archive_mode;\" -c \"SELECT archived_count, failed_count, last_archived_time, last_failed_time FROM pg_stat_archiver;\"", "<code>archive_mode = on</code>, a recent <code>last_archived_time</code>, and <code>failed_count</code> not growing. If archive_mode is off, your RPO is your last nightly dump."],
        ["How long would a restore take?", "ls -lh /srv/app/backups | tail -3\ndocker compose exec db psql -U <user> -d <db> -c \"SELECT pg_size_pretty(pg_database_size(current_database()));\"", "Compare the database size with your last measured restore time from Level 1 (restore-test.sh). That is your recovery time objective today."],
        ["If you add a replica later: is it healthy?", "docker compose exec db psql -U <user> -d <db> -c \"SELECT client_addr, state, sync_state, replay_lag FROM pg_stat_replication;\"", "<code>state = streaming</code> and a replay_lag of well under a second in normal operation."]
      ],
      steps: [
        { id: "l5-1", why: "Before relying on a replica you need to know how to confirm it is streaming and how far behind it is. These are the two queries you will use most.", title: "Start the pair and confirm streaming",
          body: `${H.code(`cd level-5-replication
docker compose up -d
docker compose logs replica | tail -5          # the pg_basebackup clone, then streaming
./pg.sh primary -c "SELECT client_addr, application_name, state, sync_state, replay_lag FROM pg_stat_replication;"
./pg.sh replica -c "SELECT pg_is_in_recovery();"`)}<p>Read <code>scripts/replica-entrypoint.sh</code>: on first start the replica copies the primary with <code>pg_basebackup -R</code>, then starts as a standby.</p>`,
          expect: "One row on the primary with <code>state = streaming</code> and <code>sync_state = async</code>. The replica reports <code>pg_is_in_recovery = t</code>.",
          solution: `${H.code(` client_addr | application_name |   state   | sync_state |   replay_lag
-------------+------------------+-----------+------------+-----------------
 172.18.0.3  | walreceiver      | streaming | async      | 00:00:00.000435

 pg_is_in_recovery
-------------------
 t`)}
            <ul><li><code>pg_stat_replication</code> on the primary has one row per connected standby. <code>streaming</code> means it is receiving WAL as it is written.</li><li><code>pg_is_in_recovery() = t</code>: the replica is permanently "recovering", replaying the primary's log. That is what a standby is.</li><li><code>pg_basebackup -R</code> wrote <code>standby.signal</code> and a <code>primary_conninfo</code> line into the replica's <code>postgresql.auto.conf</code>; those two make it a standby.</li></ul>` },
        { id: "l5-2", why: "Replicas are only useful if you understand what they can and cannot do. Trying a write on one makes 'read-only' concrete.", title: "Read from the replica, try to write to it",
          body: `${H.code(`./pg.sh primary -c "INSERT INTO events (note) VALUES ('hello from the primary');"
./pg.sh replica -c "SELECT id, note FROM events ORDER BY id DESC LIMIT 1;"
./pg.sh replica -c "INSERT INTO events (note) VALUES ('can I write here?');"`)}`,
          expect: "The replica returns the new row within a moment. The insert on the replica fails.",
          solution: `${H.code(`  id  |          note
------+------------------------
 1001 | hello from the primary

ERROR:  cannot execute INSERT in a read-only transaction`, [4])}
            <p>Replicas can serve any read, which is how they scale read traffic. Every write must go to the primary, so applications that use replicas need two connection strings (or a proxy that routes by query type), plus the lag handling from Lesson 5.2.</p>` },
        { id: "l5-3", why: "Lag is invisible until it causes a bug. Creating it on purpose shows how it builds up, how to measure it, and how a replica catches up.", title: "Create replication lag",
          body: `<p><code>docker compose pause</code> freezes the replica's processes, like a stalled disk or an overloaded machine.</p>${H.code(`LAG="SELECT application_name, state, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS behind, replay_lag FROM pg_stat_replication;"
docker compose pause replica
./pg.sh primary -c "INSERT INTO events (note) SELECT 'bulk ' || g FROM generate_series(1, 200000) g;"
./pg.sh primary -c "$LAG"
docker compose unpause replica
sleep 3; ./pg.sh primary -c "$LAG"`)}`,
          expect: "While paused, the replica is tens of megabytes of WAL behind. A few seconds after unpausing it is 0 bytes behind.",
          solution: `${H.code(` application_name |   state   | behind |   replay_lag
------------------+-----------+--------+-----------------
 walreceiver      | streaming | 30 MB  | 00:00:00.001579     <- while paused

 application_name |   state   | behind  |   replay_lag
------------------+-----------+---------+-----------------
 walreceiver      | streaming | 0 bytes | 00:00:00.226338     <- caught up`, [3])}
            <ul><li><b>Bytes behind</b> (<code>pg_wal_lsn_diff</code>) is the reliable measure: how much log the primary has written that the replica has not replayed.</li><li><b>replay_lag is misleading here.</b> It is computed from the standby's own reports, and a frozen standby sends none, so the value is stale (it still shows the last healthy figure). Alert on bytes behind, or on replay_lag together with a check that it is being updated.</li><li>The primary keeps WAL the replica still needs (up to <code>wal_keep_size</code>, 512 MB here). If a replica falls further behind than that, it can no longer catch up from streaming and must be re-cloned, unless you use a replication slot (which has the opposite risk: the primary's disk fills up).</li></ul>` },
        { id: "l5-4", why: "Synchronous replication is a trade-off you should see fail before you choose it: no lost commits, but a missing standby blocks every write.", title: "Make replication synchronous, then stop the standby",
          body: `${H.code(`./pg.sh primary -c "ALTER SYSTEM SET synchronous_standby_names = '*';" -c "SELECT pg_reload_conf();"
./pg.sh primary -c "SELECT application_name, sync_state FROM pg_stat_replication;"
docker compose stop replica
./pg.sh primary -c "INSERT INTO events (note) VALUES ('will this commit?');"
#   ...it hangs. Wait a few seconds, then press Ctrl-C.
./pg.sh primary -c "SELECT note FROM events WHERE note = 'will this commit?';"
# put things back
./pg.sh primary -c "ALTER SYSTEM RESET synchronous_standby_names;" -c "SELECT pg_reload_conf();"
docker compose start replica`)}`,
          expect: "<code>sync_state</code> becomes <code>sync</code>. With the standby stopped, the INSERT hangs until you press Ctrl-C, then prints a warning. The row is visible on the primary afterwards.",
          solution: `${H.code(` application_name | sync_state
------------------+------------
 walreceiver      | sync

^CCancel request sent
WARNING:  canceling wait for synchronous replication due to user request
DETAIL:  The transaction has already committed locally, but might not have been replicated to the standby.

       note
-------------------
 will this commit?`, [6, 7])}
            <ul><li>With a synchronous standby configured, a commit returns only when the standby confirms. With no standby, every write waits forever. Even <code>statement_timeout</code> does not end that wait; only a cancel does.</li><li><b>Read the DETAIL line carefully.</b> The transaction had already committed on the primary before it started waiting, so cancelling does not undo it: the row exists, but the client was never told "committed", and no standby has it. Synchronous replication guarantees that confirmed commits are on the standby; it cannot make unconfirmed ones disappear.</li><li>That is why production setups list several standbys, for example <code>ANY 1 (replica1, replica2)</code>, so one standby can fail without stopping writes.</li></ul>` },
        { id: "l5-5", why: "Point-in-time recovery is the one protection that undoes human mistakes. Restoring to the second before a destructive query is the most valuable backup skill there is.", title: "Undo a DELETE with point-in-time recovery",
          body: `<p>The primary has been copying every finished WAL file into the <code>wal-archive</code> volume (<code>archive_command</code> in <code>scripts/primary-entrypoint.sh</code>). Take a base backup, make some valuable changes, then destroy everything.</p>${H.code(`docker compose exec -u postgres -e PGPASSWORD=replpass primary pg_basebackup -h 127.0.0.1 -U replicator -D /backups/base -X stream --checkpoint=fast
./pg.sh primary -c "INSERT INTO events (note) VALUES ('important order A'), ('important order B'), ('important order C');"
./pg.sh primary -Atc "SELECT now();"            # note this timestamp
./pg.sh primary -c "DELETE FROM events;"        # the mistake
./pg.sh primary -c "SELECT pg_switch_wal();"    # close the current WAL file so it is archived now
RESTORE_TARGET='<the timestamp you noted>' docker compose --profile pitr up -d restore
docker compose logs restore | grep -iE "point-in-time|stopping|timeline|complete"
./pg.sh restore -c "SELECT count(*) FROM events;" -c "SELECT note FROM events WHERE note LIKE 'important%';"`)}<p>In a real incident you would not have noted the time in advance. You would find it from your application logs, or from the WAL itself with <code>pg_waldump</code>.</p>`,
          expect: "The primary has 0 rows. The restored server has every row, including the three important orders, and is a normal read-write server on a new timeline.",
          solution: `${H.code(`starting point-in-time recovery to 2026-10-13 13:28:46.049488+00
recovery stopping before commit of transaction 751, time 2026-10-13 13:28:47.181241+00
selected new timeline ID: 2
archive recovery complete

 count
--------
 201005

       note
-------------------
 important order A
 important order B
 important order C`, [2])}
            <ul><li>The restore server started from the base backup, then fetched archived WAL files one by one with <code>restore_command</code> and replayed them. It stopped just before transaction 751, the DELETE, because that committed after the target time.</li><li><b>RPO here is zero</b>: everything up to the mistake is back. With only nightly dumps you would have lost everything since midnight.</li><li><b>New timeline 2</b>: the restored server's history now branches from the primary's. Postgres numbers timelines so WAL from the two histories is never mixed up.</li><li>In production you would recover into a separate server like this, check the data, then copy the lost rows back or switch the application over. Tools such as pgBackRest and WAL-G manage base backups and the archive (with compression and retention) for you.</li></ul>` },
        { id: "l5-6", why: "Failover is the reason replicas exist. Doing it by hand once teaches you exactly what tools like Patroni automate, and why fencing matters.", title: "Fail over, then cause split brain",
          body: `${H.code(`docker compose stop primary                     # the primary "crashes"
./pg.sh replica -c "SELECT pg_promote();"
./pg.sh replica -c "SELECT pg_is_in_recovery();" -c "INSERT INTO events (note) VALUES ('written on the new primary');"
docker compose start primary                    # ...and then the old primary comes back
./pg.sh primary -c "SELECT pg_is_in_recovery();" -c "INSERT INTO events (note) VALUES ('written on the OLD primary');"
docker compose down -v                          # finish: removes the containers and all lab data`)}`,
          expect: "The promoted replica accepts writes. The restarted old primary also accepts writes: two independent primaries.",
          solution: `${H.code(` pg_promote
------------
 t

 pg_is_in_recovery          <- the old replica
-------------------
 f
INSERT 0 1

 pg_is_in_recovery          <- the old primary, restarted
-------------------
 f
INSERT 0 1`, [11, 12, 13])}
            <ul><li><code>pg_promote()</code> ends recovery: the replica starts a new timeline and accepts writes. That part takes a second.</li><li>The old primary knows nothing about it. It starts up as a primary again and happily takes writes. Any client still pointed at it now writes to a database nobody else sees: <b>split brain</b>, reproduced in two commands.</li><li>What Patroni adds is everything around <code>pg_promote()</code>: it only lets a node be primary while it holds a lease in etcd, demotes a node that loses the lease, and rejoins the old primary as a replica with <code>pg_rewind</code>. Managed databases (RDS Multi-AZ, Cloud SQL HA) do the same behind the scenes.</li></ul>` }
      ]
    }
  });
})();
