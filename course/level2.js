/* Level 2 — Scaling out */
(function () {
  "use strict";
  const H = Course.H;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };

  /* ---------------- 2.1 Fleet planner ---------------- */
  const SIZES = [["Small", 2, 400, 35], ["Medium", 4, 800, 70], ["Large", 8, 1600, 140], ["X-large", 16, 3200, 280], ["2X-large", 32, 6400, 560]];
  function fleet(root) {
    const p = H.panel(root, "Scale up or scale out?", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="fl-t">Peak traffic <output id="fl-to"></output></label><input type="range" id="fl-t" min="2" max="4.3" step="0.02" value="3"></div>
        <div class="ctl"><label for="fl-n">Number of servers <output id="fl-no"></output></label><input type="range" id="fl-n" min="1" max="12" value="1"></div>
        <div><div class="note" style="margin-bottom:4px">Server size</div><div class="seg" id="fl-s"></div></div>
      </div>
      <p class="note">Capacity and prices are illustrative, but the shape is real: within one cloud instance family, price grows roughly in line with CPUs.</p>
      <div id="fl-viz" style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:12px 0"></div>
      <div class="controls"><button class="btn danger" type="button" id="fl-kill">Fail one server</button><button class="btn" type="button" id="fl-heal" disabled>Repair it</button></div>
      <div class="readout" id="fl-r"></div><div class="callout" id="fl-v"></div>`;
    let size = 1, failed = false;
    seg(p.querySelector("#fl-s"), SIZES.map((s, i) => [i, s[0]]), size, v => { size = v; upd(); });
    function upd() {
      const peak = Math.round(Math.pow(10, +p.querySelector("#fl-t").value));
      const n = +p.querySelector("#fl-n").value;
      p.querySelector("#fl-to").textContent = peak.toLocaleString() + " req/s";
      p.querySelector("#fl-no").textContent = n;
      const [, cpu, cap, cost] = SIZES[size];
      const alive = failed ? n - 1 : n;
      const util = alive ? peak / (alive * cap) : Infinity;
      const viz = p.querySelector("#fl-viz"); viz.innerHTML = "";
      if (n > 1) viz.appendChild(H.el(`<div style="align-self:center;padding:8px 10px;border:1.5px solid var(--compute);border-radius:8px;font-size:12px;font-weight:600;color:var(--compute)">Load balancer →</div>`));
      for (let i = 0; i < n; i++) {
        const dead = failed && i === n - 1;
        const h = 36 + cpu * 2.2;
        const fill = dead ? 0 : Math.min(1, util);
        const col = util > 1 ? "var(--bad)" : util > .7 ? "var(--xp)" : "var(--ok)";
        viz.appendChild(H.el(`<div title="${dead ? "failed" : Math.round(util * 100) + "% busy"}" style="width:${28 + cpu * 1.6}px;height:${h}px;border:1.5px solid ${dead ? "var(--bad)" : "var(--line-strong)"};border-radius:6px;position:relative;overflow:hidden;background:var(--surface-2)">${dead ? `<span style="position:absolute;inset:0;display:grid;place-items:center;color:var(--bad);font-weight:700">✕</span>` : `<i style="position:absolute;left:0;right:0;bottom:0;height:${fill * 100}%;background:${col};opacity:.8"></i>`}</div>`));
      }
      const survive = (n - 1) * cap >= peak;
      const after = n > 1 ? peak / ((n - 1) * cap) : Infinity, tight = survive && after > 0.8;   // survivors' utilization after one failure
      readout(p.querySelector("#fl-r"), [
        ["Capacity", (alive * cap).toLocaleString() + " req/s"],
        ["Utilization", util === Infinity ? "∞" : Math.round(util * 100) + "%", util > 1 ? "bad" : util > .7 ? "warn" : "good"],
        ["Monthly cost", "$" + (n * cost).toLocaleString()],
        ["Survives a failure at peak?", n === 1 ? "No (outage)" : !survive ? "No (overload)" : tight ? "Barely" : "Yes", n === 1 || !survive ? "bad" : tight ? "warn" : "good"]
      ]);
      const v = p.querySelector("#fl-v");
      if (failed && n === 1) { v.className = "callout bad"; v.textContent = "One server, one failure: a complete outage. However big the machine, it is still one machine."; }
      else if (util > 1) { v.className = "callout bad"; v.textContent = failed ? "The survivors cannot carry the load: they are now overloaded, and overload spreads (Lesson 0.4). Plan capacity so that N−1 servers can handle peak." : "Not enough capacity. Add servers or pick a bigger size."; }
      else if (n === 1) { v.className = "callout warn"; v.textContent = "Scaling up works and keeps things simple, but this is a single point of failure, and there is a ceiling: the biggest machine you can buy."; }
      else if (!survive) { v.className = "callout warn"; v.textContent = `Enough capacity today, but if one of ${n} servers fails at peak, the rest are overloaded. Add one more: the "N+1" rule.`; }
      else if (tight) { v.className = "callout warn"; v.textContent = `On paper this survives a failure, but the remaining servers would run at ${Math.round(after * 100)}% busy. Near full load, queues and latency grow sharply (Lesson 0.4), so plan for the survivors to stay around 70-80% at peak: add a server.`; }
      else { v.className = "callout good"; v.textContent = `N+1: any one server can fail at peak and the rest still cope (${Math.round(after * 100)}% busy). Many small servers also fail more gently than one big one.`; }
      p.querySelector("#fl-kill").disabled = failed; p.querySelector("#fl-heal").disabled = !failed;
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", upd));
    p.querySelector("#fl-kill").onclick = () => { failed = true; upd(); };
    p.querySelector("#fl-heal").onclick = () => { failed = false; upd(); };
    upd();
  }

  /* ---------------- 2.2 Sessions ---------------- */
  function sessions(root) {
    const p = H.panel(root, "Where does Alice's login live?", "Try it");
    p.innerHTML = `<div class="controls"><div><div class="note" style="margin-bottom:4px">Session storage</div><div class="seg" id="ss-m"></div></div></div>
      <div id="ss-viz" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0"></div>
      <div class="controls">
        <button class="btn primary" type="button" id="ss-login">Alice logs in</button>
        <button class="btn" type="button" id="ss-req">Alice opens her profile</button>
        <button class="btn danger" type="button" id="ss-kill">Kill server B</button>
        <button class="btn" type="button" id="ss-deploy">Deploy (restart all servers)</button>
        <button class="btn danger" type="button" id="ss-kredis" hidden>Kill Redis</button>
        <button class="btn" type="button" id="ss-reset">Reset</button>
      </div>
      <div id="ss-log" style="display:grid;gap:4px;font-size:14px" aria-live="polite"></div>
      <div class="callout" id="ss-v"></div>`;
    const MODES = [["memory", "In server memory"], ["sticky", "Memory + sticky sessions"], ["redis", "Shared store (Redis)"], ["token", "Signed token in a cookie"]];
    let mode = "memory", st;
    function reset() { st = { alive: [true, true, true], mem: [false, false, false], redis: false, redisUp: true, cookie: null, sticky: null, rr: 0, last: -1, loggedIn: false }; p.querySelector("#ss-log").innerHTML = ""; draw(); verdict(); }
    function route() {
      const alive = [0, 1, 2].filter(i => st.alive[i]);
      if (mode === "sticky" && st.sticky !== null) { if (st.alive[st.sticky]) return st.sticky; }
      let i = st.rr % 3; let tries = 0; while (!st.alive[i] && tries < 3) { i = (i + 1) % 3; tries++; } st.rr = i + 1;
      return alive.length ? i : -1;
    }
    function log(ok, text) { const l = p.querySelector("#ss-log"); l.prepend(H.el(`<div class="callout ${ok ? "good" : "bad"}" style="margin:0;padding:6px 10px"></div>`)); l.firstChild.textContent = text; while (l.children.length > 6) l.lastChild.remove(); }
    function hasSession(i) {
      if (!st.cookie) return false;
      if (mode === "memory" || mode === "sticky") return st.mem[i];
      if (mode === "redis") return st.redisUp && st.redis;
      return true;
    }
    function draw() {
      const v = p.querySelector("#ss-viz"); v.innerHTML = "";
      ["A", "B", "C"].forEach((n, i) => {
        const on = st.alive[i], hit = st.last === i;
        v.appendChild(H.el(`<div style="border:${hit ? 2.5 : 1.5}px solid ${!on ? "var(--bad)" : hit ? "var(--signal)" : "var(--line-strong)"};border-radius:10px;padding:10px;background:var(--surface);opacity:${on ? 1 : .55}">
          <div style="font-weight:600">Server ${n} ${on ? "" : "<span style='color:var(--bad)'>(down)</span>"}</div>
          <div class="note">${mode === "memory" || mode === "sticky" ? (st.mem[i] ? "memory: Alice's session" : "memory: empty") : mode === "redis" ? "memory: nothing" : "memory: nothing"}</div></div>`));
      });
      if (mode === "redis") v.appendChild(H.el(`<div style="border:1.5px solid ${st.redisUp ? "var(--data)" : "var(--bad)"};border-radius:10px;padding:10px;background:var(--data-soft)"><div style="font-weight:600">Redis ${st.redisUp ? "" : "(down)"}</div><div class="note">${st.redis ? "session:alice" : "empty"}</div></div>`));
      if (mode === "token") v.appendChild(H.el(`<div style="border:1.5px dashed var(--xp);border-radius:10px;padding:10px;background:var(--xp-soft)"><div style="font-weight:600">Alice's browser</div><div class="note">${st.cookie ? "cookie: signed token {user: alice, exp}" : "no cookie"}</div></div>`));
      p.querySelector("#ss-kredis").hidden = mode !== "redis";
      p.querySelector("#ss-kill").textContent = st.alive[1] ? "Kill server B" : "Restore server B";
    }
    p.querySelector("#ss-login").onclick = () => {
      const i = route(); if (i < 0) return log(false, "No servers alive.");
      st.last = i;
      if (mode === "redis" && !st.redisUp) { draw(); return log(false, `Server ${"ABC"[i]} cannot save the session: Redis is down. Nobody can log in.`); }
      st.cookie = true; if (mode === "memory" || mode === "sticky") st.mem[i] = true; if (mode === "redis") st.redis = true; if (mode === "sticky") st.sticky = i;
      draw(); log(true, `Server ${"ABC"[i]} logged Alice in${mode === "sticky" ? " and the load balancer pinned her to it" : ""}.`);
    };
    p.querySelector("#ss-req").onclick = () => {
      if (!st.cookie) return log(false, "Alice is not logged in yet.");
      const i = route(); if (i < 0) return log(false, "No servers alive."); st.last = i; draw();
      if (hasSession(i)) log(true, `Server ${"ABC"[i]}: found Alice's session, profile shown.`);
      else if (mode === "redis" && !st.redisUp) log(false, `Server ${"ABC"[i]}: Redis is down, cannot check the session. Alice sees an error.`);
      else log(false, `Server ${"ABC"[i]}: no session for this cookie. Alice is sent back to the login page.`);
      verdict();
    };
    p.querySelector("#ss-kill").onclick = () => {
      st.alive[1] = !st.alive[1];
      if (!st.alive[1]) { st.mem[1] = false; log(false, "Server B crashed. Everything in its memory is gone."); } else log(true, "Server B is back, with empty memory.");
      draw(); verdict();
    };
    p.querySelector("#ss-deploy").onclick = () => { st.mem = [false, false, false]; st.alive = [true, true, true]; log(mode === "memory" || mode === "sticky" ? false : true, mode === "memory" || mode === "sticky" ? "Deploy restarted every server: all in-memory sessions are gone. Every user is logged out." : "Deploy restarted every server. Sessions live outside them, so nobody notices."); draw(); verdict(); };
    p.querySelector("#ss-kredis").onclick = () => { st.redisUp = !st.redisUp; p.querySelector("#ss-kredis").textContent = st.redisUp ? "Kill Redis" : "Restore Redis"; if (st.redisUp) st.redis = false; log(st.redisUp, st.redisUp ? "Redis restarted (without persistence, its data is empty: everyone logs in again)." : "Redis is down."); draw(); verdict(); };
    p.querySelector("#ss-reset").onclick = reset;
    seg(p.querySelector("#ss-m"), MODES, mode, v => { mode = v; reset(); });
    function verdict() {
      const v = p.querySelector("#ss-v");
      const msg = {
        memory: ["bad", "With sessions in server memory, each server knows only the users who logged in on it. Round-robin sends Alice somewhere else on her next click, so she appears logged out. Click 'opens her profile' a few times."],
        sticky: ["warn", "Sticky sessions hide the problem: the load balancer always sends Alice to the same server. But kill that server or deploy, and her session vanishes. Load also becomes uneven. The Twelve-Factor App calls sticky sessions a violation to never rely on."],
        redis: ["good", "Servers are now stateless: any server can handle any request, so you can add, remove and restart them freely. The cost: Redis is now critical (try killing it), so it needs persistence and redundancy of its own."],
        token: ["good", "A signed token (a cookie signed with a server secret, or a JWT) carries the session itself, so servers need no shared store. The trade-off: you cannot easily revoke it before it expires, so keep expiry short (Level 11)."]
      }[mode];
      v.className = "callout " + msg[0]; v.textContent = msg[1];
    }
    reset();
  }

  /* ---------------- 2.3 Load-balancing algorithms ---------------- */
  function lbAlgos(root) {
    const p = H.panel(root, "Four servers, one slow: which algorithm copes?", "Try it");
    p.innerHTML = `<div class="controls">
        <div><div class="note" style="margin-bottom:4px">Algorithm</div><div class="seg" id="la-a"></div></div>
        <div class="ctl"><label for="la-l">Load (share of total capacity) <output id="la-lo"></output></label><input type="range" id="la-l" min="20" max="95" value="70"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="la-slow" checked> Server 4 is slow (noisy neighbour, bad disk, long GC pauses): 4× slower</label>
      <canvas id="la-cv" style="width:100%;height:200px;display:block;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);margin-top:10px" aria-label="Animated queues at four backend servers"></canvas>
      <div class="readout" id="la-r"></div><div class="callout" id="la-v"></div>`;
    const ALG = [["rr", "Round robin"], ["random", "Random"], ["lc", "Least connections"], ["p2c", "Power of two choices"]];
    let alg = "rr", sim, last = 0;
    const N = 4, W = 2, MEAN = 0.030;
    const r = rng(11);
    const expo = m => -Math.log(1 - r()) * m;
    function speed(i) { return i === 3 && p.querySelector("#la-slow").checked ? 4 : 1; }
    function capacity() { let c = 0; for (let i = 0; i < N; i++) c += W / (MEAN * speed(i)); return c; }
    function reset() { sim = { t: 0, next: 0, rr: 0, b: Array.from({ length: N }, () => ({ q: [], s: [] })), lat: [], share: new Array(N).fill(0), total: 0 }; }
    function inflight(i) { return sim.b[i].q.length + sim.b[i].s.length; }
    function pick() {
      if (alg === "rr") { const i = sim.rr % N; sim.rr++; return i; }
      if (alg === "random") return Math.floor(r() * N);
      if (alg === "lc") { let best = [], m = Infinity; for (let i = 0; i < N; i++) { const f = inflight(i); if (f < m) { m = f; best = [i]; } else if (f === m) best.push(i); } return best[Math.floor(r() * best.length)]; }
      const a = Math.floor(r() * N); let b = Math.floor(r() * (N - 1)); if (b >= a) b++;
      return inflight(a) <= inflight(b) ? a : b;
    }
    function step(dt) {
      const lam = capacity() * (+p.querySelector("#la-l").value / 100);
      const end = sim.t + dt;
      while (sim.next <= end) {
        const i = pick(); sim.b[i].q.push(sim.next); sim.share[i]++; sim.total++;
        sim.next += expo(1 / lam);
      }
      sim.t = end;
      for (let i = 0; i < N; i++) {
        const B = sim.b[i];
        B.s = B.s.filter(x => { if (x.end <= sim.t) { sim.lat.push(x.end - x.arr); return false; } return true; });
        while (B.s.length < W && B.q.length) { const arr = B.q.shift(); B.s.push({ arr, end: Math.max(sim.t, arr) + expo(MEAN * speed(i)) }); }
      }
      if (sim.lat.length > 3000) sim.lat.splice(0, sim.lat.length - 3000);
    }
    const cv = p.querySelector("#la-cv"), ctx = cv.getContext("2d");
    function draw() {
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const rowH = (h - 20) / N, ink = css("--ink"), comp = css("--compute"), sig = css("--signal"), mut = css("--muted"), line = css("--line-strong");
      ctx.font = "12px " + css("--f-mono");
      for (let i = 0; i < N; i++) {
        const y = 10 + i * rowH + rowH / 2, B = sim.b[i];
        ctx.fillStyle = speed(i) > 1 ? sig : mut; ctx.fillText(`server ${i + 1}${speed(i) > 1 ? " (slow)" : ""}`, 10, y + 4);
        const sx = w - 110;
        for (let k = 0; k < W; k++) { ctx.strokeStyle = line; ctx.strokeRect(sx + k * 46, y - 10, 40, 20); if (B.s[k]) { ctx.fillStyle = comp; ctx.fillRect(sx + k * 46 + 2, y - 8, 36, 16); } }
        const maxShow = Math.floor((sx - 140) / 10);
        B.q.slice(0, maxShow).forEach((_, j) => { ctx.beginPath(); ctx.fillStyle = j > 8 ? sig : ink; ctx.arc(sx - 12 - j * 10, y, 3.6, 0, 7); ctx.fill(); });
        if (B.q.length > maxShow) { ctx.fillStyle = sig; ctx.fillText("+" + (B.q.length - maxShow), 130, y + 4); }
      }
    }
    function pct(a, q) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
    function report() {
      const l = sim.lat, p50 = pct(l, .5) * 1000, p95 = pct(l, .95) * 1000, p99 = pct(l, .99) * 1000;
      const sh = sim.share.map(x => sim.total ? Math.round(x / sim.total * 100) : 0);
      const cls = v => isNaN(v) ? "" : v > 300 ? "bad" : v > 120 ? "warn" : "good";
      readout(p.querySelector("#la-r"), [["p50", isNaN(p50) ? "…" : Math.round(p50) + " ms", cls(p50)], ["p95", isNaN(p95) ? "…" : Math.round(p95) + " ms", cls(p95)], ["p99", isNaN(p99) ? "…" : Math.round(p99) + " ms", cls(p99)], ["Share to slow server", p.querySelector("#la-slow").checked ? sh[3] + "%" : "-"]]);
      const v = p.querySelector("#la-v"), slow = p.querySelector("#la-slow").checked;
      const txt = {
        rr: slow ? "Round robin gives every server the same share, including the slow one, which falls behind and builds a queue. Every request sent there is slow, so the p95 and p99 suffer. Round robin is fine only when servers and requests are all alike." : "With identical servers and similar requests, round robin works well and is the simplest choice.",
        random: "Random behaves like round robin on average but with extra unevenness: short bursts land on the same server by chance.",
        lc: "Least connections sends each request to the server with the fewest in progress. The slow server holds its requests longer, so it automatically gets fewer new ones. This is the usual choice when request durations vary.",
        p2c: "Power of two choices: pick two servers at random and use the less busy one. It performs almost as well as least connections without every load balancer needing a perfectly up-to-date view of all servers, which is why large systems use it."
      }[alg];
      v.className = "callout " + (alg === "rr" && slow ? "warn" : alg === "random" ? "warn" : "good"); v.textContent = txt;
    }
    function loop(t) {
      if (!document.body.contains(cv)) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      for (let k = 0; k < 10; k++) step(dt * 0.4 / 10 * 2.5);
      draw(); requestAnimationFrame(loop);
    }
    seg(p.querySelector("#la-a"), ALG, alg, v => { alg = v; reset(); });
    p.querySelector("#la-l").addEventListener("input", () => { p.querySelector("#la-lo").textContent = p.querySelector("#la-l").value + "%"; reset(); });
    p.querySelector("#la-slow").addEventListener("change", reset);
    p.querySelector("#la-lo").textContent = "70%";
    reset(); requestAnimationFrame(loop);
    const iv = setInterval(() => { if (!document.body.contains(cv)) { clearInterval(iv); return; } report(); }, 800);
    report();
  }

  /* ---------------- 2.4 L4 vs L7 and health checks ---------------- */
  function layers(root) {
    const p = H.panel(root, "What can the load balancer see?", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="ly-m"></div></div>
      <div id="ly-pkt" style="display:grid;gap:6px;margin:10px 0"></div>
      <h4 style="font-size:14px;margin:14px 0 6px">Which rules can it apply?</h4>
      <div id="ly-rules" style="display:grid;gap:6px"></div>`;
    let mode = "l4";
    const RULES = [
      ["Send /api/* to API servers and /static/* to file servers", "l7", "Needs the URL path, which is inside the HTTP request."],
      ["Spread raw TCP traffic for a database or MQTT broker", "l4", "Works on any protocol: it only needs addresses and ports. An L7 HTTP balancer cannot parse non-HTTP traffic."],
      ["Keep a user on one server using a cookie", "l7", "Cookies are HTTP headers. An L4 balancer can only approximate this by hashing the client IP, which breaks when many users share one IP (offices, mobile carriers)."],
      ["Retry a failed GET request on another server", "l7", "Requires understanding HTTP methods and status codes."],
      ["Terminate TLS and hold the certificate", "l7", "Decrypting is what lets the balancer read HTTP at all. An L4 balancer passes encrypted bytes through untouched (TLS passthrough)."],
      ["Handle millions of connections per second with minimal CPU", "l4", "It never parses requests, so it is cheaper and faster per connection. Cloud network load balancers work at this layer."],
      ["Add X-Forwarded-For with the client's IP", "l7", "Adding a header means rewriting the HTTP request."]
    ];
    function draw() {
      const l7 = mode === "l7";
      const row = (name, fields, visible, color) => `<div style="display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;align-items:center;border:1.5px solid ${visible ? color : "var(--line)"};background:${visible ? "var(--surface)" : "var(--surface-2)"};border-radius:8px;padding:8px 10px;opacity:${visible ? 1 : .55}"><b style="font-size:13px">${name}</b><span class="mono" style="font-size:12.5px;overflow-wrap:anywhere">${visible ? fields : "🔒 encrypted: " + "x".repeat(26)}</span></div>`;
      p.querySelector("#ly-pkt").innerHTML =
        row("IP", "src 203.0.113.7 → dst 198.51.100.10", true, "var(--compute)") +
        row("TCP", "src port 51234 → dst port 443", true, "var(--compute)") +
        row("TLS", l7 ? "decrypted here (balancer holds the certificate)" : "handshake visible, contents encrypted", true, "var(--xp)") +
        row("HTTP", "GET /api/orders?page=2 · Host: app.example.com · Cookie: session=… · User-Agent: …", l7, "var(--data)");
      const host = p.querySelector("#ly-rules"); host.innerHTML = "";
      RULES.forEach(([rule, need, why]) => {
        const ok = need === "l4" || l7;
        const both = need === "l4";
        const el = H.el(`<div class="callout ${ok ? "good" : "bad"}" style="margin:0;padding:8px 12px"><b>${ok ? "✓" : "✕"}</b> <span></span><div class="note" style="margin-top:2px"></div></div>`);
        el.querySelector("span").textContent = rule; el.querySelector(".note").textContent = (both && l7 ? "Possible, but an L4 balancer does it more cheaply. " : "") + why;
        host.appendChild(el);
      });
    }
    seg(p.querySelector("#ly-m"), [["l4", "Layer 4 (transport)"], ["l7", "Layer 7 (application)"]], mode, v => { mode = v; draw(); });
    draw();

    const q = H.panel(root, "How fast is a dead server noticed?", "Try it");
    q.innerHTML = `<div class="controls">
        <div><div class="note" style="margin-bottom:4px">Failure</div><div class="seg" id="hc-f"></div></div>
        <div class="ctl"><label for="hc-i">Check interval <output id="hc-io"></output></label><input type="range" id="hc-i" min="1" max="30" value="10"></div>
        <div class="ctl"><label for="hc-n">Failed checks before removal (fall) <output id="hc-no"></output></label><input type="range" id="hc-n" min="1" max="5" value="3"></div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="hc-p"> Passive checks too: remove a server after errors on real traffic</label>
      <div class="svgwrap" id="hc-svg" style="margin-top:8px"></div><div class="readout" id="hc-r"></div><div class="callout" id="hc-v"></div>`;
    let fail = "crash";
    seg(q.querySelector("#hc-f"), [["crash", "Server crashes"], ["hang", "Server hangs"], ["db", "Database blips (deep check)"]], fail, v => { fail = v; hupd(); });
    function hupd() {
      const iv = +q.querySelector("#hc-i").value, fall = +q.querySelector("#hc-n").value, passive = q.querySelector("#hc-p").checked;
      q.querySelector("#hc-io").textContent = iv + " s"; q.querySelector("#hc-no").textContent = fall;
      const timeout = fail === "hang" ? Math.min(iv, 5) : 0;
      let detect = iv * fall + timeout - iv / 2;
      if (passive && fail !== "db") detect = Math.min(detect, fail === "hang" ? 5 : 0.5);
      detect = Math.max(0.5, detect);
      const rps = 300, share = 1 / 4;
      const errs = Math.round(rps * share * detect);
      const W = 720, Hh = 120, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Timeline of a failure and its detection" });
      const X = t => 20 + t / 90 * (W - 40);
      for (let t = 0; t <= 90; t += 15) { H.svg("line", { x1: X(t), x2: X(t), y1: 26, y2: 92, stroke: "var(--line)" }, s); const tt = H.svg("text", { x: X(t), y: 108, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", class: "mono" }, s); tt.textContent = t + "s"; }
      H.svg("rect", { x: X(0), y: 40, width: X(90) - X(0), height: 30, fill: "var(--ok-soft)", stroke: "var(--ok)" }, s);
      const t0 = 15;
      if (fail === "db") {
        H.svg("rect", { x: X(t0), y: 40, width: X(t0 + 20) - X(t0), height: 30, fill: "var(--bad)", opacity: .8 }, s);
        const tx = H.svg("text", { x: X(t0) + 4, y: 30, "font-size": 11.5, "font-weight": 600, fill: "var(--bad)" }, s); tx.textContent = "every server fails its check at once → no healthy servers → 503 for everyone";
      } else {
        H.svg("rect", { x: X(t0), y: 40, width: Math.max(2, X(t0 + detect) - X(t0)), height: 30, fill: "var(--bad)", opacity: .8 }, s);
        H.svg("line", { x1: X(t0), x2: X(t0), y1: 20, y2: 76, stroke: "var(--bad)", "stroke-width": 2 }, s);
        const a = H.svg("text", { x: X(t0) - 4, y: 16, "text-anchor": "end", "font-size": 11.5, fill: "var(--bad)", "font-weight": 600 }, s); a.textContent = fail === "crash" ? "server crashes" : "server hangs";
        const b = H.svg("text", { x: X(t0 + detect) + 4, y: 86, "font-size": 11.5, fill: "var(--ok)", "font-weight": 600 }, s); b.textContent = "removed after ~" + detect.toFixed(1) + " s";
      }
      const host = q.querySelector("#hc-svg"); host.innerHTML = ""; host.appendChild(s);
      readout(q.querySelector("#hc-r"), fail === "db" ? [["Healthy servers", "0 of 4", "bad"], ["Users affected", "100%", "bad"]] : [["Time to detect", "~" + detect.toFixed(1) + " s", detect > 20 ? "bad" : detect > 5 ? "warn" : "good"], ["Failed user requests", "~" + errs.toLocaleString(), errs > 500 ? "bad" : errs > 50 ? "warn" : "good"], ["Load", "300 req/s over 4 servers"]]);
      const v = q.querySelector("#hc-v");
      if (fail === "db") { v.className = "callout bad"; v.textContent = "A 'deep' health check that also queries the database turns one dependency blip into a full outage: every server reports unhealthy at the same moment. Keep the load balancer's check shallow (is this process able to serve?), and report dependency problems through monitoring instead. Many balancers also 'fail open': if every server looks unhealthy, they keep sending traffic to all of them."; }
      else if (passive) { v.className = "callout good"; v.textContent = "Passive checks watch real requests and react within a few errors, while active checks keep probing to tell when the server has recovered. Most production setups use both."; }
      else { v.className = "callout " + (detect > 20 ? "bad" : "warn"); v.textContent = `Detection takes about interval × fall${fail === "hang" ? " + the check timeout" : ""}. Shorter intervals detect faster but send more probe traffic and risk removing servers during brief hiccups. HAProxy's defaults are a 2 s interval and 3 failed checks.`; }
    }
    q.querySelectorAll("input").forEach(i => i.addEventListener("input", hupd));
    hupd();
  }

  /* ---------------- 2.5 Running the balancer ---------------- */
  const TOPO = {
    dns: { name: "DNS round robin", desc: "The domain has several A records, one per server. Each client picks one.", lb: false,
      failLb: "There is no balancer to fail: DNS itself spreads the traffic.",
      failB: "Clients that cached server 2's address keep trying it until the record's TTL (time to live) expires, and many resolvers and clients cache longer than asked. Removing the record does not help them quickly. DNS has no idea which servers are healthy.",
      props: [["Single point of failure", "None, but no health checks"], ["Failover", "Minutes to hours (cache TTLs)"], ["Cost and effort", "Free, simple"]] },
    single: { name: "One self-hosted balancer", desc: "One VM runs nginx or HAProxy and spreads traffic across the app servers.", lb: true,
      failLb: "Total outage. You removed the single point of failure from the app tier and created a new one in front of it.",
      failB: "Health checks remove server 2 within seconds. Users barely notice.",
      props: [["Single point of failure", "The balancer"], ["Failover", "Seconds for app servers; none for the balancer"], ["Cost and effort", "Cheap; you run and patch it"]] },
    pair: { name: "Balancer pair + floating IP", desc: "Two balancer VMs run keepalived. They share a floating (virtual) IP using the VRRP protocol; the active one holds it, the standby watches.", lb: true, pair: true,
      failLb: "The standby stops hearing the active one's heartbeats and claims the floating IP, typically within a few seconds. Existing connections drop; new ones work.",
      failB: "Health checks remove server 2 within seconds.",
      props: [["Single point of failure", "None at this layer"], ["Failover", "A few seconds"], ["Cost and effort", "Two VMs and keepalived to run"]] },
    cloud: { name: "Managed cloud balancer", desc: "AWS Elastic Load Balancing, Google Cloud Load Balancing or Azure Load Balancer. The provider runs it across multiple zones.", lb: true, cloud: true,
      failLb: "The provider replaces failed balancer nodes for you; you never see them. You still depend on the provider and its regional health.",
      failB: "Health checks remove server 2; with an autoscaling group, a replacement server is started automatically.",
      props: [["Single point of failure", "Handled by the provider"], ["Failover", "Automatic"], ["Cost and effort", "Hourly + per-traffic fees; least work"]] }
  };
  function topology(root) {
    const p = H.panel(root, "Who balances the balancer?", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="tp-m"></div></div><p class="note" id="tp-d" style="margin:6px 0"></p>
      <div class="svgwrap" id="tp-svg"></div>
      <div class="controls"><button class="btn danger" type="button" id="tp-lb">Fail the load balancer</button><button class="btn danger" type="button" id="tp-b">Fail server 2</button><button class="btn" type="button" id="tp-r">Reset</button></div>
      <div class="callout" id="tp-v">Fail something to see what happens.</div><div class="readout" id="tp-p"></div>`;
    let t = "single", failed = null;
    function draw() {
      const T = TOPO[t]; p.querySelector("#tp-d").textContent = T.desc;
      const s = H.svg("svg", { viewBox: "0 0 680 230", role: "img", "aria-label": T.name });
      const box = (x, y, w, h, label, sub, state) => {
        const col = state === "dead" ? "var(--bad)" : state === "hot" ? "var(--compute)" : "var(--line-strong)";
        H.svg("rect", { x, y, width: w, height: h, rx: 8, fill: state === "dead" ? "var(--bad-soft)" : "var(--surface)", stroke: col, "stroke-width": state ? 2 : 1.2, "stroke-dasharray": state === "standby" ? "5 4" : "" }, s);
        const a = H.svg("text", { x: x + w / 2, y: y + h / 2 + (sub ? -2 : 4), "text-anchor": "middle", "font-size": 13, "font-weight": 600, fill: "var(--ink)" }, s); a.textContent = label;
        if (sub) { const b = H.svg("text", { x: x + w / 2, y: y + h / 2 + 14, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, s); b.textContent = sub; }
      };
      const line = (x1, y1, x2, y2, dead) => H.svg("path", { d: `M${x1} ${y1} L${x2} ${y2}`, stroke: dead ? "var(--bad)" : "var(--line-strong)", "stroke-width": 1.5, fill: "none", "stroke-dasharray": dead ? "4 4" : "" }, s);
      box(20, 90, 110, 48, "Users", "", "");
      const sx = 520, ys = [20, 90, 160];
      if (!T.lb) {
        box(170, 90, 150, 48, "DNS", "3 A records", "");
        ys.forEach((y, i) => line(130, 114, sx, y + 24, failed === "b" && i === 1));
      } else if (T.pair) {
        box(200, 50, 160, 44, failed === "lb" ? "LB 1 (dead)" : "LB 1 (active)", "", failed === "lb" ? "dead" : "hot");
        box(200, 140, 160, 44, failed === "lb" ? "LB 2 (now active)" : "LB 2 (standby)", "", failed === "lb" ? "hot" : "standby");
        const vt = H.svg("text", { x: 280, y: 124, "text-anchor": "middle", "font-size": 11.5, fill: "var(--xp)", "font-weight": 600 }, s); vt.textContent = "floating IP " + (failed === "lb" ? "→ LB 2" : "→ LB 1");
        line(130, 114, 200, failed === "lb" ? 162 : 72); const from = failed === "lb" ? 162 : 72;
        ys.forEach((y, i) => line(360, from, sx, y + 24, failed === "b" && i === 1));
      } else {
        box(200, 85, 170, 58, T.cloud ? "Cloud load balancer" : "nginx / HAProxy", T.cloud ? "multi-zone, managed" : "one VM", failed === "lb" && !T.cloud ? "dead" : "hot");
        line(130, 114, 200, 114, failed === "lb" && !T.cloud);
        ys.forEach((y, i) => line(370, 114, sx, y + 24, (failed === "b" && i === 1) || (failed === "lb" && !T.cloud)));
      }
      ys.forEach((y, i) => box(sx, y, 140, 48, "Server " + (i + 1), "", failed === "b" && i === 1 ? "dead" : ""));
      const h = p.querySelector("#tp-svg"); h.innerHTML = ""; h.appendChild(s);
      readout(p.querySelector("#tp-p"), T.props);
    }
    seg(p.querySelector("#tp-m"), Object.entries(TOPO).map(([k, v]) => [k, v.name]), t, v => { t = v; failed = null; p.querySelector("#tp-v").className = "callout"; p.querySelector("#tp-v").textContent = "Fail something to see what happens."; draw(); });
    p.querySelector("#tp-lb").onclick = () => { failed = "lb"; const T = TOPO[t]; const v = p.querySelector("#tp-v"); v.className = "callout " + (t === "single" ? "bad" : t === "dns" ? "warn" : "good"); v.textContent = T.failLb; draw(); };
    p.querySelector("#tp-b").onclick = () => { failed = "b"; const T = TOPO[t]; const v = p.querySelector("#tp-v"); v.className = "callout " + (t === "dns" ? "bad" : "good"); v.textContent = T.failB; draw(); };
    p.querySelector("#tp-r").onclick = () => { failed = null; p.querySelector("#tp-v").className = "callout"; p.querySelector("#tp-v").textContent = "Fail something to see what happens."; draw(); };
    draw();
  }

  /* ---------------- 2.6 Autoscaling ---------------- */
  function autoscale(root) {
    const p = H.panel(root, "Autoscale through a day of traffic", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="as-t">Target CPU utilization <output id="as-to"></output></label><input type="range" id="as-t" min="30" max="95" value="70"></div>
        <div class="ctl"><label for="as-b">Time for a new instance to be ready <output id="as-bo"></output></label><input type="range" id="as-b" min="1" max="12" value="4"></div>
        <div class="ctl"><label for="as-m">Minimum instances <output id="as-mo"></output></label><input type="range" id="as-m" min="1" max="12" value="2"></div>
      </div>
      <div class="controls">
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="as-sp" checked> Marketing email at 11:00 (sudden 3× spike)</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="as-sch"> Scheduled scaling: at least 10 instances 10:30–21:00</label>
      </div>
      <div class="svgwrap" id="as-svg"></div><div class="readout" id="as-r"></div><div class="callout" id="as-v"></div>`;
    const PER = 200, PRICE = 0.10;
    function demand(m, spike) {
      const h = m / 60;
      let d = 150 + 1300 * Math.exp(-Math.pow((h - 14) / 2.6, 2)) + 1000 * Math.exp(-Math.pow((h - 20.5) / 1.6, 2));
      if (spike && m >= 660 && m < 690) d += 2600 * Math.exp(-(m - 660) / 14);
      return d;
    }
    function run() {
      const tgt = +p.querySelector("#as-t").value / 100, boot = +p.querySelector("#as-b").value, minI = +p.querySelector("#as-m").value;
      const spike = p.querySelector("#as-sp").checked, sch = p.querySelector("#as-sch").checked;
      p.querySelector("#as-to").textContent = Math.round(tgt * 100) + "%"; p.querySelector("#as-bo").textContent = boot + " min"; p.querySelector("#as-mo").textContent = minI;
      let ready = minI, pending = [], below = 0; const out = [];
      let over = 0, instMin = 0, peakI = 0, utilSum = 0;
      for (let m = 0; m < 1440; m++) {
        pending = pending.filter(t => { if (t <= m) { ready++; return false; } return true; });
        const d = demand(m, spike), cap = ready * PER;
        const util = d / cap;
        const lo = sch && m >= 630 && m < 1260 ? Math.max(minI, 10) : minI;
        let desired = Math.max(lo, Math.min(40, Math.ceil(ready * util / tgt)));
        if (desired > ready + pending.length) { for (let k = ready + pending.length; k < desired; k++) pending.push(m + boot); below = 0; }
        else if (desired < ready) { below++; if (below >= 5) { ready = Math.max(lo, ready - 1); below = 0; } }
        else below = 0;
        if (d > cap) over++;
        instMin += ready + pending.length; peakI = Math.max(peakI, ready + pending.length); utilSum += Math.min(1, util);
        out.push([d, cap]);
      }
      const W = 720, Hh = 230, x0 = 40, x1 = W - 24, y0 = 14, y1 = Hh - 34;
      const maxY = 4400, X = m => x0 + m / 1440 * (x1 - x0), Y = v => y1 - Math.min(v, maxY) / maxY * (y1 - y0);
      const s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Traffic and autoscaled capacity over 24 hours" });
      [0, 1000, 2000, 3000, 4000].forEach(v => { H.svg("line", { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: "var(--line)" }, s); const t = H.svg("text", { x: x0 - 5, y: Y(v) + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); t.textContent = v / 1000 + "k"; });
      [0, 6, 12, 18, 24].forEach(h => { const t = H.svg("text", { x: X(h * 60), y: y1 + 15, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)", class: "mono" }, s); t.textContent = String(h).padStart(2, "0") + ":00"; });
      let capPath = `M${X(0)} ${y1}`; out.forEach(([, c], m) => capPath += ` L${X(m)} ${Y(c)}`); capPath += ` L${X(1439)} ${y1} Z`;
      H.svg("path", { d: capPath, fill: "var(--compute-soft)", stroke: "var(--compute)", "stroke-width": 1.2 }, s);
      out.forEach(([d, c], m) => { if (d > c) H.svg("rect", { x: X(m), y: Y(d), width: Math.max(1, X(1) - X(0)), height: Y(c) - Y(d), fill: "var(--bad)", opacity: .7 }, s); });
      H.svg("path", { d: out.map(([d], m) => (m ? "L" : "M") + X(m).toFixed(1) + " " + Y(d).toFixed(1)).join(" "), fill: "none", stroke: "var(--ink)", "stroke-width": 1.8 }, s);
      const lg = H.svg("text", { x: x0, y: Hh - 4, "font-size": 11, fill: "var(--muted)" }, s);
      [["— traffic (req/s)   ", "var(--ink)"], ["■ capacity   ", "var(--compute)"], ["■ overloaded", "var(--bad)"]].forEach(([t, c]) => { const ts = H.svg("tspan", { fill: c }, lg); ts.textContent = t; });
      const host = p.querySelector("#as-svg"); host.innerHTML = ""; host.appendChild(s);
      const cost = instMin / 60 * PRICE;
      readout(p.querySelector("#as-r"), [["Overloaded minutes", over, over > 30 ? "bad" : over > 5 ? "warn" : "good"], ["Peak instances", peakI], ["Average utilization", Math.round(utilSum / 1440 * 100) + "%"], ["Cost per day", "$" + cost.toFixed(0)]]);
      const v = p.querySelector("#as-v");
      if (over > 30 && boot >= 6) { v.className = "callout bad"; v.textContent = "New instances take too long to be ready, so the spike is over (or has already hurt users) by the time they arrive. Faster startup (small images, no heavy warm-up), more headroom (a lower target) or scheduled scaling ahead of known peaks all help."; }
      else if (over > 5 && spike && !sch) { v.className = "callout warn"; v.textContent = "Autoscaling reacts to load it has already seen, so a sudden spike outruns it. For events you know about (a marketing email, a sale), scale ahead of time. Try the scheduled scaling box."; }
      else if (tgt < .5) { v.className = "callout warn"; v.textContent = "A low target buys plenty of headroom, at the price of paying for mostly idle machines all day."; }
      else { v.className = "callout good"; v.textContent = "Capacity follows the traffic, and you pay for roughly what you use. The scale-in delay (5 minutes here) stops the fleet from shrinking and growing again on every small dip."; }
    }
    p.querySelectorAll("input").forEach(i => i.addEventListener("input", run));
    run();
  }

  /* ---------------- module ---------------- */
  Course.register({
    id: 2,
    blurb: "When one machine is no longer enough, or no longer safe enough: more servers, a load balancer in front, and the discipline that makes it work (no state on the servers).",
    examBadge: "lvl2",
    lessons: [
      { id: "2.1", sources: [["Designing Data-Intensive Applications, chapter 1", "https://dataintensive.net/", "Martin Kleppmann, O'Reilly: 'Approaches for coping with load'"], ["System Design Primer: scalability", "https://github.com/donnemartin/system-design-primer#scalability", "Donne Martin"], ["Reliability pillar", "https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html", "AWS Well-Architected Framework"]],
        title: "Scale up, scale out", minutes: 20,
        lede: "Scaling up means a bigger machine. Scaling out means more machines. Both add capacity, but only one removes the single point of failure.",
        render(r) { fleet(r); H.keys(r, [["Scale up first", "A bigger machine is minutes of work and adds no new failure modes."], ["Scale out for limits and failures", "When no single machine is big enough, or one failure must not mean an outage."], ["N+1", "Size the fleet so it handles peak with one server missing."], ["Scaling out has a price", "A load balancer, stateless servers, and more things to deploy and monitor."]]); },
        check: { q: "Your app peaks at 3,000 req/s. Load tests show each server stays fast up to 1,000 req/s, a figure that already leaves headroom below its absolute maximum. What is the smallest fleet that survives one server failing at peak?", opts: ["3 servers, since together they exactly match the peak", "4 servers", "5 servers, one spare for every two that are busy", "1 server sized for 3,000 req/s, with nothing left over"], a: 1, why: "Three servers are exactly enough with all of them healthy. With N+1 you need 4, so any 3 can carry the peak at their safe load. The answer depends on what 1,000 means: if it were each server's absolute maximum, 3 survivors at 100% would queue badly (Lesson 0.4). Then you would size from a target such as 70%: 700 req/s each, so 5 survivors and 6 servers in all." } },
      { id: "2.2", sources: [["The Twelve-Factor App: processes", "https://12factor.net/processes", "Stateless processes, and why sticky sessions are discouraged"], ["Session Management Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", "OWASP"]],
        title: "Stateless servers: where state goes", minutes: 25,
        lede: "A load balancer can send any request to any server only if the servers keep nothing important in themselves. Find out what breaks when they do.",
        render(r) { sessions(r); H.keys(r, [["Sessions", "In a shared store (Redis, the database) or in a signed cookie, never only in process memory."], ["Uploaded files", "In object storage (S3, Google Cloud Storage), not the server's disk."], ["Scheduled jobs", "Run once per cluster (a dedicated worker or a lock), not once per replica."], ["In-process caches", "Fine as an optimisation, as long as losing them changes only speed, not correctness."]]); },
        check: { q: "You run 3 replicas behind a round-robin load balancer and users report being randomly logged out. What is the most likely cause?", opts: ["The load balancer is overloaded and drops session cookies", "Sessions are stored in each server's memory", "The database is too slow to look up sessions in time", "Each server has a different TLS certificate, which resets cookies"], a: 1, why: "Each request may land on a different replica, and only the replica where the user logged in has the session. Move sessions to a shared store or a signed cookie." } },
      { id: "2.3", sources: [["Using nginx as an HTTP load balancer", "https://nginx.org/en/docs/http/load_balancing.html", "nginx documentation"], ["The Power of Two Choices in Randomized Load Balancing", "https://www.eecs.harvard.edu/~michaelm/postscripts/tpds2001.pdf", "Michael Mitzenmacher, IEEE TPDS 2001"], ["Load Balancing in the Datacenter", "https://sre.google/sre-book/load-balancing-datacenter/", "Google SRE book, chapter 20"]],
        title: "Load-balancing algorithms", minutes: 25,
        lede: "Round robin is the default everyone starts with. Watch what happens to it when one server is slower than the rest, and which algorithms adapt.",
        render(r) { lbAlgos(r); H.keys(r, [["Round robin", "Equal turns. Good when servers and requests are uniform."], ["Least connections", "Fewest requests in progress. Adapts to slow servers and long requests."], ["Power of two choices", "Least busy of two random picks: nearly as good, scales to many balancers."], ["Hashing (IP or key)", "Same client or key → same server. Useful for cache locality (Level 6 covers consistent hashing)."]]); },
        check: { q: "Request durations vary widely (some take 5 ms, some 2 s). Which algorithm keeps tail latency lowest?", opts: ["Round robin", "Least connections", "IP hash", "DNS round robin"], a: 1, why: "Least connections notices that a server is busy with long requests and routes new ones elsewhere. Round robin and hashing ignore how busy each server is." } },
      { id: "2.4", sources: [["Implementing health checks", "https://aws.amazon.com/builders-library/implementing-health-checks/", "Amazon Builders' Library"], ["Health checks", "https://www.haproxy.com/documentation/haproxy-configuration-tutorials/reliability/health-checks/", "HAProxy documentation"], ["What is load balancing?", "https://www.cloudflare.com/learning/performance/what-is-load-balancing/", "Cloudflare Learning Center"]],
        title: "Layer 4 vs layer 7, and health checks", minutes: 25,
        lede: "A balancer that only sees addresses and ports is fast but blind. One that reads HTTP can route cleverly. Either way, it must notice dead servers quickly, without panicking.",
        render(r) { layers(r); H.keys(r, [["Layer 4", "Routes connections by IP and port. Any protocol, very fast, cannot read requests."], ["Layer 7", "Terminates TLS and reads HTTP: path routing, cookies, retries, headers."], ["Active + passive checks", "Probe regularly, and also react to errors in real traffic."], ["Keep checks shallow", "Health = can this process serve? Dependency failures belong in monitoring."]]); },
        check: { q: "Your /health endpoint queries the database. The database has a 20-second hiccup. What happens?", opts: ["Only the server nearest the database fails its check and is taken out of rotation", "Every server fails its check at once, so the balancer has nowhere to send traffic", "Nothing, because load balancers ignore failures caused by a server's dependencies", "The balancer switches the servers over to the standby database until it recovers"], a: 1, why: "A dependency shared by all servers makes all of them 'unhealthy' together. The outage is caused by the health check itself. Keep load-balancer checks shallow." } },
      { id: "2.5", sources: [["Load Balancing at the Frontend", "https://sre.google/sre-book/load-balancing-frontend/", "Google SRE book, chapter 19: DNS limitations"], ["What is Elastic Load Balancing?", "https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html", "AWS documentation"], ["Cloud Load Balancing overview", "https://cloud.google.com/load-balancing/docs/load-balancing-overview", "Google Cloud documentation"], ["Keepalived", "https://www.keepalived.org/", "VRRP floating IPs for Linux"]],
        title: "Who balances the balancer?", minutes: 20,
        lede: "Putting a load balancer in front of your servers moves the single point of failure to the balancer. Here is how that is solved, from free and fragile to managed and expensive.",
        render(r) { topology(r); H.keys(r, [["DNS alone is not a balancer", "No health checks, and caches keep sending users to dead servers."], ["Pair your balancers", "Two balancers and a floating IP remove the last single point."], ["Managed is usually the answer", "On a cloud, a managed balancer is cheaper than your time to run a pair."], ["Drain before removing", "Stop sending new requests to a server, let in-flight ones finish, then stop it."]]); },
        check: { q: "Why is DNS round robin a poor replacement for a load balancer?", opts: ["DNS can return only one IP address per name, so it cannot spread the load at all", "DNS checks no health, and cached answers keep pointing users at dead servers", "DNS lookups are slower than HTTP requests, so every single request pays the delay", "Browsers ignore every A record except the first, so only one server gets traffic"], a: 1, why: "Resolvers and clients cache answers, sometimes longer than the TTL, and DNS has no idea whether a server is alive." } },
      { id: "2.6", sources: [["Horizontal Pod Autoscaling", "https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/", "Kubernetes documentation: the scaling algorithm"], ["Target tracking scaling policies", "https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html", "Amazon EC2 Auto Scaling"]],
        title: "Autoscaling", minutes: 20,
        lede: "Autoscalers add servers when they are busy and remove them when they are idle. They are reactive, so how fast a new server becomes ready decides whether users notice a spike.",
        render(r) { autoscale(r); H.keys(r, [["Target tracking", "Kubernetes: desired = ⌈current × current metric ÷ target⌉."], ["Startup time matters", "Capacity arrives only after boot, image pull and warm-up."], ["Scale in slowly", "A stabilisation window (Kubernetes defaults to 5 minutes) prevents flapping."], ["Known peaks: schedule", "Scale before predictable events instead of reacting to them."]]); },
        check: { q: "Traffic jumps 3× within one minute, and new instances take 8 minutes to become ready. What is the most effective fix?", opts: ["Lower the scale-in delay, so idle instances are removed sooner", "Raise the target utilization to 95%, so scaling triggers sooner", "Keep more headroom (a lower target) and pre-scale for known events", "Switch the balancer from least connections to round robin"], a: 2, why: "Reactive scaling cannot help with load that arrives faster than instances start. Headroom absorbs it, and scheduled scaling prepares for events you know about." } }
    ],
    exam: [
      { q: "Which statement about scaling up (vertical scaling) is true?", opts: ["It removes the single point of failure, because a bigger machine fails less often", "It is often the simplest first step, but it has an upper limit and keeps one point of failure", "It requires a load balancer to share traffic across the new CPU cores", "It requires stateless servers, because the app restarts on the new machine"], a: 1, why: "A bigger machine is simple but bounded, and it is still one machine." },
      { q: "What makes an application server 'stateless'?", opts: ["It uses no database, so there is nothing for it to remember between requests", "Any instance can serve any request, because state lives in shared services", "It keeps nothing at all in memory, not even caches or connection pools", "It runs only on serverless platforms such as AWS Lambda or Cloud Run"], a: 1, why: "Stateless means instances are interchangeable; state lives in shared backing services." },
      { q: "One of four backends becomes 4× slower. Under round robin, what happens to latency?", opts: ["Nothing changes, because round robin already accounts for each server's speed", "About a quarter of requests become slow and the slow server's queue grows, raising p95/p99", "All requests become 4× slower, because the balancer waits for the slowest server", "The balancer stops using it as soon as its responses take longer"], a: 1, why: "Round robin keeps giving it an equal share regardless of how busy it is." },
      { q: "Which task needs a layer 7 load balancer?", opts: ["Balancing raw TCP connections to a database", "Routing /api/* and /static/* to different server pools", "Passing TLS through to the servers without decrypting it", "Spreading UDP traffic for a DNS service"], a: 1, why: "Routing by path requires reading the HTTP request." },
      { q: "With a 5-second check interval and fall = 3, roughly how long before a crashed server is removed by active checks alone?", opts: ["About 1 second", "About 10–15 seconds", "About 1 minute", "Never"], a: 1, why: "Three consecutive failed checks, five seconds apart: roughly 10–15 seconds depending on when the crash happens." },
      { q: "Why should load-balancer health checks usually avoid checking shared dependencies such as the database?", opts: ["Database queries make the checks slower to write, test and maintain over time", "If that dependency fails, every server looks unhealthy at once: a total outage", "Databases refuse queries that arrive from load-balancer health-check agents", "Checking the database from each server requires turning off TLS for the checks"], a: 1, why: "All servers share the database, so they all fail together and the balancer has nowhere to send traffic." },
      { q: "What does a floating IP with keepalived (VRRP) provide?", opts: ["Faster DNS resolution, because clients cache one address for longer", "Automatic failover of the balancer's address from an active node to a standby", "Encryption of the traffic between the balancer and the servers", "Autoscaling of the balancer pool when traffic grows"], a: 1, why: "The standby claims the shared IP when the active node stops sending heartbeats." },
      { q: "Current replicas = 4, current CPU = 90%, target = 60%. What does the Kubernetes autoscaling formula request?", opts: ["4", "5", "6", "9"], a: 2, why: "⌈4 × 90 ÷ 60⌉ = ⌈6⌉ = 6 replicas." }
    ],
    lab: {
      title: "Three replicas behind HAProxy",
      time: "about 5 hours",
      folder: "level-2-scale-out/",
      needs: "Docker Desktop (or Docker Engine), a terminal, curl",
      intro: `<p>You will put HAProxy, a widely used open-source load balancer, in front of three FastAPI replicas. You will watch traffic spread, break logins by keeping sessions in memory, fix them with Redis, kill servers under load, compare algorithms with a deliberately slow server, and scale to five replicas while the balancer discovers them on its own.</p><p>Everything runs locally. Ports are set in <code>.env</code>: <code>LB_PORT</code> (default 8080) for traffic and <code>STATS_PORT</code> (default 8404) for HAProxy's dashboard.</p>`,
      vmIntro: "If your API runs as a single container on one VM, there is no load balancer to inspect yet. These checks tell you whether it is ready to scale out when the time comes.",
      vmChecks: [
        ["The API keeps no state on the machine", "docker inspect --format '{{.Name}} {{json .Mounts}}' $(docker compose ps -q api)", "<code>[]</code>: the API container mounts no volumes. Uploads, sessions and caches that must survive live in Postgres, Redis or object storage."],
        ["Sessions do not depend on one process", "grep -rniE 'session|SessionMiddleware|login' --include=*.py . | head", "Sessions are signed cookies or stored in the database/Redis. Restarting the API (<code>docker compose restart api</code>) does not log anyone out."],
        ["The health endpoint is fast and shallow", "curl -s -o /dev/null -w '%{http_code} %{time_total}s\\n' https://your-domain/api/health", "<code>200</code> in well under 100 ms. If it queries the database, decide deliberately whether a database blip should take the app out of rotation."],
        ["Workers match the CPU", "nproc\ndocker compose exec api ps aux | grep -c '[u]vicorn'", "Roughly one uvicorn worker per CPU core (plus the parent process)."]
      ],
      steps: [
        { id: "l2-1", why: "Before tuning anything, see the basic mechanism: one address in front, several interchangeable servers behind it.", title: "Start the cluster and watch traffic spread",
          body: `${H.code(`cd level-2-scale-out
cp .env.example .env            # change LB_PORT / STATS_PORT if 8080 / 8404 are taken
export LB_PORT=8080
docker compose up -d --build
for i in $(seq 1 9); do curl -s localhost:$LB_PORT/; echo; done`)}`,
          expect: "Nine responses cycling through three different <code>server</code> names (the container IDs of the three replicas).",
          solution: `${H.code(`{"server":"3f2a9c1b0e7d","pid":8}
{"server":"a81c44d29f10","pid":8}
{"server":"c0e5b7a3d812","pid":8}
{"server":"3f2a9c1b0e7d","pid":8}
...`)}
            <ul><li>Compose started three copies of the same API service (<code>deploy.replicas: 3</code>). Docker's internal DNS answers the name <code>api</code> with all three IP addresses.</li><li>HAProxy asks that DNS name for addresses (<code>server-template</code> in <code>haproxy/haproxy.cfg</code>) and balances across whatever it finds: no IPs are written in the config.</li><li>Round robin is HAProxy's default, so the order repeats.</li></ul>` },
        { id: "l2-2", why: "A balancer is only as good as its view of which servers are healthy. The stats page is that view, and you will use it in every later step.", title: "Open HAProxy's stats page",
          body: `<p>Open <code>http://localhost:8404</code> (your <code>STATS_PORT</code>). Find the <code>api</code> backend.</p>`,
          expect: "Five rows <code>api1</code>–<code>api5</code>: three green (UP) and two grey (MAINT, no address). Each UP server shows check results and request counts.",
          solution: `<ul><li><b>Why five rows for three servers?</b> <code>server-template api 5 api:8000</code> reserves five slots. Slots are filled as DNS returns addresses, which is how scaling up later works without editing the config.</li><li><b>LastChk</b> shows the result of the latest active health check (<code>GET /health</code> every 2 s). <b>Chk/Dwn</b> counts failed checks and transitions to DOWN.</li><li>The <b>Cur</b> sessions column is what <i>least connections</i> looks at.</li></ul>` },
        { id: "l2-3", why: "This is the classic bug when an app first moves from one server to several. Reproducing it makes the stateless rule concrete.", title: "Break logins with in-memory sessions",
          body: `<p>The app starts with <code>SESSION_STORE=memory</code>. Log in once, then ask "who am I?" six times with the same cookie.</p>${H.code(`curl -s -c jar.txt -X POST localhost:$LB_PORT/login -H 'content-type: application/json' -d '{"user":"alice"}'; echo
for i in $(seq 1 6); do curl -s -b jar.txt localhost:$LB_PORT/me; echo; done`)}`,
          expect: "Only about one in three <code>/me</code> calls returns Alice; the rest return <code>401</code> with <code>\"not logged in on server …\"</code>.",
          solution: `${H.code(`{"user":"alice","server":"3f2a9c1b0e7d"}
{"detail":"not logged in on server a81c44d29f10"}
{"detail":"not logged in on server c0e5b7a3d812"}
{"user":"alice","server":"3f2a9c1b0e7d"}
...`)}
            <p>The session ID in the cookie is only known to the replica that created it. Round robin sends the next request elsewhere. On a single server you never see this, which is why it surprises people when they add a second one.</p>` },
        { id: "l2-4", why: "Moving state to a shared store is what makes servers interchangeable, so they can be added, removed, restarted and deployed freely.", title: "Move sessions to Redis",
          body: `${H.code(`# in .env: SESSION_STORE=redis
docker compose up -d                      # recreates the api replicas with the new setting
curl -s -c jar.txt -X POST localhost:$LB_PORT/login -H 'content-type: application/json' -d '{"user":"alice"}'; echo
for i in $(seq 1 6); do curl -s -b jar.txt localhost:$LB_PORT/me; echo; done
docker compose restart api                # restart every replica
curl -s -b jar.txt localhost:$LB_PORT/me; echo`)}`,
          expect: "All six calls return Alice, from different servers. After restarting every replica, Alice is still logged in.",
          solution: `<ul><li>Each replica now looks the session up in Redis (<code>session:&lt;id&gt;</code>, with a 1-hour expiry), so it no longer matters which one answers.</li><li>Peek inside: <code>docker compose exec redis redis-cli --scan --pattern 'session:*'</code>.</li><li><b>The new risk:</b> Redis is now on every request's path. Try <code>docker compose stop redis</code> and call <code>/me</code>: errors everywhere. In production Redis gets persistence and a replica (or you use a managed service), or sessions go in Postgres, or in signed cookies.</li><li>Start it again: <code>docker compose start redis</code> (sessions are gone: this lab's Redis has persistence off).</li></ul>` },
        { id: "l2-5", why: "Servers will fail. What matters is how many user requests fail with them, and that depends on health checks and retries.", title: "Kill a replica under load",
          body: `<p>Run a steady 60 req/s for 40 seconds. Ten seconds in, stop one replica from a second terminal.</p>${H.code(`# terminal 1 (Linux; on Docker Desktop use TARGET=http://host.docker.internal:$LB_PORT/work and drop --network host)
docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work -e RATE=60 -e DURATION=40s grafana/k6 run - < k6/steady.js
# terminal 2, about 10 s later
docker stop $(docker compose ps -q api | head -n1)`)}<p>Watch the stats page while it runs. Afterwards bring the replica back with <code>docker compose up -d</code>.</p>`,
          expect: "The stats page shows one server go DOWN within a few seconds. The k6 report shows zero or very few failed requests.",
          solution: `${H.code(`  STEADY LOAD REPORT  http://localhost:8080/work
  offered 60 req/s for 40s  ->  completed 2400 requests (59.8 req/s), dropped 0
  failed requests: 0 (0.00%)`, [3])}
            <ul><li><code>docker stop</code> sends SIGTERM: uvicorn stops accepting new connections and finishes in-flight requests (a graceful shutdown), so almost nothing fails.</li><li>Requests sent to the dying server during the gap are covered by <code>retries 2</code> and <code>option redispatch</code> in <code>haproxy.cfg</code>: a failed connection is retried on another server. This is safe here because the request never reached the app. In the reference run the stopped server's row showed about 80 <i>redispatched</i> requests and the client saw none fail. Read yours with <code>curl -s "localhost:$STATS_PORT/;csv" | awk -F, '$1=="api" {print $2, $18, "total", $8, "redispatched", $17}'</code>.</li><li>Active checks (<code>inter 2s fall 2</code>) mark it DOWN in about 4 s, after which no more traffic goes there.</li><li><b>Try a hang instead</b>: <code>docker pause</code> a replica. Connections are accepted but never answered, so requests wait for <code>timeout server</code> (10 s) and some fail. Hung servers are harder than dead ones. Unpause with <code>docker unpause</code>.</li></ul>` },
        { id: "l2-6", why: "Real fleets are never uniform. This shows, with your own numbers, why least connections is a common default.", title: "Compare algorithms with a slow server",
          body: `<p>Add a fourth replica that answers every request 150 ms late. It joins the same DNS name, so HAProxy picks it up automatically.</p>${H.code(`docker compose --profile slow up -d        # starts api-slow
docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work -e RATE=60 -e DURATION=30s grafana/k6 run - < k6/steady.js
# in .env: BALANCE=leastconn, then recreate only the balancer:
docker compose up -d haproxy
docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work -e RATE=60 -e DURATION=30s grafana/k6 run - < k6/steady.js`)}`,
          expect: "With round robin, every server (the slow one included) gets the same number of requests. With least connections the slow server gets far fewer and the average drops, but the p95 may stay high.",
          solution: `<p>Read how many requests each server got from the stats page (Sessions → Total) or with <code>curl -s "localhost:$STATS_PORT/;csv" | awk -F, '$1=="api" {print $2, $8}'</code>. Reference runs (60 req/s for 30 s, 3 normal replicas + 1 slow):</p>${H.code(`              average    p50     p95     share sent to the slow server
roundrobin    62 ms     25 ms   178 ms   449 of 1,799  (25%)
leastconn     39 ms     26 ms   175 ms   145 of 1,801   (8%)`, [2, 3])}
            <ul><li><b>Round robin</b> gives the slow replica exactly a quarter of the traffic, so everything above the 75th percentile is slow.</li><li><b>Least connections</b> notices that the slow replica keeps its requests longer and sends it a third as many. The average drops by a third.</li><li><b>Why the p95 barely moved:</b> at this load the servers are often all idle at the same moment. Then they all have zero connections, and the slow one looks just as good as the rest. 8% of requests still go there, which is more than the slowest 5%, so the p95 is still a slow request. Least connections reduces the damage; it does not remove a bad server. That job belongs to health checks and outlier detection (taking servers with high error rates or latency out of rotation), or to fixing the server.</li><li>Stop the slow replica afterwards: <code>docker compose --profile slow stop api-slow</code>, and set <code>BALANCE</code> back if you like.</li></ul>` },
        { id: "l2-7", why: "Scaling out only works if the balancer finds new servers without manual config edits. This is service discovery in its simplest form.", title: "Scale to five replicas",
          body: `${H.code(`docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work -e END=300 grafana/k6 run - < k6/ramp.js   # baseline
docker compose up -d --scale api=5
# watch the stats page: within ~10 s, api4 and api5 turn green
docker run --rm -i --network host -e TARGET=http://localhost:$LB_PORT/work -e END=300 grafana/k6 run - < k6/ramp.js`)}<p>If the slow replica from step 6 is still running, stop it first (<code>docker compose --profile slow stop api-slow</code>). It also answers to the name <code>api</code>, and HAProxy has exactly five slots for that name.</p>`,
          expect: "Two new rows turn UP without touching HAProxy. The knee in the ramp report moves up, as far as your CPU cores allow.",
          solution: `<ul><li>HAProxy re-resolves <code>api</code> every few seconds (<code>hold valid 5s</code> in the <code>resolvers</code> section) and fills the empty template slots with the new addresses.</li><li><b>Five slots, not unlimited.</b> <code>server-template api 5</code> creates exactly five server entries when HAProxy starts. If DNS returns more addresses than slots (five replicas plus a still-running <code>api-slow</code> make six), the extra ones get no slot and no traffic. Raise the number in <code>haproxy.cfg</code> to leave room for growth; empty slots cost almost nothing and show as MAINT.</li><li><b>Throughput only scales with real CPU.</b> On a 4-core laptop, five replicas of a CPU-bound endpoint cannot beat four cores; the knee stops moving once the machine is saturated. In production each replica is on its own machine or has its own CPU allocation.</li><li>Scale back down with <code>--scale api=3</code>: the removed servers go to MAINT. Then <code>docker compose down</code> when you are finished.</li></ul>` }
      ]
    }
  });
})();
