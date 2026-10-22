/* Level 12 — Capstone: designing real systems */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const txt = (parent, x, y, s, attrs) => { const t = H.svg("text", Object.assign({ x, y, "font-size": 12, fill: "var(--ink)" }, attrs || {}), parent); t.textContent = s; return t; };
  const num = n => n >= 1e12 ? (n / 1e12).toFixed(1) + "T" : n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : n.toFixed(n < 10 ? 1 : 0);

  /* Decision cards: a question, options, the best option, and feedback for each. */
  function decisions(root, title, cards) {
    const p = H.panel(root, title, "Decide");
    p.innerHTML = `<div id="dc-l" style="display:grid;gap:10px"></div><div class="readout" id="dc-r" style="margin-top:12px"></div>`;
    const list = p.querySelector("#dc-l"), got = {};
    const score = () => readout(p.querySelector("#dc-r"), [["Decisions made", `${Object.keys(got).length} of ${cards.length}`], ["Matched the usual answer", Object.values(got).filter(Boolean).length]]);
    cards.forEach(([q, opts, best, why], ci) => {
      const row = H.el(`<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><div style="font-weight:600;font-size:14px;margin-bottom:8px"></div><div style="display:grid;gap:6px"></div><div class="note" style="display:none;margin-top:8px"></div></div>`);
      row.firstElementChild.textContent = q;
      opts.forEach(([label, fb], oi) => {
        const b = H.el(`<button class="btn" type="button" style="text-align:left;justify-content:flex-start"></button>`); b.textContent = label;
        b.onclick = () => { const n = row.querySelector(".note"); n.style.display = ""; n.style.color = "var(--ink)"; n.innerHTML = ""; const head = document.createElement("b"); head.textContent = oi === best ? "Good choice. " : "Possible, but consider the trade-off. "; head.style.color = oi === best ? "var(--ok)" : "var(--xp)"; n.appendChild(head); n.appendChild(document.createTextNode(fb + " " + why)); got[ci] = oi === best; row.querySelectorAll("button").forEach(x => x.style.outline = x === b ? "2px solid " + (oi === best ? "var(--ok)" : "var(--xp)") : ""); score(); };
        row.children[1].appendChild(b);
      });
      list.appendChild(row);
    });
    score();
  }

  /* ---------------- 12.1 Framework and estimates ---------------- */
  function estimator(root) {
    const p = H.panel(root, "Back-of-the-envelope, before any boxes", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Estimates decide the design. Change the inputs and watch which levels of this course become necessary.</p>
      <div class="controls">
        <div class="ctl" style="min-width:200px"><label for="es-dau">Daily active users <output id="es-dauo"></output></label><input type="range" id="es-dau" min="3" max="9" step="0.5" value="6"></div>
        <div class="ctl" style="min-width:200px"><label for="es-w">Writes per user per day <output id="es-wo"></output></label><input type="range" id="es-w" min="0" max="3" step="0.5" value="0"></div>
        <div class="ctl" style="min-width:200px"><label for="es-r">Reads per write <output id="es-ro"></output></label><input type="range" id="es-r" min="0" max="3" step="0.5" value="2"></div>
        <div class="ctl" style="min-width:200px"><label for="es-s">Bytes per record <output id="es-so"></output></label><input type="range" id="es-s" min="2" max="6" step="0.5" value="3"></div>
      </div>
      <div class="readout" id="es-out"></div><div class="callout" id="es-v"></div>`;
    function run() {
      const dau = Math.pow(10, +p.querySelector("#es-dau").value), w = Math.pow(10, +p.querySelector("#es-w").value), rr = Math.pow(10, +p.querySelector("#es-r").value), sz = Math.pow(10, +p.querySelector("#es-s").value);
      p.querySelector("#es-dauo").textContent = num(dau); p.querySelector("#es-wo").textContent = num(w); p.querySelector("#es-ro").textContent = num(rr); p.querySelector("#es-so").textContent = H.fmtBytes(sz);
      const wps = dau * w / 86400, rps = wps * rr, peak = 3, storeYear = dau * w * 365 * sz;
      readout(p.querySelector("#es-out"), [["Writes/s (avg → peak ×3)", `${num(wps)} → ${num(wps * peak)}`], ["Reads/s (avg → peak)", `${num(rps)} → ${num(rps * peak)}`, rps * peak > 1e5 ? "bad" : rps * peak > 1e4 ? "warn" : ""], ["New data per year", H.fmtBytes(storeYear), storeYear > 1e13 ? "bad" : storeYear > 1e12 ? "warn" : ""]]);
      const notes = [];
      if (rps * peak > 2e4) notes.push("reads at this rate want a cache and read replicas (Levels 3, 5)");
      if (wps * peak > 5e3) notes.push("writes at this rate approach one Postgres primary's comfortable limit: plan partitioning or sharding (Level 6)");
      if (storeYear > 5e12) notes.push("tens of terabytes per year means tiered storage and retention policies");
      if (!notes.length) notes.push("one well-indexed Postgres, one app tier and a cache would carry this comfortably. Do not build more than this");
      const v = p.querySelector("#es-v"); v.className = "callout " + (notes.length > 1 ? "warn" : "good"); v.textContent = "At these numbers, " + notes.join("; ") + ".";
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", run)); run();
  }

  /* ---------------- 12.2 URL shortener ---------------- */
  function codes(root) {
    const p = H.panel(root, "How long must a short code be?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Codes use base62 (a–z, A–Z, 0–9). Random codes are checked against a unique index and retried on collision.</p>
      <div class="controls"><div class="ctl" style="min-width:200px"><label for="cd-n">Code length <output id="cd-no"></output></label><input type="range" id="cd-n" min="4" max="10" value="7"></div>
      <div class="ctl" style="min-width:240px"><label for="cd-k">Links already stored <output id="cd-ko"></output></label><input type="range" id="cd-k" min="5" max="11" step="0.5" value="9"></div></div>
      <div class="readout" id="cd-r"></div><div class="callout" id="cd-v"></div>`;
    function run() {
      const n = +p.querySelector("#cd-n").value, k = Math.pow(10, +p.querySelector("#cd-k").value), space = Math.pow(62, n), pc = Math.min(1, k / space);
      p.querySelector("#cd-no").textContent = n + " chars"; p.querySelector("#cd-ko").textContent = num(k);
      readout(p.querySelector("#cd-r"), [["Possible codes (62^" + n + ")", num(space)], ["Chance a new random code is taken", pc < 1e-6 ? "< 0.0001%" : (pc * 100).toFixed(pc < 0.01 ? 4 : 1) + "%", pc > 0.1 ? "bad" : pc > 0.001 ? "warn" : "good"], ["Expected tries per new link", pc >= 1 ? "∞" : (1 / (1 - pc)).toFixed(pc < 0.001 ? 4 : 2)]]);
      const v = p.querySelector("#cd-v"); v.className = "callout " + (pc > 0.1 ? "bad" : pc > 0.001 ? "warn" : "good");
      v.textContent = pc >= 1 ? "The space is full: every code is taken. Use longer codes." : pc > 0.1 ? "Collisions are now common: creation slows down with retries. Lengthen the code before you get here." : `With ${num(k)} links, a random ${n}-character code collides ${pc < 1e-6 ? "almost never" : "rarely"}; one INSERT with a unique constraint and a retry on conflict is enough. Random codes are also not guessable, unlike a counter.`;
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", run)); run();
  }

  const URL_CARDS = [
    ["How do you generate the short code?", [
      ["Hash the long URL (e.g. first 7 characters of its MD5)", "Deterministic, but different URLs can collide and you must handle it anyway, and two users shortening the same URL share one code (and its analytics)."],
      ["A database counter, encoded in base62", "Short and collision-free, but sequential codes let anyone enumerate every link (a privacy problem), and one counter becomes a hot spot."],
      ["Random base62, unique index, retry on conflict", "Unguessable, simple, no coordination; collisions are rare and caught by the database."],
      ["Snowflake IDs in base62", "Unique without coordination (Level 6), but 64-bit IDs make 11-character codes, and they leak creation time."]], 2,
      "Most production shorteners use random or pre-generated codes checked against a unique index."],
    ["Should the redirect be 301 or 302?", [
      ["301 Moved Permanently", "Browsers may cache it indefinitely, so later clicks never reach you: less load, but no click analytics and no way to change or disable the link."],
      ["302 Found (or 307)", "Every click comes to you: you can count it, change the destination, or block abuse."]], 1,
      "RFC 9110 lets clients cache a 301 by default; a 302 is only cached if headers say so. Choose by whether you need to see clicks."],
    ["Where do links live?", [
      ["One Postgres table, primary key on the code, plus a Redis cache", "Billions of small rows fit; lookups by primary key are fast; the cache takes almost all reads."],
      ["A sharded cluster from day one", "Works at huge scale, but you pay its complexity long before you need it."],
      ["Redis only", "Fast, but Redis is a cache unless you configure persistence carefully; losing links is not acceptable."]], 0,
      "Estimate first: 100 million new links a month is about 40 writes per second, well within one primary. Shard by code later if needed (Level 6)."],
    ["How do you record clicks?", [
      ["UPDATE links SET clicks = clicks + 1 on every redirect", "Simple, but every redirect becomes a write, and popular links become hot rows that serialise on their lock (Level 4)."],
      ["Append click events to a stream and aggregate asynchronously", "The redirect stays a fast read; counting happens in batches off the critical path (Level 8)."]], 1,
      "Keep the hot path read-only. Analytics can be seconds behind; redirects cannot be slow."]
  ];

  /* ---------------- 12.3 Chat ---------------- */
  function chat(root) {
    const p = H.panel(root, "Deliver a chat message", "Try it");
    p.innerHTML = `<div class="controls"><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ch-on" checked> Bob is online</label><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ch-two"> Bob has two devices</label><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ch-crash"> Bob's gateway crashed a moment ago</label></div>
      <div class="svgwrap" id="ch-svg"></div><div class="callout" id="ch-v"></div>
      <div class="controls" style="margin-top:14px"><div class="ctl" style="min-width:260px"><label for="ch-u">Users online at once <output id="ch-uo"></output></label><input type="range" id="ch-u" min="4" max="8" step="0.5" value="6"></div></div><div class="readout" id="ch-r"></div>`;
    function draw() {
      const on = p.querySelector("#ch-on").checked, two = p.querySelector("#ch-two").checked, crash = p.querySelector("#ch-crash").checked;
      const W = 680, Hh = 200, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Chat message path" });
      const defs = H.svg("defs", {}, s), mk = H.svg("marker", { id: "ch-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.6 }, mk);
      const box = (x, y, w, l, col, dash) => { H.svg("rect", { x, y, width: w, height: 34, rx: 8, fill: "var(--surface)", stroke: col, "stroke-dasharray": dash ? "5 4" : "" }, s); txt(s, x + w / 2, y + 21, l, { "text-anchor": "middle", "font-size": 11, "font-weight": 600 }); };
      const arr = (x1, y1, x2, y2, col, label) => { H.svg("line", { x1, y1, x2, y2, stroke: col, "stroke-width": 1.8, "marker-end": "url(#ch-ar)" }, s); if (label) txt(s, (x1 + x2) / 2, (y1 + y2) / 2 - 5, label, { "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" }); };
      box(10, 80, 70, "Alice", "var(--line-strong)"); box(110, 80, 110, "WS gateway 1", "var(--compute)"); box(250, 80, 120, "Message service", "var(--data)");
      box(250, 150, 120, "Store (seq 1042)", "var(--data)"); box(250, 10, 120, "Presence (Redis)", "var(--xp)");
      arr(80, 97, 108, 97, "var(--compute)"); arr(220, 97, 248, 97, "var(--compute)"); arr(310, 114, 310, 148, "var(--data)", ""); arr(310, 80, 310, 46, "var(--xp)", "");
      let note;
      if (!on) { box(420, 80, 120, "Push (APNs/FCM)", "var(--signal)"); arr(370, 97, 418, 97, "var(--signal)"); box(570, 80, 100, "Bob's phone", "var(--line-strong)", true); arr(540, 97, 568, 97, "var(--signal)"); note = "Presence says Bob is offline, so a push notification goes out. The message is already stored with sequence number 1042; when Bob opens the app it asks for everything after the last sequence it has."; }
      else if (crash) { box(420, 80, 120, "WS gateway 2 (down)", "var(--bad)", true); box(570, 80, 100, "Bob", "var(--line-strong)"); note = "Presence still points at the dead gateway. Delivery fails, but nothing is lost: the message is stored. Bob's client notices the dropped connection, reconnects to another gateway, and asks for messages after the last sequence it saw. Store first, deliver second."; }
      else { box(420, 80, 120, "WS gateway 2", "var(--compute)"); arr(370, 97, 418, 97, "var(--compute)", ""); box(570, two ? 55 : 80, 100, "Bob (phone)", "var(--line-strong)"); arr(540, 97, 568, two ? 72 : 97, "var(--compute)"); if (two) { box(570, 110, 100, "Bob (laptop)", "var(--line-strong)"); arr(540, 97, 568, 127, "var(--compute)"); } note = two ? "Presence maps Bob to two connections (possibly on different gateways); the message goes to both. Each device acknowledges by message ID, so a retry never shows a duplicate." : "Presence maps Bob to gateway 2, which holds his WebSocket. The message service stores the message, gives it the next sequence number in this conversation, and forwards it. Bob's app acknowledges it."; }
      const h = p.querySelector("#ch-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#ch-v"); v.className = "callout " + (crash && on ? "warn" : ""); v.textContent = note;
      const u = Math.pow(10, +p.querySelector("#ch-u").value); p.querySelector("#ch-uo").textContent = num(u);
      readout(p.querySelector("#ch-r"), [["Open WebSockets", num(u)], ["Gateway servers (≈100k connections each, with headroom)", Math.max(2, Math.ceil(u / 100000 * 1.5))], ["Heartbeats per second (every 30 s)", num(u / 30)]]);
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener(i.type === "range" ? "input" : "change", draw)); draw();
  }

  /* ---------------- 12.4 Feed and notifications ---------------- */
  function fanout(root) {
    const p = H.panel(root, "Fan-out on write, on read, or both?", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A user posts. Their followers' home feeds must show it. Push: write the post ID into every follower's precomputed feed. Pull: build each feed when it is opened, by querying everyone the reader follows.</p>
      <div class="controls"><div class="ctl" style="min-width:250px"><label for="fo-f">Poster's followers <output id="fo-fo"></output></label><input type="range" id="fo-f" min="1" max="8" step="0.5" value="2.5"></div>
      <div class="ctl" style="min-width:250px"><label for="fo-g">Accounts a reader follows <output id="fo-go"></output></label><input type="range" id="fo-g" min="1" max="3.5" step="0.5" value="2.5"></div><div class="seg" id="fo-m"></div></div>
      <div class="readout" id="fo-r"></div><div class="callout" id="fo-v"></div>`;
    let mode = "hybrid";
    function run() {
      const f = Math.pow(10, +p.querySelector("#fo-f").value), g = Math.pow(10, +p.querySelector("#fo-g").value); p.querySelector("#fo-fo").textContent = num(f); p.querySelector("#fo-go").textContent = num(g);
      const celeb = f > 1e5, push = mode === "push" || (mode === "hybrid" && !celeb);
      readout(p.querySelector("#fo-r"), [["Writes when this user posts", push ? num(f) + " feed inserts" : "1 (the post)", push && f > 1e6 ? "bad" : ""], ["Work when a reader opens the feed", mode === "pull" ? `query ${num(g)} accounts, merge, sort` : mode === "hybrid" ? "read 1 precomputed feed + merge a few celebrities" : "read 1 precomputed feed", mode === "pull" && g > 300 ? "warn" : "good"], ["Feed freshness", push ? "delayed while fan-out runs" : "always current"]]);
      const v = p.querySelector("#fo-v"); v.className = "callout " + (push && f > 1e6 ? "bad" : "");
      v.textContent = mode === "push" ? (f > 1e6 ? `A celebrity post means ${num(f)} inserts: minutes of fan-out work and a burst that can starve everything else. Push alone breaks on accounts like this.` : "Reads are cheap and fast, the common case on read-heavy social apps. The cost is write amplification and storage for every feed.") : mode === "pull" ? "No fan-out at all, but every feed load fans in across all followed accounts; with hundreds of follows and millions of readers that is the expensive direction." : celeb ? "Hybrid: this account has too many followers to push to, so its posts are pulled and merged in when a feed is read. Ordinary accounts still push. This is the approach Twitter described for its home timelines." : "Hybrid: an ordinary account, so the post is pushed into followers' feeds; only very large accounts are pulled at read time.";
    }
    seg(p.querySelector("#fo-m"), [["push", "Push"], ["pull", "Pull"], ["hybrid", "Hybrid"]], mode, v => { mode = v; run(); });
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", run)); run();
  }

  const NOTIF_CARDS = [
    ["A notification service calls Apple's push service, which sometimes times out. What do you do?", [
      ["Retry immediately until it works", "A provider outage turns into a retry storm (Level 10)."],
      ["Queue each notification; workers retry with backoff and give up after a deadline", "The API returns fast, retries are bounded, and stale notifications ('your taxi is here' an hour later) are dropped."],
      ["Skip it; notifications are best-effort", "Some are (marketing); some are not (security codes)."]], 1, "Treat sending as a job (Level 8), with per-type priorities and expiry."],
    ["A bug enqueues the same 'order shipped' notification three times. How do users avoid three pings?", [
      ["Hope it doesn't happen", "At-least-once delivery means it will (Level 8)."],
      ["Deduplicate on a notification key (order ID + type) before sending", "Idempotency again: the first send wins, repeats are skipped (Level 7)."]], 1, "Every consumer of an at-least-once queue needs a dedupe key."],
    ["Marketing wants to send 50 million pushes at 9:00.", [
      ["Send them all at 9:00", "Your workers, your database (to render each message) and the provider all spike at once."],
      ["Rate-limit the campaign and spread it over a window, behind transactional messages in priority", "Login codes and order updates must never wait behind a promotion."]], 1, "Separate queues or priorities by message type, and rate limits per user and per campaign."]
  ];

  /* ---------------- 12.5 Video and ride-hailing ---------------- */
  function abr(root) {
    const p = H.panel(root, "Adaptive bitrate streaming", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">The video was transcoded into several renditions, each cut into segments of a few seconds (HLS or DASH). The player measures its download speed and picks a rendition for each next segment.</p>
      <div class="controls"><div class="ctl" style="min-width:300px"><label for="ab-b">Network bandwidth <output id="ab-bo"></output></label><input type="range" id="ab-b" min="0" max="7" value="4"></div></div>
      <div class="svgwrap" id="ab-svg"></div><div class="callout" id="ab-v"></div>`;
    const BW = [0.3, 0.8, 1.5, 3, 5, 8, 15, 25], LAD = [["240p", 0.4], ["480p", 1.2], ["720p", 3], ["1080p", 6], ["4K", 16]];
    function run() {
      const bw = BW[+p.querySelector("#ab-b").value]; p.querySelector("#ab-bo").textContent = bw + " Mbit/s";
      const usable = bw * 0.8, pick = LAD.filter(l => l[1] <= usable).pop();
      const W = 680, Hh = 130, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Rendition ladder" });
      LAD.forEach(([n, r], i) => { const on = pick && pick[0] === n, ok = r <= usable, x = 20 + i * 130; H.svg("rect", { x, y: 20, width: 120, height: 60, rx: 8, fill: on ? "var(--ok-soft)" : "var(--surface)", stroke: on ? "var(--ok)" : ok ? "var(--line-strong)" : "var(--line)", "stroke-width": on ? 2.5 : 1, opacity: ok ? 1 : 0.45 }, s); txt(s, x + 60, 46, n, { "text-anchor": "middle", "font-weight": 700 }); txt(s, x + 60, 66, r + " Mbit/s", { "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }); });
      txt(s, 20, 108, pick ? `Next segments: ${pick[0]}. Leaving 20% headroom so the buffer keeps filling.` : "Even 240p does not fit: the buffer drains and playback stalls.", { "font-size": 12, fill: pick ? "var(--ink)" : "var(--bad)" });
      const h = p.querySelector("#ab-svg"); h.innerHTML = ""; h.appendChild(s);
      const v = p.querySelector("#ab-v"); v.className = "callout " + (pick ? "" : "bad");
      v.textContent = "Because segments are plain files over HTTP, CDNs cache them like images (Level 3): the origin serves each segment once per edge location, not once per viewer. That is what makes streaming to millions affordable. Transcoding happens once, at upload, as a pipeline of jobs (Level 8).";
    }
    p.querySelector("#ab-b").addEventListener("input", run); run();
  }

  function geo(root) {
    const p = H.panel(root, "Finding nearby drivers", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Drivers send their position every few seconds. To find drivers near a rider, the map is divided into cells (geohash, S2 or H3) and each driver is indexed by the cell they are in.</p>
      <div class="controls"><div class="ctl" style="min-width:240px"><label for="geo-d">Active drivers <output id="geo-do"></output></label><input type="range" id="geo-d" min="3" max="6.5" step="0.5" value="5"></div>
      <div class="ctl" style="min-width:200px"><label for="geo-i">Update every <output id="geo-io"></output></label><input type="range" id="geo-i" min="1" max="30" value="4"></div>
      <div class="ctl" style="min-width:220px"><label for="geo-p">Geohash precision <output id="geo-po"></output></label><input type="range" id="geo-p" min="4" max="7" value="6"></div></div>
      <div class="readout" id="geo-r"></div><div class="callout" id="geo-v"></div>`;
    const CELL = { 4: "≈39 km × 20 km", 5: "≈4.9 km × 4.9 km", 6: "≈1.2 km × 0.6 km", 7: "≈153 m × 153 m" };
    function run() {
      const d = Math.pow(10, +p.querySelector("#geo-d").value), i = +p.querySelector("#geo-i").value, pr = +p.querySelector("#geo-p").value;
      p.querySelector("#geo-do").textContent = num(d); p.querySelector("#geo-io").textContent = i + " s"; p.querySelector("#geo-po").textContent = pr;
      const ups = d / i;
      readout(p.querySelector("#geo-r"), [["Location updates per second", num(ups), ups > 1e5 ? "bad" : ups > 1e4 ? "warn" : ""], ["Cell size", CELL[pr]], ["Search", "the rider's cell plus its 8 neighbours"]]);
      const v = p.querySelector("#geo-v"); v.className = "callout " + (ups > 1e4 ? "warn" : "");
      v.textContent = (ups > 1e4 ? `${num(ups)} writes per second of data that is stale within seconds: keep it in memory (Redis has geo commands), not in a database that writes every update to disk. ` : "") + (pr >= 7 ? "Small cells mean searching many of them in a sparse suburb; " : pr <= 4 ? "Huge cells mean filtering thousands of drivers by exact distance in a dense city; " : "A middle precision balances it; ") + "real systems pick the cell size per area, or use hierarchical indexes like S2 and H3 that make that easy.";
    }
    p.querySelectorAll("input").forEach(x => x.addEventListener("input", run)); run();
  }

  Course.register({
    id: 12,
    blurb: "Putting it all together: a repeatable way to design a system, then six classic designs, each built from the patterns of earlier levels. Finish by building and breaking a complete URL shortener.",
    examBadge: "lvl12",
    lessons: [
      { id: "12.1", sources: [["The System Design Primer", "https://github.com/donnemartin/system-design-primer", "Donne Martin: how to approach a design question"], ["System Design Interview, volume 1, chapter 3", "https://bytebytego.com/", "Alex Xu: a four-step framework"], ["Designing Data-Intensive Applications", "https://dataintensive.net/", "Martin Kleppmann: reliability, scalability, maintainability"]],
        title: "A repeatable design framework", minutes: 25,
        lede: "Good designs come from a process, not a flash of insight: understand the problem, size it, sketch the simplest thing that works, then find where it breaks. Every level of this course is a tool for one of those steps.",
        render(r) { estimator(r); H.keys(r, [["1. Requirements", "Functional (what it does) and non-functional (latency, availability SLO, consistency, durability). Say what you will not build."], ["2. Estimates", "Requests per second, read/write ratio, storage per year, peak vs average (Level 0)."], ["3. API and data model", "The endpoints and the tables or keys. Access patterns decide the store (Level 4)."], ["4. High-level design", "The simplest boxes that meet the numbers. Usually: load balancer, stateless app, database, cache."], ["5. Deep dives", "The hardest parts: hot keys, consistency, failure modes, what happens when each box dies."], ["6. Operate it", "SLOs, deploys, observability and cost (Level 10). A design you cannot run is not finished."]]); },
        check: { q: "What should come before drawing any architecture?", opts: ["Choosing an orchestration platform, such as Kubernetes", "Clarifying requirements and estimating load", "Picking which database brand to use", "Splitting the system into microservices"], a: 1, why: "The numbers and requirements decide which boxes you need at all." } },
      { id: "12.2", sources: [["System Design Interview, volume 1, chapter 8: Design a URL shortener", "https://bytebytego.com/", "Alex Xu"], ["RFC 9110: 301 and 302", "https://www.rfc-editor.org/rfc/rfc9110.html#name-301-moved-permanently", "IETF: caching of redirects"], ["The Birthday Problem", "https://en.wikipedia.org/wiki/Birthday_problem", "Why random IDs collide sooner than intuition suggests"]],
        title: "Case study: a URL shortener", minutes: 25,
        lede: "A tiny product with a very skewed workload: few writes, enormous numbers of reads, a handful of links that go viral. It exercises IDs, caching, redirects and analytics, and it is this level's lab.",
        render(r) { codes(r); decisions(r, "Four decisions", URL_CARDS); H.keys(r, [["Read-heavy", "Often 100 or more redirects per created link: cache aggressively (Level 3)."], ["Random codes + unique index", "Unguessable and coordination-free; collisions are caught by the database."], ["302 for analytics", "301s are cached by browsers and never come back."], ["Keep the redirect path read-only", "Click events go to a stream and are counted asynchronously (Level 8)."], ["Abuse is a requirement", "Rate-limit creation (Level 9), and check destinations against malware lists."]]); },
        check: { q: "Why do many shorteners avoid sequential codes from a counter?", opts: ["Counter-based codes grow too long once there are millions of links", "Anyone can enumerate all links by counting, exposing private URLs", "Base62 cannot encode numbers larger than a 32-bit counter", "Databases cannot generate counters fast enough for link creation"], a: 1, why: "Predictable IDs are enumerable; random codes are not." } },
      { id: "12.3", sources: [["How Discord Stores Trillions of Messages", "https://discord.com/blog/how-discord-stores-trillions-of-messages", "Discord engineering blog, 2023"], ["System Design Interview, volume 1, chapter 12: Design a chat system", "https://bytebytego.com/", "Alex Xu"], ["RFC 6455: The WebSocket Protocol", "https://www.rfc-editor.org/rfc/rfc6455.html", "IETF"]],
        title: "Case study: a chat system", minutes: 25,
        lede: "Chat turns the usual web model around: millions of connections stay open, the server pushes, and users expect every message once, in order, on every device.",
        render(r) { chat(r); H.keys(r, [["Stateful edge, stateless core", "WebSocket gateways hold connections; message services behind them stay stateless and scalable."], ["Presence", "A fast map from user to connection(s), with heartbeats and expiry (Redis, Level 3)."], ["Order per conversation", "A sequence number per conversation, assigned when stored. No global order needed (Level 7)."], ["Store, then deliver", "Persist first; clients sync from their last sequence after any disconnect."], ["Exactly-once display", "At-least-once delivery plus client-side dedupe by message ID (Levels 7–8)."], ["Partition by conversation", "Messages are read by conversation and time, so partition on that (Discord stores them this way)."]]); },
        check: { q: "Bob's phone was offline for an hour. How does it catch up reliably?", opts: ["The server resends every message from every one of its conversations", "It asks, per conversation, for everything after the last sequence it has", "It cannot: messages sent while it was offline are dropped by design", "Alice's app resends anything that Bob's devices have not yet confirmed"], a: 1, why: "Sequence numbers per conversation make sync a simple range query." } },
      { id: "12.4", sources: [["Timelines at Scale", "https://www.infoq.com/presentations/Twitter-Timeline-Scalability/", "Raffi Krikorian, Twitter, QCon 2012"], ["System Design Interview, volume 1, chapters 10 and 11: notifications, news feed", "https://bytebytego.com/", "Alex Xu"], ["Designing Data-Intensive Applications, chapter 1", "https://dataintensive.net/", "The Twitter home timeline example: fan-out on write vs read"]],
        title: "Case study: news feed and notifications", minutes: 25,
        lede: "Feeds are the textbook trade-off between doing work when data is written and when it is read. Notifications are a queue with rules: priorities, deadlines, deduplication and rate limits.",
        render(r) { fanout(r); decisions(r, "Notification decisions", NOTIF_CARDS); H.keys(r, [["Push (fan-out on write)", "Precompute each follower's feed; reads are cheap. Breaks for accounts with millions of followers."], ["Pull (fan-out on read)", "Assemble feeds at read time; no write amplification, expensive reads."], ["Hybrid", "Push for most, pull for the few huge accounts. Described by Twitter and in DDIA."], ["Feeds hold IDs", "Store post IDs in the feed and hydrate them from a cache (Level 3)."], ["Notifications are jobs", "Queued, prioritised, deduplicated, rate-limited per user, retried with backoff and an expiry."]]); },
        check: { q: "Why do large social networks pull posts from celebrity accounts at read time instead of pushing them?", opts: ["Celebrities post so rarely that pushing is not worth it", "Pushing one post would mean millions of feed writes at once", "Pulling is always faster than reading a precomputed feed", "Celebrity accounts are stored in a separate database"], a: 1, why: "Write amplification grows with follower count; hybrid avoids the worst case." } },
      { id: "12.5", sources: [["HTTP Live Streaming", "https://developer.apple.com/streaming/", "Apple: segments, playlists and adaptive bitrate"], ["Per-Title Encode Optimization", "https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2", "Netflix Technology Blog, 2015"], ["H3: Uber's Hexagonal Hierarchical Spatial Index", "https://www.uber.com/blog/h3/", "Uber Engineering, 2018"], ["Geohash", "https://en.wikipedia.org/wiki/Geohash", "Cell sizes by precision"]],
        title: "Case studies: video streaming and ride-hailing", minutes: 25,
        lede: "Two very different workloads. Video moves huge files cheaply by turning them into many small, cacheable ones. Ride-hailing tracks fast-changing positions and answers 'who is near here?' in milliseconds.",
        render(r) { abr(r); geo(r); H.keys(r, [["Transcode once, serve many", "Upload triggers a pipeline of jobs that produce a ladder of renditions (Level 8)."], ["Segments + CDN", "Small files over HTTP cache at the edge; the player adapts bitrate per segment (Level 3)."], ["Spatial indexes", "Geohash, S2 or H3 cells turn 'nearby' into 'same or neighbouring cell'."], ["Ephemeral, high-rate data", "Driver positions live in memory and expire; trips and payments go to durable storage."], ["Matching is a workflow", "Offer, accept, timeout, re-offer: a state machine with idempotent steps (Level 7)."]]); },
        check: { q: "Why is video split into segments of a few seconds?", opts: ["To save disk space, because short files compress much better", "So players can switch quality per segment and CDNs can cache them", "Because browsers cannot play any video file longer than a few seconds", "So each segment can be encrypted with its own separate key"], a: 1, why: "Segments enable adaptive bitrate and edge caching." } }
    ],
    exam: [
      { q: "A design must handle 50 writes per second and 5,000 reads per second. What is the most sensible starting point?", opts: ["Shard the data across 10 databases from the start", "One Postgres primary, a cache and maybe a read replica", "A multi-region active/active cluster for availability", "A data lake with nightly batch jobs to serve the reads"], a: 1, why: "Those numbers fit comfortably; complexity should follow need." },
      { q: "A URL shortener needs click analytics and the ability to disable links. Which redirect status?", opts: ["301", "302", "200 with JavaScript", "404"], a: 1, why: "302s are not cached by default, so every click reaches you." },
      { q: "How should a URL shortener count clicks at high volume?", opts: ["Increment a counter row on each redirect", "Emit click events and aggregate them asynchronously", "Count the clicks in the browser with JavaScript", "Keep a counter in each app instance's memory, never saved"], a: 1, why: "Keep the hot path read-only; aggregate off it." },
      { q: "In a chat system, what gives messages a reliable order?", opts: ["The servers' wall-clock timestamps, synchronised with NTP", "A per-conversation sequence number assigned when it is stored", "The order in which the senders' clients send the messages", "A global lock taken by the server for every message sent"], a: 1, why: "Ordering within a conversation is enough and avoids clock problems." },
      { q: "What is the main problem with pure fan-out on write for feeds?", opts: ["Slow reads, because each feed is rebuilt when it is opened", "Huge write amplification for accounts with millions of followers", "Feeds cannot be cached, because they change on every post", "It only works with relational databases that support joins"], a: 1, why: "One post becomes millions of writes." },
      { q: "A notification fails because the push provider is down. Best behaviour?", opts: ["Retry immediately, and keep retrying until it is delivered", "Retry from a queue with backoff, and drop it after its deadline", "Drop it immediately, because notifications are best-effort", "Always send an email instead, so the user still gets it"], a: 1, why: "Bounded retries with expiry; stale notifications are worse than none." },
      { q: "Why does streaming video scale well with CDNs?", opts: ["Video files are small once compressed, so CDNs can hold whole libraries", "Segments are ordinary cacheable files, so the edge serves repeat viewers", "CDNs transcode the video at the edge for each viewer's device", "Streaming uses UDP, which CDNs forward without keeping state"], a: 1, why: "The origin serves each segment once per edge, not per viewer." },
      { q: "Where should a ride-hailing system keep live driver locations updated every few seconds?", opts: ["In the main relational database, one row written per update", "In memory, with a spatial index and expiry on each position", "In a CDN, so riders' apps can fetch nearby drivers quickly", "Only in the drivers' own apps, which are queried when needed"], a: 1, why: "High-rate ephemeral data belongs in memory; durable data is trips and payments." }
    ],
    lab: {
      title: "Capstone: build, load, break and document a URL shortener",
      time: "about 6 hours",
      folder: "level-12-capstone/",
      needs: "Docker Desktop (or Docker Engine) and a terminal; port 8090 free on localhost (or set APP_PORT)",
      intro: `<p>The capstone brings the course together in one small system. You design it on paper first, then run a reference implementation, load it, break its parts one at a time, and finish by writing the design document. The reference uses patterns from earlier levels: a gateway with rate limits (Level 9), stateless replicas (Level 2), cache-aside (Level 3), an append-only event stream with a consumer group (Level 8), and random IDs checked by a unique index (Level 6).</p><p>Only the gateway is published, on <code>127.0.0.1:8090</code> (set <code>APP_PORT</code> to change it). k6 and the scripts run on the Compose network. Do step 1 before reading the code: the comparison is where the learning happens.</p>`,
      vmIntro: "Read-only checks that a real deployment of your own app covers what this capstone did. Each points back to the level that taught it.",
      vmChecks: [
        ["Is there one way in?", "sudo ss -tlnp | grep -vE '127.0.0.1|::1'", "Only nginx (80/443) and SSH listen publicly; the app, database and cache are on localhost or a Docker network (Levels 1 and 11)."],
        ["Are abusive clients slowed down?", "sudo nginx -T 2>/dev/null | grep -nE 'limit_req(_zone)?'", "A limit on the expensive or abusable endpoints (sign-up, login, creation), answering 429 (Level 9)."],
        ["Does the app survive its cache failing?", "grep -rnE 'socket_timeout|socket_connect_timeout' --include=*.py .", "Redis clients have short timeouts, and the code falls back to the database when the cache errors (Level 3)."],
        ["Is the hot path free of writes it does not need?", "grep -rnE 'UPDATE .*(count|views|clicks)' --include=*.py .", "No per-request counter updates on hot rows; events go to a queue or stream and are aggregated (Level 8)."],
        ["Do you know your capacity?", "# not a command: find your last load-test result", "A recent number for the request rate where p95 latency starts to climb, and how far today's peak is from it (Levels 0 and 2)."],
        ["Is the design written down?", "ls docs/ 2>/dev/null; git log --oneline -3 -- docs/", "A short design document with estimates, failure modes and a scaling plan, updated when the system changes (this level)."]
      ],
      steps: [
        { id: "l12-1", why: "Designing before building is the habit this whole course has been training. Writing your own requirements and estimates first means the reference implementation becomes something to compare with, not something to copy.", title: "Design it on paper first",
          body: `<p>Without opening the code, spend 30-45 minutes on paper or in <code>docs/DESIGN-template.md</code>, sections 1-3 and 5:</p><ol><li>Requirements: what users do, what is out of scope, and SLOs for redirects and creation.</li><li>Estimates, assuming 10 million new links a month, 100 clicks per link over its life, and a peak of 10× average: requests per second for each, read/write ratio, storage for 5 years, cache size for the hot set, and whether 7 base62 characters are enough.</li><li>The API (three endpoints) and a box-and-arrow sketch.</li><li>Four decisions: how codes are generated, 301 or 302, how clicks are counted, and what happens to redirects if the cache fails.</li></ol>`,
          expect: "A page of numbers and a sketch. Roughly: 4 creations/s and 390 redirects/s on average (3,900 at peak), 100:1 reads to writes, about 120 GB of links over 5 years, clicks as the largest data by far, a hot set that fits in a few hundred MB of cache, and 62^7 ≈ 3.5 trillion codes.",
          solution: `${H.code(`creations   10,000,000 / 2,592,000 s            ≈ 4 /s      (peak 40 /s)
redirects   1,000,000,000 / 2,592,000 s         ≈ 390 /s    (peak ≈ 3,900 /s)
ratio       1 billion : 10 million              = 100 : 1   -> optimise the read path
links       600 M after 5 years × ~200 B        ≈ 120 GB
clicks      12 billion per year × ~60 B         ≈ 0.7 TB per year   -> the real storage problem
hot set     20% of a month's links: 2 M × 150 B ≈ 300 MB    -> one Redis node
codes       62^7 = 3.5 × 10^12 vs 600 M links  -> 0.017% full, ~1 retry per 6,000 creations`, [3, 5])}
            <ul><li><b>The ratio decides the architecture.</b> At 100 reads per write, make redirects cheap (a cache, no writes on the hot path) and accept that creation is a little slower (a unique-index insert, maybe a retry).</li><li><b>Clicks dwarf links.</b> One link is written once and read a hundred times, and each read creates an event. Storing every click forever costs far more than the links themselves, so plan rollups or retention from the start.</li><li><b>Decisions the reference made</b> (compare yours): random 7-character base62 codes with a unique index; 302 so every click reaches the service; clicks appended to a stream and counted by a worker; redirects fall back to Postgres when Redis fails. <code>docs/DESIGN-example.md</code> has the full reasoning; read it only after step 8.</li><li>If your numbers are within a factor of 2-3 of these, they are good: estimates exist to find the order of magnitude and the bottleneck, not the exact value (Level 0).</li></ul>` },

        { id: "l12-2", why: "Seeing one request travel through the whole system, and checking each response header against the design, is how you confirm the implementation does what the design says before you load it.", title: "Start it and follow one link",
          body: `${H.code(`cd level-12-capstone
docker compose up -d --build
docker compose build tools
curl -s -X POST localhost:8090/api/links -H 'content-type: application/json' \\
     -d '{"url":"https://example.com/docs/getting-started"}'
curl -si localhost:8090/<code> | grep -iE '^(HTTP|location|cache-control)'
sleep 5; curl -s localhost:8090/api/links/<code>`)}<p>PowerShell: <code>Invoke-RestMethod -Method Post -Uri http://localhost:8090/api/links -ContentType application/json -Body '{"url":"https://example.com/docs/getting-started"}'</code>, then <code>curl.exe -si localhost:8090/&lt;code&gt;</code>. Then read <code>app/main.py</code> (about 160 lines) and <code>app/worker.py</code>.</p>`,
          expect: "201 with a 7-character code. The redirect is a 302 with the long URL in Location and Cache-Control: no-store. A few seconds later the details show clicks_counted: 1.",
          solution: `${H.code(`{"code":"YktoOmp","short_url":"http://localhost:8090/YktoOmp"}

HTTP/1.1 302 Found
cache-control: no-store
location: https://example.com/docs/getting-started

{"code":"YktoOmp","url":"https://example.com/docs/getting-started",
 "created_at":"2026-10-14T11:18:07+00:00","clicks_counted":1}`, [3, 4])}
            <ul><li><b>302 plus no-store:</b> RFC 9110 lets browsers cache a 301 indefinitely, while a 302 is cached only if headers allow it. <code>no-store</code> removes any doubt, so every click comes back to the service and is counted.</li><li><b>The click was counted asynchronously.</b> The redirect only appended an event to the Redis stream; the worker stored it a moment later. That is why the count is checked after a short wait.</li><li><b>One request touched five components:</b> gateway, app, Redis (cache miss, then the stream), Postgres (the lookup), and the worker. Every one of them is a place where step 4 can break something.</li><li><code>curl</code> without <code>-L</code> does not follow the redirect, so you see the 302 itself. Browsers follow it automatically.</li></ul>` },

        { id: "l12-3", why: "A design's numbers are guesses until you measure. Loading the redirect path with a realistic skew shows the cache doing its job, the replicas sharing the load, and where this machine's capacity runs out.", title: "Seed 10,000 links and load the redirects",
          body: `${H.code(`docker compose run --rm tools python seed.py --count 10000
docker compose run --rm tools python stats.py --reset
docker compose run --rm k6 run /k6/redirects.js                 # 300 redirects/s for 30 s
docker compose run --rm tools python stats.py
docker compose run --rm k6 run -e RATE=1000 -e DURATION=20s /k6/redirects.js
docker compose run --rm k6 run -e RATE=2000 -e DURATION=20s /k6/redirects.js`)}<p>The k6 script sends 80% of requests to 20 popular links and 20% to the other 980 of the first thousand. It does not follow redirects, so it measures your 302, not example.com.</p>`,
          expect: "At 300/s, every request is a 302 with a p95 of a few milliseconds. The two replicas split the redirects almost exactly in half. The cache hit ratio is around 90% on a cold cache (each link misses once). At higher rates p95 climbs sharply, and k6 starts reporting requests it never sent: that is the machine's capacity.",
          solution: `${H.code(`created 10,000 links in 22.1 s (0 failed), for example E5uxgvr
code collisions retried: 0

  offered 300 req/s for 30s  ->  9001 redirects, 9001 were 302 with a Location, 0 were not, 0 never sent
  p50    1.6 ms   p95    3.3 ms   p99    9.1 ms   max 69.5 ms

                     replica 1     replica 2         total
redirects                4,501         4,500         9,001
cache_hits               4,104         4,061         8,165
cache_misses               397           439           836
db_reads                   397           439           836
cache hit ratio 90.7%
database: 10,001 links, 9,002 clicks counted

  offered 1000 req/s for 20s  ->  19852 redirects, 19852 were 302 with a Location, 0 were not, 148 never sent
  p50    7.8 ms   p95  102.2 ms   p99  171.6 ms   max 471.1 ms`, [5, 12, 16, 17])}
            <ul><li><b>836 misses ≈ the number of distinct links touched.</b> Each link misses once, then is served from Redis for an hour. Run the test again and the hit ratio approaches 100%, the steady state of a read-heavy system.</li><li><b>9,001 redirects, 9,002 clicks:</b> every redirect was counted (plus the click from step 2). Nothing in the hot path waited for Postgres to store them.</li><li><b>4,501 / 4,500:</b> nginx's round-robin over the two replicas, which works because the app keeps no state of its own (Level 2). Your stats header shows the two container IDs instead of replica 1 and 2.</li><li><b>The knee:</b> on the 2-core machine that produced these numbers, with k6, nginx, two apps, Redis, Postgres and the worker all sharing it, p95 went from 3 ms at 300/s to 102 ms at 1,000/s, and 148 requests could not even be started. Your laptop will knee later. The design's peak of 3,900/s therefore needs more app capacity, which is the scaling plan's first line.</li><li><b>Creation took 22 s for 10,000 links</b> (about 450 per second with 50 concurrent requests), far above the design's 40 per second at peak.</li></ul>` },

        { id: "l12-4", why: "A design is only as good as its behaviour when parts fail. Stopping an app replica and then Redis, under load, tests the two claims the design makes: replicas are interchangeable, and the cache is an optimisation, not a dependency.", title: "Break a replica, then Redis, under load",
          body: `${H.code(`docker compose ps app                          # note the two container names

# terminal 2: 20 seconds of load
docker compose run --rm k6 run -e DURATION=20s /k6/redirects.js
# terminal 1, about 8 seconds into the run:
docker stop level-12-capstone-app-1

docker compose up -d app && docker compose restart gateway

docker compose stop redis
docker compose run --rm tools python stats.py --reset
docker compose run --rm k6 run -e DURATION=20s /k6/redirects.js
docker compose run --rm tools python stats.py
docker compose start redis`)}`,
          expect: "With one replica stopped mid-run, every redirect still succeeds. With Redis stopped, every redirect still succeeds, a little slower, served from Postgres; stats shows zero cache hits, two Redis errors per redirect, and every click dropped.",
          solution: `${H.code(`replica stopped at ~8 s:
  offered 300 req/s for 20s  ->  6001 redirects, 6001 were 302 with a Location, 0 were not, 0 never sent
  p50    1.5 ms   p95    2.2 ms   p99    4.6 ms   max 12.8 ms

Redis stopped:
  offered 300 req/s for 20s  ->  6000 redirects, 6000 were 302 with a Location, 0 were not, 0 never sent
  p50    2.9 ms   p95    6.7 ms   p99   12.9 ms   max 47.5 ms
                     replica 1     replica 2         total
redirects                2,595         3,405         6,000
cache_hits                   0             0             0
db_reads                 2,595         3,405         6,000
redis_errors             5,190         6,810        12,000
clicks_dropped           2,595         3,405         6,000`, [3, 6, 13])}
            <ul><li><b>Losing a replica cost nothing</b> because nginx retries a failed GET on the other upstream (<code>proxy_next_upstream</code> defaults to retrying on connection errors), and <code>docker stop</code> sends SIGTERM, so uvicorn finished its in-flight requests before exiting. nginx does not retry a POST that already reached a server, because creating a link twice is not safe to repeat.</li><li><b>Why restart the gateway?</b> nginx resolved <code>app</code> to two addresses when it started. A recreated container may get a new address, and nginx would keep sending to the old one. Level 2's HAProxy re-resolved through Docker's DNS; this nginx configuration does not.</li><li><b>Redis down: redirects fine, analytics lost.</b> Each redirect tried Redis twice (the cache read and the cache write), failed fast thanks to the 200 ms timeouts (here, connection refused, which is instant), and went to Postgres. p95 rose from 2-3 ms to 6.7 ms, and Postgres absorbed 300 reads per second without trouble. The 6,000 clicks are gone: the trade-off the requirements accepted.</li><li><b>Making that trade-off visible matters more than avoiding it.</b> <code>clicks_dropped</code> is exactly the metric to alert on. Fixes, in order of cost: a Redis replica with automatic failover (Sentinel or a managed service), or writing clicks to a local buffer when the stream is unavailable.</li><li>Redis restarts with its stream intact (the append-only file), so clicks that were queued but not yet counted before the outage are not lost.</li></ul>` },

        { id: "l12-5", why: "Asynchronous processing moves work off the hot path, but only if a stopped or crashed consumer loses nothing. Stopping the worker, and faking a crash mid-batch, tests the at-least-once delivery the design relies on.", title: "Stop the counter, crash it, and check nothing is lost",
          body: `${H.code(`docker compose stop worker
docker compose run --rm k6 run -e DURATION=20s /k6/redirects.js
docker compose run --rm tools python stats.py | tail -n 1      # the count has not moved

for i in 1 2 3 4 5; do curl -s -o /dev/null localhost:8090/<code>; done
# a "worker" that reads 5 events and dies before acknowledging them:
docker compose exec redis redis-cli XREADGROUP GROUP counter ghost COUNT 5 STREAMS clicks '>'
docker compose exec redis redis-cli XPENDING clicks counter
sleep 11

docker compose start worker
sleep 10; docker compose logs worker | tail -n 3
docker compose run --rm tools python stats.py | tail -n 1
docker compose exec redis redis-cli XPENDING clicks counter`)}`,
          expect: "While the worker is stopped, redirects work and the database count stays the same. XPENDING shows 5 events held by 'ghost'. On restart the worker claims those 5, stores the 6,001 queued clicks within a few seconds, and the database count rises by 6,006 in total; nothing is pending afterwards.",
          solution: `${H.code(`database: 10,001 links, 34,855 clicks counted        <- unchanged while the worker is stopped
5                                                     <- XPENDING: 5 events delivered to "ghost", never acknowledged

claimed 5 unacknowledged events from a previous worker
stored 6001 clicks in the last 5 s; stream length 40861, waiting to be read 0, pending ack 0
database: 10,001 links, 40,861 clicks counted        <- 34,855 + 6,001 + 5
0                                                     <- nothing pending`, [3, 5])}
            <ul><li><b>The stream is a buffer.</b> Redirects kept appending while nobody consumed, so a worker outage became a delay in the counts, not a loss. The consumer group remembers how far it has read, so the restarted worker resumed exactly where it stopped.</li><li><b>Pending means "delivered, not acknowledged".</b> "ghost" read 5 events and vanished, like a worker killed between reading and storing. On start, the real worker runs <code>XAUTOCLAIM</code> for anything idle for more than 10 s and processes it.</li><li><b>At-least-once, made safe.</b> A worker that crashes after its database commit but before <code>XACK</code> will see the same events again. The <code>clicks</code> primary key is the stream ID, so <code>ON CONFLICT DO NOTHING</code> ignores the repeats: the same idea as Level 8's processed-events table.</li><li><b>What to alert on:</b> consumer-group lag and the age of the oldest pending event. "Counts are a minute behind" is fine; "the worker has been down for an hour" should page. The stream is capped at about a million entries (<code>MAXLEN ~</code>), so a very long outage would eventually drop the oldest uncounted clicks.</li></ul>` },

        { id: "l12-6", why: "Every public write endpoint is an abuse target. Sending bad URLs and too many creations through the real gateway checks that both layers, validation in the app and rate limiting at the edge, behave as the design says.", title: "Abuse it",
          body: `${H.code(`docker compose run --rm tools python abuse.py
docker compose logs gateway | grep '"status":429' | tail -n 1`)}<p>Wait a minute before running it again: the rate limit remembers.</p>`,
          expect: "Five invalid URLs get 422. Of the 12 quick creations, only the first succeeds; the rest get 429. /internal/stats through the gateway is 404.",
          solution: `${H.code(`422  javascript:alert(1)                        url must be an absolute http(s) URL of at most 2048 characters
422  ftp://example.com/file                     url must be an absolute http(s) URL of at most 2048 characters
422  not a url                                  url must be an absolute http(s) URL of at most 2048 characters
422  https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa   url must be an absolute http(s) URL of at most 2048 characters
422  http://localhost:8090/abc1234              url must be an absolute http(s) URL of at most 2048 characters
12 quick creations from one client: 201 429 429 429 429 429 429 429 429 429 429 429
internal endpoint through the gateway: 404`, [1, 6])}
            <ul><li><b>Why only one 201?</b> The limit is 10 per minute with a burst of 5, so 6 requests can arrive at once. The five invalid ones used up the burst: nginx counts requests, not successful ones, because it limits before the app ever sees them. That is intended: a client sending garbage should be slowed down too.</li><li><b><code>javascript:</code> URLs</b> would turn your domain into a launcher for scripts, and links back to the shortener create redirect loops. Allow-list the schemes you accept rather than block-listing bad ones.</li><li><b>Not covered here, needed in production:</b> checking destinations against malware and phishing lists, limits per account as well as per IP (many abusers rotate addresses), and a way to disable a link quickly. With a one-hour cache TTL, disabling also means deleting the cache key.</li><li>The tools container reached the gateway from one Docker network address, so all its requests shared one limit. Behind a load balancer you would limit on the real client IP from <code>X-Forwarded-For</code>, set only by a proxy you trust (Level 9).</li></ul>` },

        { id: "l12-7", why: "Random codes are safe only while the code space is mostly empty. Shrinking it to 2 characters and filling it shows the birthday problem directly, and why the design checks collisions with a unique index rather than hoping.", title: "Fill a tiny code space",
          body: `${H.code(`CODE_LEN=2 docker compose up -d app            # PowerShell: $env:CODE_LEN=2; docker compose up -d app
docker compose run --rm tools python collisions.py --count 3000

docker compose up -d app                       # PowerShell: Remove-Item Env:CODE_LEN; docker compose up -d app
docker compose restart gateway`)}<p>With 2 characters there are 62 × 62 = 3,844 possible codes. Each creation retries up to 5 times on a collision, then gives up with 503. While <code>CODE_LEN=2</code> is set, the existing 7-character links do not resolve: the redirect checks the code length.</p>`,
          expect: "Retries start early (dozens by 13% full) and grow quickly; past about a third full some creations fail after 5 tries, and by 75% full more than 100 have failed. The final line estimates collisions for 7-character codes: practically certain to have happened at least once by 10 million links, but each insert has only a 0.0003% chance.",
          solution: `${H.code(`code space: 3,844 codes
 links   full  retries so far  failed (5 tries)
   500    13%              43                 0
  1000    26%             183                 0
  1500    39%             444                 3
  2000    52%             877                 6
  2500    64%           1,527                35
  3000    75%           2,485               111

birthday estimate for 7-character codes: after 10,000,000 links, P(at least one collision so far) = 100.0%;
P(the next insert collides) = 0.000284%`, [5, 8, 10, 11])}
            <ul><li><b>The birthday problem:</b> the chance that some pair of codes collides grows with the square of the number of codes, which is why collisions appear long before the space is "full" (43 retries at only 13%).</li><li><b>What matters for the design is the per-insert chance</b>, which equals how full the space is. At 75% full, each attempt collides 3 times in 4, so 5 tries fail about 0.75^5 ≈ 24% of the time for the newest codes. At 10 million 7-character codes, an insert collides 3 times in a million: one retry, invisible to users.</li><li><b>Why a unique index and not a "does it exist?" check:</b> two replicas could check the same new code at the same moment, both see "free" and both insert. <code>INSERT … ON CONFLICT DO NOTHING</code> on the primary key makes the database the referee, atomically (Level 4).</li><li><b>Plan for growth:</b> monitor the retry rate. When it rises, lengthen the codes (8 characters gives 62 times more space); old links keep working because codes of different lengths cannot collide.</li></ul>` },

        { id: "l12-8", why: "Writing the design down is the final skill: it forces vague ideas into decisions with reasons, gives reviewers something concrete to challenge, and outlives your memory of why things are the way they are.", title: "Write the design document",
          body: `<p>Complete <code>docs/DESIGN-template.md</code> for this system, using your step 1 work and what you measured in steps 3-7. Aim for 2-4 pages. Give the failure-mode table one row for each thing you broke, and fill in what users saw with your own numbers.</p><p>Then compare with <code>docs/DESIGN-example.md</code>. Better still, apply the template to your own FastAPI app on the VM: requirements, estimates from your real traffic, and the failure modes you would expect.</p>`,
          expect: "A document whose estimates show their arithmetic, whose decisions each name the alternative and the trade-off, and whose failure modes are backed by what you measured: no failed redirects when a replica died, a few milliseconds slower and clicks lost when Redis died, nothing lost when the worker died.",
          solution: `<p>The reference is <code>docs/DESIGN-example.md</code>. Check yours against these points, which reviewers most often find missing:</p><ul><li><b>Numbers with units and arithmetic</b>, not "high traffic": 390 redirects/s average, 3,900 at peak.</li><li><b>Explicit trade-offs:</b> "302, so we lose browser caching but keep analytics and takedowns"; "click counts may undercount during a Redis outage".</li><li><b>Failure modes from evidence:</b> the replica and Redis rows should quote your measured latencies and drop counts, not guesses.</li><li><b>A scaling plan that names the first bottleneck:</b> here app CPU (measured knee near 1,000 redirects/s on 2 cores), not the database, because the cache absorbs most reads.</li><li><b>Operations and security sections that are not empty:</b> SLIs and alerts (clicks_dropped, consumer lag), backups for the one table that matters, rate limits and URL validation.</li><li><b>Open questions</b> you could not decide alone (link expiry, takedowns): a design document is also a list of what still needs an answer.</li></ul>` },

        { id: "l12-9", why: "The stack holds a database and Redis volumes; removing them leaves your machine as you found it.", title: "Clean up",
          body: `${H.code(`docker compose --profile tools down -v`)}`,
          expect: "All containers, the network and the volumes are removed.",
          solution: `<p>Keep <code>docs/</code> with your design document. You have now built, measured and broken each pattern in this course, and written up a system end to end. That is the skill this course set out to teach.</p>` }
      ]
    }
  });
})();
