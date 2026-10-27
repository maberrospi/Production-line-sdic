/* Level 1 — The single server */
(function () {
  "use strict";
  const H = Course.H;
  const sleep = ms => new Promise(r => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms));

  /* ---------------- 1.1 Anatomy of a production VM ---------------- */
  const LAYERS = {
    cloud: { t: "Cloud firewall", s: "Provider security group / VPC rules", d: "The first wall, outside your VM. Allow 80 and 443 from anywhere, and 22 only from your IP or a VPN. Everything else is dropped before it reaches the machine.", c: ["Inbound: 80, 443 from 0.0.0.0/0", "Inbound: 22 from your IP only (or Tailscale, no public SSH at all)", "Everything else denied by default"] },
    os: { t: "Operating system", s: "Ubuntu LTS, patched, keys only", d: "A long-term-support release that patches itself. You log in with SSH keys as a normal user; root login and passwords are off.", c: ["PasswordAuthentication no, PermitRootLogin no", "unattended-upgrades for security patches", "A non-root deploy user for CI", "fail2ban or SSH behind a VPN", "Time sync (chrony) and a sane timezone"] },
    docker: { t: "Docker engine", s: "Runs and restarts your containers", d: "Docker owns the containers and part of the firewall. Its biggest production trap is logs: by default they grow until the disk is full.", c: ["/etc/docker/daemon.json with log rotation (max-size 10m, max-file 3)", "restart: unless-stopped on every service", "Remember: published ports bypass ufw (Lesson 1.2)"] },
    front: { t: "frontend network", s: "nginx ↔ api", d: "A private Docker network. nginx reaches FastAPI by its service name, api:8000. The database is not on this network, so nginx cannot reach it even if compromised.", c: ["Only nginx publishes ports (80, 443)", "nginx → api:8000 by service name"] },
    back: { t: "backend network", s: "api ↔ db", d: "The second private network. Only the API can talk to Postgres. Port 5432 is never published to the host.", c: ["db publishes no ports", "API connects to db:5432 with credentials from .env"] },
    nginx: { t: "nginx container", s: "TLS, routing, static files", d: "The only door into the VM. It terminates HTTPS, serves static files, rate-limits, and forwards /api to FastAPI (Lesson 1.3).", c: ["Pinned image tag, not latest", "Config from git, certificates mounted read-only"] },
    api: { t: "api container", s: "FastAPI, your image", d: "Built by CI, tagged with the git commit, pulled by the deploy script. Stateless: anything that must survive goes to Postgres.", c: ["Runs as a non-root user", "Healthcheck on /health", "Config and secrets from environment, never baked in"] },
    db: { t: "db container", s: "Postgres 16", d: "The one stateful thing on the box. Its data lives in a named volume so recreating the container never loses data. Backups go off the machine.", c: ["Named volume dbdata", "pg_isready healthcheck", "Nightly dump + WAL archiving to a bucket (Lesson 1.6)"] },
    vol: { t: "Volumes", s: "dbdata, certs", d: "Data that must outlive containers. A volume survives docker compose down and image upgrades, but not a dead disk, so it is not a backup.", c: ["Back up dbdata off-site", "Never docker compose down -v in production"] },
    off: { t: "Off the box", s: "Things that must survive the VM dying", d: "If the VM vanished right now, these let you rebuild in under an hour: images in a registry, data in a bucket, the setup in git, and someone watching.", c: ["Container registry (GHCR, Artifact Registry, ECR)", "Backups in object storage, ideally another account", "Uptime monitor on /health and a backup heartbeat", "Error tracking (Sentry)", "The whole setup as scripts in git"] }
  };
  function anatomy(root) {
    const p = H.panel(root, "Explore a production-ready VM", "Tap any layer");
    p.innerHTML = `<style>
      .ly{border:1.5px solid var(--line-strong);border-radius:12px;padding:10px 12px 12px;background:var(--surface);text-align:left;width:100%;cursor:pointer;display:block;font:inherit;color:inherit}
      .ly:hover{border-color:var(--ink)} .ly.sel{border-color:var(--signal);box-shadow:0 0 0 3px var(--signal-soft)}
      .ly .lt{font-family:var(--f-display);font-stretch:108%;font-weight:700;font-size:14px} .ly .ls{font-size:12px;color:var(--muted)}
      .ly-in{margin-top:10px;display:grid;gap:10px}
      .an-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px}
      .nets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .ctr{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .ctr .ly{flex:1 1 90px;padding:8px} @media(max-width:700px){.an-grid{grid-template-columns:minmax(0,1fr)}.nets{grid-template-columns:minmax(0,1fr)}}
    </style>
    <div class="an-grid">
      <div class="layer-host"></div>
      <div><div class="ly-off"></div><div class="callout" id="andet" style="margin-top:10px" aria-live="polite"></div></div>
    </div>`;
    const btn = (k, inner, style) => `<div class="ly" role="button" tabindex="0" data-k="${k}" style="${style || ""}"><div class="lt">${LAYERS[k].t}</div><div class="ls">${LAYERS[k].s}</div>${inner || ""}</div>`;
    p.querySelector(".layer-host").innerHTML =
      btn("cloud", `<div class="ly-in">${btn("os", `<div class="ly-in">${btn("docker", `<div class="ly-in"><div class="nets">
        ${btn("front", `<div class="ctr">${btn("nginx", "", "border-color:var(--compute)")}${btn("api", "", "border-color:var(--compute)")}</div>`, "background:var(--compute-soft)")}
        ${btn("back", `<div class="ctr">${btn("api", "", "border-color:var(--compute)")}${btn("db", "", "border-color:var(--data)")}</div>`, "background:var(--data-soft)")}
      </div>${btn("vol", "", "border-style:dashed")}</div>`)}</div>`)}</div>`, "border-style:dashed");
    p.querySelector(".ly-off").innerHTML = btn("off", "", "border-color:var(--xp);background:var(--xp-soft)");
    const det = p.querySelector("#andet");
    function show(k, el) {
      p.querySelectorAll(".ly").forEach(x => x.classList.toggle("sel", x === el));
      const L = LAYERS[k];
      det.innerHTML = `<b></b><p style="margin:4px 0 8px"></p><div style="font-size:13px;font-weight:600;margin-bottom:4px">Production checklist</div><ul style="margin:0;padding-left:18px">${L.c.map(() => "<li></li>").join("")}</ul>`;
      det.querySelector("b").textContent = L.t; det.querySelector("p").textContent = L.d;
      det.querySelectorAll("li").forEach((li, i) => li.textContent = L.c[i]);
    }
    p.addEventListener("click", e => { const el = e.target.closest(".ly"); if (el) { e.stopPropagation(); show(el.dataset.k, el); } });
    p.addEventListener("keydown", e => { const el = e.target.closest(".ly"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(el.dataset.k, el); } });
    show("cloud", p.querySelector('.ly[data-k="cloud"]'));
  }

  /* ---------------- 1.2 Attack surface ---------------- */
  function attack(root) {
    const p = H.panel(root, "Lock down the box", "Game");
    p.innerHTML = `<p class="note" style="margin-top:0">Goal: from the internet, only 80 and 443 should answer, and SSH must not accept passwords. Change the settings, then run the scan.</p>
      <div class="controls" style="align-items:flex-start">
        <div><div class="note" style="margin-bottom:4px">FastAPI port 8000</div><div class="seg" data-k="api"><button type="button" data-v="pub">"8000:8000"</button><button type="button" data-v="local">"127.0.0.1:8000:8000"</button><button type="button" data-v="none">not published</button></div></div>
        <div><div class="note" style="margin-bottom:4px">Postgres port 5432</div><div class="seg" data-k="db"><button type="button" data-v="pub">"5432:5432"</button><button type="button" data-v="local">"127.0.0.1:5432:5432"</button><button type="button" data-v="none">not published</button></div></div>
        <div><div class="note" style="margin-bottom:4px">SSH</div><div class="seg" data-k="ssh"><button type="button" data-v="pw">passwords allowed</button><button type="button" data-v="key">keys only</button><button type="button" data-v="ip">keys, my IP only</button></div></div>
      </div>
      <div class="controls">
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ufw" checked> ufw on the VM: deny 8000 and 5432</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="sg"> Cloud firewall: allow only 22, 80, 443</label>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px" class="atk-grid">
        <div><div class="note" style="margin-bottom:4px">compose.yaml (generated)</div><div id="atk-yaml"></div></div>
        <div><div class="note" style="margin-bottom:4px">Scan from the internet: <code>nmap -p 22,80,443,5432,8000 your-vm</code></div><div id="atk-scan" style="overflow-x:auto;white-space:nowrap;font:13px var(--f-mono);background:var(--code-bg);color:var(--code-ink);border-radius:10px;padding:12px 14px;min-height:170px"></div>
        <button class="btn primary" type="button" id="scan" style="margin-top:8px">Run scan</button></div>
      </div>
      <div class="callout" id="atk-v" aria-live="polite">Pick your settings and run the scan.</div>
      <style>@media(max-width:760px){.atk-grid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
    const st = { api: "pub", db: "pub", ssh: "pw" };
    p.querySelectorAll(".seg[data-k]").forEach(seg => {
      seg.querySelectorAll("button").forEach(b => {
        b.setAttribute("aria-pressed", st[seg.dataset.k] === b.dataset.v);
        b.onclick = () => { st[seg.dataset.k] = b.dataset.v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); yaml(); };
      });
    });
    function yaml() {
      const port = (k, n) => st[k] === "pub" ? `    ports: ["${n}:${n}"]` : st[k] === "local" ? `    ports: ["127.0.0.1:${n}:${n}"]` : `    # no ports: reachable only on the Docker network`;
      p.querySelector("#atk-yaml").innerHTML = H.code(`services:
  nginx:
    ports: ["80:80", "443:443"]
    networks: [frontend]
  api:
${port("api", 8000)}
    networks: [frontend, backend]
  db:
${port("db", 5432)}
    networks: [backend]`);
    }
    function result() {
      const ufw = p.querySelector("#ufw").checked, sg = p.querySelector("#sg").checked;
      const rows = [];
      const ssh = st.ssh === "ip" || false ? ["filtered", "good", "only your IP gets through"] : st.ssh === "key" ? ["open", "ok", "keys only: brute force is useless"] : ["open", "bad", "accepts passwords: bots will try millions"];
      rows.push(["22/tcp", ...ssh]);
      rows.push(["80/tcp", "open", "ok", "nginx (redirects to HTTPS)"]);
      rows.push(["443/tcp", "open", "ok", "nginx"]);
      const svc = (k, n, name) => {
        if (st[k] !== "pub") return [n + "/tcp", "closed", "good", st[k] === "local" ? "bound to 127.0.0.1 only" : "not published"];
        if (sg) return [n + "/tcp", "filtered", "warn", "blocked by the cloud firewall only"];
        return [n + "/tcp", "open", "bad", name + (ufw ? " (ufw did not stop it!)" : "")];
      };
      rows.push(svc("db", 5432, "Postgres")); rows.push(svc("api", 8000, "FastAPI, bypassing nginx"));
      return { rows, ufw, sg };
    }
    let scanning = false;
    p.querySelector("#scan").onclick = async () => {
      if (scanning) return; scanning = true;
      const out = p.querySelector("#atk-scan"); out.innerHTML = "";
      const { rows, ufw, sg } = result();
      const line = (html) => { const d = document.createElement("div"); d.innerHTML = html; out.appendChild(d); };
      line(`<span style="opacity:.6">Starting Nmap scan…</span>`);
      line(`<span style="opacity:.6">PORT      STATE     SERVICE</span>`);
      const color = { bad: "#FF7A6B", ok: "#9FD9A3", good: "#9FD9A3", warn: "#F0C66B" };
      for (const r of rows) { await sleep(320); line(`<span style="color:${color[r[2]]}">${r[0].padEnd(9, " ")} ${r[1].padEnd(9, " ")}</span> <span style="opacity:.75">${r[3]}</span>`.replace(/ /g, "&nbsp;").replace(/<span&nbsp;/g, "<span ")); }
      scanning = false;
      const v = p.querySelector("#atk-v");
      const exposed = rows.filter(r => r[2] === "bad");
      const ufwTrap = ufw && rows.some(r => (r[0] === "5432/tcp" || r[0] === "8000/tcp") && r[2] === "bad");
      if (exposed.length) {
        v.className = "callout bad";
        v.textContent = ufwTrap ? "Docker writes its own iptables rules for published ports, ahead of ufw. ufw says 'deny' and the port is open anyway. The fix is not to publish database or API ports at all, or bind them to 127.0.0.1." : "Something is still reachable that should not be. Every open port is something attackers can probe.";
      } else if (rows.some(r => r[2] === "warn")) {
        v.className = "callout warn"; v.textContent = "Safe for now, but only because of one outer layer. If someone edits the cloud firewall, the database is exposed. Fix it in compose too: defense in depth means each layer is safe on its own.";
        H.award("locked-down");
      } else {
        v.className = "callout good"; v.textContent = "Locked down. Only nginx is public, the API and database are reachable only over the Docker network, and SSH cannot be brute-forced.";
        H.award("locked-down");
      }
    };
    p.querySelectorAll("input").forEach(i => i.addEventListener("change", yaml));
    yaml();
  }

  /* ---------------- 1.3 Reverse proxy ---------------- */
  const CONF = [
    ["upstream api { server api:8000; keepalive 16; }", "api timeout rate"],
    ["limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;", "rate"],
    ["", ""],
    ["server {", "redir"],
    ["  listen 80;", "redir"],
    ["  server_name app.example.com;", "redir"],
    ["  return 301 https://$host$request_uri;", "redir"],
    ["}", "redir"],
    ["", ""],
    ["server {", "tls"],
    ["  listen 443 ssl;", "tls"],
    ["  http2 on;", "tls"],
    ["  ssl_certificate     /etc/letsencrypt/live/app/fullchain.pem;", "tls"],
    ["  ssl_certificate_key /etc/letsencrypt/live/app/privkey.pem;", "tls"],
    ["  root /usr/share/nginx/html;", "static assets spa"],
    ["  gzip on;", "assets static"],
    ["  gzip_types text/css application/javascript application/json;", "assets"],
    ["", ""],
    ["  location ~ /\\. { return 404; }   # .env, .git ...", "dot"],
    ["", ""],
    ["  location /assets/ {", "assets"],
    ["    add_header Cache-Control \"public, max-age=31536000, immutable\";", "assets"],
    ["  }", "assets"],
    ["", ""],
    ["  location = /api/login {", "rate"],
    ["    limit_req zone=login burst=5 nodelay;", "rate"],
    ["    limit_req_status 429;", "rate"],
    ["    proxy_pass http://api;", "rate"],
    ["  }", "rate"],
    ["", ""],
    ["  location /api/ {", "api timeout"],
    ["    proxy_pass http://api;", "api timeout"],
    ["    proxy_http_version 1.1;", "api"],
    ["    proxy_set_header Connection \"\";", "api"],
    ["    proxy_set_header Host $host;", "api"],
    ["    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;", "api"],
    ["    proxy_set_header X-Forwarded-Proto $scheme;", "api"],
    ["    proxy_read_timeout 60s;", "timeout"],
    ["  }", "api timeout"],
    ["", ""],
    ["  location / {", "spa static"],
    ["    try_files $uri $uri/ /index.html;", "spa static"],
    ["  }", "spa static"],
    ["}", "tls"]
  ];
  const REQS = [
    { k: "redir", m: "GET", u: "http://app.example.com/login", code: "301", to: "client", why: "Plain HTTP hits the port 80 server block, which only redirects to HTTPS. Browsers then remember this with HSTS." },
    { k: "static", m: "GET", u: "https://app.example.com/", code: "200", to: "disk", why: "nginx decrypts TLS, finds index.html on disk and sends it. FastAPI never wakes up. nginx serves static files far more cheaply than Python." },
    { k: "assets", m: "GET", u: "/assets/index-3f9c1a.js", code: "200", to: "disk", why: "Built assets have a content hash in the name, so they can be cached for a year. The browser and any CDN will not ask again until the hash changes." },
    { k: "api", m: "GET", u: "/api/orders?page=2", code: "200", to: "api", why: "Matches location /api/. nginx forwards it to api:8000 over the Docker network, reusing a keep-alive connection, and adds X-Forwarded-For so FastAPI sees the real client IP." },
    { k: "spa", m: "GET", u: "/settings/billing", code: "200", to: "disk", why: "No such file exists: it is a client-side route. try_files falls back to index.html and the frontend router takes over. Without this line, refreshing a deep link gives 404." },
    { k: "rate", m: "POST", u: "/api/login × 50 from one IP", code: "429", to: "reject", why: "The first 6 attempts reach FastAPI (rate 5/min plus burst 5). The rest get 429 Too Many Requests from nginx, so a password-guessing script never loads your API." },
    { k: "dot", m: "GET", u: "/.env", code: "404", to: "reject", why: "Bots scan for /.env and /.git constantly. Denying every dotfile path means a misplaced secret file is never served." },
    { k: "timeout", m: "GET", u: "/api/reports/yearly (takes 75 s)", code: "504", to: "api", why: "FastAPI is still working when proxy_read_timeout (60 s) runs out, so nginx returns 504 Gateway Timeout. Long jobs belong in a background queue (Level 8), not a request." }
  ];
  function proxy(root) {
    const p = H.panel(root, "Route requests through nginx", "Try it");
    p.innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px" class="px-grid">
      <div><div class="note" style="margin-bottom:6px">Incoming requests</div><div id="px-list" style="display:grid;gap:6px"></div></div>
      <div style="min-width:0"><div class="svgwrap" id="px-svg"></div><div class="callout" id="px-why" aria-live="polite">Pick a request.</div></div>
    </div><div class="note" style="margin:12px 0 4px">nginx/conf.d/app.conf, with the lines that handled it highlighted</div><div id="px-conf"></div>
    <style>@media(max-width:760px){.px-grid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
    const list = p.querySelector("#px-list");
    REQS.forEach((r, i) => {
      const b = H.el(`<button type="button" class="opt" style="font-size:13px;padding:8px 10px"><span class="mono" style="font-weight:600;min-width:42px">${r.m}</span><span class="mono" style="word-break:break-all"></span></button>`);
      b.lastChild.textContent = r.u; b.onclick = () => pick(i, b); list.appendChild(b);
    });
    function diagram(r) {
      const s = H.svg("svg", { viewBox: "0 0 680 250", role: "img", "aria-label": "Request path through nginx" });
      const hot = { client: r && r.to === "client", disk: r && r.to === "disk", api: r && r.to === "api", reject: r && r.to === "reject" };
      const col = r ? (r.code[0] === "2" ? "var(--ok)" : r.code[0] === "3" ? "var(--compute)" : "var(--bad)") : "var(--line-strong)";
      const bx = (x, y, w, h, t, sub, on) => { H.svg("rect", { x, y, width: w, height: h, rx: 9, fill: on ? "var(--surface)" : "var(--surface-2)", stroke: on ? col : "var(--line-strong)", "stroke-width": on ? 2.5 : 1.2 }, s); const a = H.svg("text", { x: x + w / 2, y: y + h / 2 - 2, "text-anchor": "middle", "font-size": 13.5, "font-weight": 600, fill: "var(--ink)" }, s); a.textContent = t; const b = H.svg("text", { x: x + w / 2, y: y + h / 2 + 14, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, s); b.textContent = sub; };
      const ar = (d, on) => H.svg("path", { d, fill: "none", stroke: on ? col : "var(--line)", "stroke-width": on ? 3 : 1.5, "stroke-dasharray": on ? "" : "4 4" }, s);
      ar("M130 125 L230 125", !!r); ar("M380 115 L470 50", hot.disk); ar("M380 125 L470 125", hot.api); ar("M380 135 L470 200", hot.reject);
      if (hot.client) ar("M230 145 C 200 200, 150 200, 110 152", true);
      bx(10, 100, 120, 50, "Internet", "browsers, bots", !!r);
      bx(230, 85, 150, 80, "nginx", "TLS · routing · limits", !!r);
      bx(470, 25, 200, 50, "Static files", "/usr/share/nginx/html", hot.disk);
      bx(470, 100, 200, 50, "FastAPI", "api:8000 (Docker network)", hot.api);
      bx(470, 175, 200, 50, "Rejected by nginx", "429, 404, …", hot.reject);
      if (r) { const c = H.svg("text", { x: 305, y: 70, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: col, class: "mono" }, s); c.textContent = "→ " + r.code; }
      const h = p.querySelector("#px-svg"); h.innerHTML = ""; h.appendChild(s);
    }
    function conf(k) {
      const text = CONF.map(l => l[0]).join("\n");
      const hl = k ? CONF.map((l, i) => (l[1].split(" ").includes(k) || (k !== "redir" && l[1] === "tls")) ? i + 1 : 0).filter(Boolean) : [];
      p.querySelector("#px-conf").innerHTML = H.code(text, hl);
    }
    function pick(i, b) {
      list.querySelectorAll(".opt").forEach(x => x.classList.toggle("right", x === b));
      const r = REQS[i]; diagram(r); conf(r.k);
      const w = p.querySelector("#px-why"); w.className = "callout " + (r.code[0] === "2" || r.code[0] === "3" ? "good" : "warn");
      w.innerHTML = `<b class="mono">${r.code}</b> `; w.append(r.why);
    }
    diagram(null); conf(null);
  }

  /* ---------------- 1.4 Deploy pipeline ---------------- */
  const STAGES = [["commit", "git push", "Merge to main"], ["test", "CI tests", "pytest, lint"], ["build", "Build image", "tag = git SHA"], ["push", "Push", "to the registry"], ["pull", "Pull on VM", "docker compose pull"], ["migrate", "Migrate DB", "run migrations"], ["swap", "Swap", "recreate api only"], ["health", "Health check", "GET /health"], ["live", "Live", "record the tag"]];
  function pipeline(root) {
    const p = H.panel(root, "Ship code to production", "Try it");
    p.innerHTML = `<style>
      .pipe{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px}
      .stg{flex:1 1 92px;border:1.5px solid var(--line-strong);border-radius:10px;padding:8px 9px;background:var(--surface);position:relative;min-width:0}
      .stg b{display:block;font-size:13px;font-family:var(--f-display);font-stretch:105%} .stg span{font-size:11px;color:var(--muted)}
      .stg.run{border-color:var(--xp);background:var(--xp-soft)} .stg.ok{border-color:var(--ok);background:var(--ok-soft)} .stg.fail{border-color:var(--bad);background:var(--bad-soft)} .stg.skip{opacity:.35}
      .hist{width:100%;border-collapse:collapse;font-size:13px} .hist td,.hist th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left} .hist th{color:var(--muted);font-weight:500}
    </style>
    <div class="controls">
      <button class="btn" type="button" data-s="good">Ship a good commit</button>
      <button class="btn" type="button" data-s="tests">Ship a commit with a failing test</button>
      <button class="btn" type="button" data-s="crash">Ship a build that crashes on start</button>
      <button class="btn" type="button" data-s="mig">Ship a release that drops a column</button>
    </div>
    <label style="display:flex;gap:8px;align-items:center;font-size:14px;margin-bottom:6px"><input type="checkbox" id="expand"> Use expand/contract migrations</label>
    <div class="pipe" id="pipe"></div>
    <div class="readout" id="pread"></div>
    <div class="callout" id="pv" aria-live="polite">Pick a commit to ship. The VM is currently running <span class="mono">a41f2c9</span>.</div>
    <div style="overflow-x:auto"><table class="hist"><thead><tr><th>Tag</th><th>Change</th><th>Result</th><th>Live after</th></tr></thead><tbody id="hist"></tbody></table></div>`;
    const pipe = p.querySelector("#pipe");
    STAGES.forEach(([k, t, s]) => pipe.appendChild(H.el(`<div class="stg" data-k="${k}"><b>${t}</b><span>${s}</span></div>`)));
    let live = "a41f2c9", prev = null, uptime = 100, busy = false, n = 0, broken = false;
    const hexes = ["7c03e1b", "e9b4d20", "3fa81c6", "b02d7e4", "c51f9a8", "18d6b3f", "9e47a02", "d3c815e"];
    function readout() { p.querySelector("#pread").innerHTML = `<div><div class="k">Running</div><div class="v ${broken ? "bad" : "good"}">${live}</div></div><div><div class="k">Rollback target</div><div class="v">${prev || "–"}</div></div><div><div class="k">Users affected</div><div class="v ${broken ? "bad" : "good"}">${broken ? "Everyone" : "None"}</div></div>`; }
    function setStage(k, cls) { const e = pipe.querySelector(`[data-k="${k}"]`); e.className = "stg " + (cls || ""); }
    function hist(tag, change, res, after) { const tb = p.querySelector("#hist"); const tr = H.el(`<table><tr><td class="mono">${tag}</td><td></td><td></td><td class="mono">${after}</td></tr></table>`).querySelector("tr"); tr.children[1].textContent = change; tr.children[2].textContent = res; tb.prepend(tr); }
    async function ship(kind) {
      if (busy) return; busy = true; p.querySelectorAll("[data-s]").forEach(b => b.disabled = true);
      const tag = hexes[n++ % hexes.length]; const v = p.querySelector("#pv");
      const expand = p.querySelector("#expand").checked;
      STAGES.forEach(([k]) => setStage(k, ""));
      v.className = "callout"; v.innerHTML = `Shipping <span class="mono">${tag}</span>…`;
      const run = async (k, ok, ms) => { setStage(k, "run"); await sleep(ms || 450); setStage(k, ok ? "ok" : "fail"); return ok; };
      const skip = from => { let on = false; STAGES.forEach(([k]) => { if (k === from) on = true; else if (on) setStage(k, "skip"); }); };
      await run("commit", true, 300);
      if (kind === "tests") { await run("test", false, 700); skip("test"); v.className = "callout good"; v.innerHTML = `CI failed on <span class="mono">test_order_total</span>. Nothing was built or deployed: the cheapest possible place to catch a bug. Production is untouched.`; hist(tag, "Bug in order totals", "Stopped in CI", live); return done(); }
      await run("test", true, 600); await run("build", true, 650); await run("push", true, 400); await run("pull", true, 450);
      if (kind === "mig" && !expand) {
        await run("migrate", true, 500); await run("swap", true, 400); await run("health", false, 900);
        setStage("live", "skip"); broken = true; readout();
        v.className = "callout bad"; v.innerHTML = `The new code fails its health check, so the script rolls back to <span class="mono">${live}</span>… but the migration already dropped <span class="mono">users.phone</span>, and the old code still reads it. Rollback restores the image, not the schema. Production is down until someone writes a fix forward or restores the database. Tick <b>Use expand/contract migrations</b> and ship again.`;
        hist(tag, "Rename users.phone → phone_e164 (drop old)", "Rollback failed: schema mismatch", live + " (broken)");
        return done();
      }
      if (kind === "mig" && expand) {
        await run("migrate", true, 500); await run("swap", true, 400); await run("health", true, 700); await run("live", true, 300);
        prev = live; live = tag; broken = false; readout();
        v.className = "callout good"; v.innerHTML = `Expand: this release only <i>adds</i> <span class="mono">phone_e164</span> and writes to both columns, so old and new code both work against the new schema. A later release stops reading <span class="mono">phone</span>, and only the release after that drops it. Every step can be rolled back.`;
        hist(tag, "Add phone_e164, dual-write (expand)", "Deployed", live);
        return done();
      }
      await run("migrate", true, 450); await run("swap", true, 400);
      if (kind === "crash") {
        await run("health", false, 1000);
        v.className = "callout warn"; v.innerHTML = `<span class="mono">/health</span> never returned 200 (ImportError on start). The script redeploys the previous tag <span class="mono">${live}</span>…`;
        await sleep(900); setStage("live", "skip");
        v.className = "callout good"; v.innerHTML = `Rolled back to <span class="mono">${live}</span> automatically. Users saw a few seconds of errors at most. Now debug calmly: the broken image is still in the registry, tagged and reproducible.`;
        hist(tag, "Refactor imports", "Health check failed, rolled back", live);
        H.award("rollback"); return done();
      }
      await run("health", true, 700); await run("live", true, 300);
      prev = live; live = tag; broken = false; readout();
      v.className = "callout good"; v.innerHTML = `<span class="mono">${tag}</span> is live. The previous tag <span class="mono">${prev}</span> is recorded, so rolling back is one command: deploy the old tag again.`;
      hist(tag, "New feature", "Deployed", live);
      done();
    }
    function done() { busy = false; p.querySelectorAll("[data-s]").forEach(b => b.disabled = false); readout(); }
    p.querySelectorAll("[data-s]").forEach(b => b.onclick = () => ship(b.dataset.s));
    readout();
    H.add(root, `<div class="panel"><div class="panel-t"><h3>The deploy script behind it</h3><span class="tag" style="background:var(--compute-soft);color:var(--compute)">scripts/deploy.sh</span></div>${H.code(`#!/usr/bin/env bash
set -euo pipefail
NEW_TAG="$1"                                        # the git SHA CI just built
PREV_TAG="$(grep '^API_TAG=' .env | cut -d= -f2)"   # what is live right now

API_TAG="$NEW_TAG" docker compose pull api          # the exact image CI tested
docker compose up -d --wait db
API_TAG="$NEW_TAG" docker compose run --rm api python migrate.py   # backward-compatible only

set_tag "$NEW_TAG"                                  # writes API_TAG=<new> into .env
docker compose up -d --no-deps api                  # recreate only the api container

if bash scripts/wait-healthy.sh api 60; then
  echo "Deployed $NEW_TAG"
else
  echo "Health check failed, rolling back to $PREV_TAG" >&2
  set_tag "$PREV_TAG"
  docker compose up -d --no-deps api
  exit 1
fi`)}</div>`);
  }

  /* ---------------- 1.5 Scale up and its limits ---------------- */
  const SIZES = [[2, 50], [4, 100], [8, 200], [16, 400], [32, 800], [64, 1600]];
  function scaleUp(root) {
    const p = H.panel(root, "How far can one box go?", "Try it");
    p.innerHTML = `<div class="controls">
        <div class="ctl"><label for="su-t">Peak traffic <output id="su-to"></output></label><input type="range" id="su-t" min="1" max="4.6" step="0.05" value="2.3"></div>
        <div><div class="note" style="margin-bottom:4px">VM size (vCPU)</div><div class="seg" id="su-s"></div></div>
      </div>
      <div class="svgwrap" id="su-g"></div>
      <div class="readout" id="su-r"></div><div class="callout" id="su-v"></div>`;
    let size = 1;
    const seg = p.querySelector("#su-s");
    SIZES.forEach(([c], i) => { const b = H.el(`<button type="button" aria-pressed="${i === size}">${c}</button>`); b.onclick = () => { size = i; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); upd(); }; seg.appendChild(b); });
    function upd() {
      const rps = Math.round(Math.pow(10, +p.querySelector("#su-t").value)); p.querySelector("#su-to").textContent = rps.toLocaleString() + " req/s";
      const [cpu, cost] = SIZES[size]; const cap = cpu * 120; const util = rps / cap;
      const W = 720, Hh = 120, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Capacity of each VM size against traffic" });
      const maxCap = 64 * 120, X = v => 20 + Math.log10(Math.max(1, v)) / Math.log10(maxCap * 1.6) * (W - 40);
      SIZES.forEach(([c], i) => { const x = X(c * 120); H.svg("line", { x1: x, x2: x, y1: 20, y2: 80, stroke: i === size ? "var(--compute)" : "var(--line-strong)", "stroke-width": i === size ? 3 : 1 }, s); const t = H.svg("text", { x, y: 96, "text-anchor": "middle", "font-size": 11, fill: i === size ? "var(--compute)" : "var(--muted)", class: "mono" }, s); t.textContent = c + "c"; });
      H.svg("rect", { x: X(maxCap), y: 20, width: W - 20 - X(maxCap), height: 60, fill: "var(--bad-soft)" }, s);
      const ce = H.svg("text", { x: (X(maxCap) + W - 20) / 2, y: 54, "text-anchor": "middle", "font-size": 11, fill: "var(--bad)", "font-weight": 600 }, s); ce.textContent = "no bigger box";
      H.svg("rect", { x: 20, y: 40, width: Math.max(2, X(rps) - 20), height: 20, rx: 4, fill: util > 1 ? "var(--bad)" : util > .7 ? "var(--xp)" : "var(--ok)" }, s);
      const lt = H.svg("text", { x: 20, y: 114, "font-size": 11.5, fill: "var(--muted)" }, s); lt.textContent = "bar = your traffic · lines = capacity of each VM size (log scale)";
      const g = p.querySelector("#su-g"); g.innerHTML = ""; g.appendChild(s);
      const cls = util > 1 ? "bad" : util > .7 ? "warn" : "good";
      p.querySelector("#su-r").innerHTML = `<div><div class="k">Capacity</div><div class="v">${cap.toLocaleString()} req/s</div></div><div><div class="k">Utilization</div><div class="v ${cls}">${Math.round(util * 100)}%</div></div><div><div class="k">Cost</div><div class="v">~$${cost}/mo</div></div><div><div class="k">Cost per 1k req/s</div><div class="v">$${Math.round(cost / cap * 1000)}</div></div>`;
      const v = p.querySelector("#su-v");
      if (rps > 64 * 120 * .7) { v.className = "callout bad"; v.textContent = "You have hit the vertical ceiling: there is no affordable single machine big enough. From here the only way is out, onto more machines behind a load balancer (Level 2)."; }
      else if (util > 1) { v.className = "callout bad"; v.textContent = "Overloaded. Pick a bigger VM: on most clouds that is a 2-minute resize and a reboot. Scaling up is the simplest fix there is."; }
      else if (util > .7) { v.className = "callout warn"; v.textContent = "Past 70%: the danger zone from Lesson 0.4. Scale up one size, or cache to reduce work."; }
      else { v.className = "callout good"; v.textContent = "Comfortable. Scaling up keeps one simple machine, no distributed-systems problems, and costs grow roughly linearly. Stay here as long as you can."; }
    }
    p.querySelector("#su-t").addEventListener("input", upd); upd();

    const q = H.panel(root, "But one box is one point of failure", "Try it");
    q.innerHTML = `<div class="controls"><div><div class="note" style="margin-bottom:4px">Uptime target</div><div class="seg" id="nines"></div></div><button class="btn danger" type="button" id="kill">Kill the VM</button></div>
      <div class="readout" id="nr"></div><div id="kv" style="margin-top:10px"></div><div class="callout" id="nv"></div>`;
    const NINES = [["99%", 0.99], ["99.5%", 0.995], ["99.9%", 0.999], ["99.95%", 0.9995], ["99.99%", 0.9999]];
    let ni = 2; const ns = q.querySelector("#nines");
    NINES.forEach(([l], i) => { const b = H.el(`<button type="button" aria-pressed="${i === ni}">${l}</button>`); b.onclick = () => { ni = i; ns.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); nupd(); }; ns.appendChild(b); });
    const fmtMin = m => m >= 60 ? (m / 60).toFixed(1) + " h" : m >= 1 ? m.toFixed(1) + " min" : (m * 60).toFixed(0) + " s";
    function nupd() {
      const a = NINES[ni][1], month = (1 - a) * 30 * 24 * 60, year = (1 - a) * 365 * 24 * 60;
      q.querySelector("#nr").innerHTML = `<div><div class="k">Allowed downtime / month</div><div class="v">${fmtMin(month)}</div></div><div><div class="k">Allowed downtime / year</div><div class="v">${fmtMin(year)}</div></div><div><div class="k">One VM can do it?</div><div class="v ${a <= 0.999 ? "good" : "bad"}">${a <= 0.995 ? "Yes" : a <= 0.999 ? "Barely" : "No"}</div></div>`;
      const v = q.querySelector("#nv");
      if (a <= 0.995) { v.className = "callout good"; v.textContent = "A single VM with automatic restarts and tested backups meets this. One bad incident a quarter fits the budget."; }
      else if (a <= 0.999) { v.className = "callout warn"; v.textContent = "43 minutes a month. One kernel update reboot, one bad deploy and one slow restore could use it up. Possible on one VM only with fast, rehearsed recovery."; }
      else { v.className = "callout bad"; v.textContent = `${fmtMin(month)} a month is less than one VM reboot plus a restore. You need redundancy: at least two app servers behind a load balancer (Level 2) and a replicated database with failover (Level 5), ideally across zones.`; }
    }
    q.querySelector("#kill").onclick = async () => {
      const k = q.querySelector("#kv"); const b = q.querySelector("#kill"); b.disabled = true;
      const steps = [["Host hardware fails", 0], ["Monitor notices /health is down", 2], ["You get paged and open a laptop", 9], ["Cloud restarts the VM on new hardware", 6], ["Docker restarts containers, Postgres runs crash recovery", 3], ["Back online", 0]];
      k.innerHTML = ""; let t = 0;
      for (const [txt, m] of steps) { t += m; k.appendChild(H.el(`<div style="display:flex;gap:10px;font-size:14px;padding:3px 0"><span class="mono" style="color:var(--bad);min-width:64px">+${t} min</span><span>${txt}</span></div>`)); await sleep(500); }
      k.appendChild(H.el(`<div class="callout bad">${t} minutes of total outage: nginx, API and database all went down together, because they share one machine. That alone is ${Math.round(t / ((1 - 0.999) * 43200) * 100)}% of a 99.9% monthly budget.</div>`));
      b.disabled = false;
    };
    nupd();
  }

  /* ---------------- 1.6 Backups: RPO and RTO ---------------- */
  const STRATS = [
    ["none", "No backups"], ["local", "Nightly dump, same disk"], ["offsite", "Nightly dump, off-site bucket"], ["pitr", "Off-site dump + WAL archiving"]
  ];
  const DISASTERS = [["disk", "Disk dies"], ["delete", "DELETE without WHERE at 14:32"], ["vm", "VM deleted by mistake"]];
  function backups(root) {
    const p = H.panel(root, "Pick a backup strategy, then cause a disaster", "Game");
    p.innerHTML = `<div class="controls" style="align-items:flex-start"><div><div class="note" style="margin-bottom:4px">Backup strategy</div><div class="seg" id="bs"></div></div></div>
      <div class="controls" id="bd"></div>
      <div class="svgwrap" id="bt"></div><div class="readout" id="br"></div><div class="callout" id="bv" aria-live="polite">Choose a disaster.</div>
      <p class="note" id="bprog"></p>`;
    let strat = 0; const seen = new Set();
    const bs = p.querySelector("#bs");
    STRATS.forEach(([k, l], i) => { const b = H.el(`<button type="button" aria-pressed="${i === 0}">${l}</button>`); b.onclick = () => { strat = i; bs.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); timeline(null); p.querySelector("#bv").className = "callout"; p.querySelector("#bv").textContent = "Choose a disaster."; p.querySelector("#br").innerHTML = ""; }; bs.appendChild(b); });
    DISASTERS.forEach(([k, l]) => { const b = H.el(`<button class="btn danger" type="button">${l}</button>`); b.onclick = () => hit(k); p.querySelector("#bd").appendChild(b); });
    function outcome(s, d) {
      const since = 14 * 60 + 32; // minutes since midnight dump
      if (s === "none") return { lost: Infinity, rto: null, msg: "There is nothing to restore. Every user, every order, gone. This is how small companies end." };
      if (s === "local") {
        if (d === "delete") return { lost: since, rto: 30, msg: "The dump on the same disk saves you this time: restore last night's file and lose everything since midnight, 14.5 hours of data." };
        return { lost: Infinity, rto: null, msg: "The backup lived on the same disk as the database, so it died with it. A backup on the same machine is not a backup." };
      }
      if (s === "offsite") return { lost: since, rto: 60, msg: `Restore last night's dump from the bucket onto a fresh VM. You lose everything since midnight: ${Math.floor(since / 60)}h ${since % 60}m of orders and sign-ups. Recovery Point Objective (RPO) = up to 24 h.` };
      return { lost: d === "delete" ? 0 : 1, rto: 60, msg: d === "delete" ? "Point-in-time recovery: restore the base backup, then replay the archived write-ahead log up to 14:31:59, one second before the bad DELETE. Nothing lost." : "Restore the base backup and replay the archived WAL up to the last segment shipped. You lose at most about a minute of writes." };
    }
    function timeline(d, o) {
      const W = 720, Hh = 110, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "One day of database writes, backups and the disaster" });
      const X = m => 20 + m / 1440 * (W - 40), k = STRATS[strat][0];
      H.svg("rect", { x: 20, y: 40, width: W - 40, height: 22, rx: 4, fill: "var(--compute-soft)", stroke: "var(--compute)" }, s);
      [0, 360, 720, 1080, 1440].forEach(m => { const t = H.svg("text", { x: X(m), y: 84, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)", class: "mono" }, s); t.textContent = String(Math.floor(m / 60)).padStart(2, "0") + ":00"; });
      if (k === "local" || k === "offsite" || k === "pitr") { H.svg("rect", { x: X(0) - 3, y: 30, width: 6, height: 42, fill: k === "local" ? "var(--xp)" : "var(--ok)" }, s); const t = H.svg("text", { x: X(0) + 6, y: 24, "font-size": 11, fill: "var(--muted)" }, s); t.textContent = k === "local" ? "dump (same disk)" : "dump (off-site)"; }
      if (k === "pitr") for (let m = 5; m < 1440; m += 15) H.svg("rect", { x: X(m), y: 64, width: 2, height: 6, fill: "var(--ok)" }, s);
      if (k === "pitr") { const t = H.svg("text", { x: X(1440) - 2, y: 102, "text-anchor": "end", "font-size": 11, fill: "var(--ok)" }, s); t.textContent = "WAL shipped continuously"; }
      if (d && o) {
        const at = 14 * 60 + 32;
        if (o.lost === Infinity) H.svg("rect", { x: 20, y: 40, width: X(at) - 20, height: 22, fill: "var(--bad)", opacity: .75 }, s);
        else if (o.lost > 1) H.svg("rect", { x: X(at - o.lost), y: 40, width: X(at) - X(at - o.lost), height: 22, fill: "var(--bad)", opacity: .75 }, s);
        H.svg("line", { x1: X(at), x2: X(at), y1: 20, y2: 72, stroke: "var(--bad)", "stroke-width": 3 }, s);
        const t = H.svg("text", { x: X(at) + 6, y: 24, "font-size": 11.5, "font-weight": 600, fill: "var(--bad)" }, s); t.textContent = "14:32 disaster";
      }
      const h = p.querySelector("#bt"); h.innerHTML = ""; h.appendChild(s);
    }
    function hit(d) {
      const k = STRATS[strat][0], o = outcome(k, d); timeline(d, o);
      const lostTxt = o.lost === Infinity ? "Everything" : o.lost === 0 ? "Nothing" : o.lost <= 1 ? "~1 min" : Math.floor(o.lost / 60) + "h " + (o.lost % 60) + "m";
      p.querySelector("#br").innerHTML = `<div><div class="k">Data lost (RPO)</div><div class="v ${o.lost === Infinity ? "bad" : o.lost > 60 ? "warn" : "good"}">${lostTxt}</div></div><div><div class="k">Time to recover (RTO)</div><div class="v ${o.rto ? "warn" : "bad"}">${o.rto ? "~" + o.rto + " min" : "never"}</div></div>`;
      const v = p.querySelector("#bv"); v.className = "callout " + (o.lost === Infinity ? "bad" : o.lost > 60 ? "warn" : "good"); v.textContent = o.msg;
      if (k === "pitr") { seen.add(d); if (seen.size === 3) H.award("backup"); }
      p.querySelector("#bprog").textContent = k === "pitr" ? `Recovered with PITR: ${seen.size} of 3 disasters.` : "";
    }
    timeline(null);
  }

  /* ---------------- 1.7 Architect's choice ---------------- */
  const SCEN = [
    { id: "s1", t: "Launch week", q: "You launch your FastAPI app next week. You expect about 500 users, you work alone, and the budget is €50 a month. What do you run?", opts: [
      ["A 3-node Kubernetes cluster with Helm charts", "Kubernetes solves problems you do not have yet (many services, many teams, many machines) and adds a whole platform to operate, alone. Revisit in Level 11."],
      ["One hardened VM with Docker Compose, CI deploys, off-site backups and an uptime monitor", "Right. Lesson 0.5 says one box handles this many times over. Your risk is losing data or shipping a broken build, and this setup covers both."],
      ["Three VMs behind a load balancer and a 3-node Postgres cluster", "High availability before product-market fit. Three times the cost and a lot of moving parts to protect against a failure that a 15-minute restart would fix."],
      ["One VM where you git pull and edit files on the server, backups later", "Cheapest today, most expensive the first time something breaks: no reproducible deploys, no rollback, no data safety."]], a: 1 },
    { id: "s2", t: "The firewall argument", q: "Your compose file publishes the database as \"5432:5432\". ufw denies 5432. A colleague says that is fine. Is it?", opts: [
      ["Yes, ufw blocks the port", "Docker inserts its own iptables rules for published ports ahead of ufw's, so the port is reachable anyway. Run nmap from outside to see for yourself."],
      ["Yes, as long as the password is strong", "A strong password helps, but now every Postgres vulnerability and every leaked credential is directly exploitable from the internet."],
      ["No. Remove the ports entry (or bind to 127.0.0.1) so the database is only on the Docker network", "Right. If nothing outside needs the database, nothing outside should be able to reach it. Use an SSH tunnel when you need to connect from your laptop."],
      ["No, change it to a non-standard port like 15432", "Scanners check all 65,535 ports. Obscurity is not a control."]], a: 2 },
    { id: "s3", t: "Bad deploy", q: "A deploy just went out and /health is failing. What should happen next?", opts: [
      ["SSH in and patch the code on the server", "Now production runs code that is not in git and that no CI tested. The next deploy silently undoes your fix."],
      ["Automatically redeploy the previous image tag, then investigate", "Right. Restore service first with a known-good artifact, then debug without time pressure. This is why images are tagged by commit."],
      ["Restore last night's database backup", "The data is fine; the code is broken. Restoring loses every write since midnight to fix a problem the database does not have."],
      ["Reboot the VM", "Restarts the same broken image. Containers with restart policies are already retrying it."]], a: 1 },
    { id: "s4", t: "Four nines", q: "Your manager wants a 99.99% uptime promise for the app running on one VM. What do you say?", opts: [
      ["Agree; a bigger VM will be more reliable", "Size does not help availability: a big VM fails exactly like a small one."],
      ["Agree; Docker restart policies handle failures", "Restart policies recover from crashed processes, not a dead host, a bad deploy or a zone outage."],
      ["99.99% is 4 minutes a month. One VM can realistically give 99.5–99.9%; more needs redundant servers and a replicated database across zones", "Right. Each extra nine roughly needs another layer of redundancy and automation. Levels 2, 5 and 10 cover how, and what it costs."],
      ["Add a second API container on the same VM", "Helps with deploys, but the machine itself is still the single point of failure."]], a: 2 }
  ];
  function scenarios(root) {
    H.prose(root, `<p>No sliders this time. Each card is a real decision; pick what you would do and read the consequences. Correct picks are worth 20 XP each.</p>`);
    const wrap = H.add(root, `<div class="scen"></div>`);
    SCEN.forEach((sc, si) => {
      const c = H.add(wrap, `<div class="scen-card"><div class="eyebrow">Scenario ${si + 1}</div><h4>${sc.t}</h4><p style="margin:0 0 10px"></p><div class="opts"></div><div class="choice-res"></div></div>`);
      c.querySelector("p").textContent = sc.q;
      const opts = c.querySelector(".opts"), res = c.querySelector(".choice-res");
      sc.opts.forEach(([o, why], i) => {
        const b = H.el(`<button type="button" class="opt"><span class="ltr">${"ABCD"[i]}</span><span></span></button>`); b.lastChild.textContent = o;
        b.onclick = () => {
          opts.querySelectorAll(".opt").forEach(x => x.classList.remove("right", "wrong"));
          b.classList.add(i === sc.a ? "right" : "wrong");
          res.innerHTML = `<div class="callout ${i === sc.a ? "good" : "bad"}"></div>`; res.firstChild.textContent = why;
          if (i === sc.a) H.earn("scen:" + sc.id, 20, "Scenario: " + sc.t);
        };
        opts.appendChild(b);
      });
    });
  }

  Course.register({
    id: 1,
    blurb: "Where you are now: a VM running nginx, FastAPI and Postgres in Docker. Make it secure, reproducible, deployable, recoverable, and know exactly how far it can take you.",
    examBadge: "lvl1",
    lessons: [
      { id: "1.1", sources: [["The Twelve-Factor App", "https://12factor.net/", "Heroku's methodology for deployable services"], ["Networking overview", "https://docs.docker.com/engine/network/", "Docker documentation"], ["Configure logging drivers", "https://docs.docker.com/engine/logging/configure/", "Docker documentation"], ["Automatic updates", "https://ubuntu.com/server/docs/how-to/software/automatic-updates/", "Ubuntu Server documentation"]], title: "Anatomy of a production VM", minutes: 20,
        lede: "A production server is layers of defence around one stateful thing, the database, plus everything needed to rebuild it from nothing.",
        render(r) { anatomy(r); H.keys(r, [["Treat the VM as cattle", "If it dies, you rebuild it from git, the registry and backups in under an hour."], ["One door in", "Only nginx is public. Everything else talks over private Docker networks."], ["State in one place", "Containers are disposable. Postgres data lives in a volume and is backed up off the box."], ["Everything as code", "Setup scripts, compose file and nginx config live in git."]]); H.yourApp(r, "In practice", "If you deploy with Docker Compose, compare your compose file with the diagram: does the database share a network with nginx? Is anything besides 80/443 published? Is <code>daemon.json</code> rotating logs?"); },
        check: { q: "Your VM is deleted by accident. Which of these do you need to get back online quickly?", opts: ["A snapshot of the running containers, which includes both their images and data", "Setup scripts and compose file in git, images in a registry, an off-site DB backup", "The Docker volumes on the old disk, which survive when the VM itself is deleted", "A bigger VM with the same name, so DNS and the deploy scripts keep working as is"], a: 1, why: "The VM is disposable. Code and config come from git, images from the registry, data from off-site backups. Anything that only existed on the VM is gone." } },
      { id: "1.2", sources: [["Packet filtering and firewalls", "https://docs.docker.com/engine/network/packet-filtering-firewalls/", "Docker documentation: why published ports bypass ufw"], ["sshd_config manual", "https://man.openbsd.org/sshd_config", "OpenSSH"]], title: "Ports, firewalls and the Docker trap", minutes: 25,
        lede: "Every open port is an invitation. Close everything except nginx, and learn the one Docker behaviour that catches almost everyone.",
        render(r) { attack(r); H.keys(r, [["Don't publish internal ports", "Containers on the same network reach each other by name. db and api need no ports entry."], ["Docker bypasses ufw", "Published ports get iptables rules that ufw never sees. Bind to 127.0.0.1 if you must publish."], ["Keys, not passwords", "Disable SSH password login and root login. Better still, put SSH behind a VPN."], ["Defense in depth", "Cloud firewall + host config + compose: each layer safe on its own."]]); H.yourApp(r, "In practice", "From a machine outside your VM, run <code>nmap -p- your-vm-ip</code>. Anything other than 22, 80 and 443 answering is a finding."); },
        check: { q: "You need to run psql against production Postgres from your laptop. What is the safe way?", opts: ["Publish 5432:5432 temporarily with a strong password, and remove it afterwards", "An SSH tunnel to a port bound to 127.0.0.1, or docker exec into the db container", "Allow only your home IP address to reach port 5432 in ufw", "Expose Postgres through nginx on a /db path protected by basic auth"], a: 1, why: "An SSH tunnel reuses the one door you already secured. Temporary public ports get forgotten, and ufw rules do not apply to Docker-published ports anyway." } },
      { id: "1.3", sources: [["NGINX reverse proxy", "https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/", "NGINX documentation"], ["ngx_http_limit_req_module", "https://nginx.org/en/docs/http/ngx_http_limit_req_module.html", "nginx reference"], ["Behind a Proxy", "https://fastapi.tiangolo.com/advanced/behind-a-proxy/", "FastAPI documentation"], ["Mozilla SSL Configuration Generator", "https://ssl-config.mozilla.org/", "Recommended TLS settings per server"]], title: "What the reverse proxy does", minutes: 25,
        lede: "nginx is the front desk of your VM: it handles TLS, decides where each request goes, and turns away the ones that should never reach Python.",
        render(r) { proxy(r); H.keys(r, [["TLS terminates here", "Certificates live with nginx; the API speaks plain HTTP inside the private network."], ["Static never touches Python", "Files, SPA fallbacks and long caching are nginx's job."], ["Protect the app", "Rate limits, timeouts, body size limits and dotfile denial stop bad traffic early."], ["Pass the real client", "X-Forwarded-For and -Proto tell FastAPI who called. Run uvicorn with --proxy-headers."]]); H.yourApp(r, "In practice", "If the API's routes are not under <code>/api</code>, either add the prefix in the app (in FastAPI, <code>APIRouter(prefix=\"/api\")</code>) or use <code>proxy_pass http://api/;</code> with a trailing slash so nginx strips it. Pick one and be consistent."); },
        check: { q: "Refreshing https://app.example.com/settings in the browser gives a 404 from nginx, but clicking to it inside the app works. What is missing?", opts: ["A FastAPI route for /settings that returns the page's HTML", "try_files $uri $uri/ /index.html in the location / block", "A longer proxy_read_timeout, so the page has time to render on refresh", "HTTP/2 enabled on the listener, so client-side routes are pushed to the browser"], a: 1, why: "/settings is a client-side route with no file on disk. try_files falls back to index.html so the frontend router can handle it." } },
      { id: "1.4", sources: [["Continuous Integration", "https://martinfowler.com/articles/continuousIntegration.html", "Martin Fowler"], ["Parallel Change (expand and contract)", "https://martinfowler.com/bliki/ParallelChange.html", "Martin Fowler"], ["Publishing Docker images", "https://docs.github.com/en/actions/publishing-packages/publishing-docker-images", "GitHub Actions documentation"]], title: "Deploys, rollbacks and migrations", minutes: 30,
        lede: "A good deploy is boring: the image CI tested goes out, the database is migrated safely, a health check decides, and rollback is one command.",
        render(r) { pipeline(r); H.keys(r, [["Build once, in CI", "The exact image that passed tests is what runs. Never build on the server."], ["Tag by commit", "a41f2c9 tells you exactly what is running; latest tells you nothing."], ["Health check decides", "No human judgement in the loop: unhealthy means roll back."], ["Expand, then contract", "Make schema changes backward compatible so old and new code both work during and after a deploy."]]); H.yourApp(r, "In practice", "If you use a migration tool (Alembic, Flyway, Django migrations), review each migration with one question: would the currently deployed code still work after this runs? If not, split it into expand and contract releases."); },
        check: { q: "You want to rename the column users.phone to phone_e164. What is the safe sequence?", opts: ["One release: rename the column and update all of the code in the same deploy", "Add phone_e164, write both; then read the new one; later, drop phone", "Drop phone first, then add phone_e164 and backfill it from the latest backup", "Rename it by hand in production during low traffic, then deploy the new code"], a: 1, why: "Expand/contract keeps every intermediate state compatible with the previous code version, so any single release can be rolled back." } },
      { id: "1.5", sources: [["Embracing Risk", "https://sre.google/sre-book/embracing-risk/", "Google SRE book, chapter 3"], ["Table for service availability", "https://sre.google/sre-book/availability-table/", "Google SRE book, appendix A"]], title: "Scaling up, and its limits", minutes: 25,
        lede: "The simplest scaling move is a bigger machine. It works surprisingly far. What it cannot fix is that one machine is one point of failure.",
        render(r) { scaleUp(r); H.keys(r, [["Scale up first", "Resizing a VM is minutes of work and keeps your system simple."], ["There is a ceiling", "Past the biggest affordable machine, you must scale out (Level 2)."], ["Nines cost layers", "99.9% ≈ 43 min/month. 99.99% ≈ 4 min. Each nine needs more redundancy."], ["Know your budget", "Agree an uptime target before designing for it."]]); H.yourApp(r, "In practice", "Write down your real uptime need. For most early products 99.5–99.9% is honest, achievable on one VM with good recovery, and far cheaper than more."); },
        check: { q: "Which problem does moving to a bigger VM NOT solve?", opts: ["CPU saturation at the daily traffic peak", "Running out of memory under load", "The app going down when the host fails", "Slow responses from an overloaded worker pool"], a: 2, why: "A bigger box is still one box. Surviving a host failure needs a second machine to fail over to, which is what Levels 2 and 5 build." } },
      { id: "1.6", sources: [["Backup and Restore", "https://www.postgresql.org/docs/16/backup.html", "PostgreSQL 16 documentation"], ["Continuous Archiving and Point-in-Time Recovery", "https://www.postgresql.org/docs/16/continuous-archiving.html", "PostgreSQL 16 documentation"], ["pgBackRest user guide", "https://pgbackrest.org/user-guide.html", "A widely used Postgres backup tool"]], title: "Backups, RPO and RTO", minutes: 25,
        lede: "Two numbers define a backup strategy: how much data you can afford to lose (RPO) and how long you can be down (RTO). Test them before you need them.",
        render(r) { backups(r); H.keys(r, [["RPO: data you lose", "Nightly dumps mean up to 24 h. WAL archiving brings it to about a minute."], ["RTO: time to recover", "How long from disaster to serving traffic. Measure it by actually restoring."], ["Off the box, ideally off the account", "A backup that shares a disk, VM or credentials with production shares its fate."], ["Untested backups are hopes", "Automate a restore into a scratch database and check row counts."]]); H.yourApp(r, "In practice", "A managed database (Cloud SQL, RDS) gives you PITR with a checkbox. On your own VM, pgBackRest or WAL-G ship WAL to a bucket. The lab starts with nightly <code>pg_dump</code> plus an automated restore test."); },
        check: { q: "Someone runs DELETE FROM orders; without a WHERE clause at 14:32. Which setup lets you recover every order up to 14:31?", opts: ["A nightly pg_dump copied to an off-site storage bucket", "RAID 1 mirroring across the database server's two disks", "Point-in-time recovery: a base backup plus archived WAL", "A streaming read replica running in another availability zone"], a: 2, hints: ["That gets you back to midnight, losing 14.5 hours of orders.", "RAID mirrors the DELETE instantly to both disks.", "", "Replicas replay the DELETE within milliseconds."], why: "PITR replays the write-ahead log up to any moment you choose, such as one second before the bad statement. Mirrors and replicas faithfully copy mistakes." } },
      { id: "1.7", sources: [["Embracing Risk", "https://sre.google/sre-book/embracing-risk/", "Google SRE book, chapter 3"], ["Packet filtering and firewalls", "https://docs.docker.com/engine/network/packet-filtering-firewalls/", "Docker documentation"]], title: "Architect's choice", minutes: 15,
        lede: "Four real decisions you will face running a single-server app. Pick an answer and see what happens.",
        render(r) { scenarios(r); },
        check: { q: "What is the main reason to tag images with the git commit SHA rather than latest?", opts: ["Commit-tagged images are smaller, because unchanged layers are not stored twice", "You always know exactly which code is running, and rollback means redeploying a known tag", "Docker refuses to pull a latest tag in production unless it is signed", "Pulls are faster, because registries cache commit tags but always rebuild latest"], a: 1, why: "A commit tag is an immutable, traceable artifact. latest changes under your feet and cannot be rolled back to." } }
    ],
    exam: [
      { q: "Which port should be published to the host in a typical nginx + FastAPI + Postgres compose setup?", opts: ["5432 for Postgres, so backups and admin tools can reach it", "8000 for FastAPI, so nginx on the host can proxy to it", "80 and 443 for nginx only", "All of them, with ufw rules restricting who can connect"], a: 2, why: "Only the reverse proxy faces the internet. API and database are reached over Docker networks." },
      { q: "You publish \"5432:5432\" and add ufw deny 5432. From the internet, the port is…", opts: ["Closed, because ufw's deny rule is checked before Docker's rules", "Open, because Docker's iptables rules bypass ufw", "Filtered: packets are dropped silently, which scanners report as closed", "Open only over IPv6, because ufw's rule applies to IPv4"], a: 1, why: "Docker manages its own iptables chains for published ports, ahead of ufw." },
      { q: "Where should the production Docker image be built?", opts: ["On the production VM, with git pull and docker build, so it matches the host", "In CI, then pushed to a registry and pulled by the VM", "On a developer laptop, where the code was last tested", "Anywhere, as long as every build is tagged latest"], a: 1, why: "Building in CI means the tested artifact is exactly what ships, and the VM never needs build tools or source code." },
      { q: "What is the purpose of the health check in the deploy script?", opts: ["To warm the application's caches before real users arrive", "To decide automatically whether to keep the new version", "To run the database migrations once the new container is up", "To rotate the old container's logs before it is removed"], a: 1, why: "It turns 'did the deploy work?' into an automatic, fast decision." },
      { q: "Without log rotation configured, what eventually happens on a busy Docker host?", opts: ["Docker discards container logs older than 24 hours", "The disk fills up and everything, including Postgres, fails", "Docker compresses old logs automatically once they pass 1 GB", "Containers restart once their log files reach the size limit"], a: 1, why: "The json-file driver keeps everything by default. Disk-full is one of the most common single-server outages." },
      { q: "Nightly off-site pg_dump at 00:00. The disk dies at 18:00. What is your RPO for this incident?", opts: ["0", "About 1 minute", "About 18 hours", "Everything"], a: 2, why: "You can restore to midnight; everything written since then is lost." },
      { q: "Which statement about a single VM is true?", opts: ["It cannot handle more than about 100 requests per second, whatever its size", "Scaling up is simple and often enough, but the VM stays a single point of failure", "Docker's restart policies make a single VM highly available on their own", "It always needs Kubernetes in production to restart containers that fail"], a: 1, why: "One well-sized VM handles a lot of traffic. What it cannot do is survive its own failure." },
      { q: "Which migration is safe to run before deploying new code, while the old code is still serving traffic?", opts: ["DROP COLUMN users.phone", "ALTER TABLE users RENAME COLUMN phone TO phone_e164", "ADD COLUMN users.phone_e164 NULL", "ALTER COLUMN users.phone SET NOT NULL, while old code still writes nulls"], a: 2, why: "Adding a nullable column is invisible to old code. The others break queries the old code is still running." }
    ],
    lab: {
      title: "Productionize the single server",
      time: "about 6 hours",
      folder: "level-1-single-server/",
      vmChecks: [["SSH accepts keys only", "sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin)'", "<code>passwordauthentication no</code> and <code>permitrootlogin no</code>."], ["Only the expected ports listen publicly", "sudo ss -tlnp | grep -v 127.0.0.1\n# and from your laptop:\nnmap -Pn -p 1-10000 your-vm-ip", "Only 22 (or none if SSH is behind a VPN), 80 and 443 answer from outside."], ["Only nginx publishes container ports", "docker ps --format '{{.Names}}\\t{{.Ports}}'", "Only the nginx row shows <code>0.0.0.0:80-&gt;</code> and <code>0.0.0.0:443-&gt;</code>; api and db show bare ports like <code>8000/tcp</code>."], ["Container logs rotate", "docker inspect --format '{{.Name}} {{json .HostConfig.LogConfig.Config}}' $(docker ps -q)\ndf -h /", "Every container shows <code>max-size</code> and <code>max-file</code>; disk usage comfortably below 80%."], ["Security updates install themselves", "head -2 /etc/os-release   # which family: Debian/Ubuntu or RHEL/Rocky/Alma\n# Debian / Ubuntu\nsystemctl is-enabled unattended-upgrades\ncat /etc/apt/apt.conf.d/20auto-upgrades\nls -l /var/run/reboot-required 2>/dev/null\n# RHEL / Rocky / Alma\nsystemctl list-timers 'dnf-automatic*' --all\ngrep -E '^(upgrade_type|apply_updates)' /etc/dnf/automatic.conf\nsudo dnf needs-restarting -r\n# either family: the running kernel against the newest installed\nuname -r; rpm -q kernel 2>/dev/null || ls /boot/vmlinuz-*", "Debian/Ubuntu: <code>enabled</code>, both settings in the file <code>\"1\"</code>, and no <code>reboot-required</code> file waiting. RHEL family: a <code>dnf-automatic</code> timer listed, <code>apply_updates = yes</code>, and <code>needs-restarting</code> reporting no reboot needed. On either, the running kernel (<code>uname -r</code>) is the newest one installed; an older one means fixes are installed but not active until a reboot. If updates are applied by hand or by your IT team instead, the latest entry in <code>/var/log/apt/history.log</code> or <code>dnf history</code> should be recent."], ["Images are pinned, services restart and report health", "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Status}}'\ndocker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)", "No <code>:latest</code> tags, every service <code>unless-stopped</code> (or <code>always</code>), and <code>(healthy)</code> where a health check exists."], ["HTTPS redirects and the certificate is valid", "curl -sI http://your-domain | grep -iE '^HTTP|^location'\necho | openssl s_client -connect your-domain:443 -servername your-domain 2>/dev/null | openssl x509 -noout -issuer -enddate", "A 301 to https, an issuer from a real authority (e.g. Let's Encrypt), and an end date more than 30 days away."], ["Secrets are not world-readable", "stat -c '%a %U %n' /srv/app/.env", "<code>600</code>, owned by the deploy user."], ["Backups run and land off the box", "crontab -l\n# then list the newest files in your bucket, e.g.\ngcloud storage ls -l gs://your-bucket/app | tail -3   # or: aws s3 ls s3://your-bucket/app/ | tail -3", "A backup line in cron and a dump from the last 24 hours in the bucket."], ["The clock is synchronised", "timedatectl", "<code>System clock synchronized: yes</code>. Logs, certificates and cron all depend on it."]],
      needs: "Your VM (Ubuntu, sudo), Docker, a domain name for real TLS (optional: you can use the self-signed setup locally)",
      intro: `<p>You will turn your current setup into the one from the lessons: a hardened VM, isolated networks, nginx with TLS, a deploy script with health checks and rollback, nightly off-site backups with an automated restore test, and monitoring.</p><p>Do steps 1 and 2 on the VM. The rest works both on the VM and locally with Docker Desktop, so you can rehearse safely first.</p><p><b>Ports:</b> only nginx publishes ports, 80 and 443 by default. If they are taken on your machine, set <code>HTTP_PORT=8080</code> and <code>HTTPS_PORT=8443</code> in <code>.env</code> and use <code>https://localhost:8443</code> wherever these steps say <code>https://localhost</code>. On a real server keep 80 and 443.</p><p>Each step has a <b>worked solution</b> under it. Try first, then compare.</p>`,
      steps: [
        { id: "l1-1", why: "SSH is the front door to the whole machine. Bots try passwords on every public server around the clock; keys-only login and a minimal firewall remove that whole class of attack.", title: "Harden SSH and the firewall",
          body: `<p>Read <code>scripts/harden.sh</code> line by line before running it. Make sure your SSH key works first, or you will lock yourself out.</p>${H.code(`# on your laptop: confirm key login works
ssh -i ~/.ssh/id_ed25519 you@your-vm 'echo key login ok'
# on the VM
sudo bash scripts/harden.sh you`)}<p>Then set the cloud firewall to allow 80 and 443 from anywhere and 22 only from your IP.</p>`,
          expect: "<code>ssh -o PubkeyAuthentication=no you@your-vm</code> is refused with <code>Permission denied (publickey)</code>. <code>sudo ufw status</code> shows 22, 80, 443.",
          solution: `${H.code(`$ sudo ufw status
Status: active
To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere

$ ssh -o PubkeyAuthentication=no you@your-vm
you@your-vm: Permission denied (publickey).`)}
            <ul><li><b>"Permission denied (publickey)"</b> is the goal: the server no longer even offers password login, so password-guessing bots get nowhere.</li><li><b>Locked out?</b> Use your cloud provider's web console (serial console) to log in and undo <code>/etc/ssh/sshd_config.d/99-hardening.conf</code>. This is why you keep one session open while testing.</li><li><b>Restricting 22 to your IP</b> in the cloud firewall is better still. If your home IP changes often, a VPN such as Tailscale avoids exposing SSH at all.</li></ul>` },
        { id: "l1-2", why: "By default Docker keeps every log line forever. A full disk stops Postgres from writing, which takes the app down.", title: "Rotate Docker logs",
          body: `${H.code(`sudo cp docker/daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
docker info --format '{{.LoggingDriver}}'`)}<p>Rotation applies to containers created after the restart, so recreate yours (<code>docker compose up -d --force-recreate</code>).</p>`,
          expect: "<code>docker inspect --format '{{json .HostConfig.LogConfig}}' &lt;container&gt;</code> shows max-size 10m and max-file 3.",
          solution: `${H.code(`$ docker inspect --format '{{json .HostConfig.LogConfig}}' $(docker compose ps -q api)
{"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}`)}
            <p>Each container now keeps at most 3 × 10 MB of logs. Without this, a chatty container slowly fills the disk, and when the disk is full Postgres stops accepting writes: one of the most common single-server outages.</p>
            <p><code>live-restore: true</code> in the same file keeps containers running while the Docker daemon itself restarts or upgrades.</p>` },
        { id: "l1-3", why: "Separate networks mean a compromised nginx still cannot reach the database, and only one container accepts traffic from outside.", title: "Bring up the stack with isolated networks",
          body: `${H.code(`cp .env.example .env              # set a strong POSTGRES_PASSWORD (and HTTP_PORT/HTTPS_PORT if needed)
bash scripts/selfsigned.sh        # local only; on the VM see step 5 first
docker build -t app-api:v1 api/
bash scripts/deploy.sh v1         # db up, migrations, api, health check, then nginx
docker compose ps`)}<p>Open <code>https://localhost</code> (accept the self-signed warning) and <code>https://localhost/api/health</code>. Try <code>docker compose exec db psql -U app -d app</code>: that is how you reach the database without publishing its port.</p>`,
          expect: "<code>deploy.sh</code> prints <code>migrate: applying 001_init.sql</code> and <code>deployed v1</code>. All services show <code>(healthy)</code> and only nginx lists ports. The page shows three notes served from Postgres.",
          solution: `${H.code(`[deploy 10:02:11] running migrations with v1
migrate: applying 001_init.sql
[deploy 10:02:13] starting api v1 (previous: v1)
api is healthy
[deploy 10:02:24] deployed v1

$ docker compose ps
NAME          SERVICE   STATUS                   PORTS
lab1-api-1    api       Up 20 seconds (healthy)  8000/tcp
lab1-db-1     db        Up 32 seconds (healthy)  5432/tcp
lab1-nginx-1  nginx     Up 9 seconds             0.0.0.0:443->443/tcp, 0.0.0.0:80->80/tcp`, [10, 11, 12])}
            <ul><li><b>Read the PORTS column carefully.</b> <code>8000/tcp</code> and <code>5432/tcp</code> with no arrow means "listening inside the container network only". Only nginx has <code>0.0.0.0:443-&gt;443</code>, meaning reachable from outside.</li><li><b>"bind: address already in use"</b> for 80 or 443: set <code>HTTP_PORT</code> / <code>HTTPS_PORT</code> in <code>.env</code> and rerun <code>docker compose up -d nginx</code>.</li><li><b>nginx exits with "host not found in upstream api"</b>: the api container was not running when nginx started. Run the deploy script, which starts api before nginx.</li></ul>` },
        { id: "l1-4", why: "Security is verified from the attacker's side. Reproducing the Docker/ufw trap once means you will never trust a firewall rule without scanning.", title: "Scan yourself",
          body: `<p>From another machine (or your laptop against the VM):</p>${H.code(`nmap -Pn -p 22,80,443,5432,8000 your-vm-ip`)}<p>Then temporarily add <code>ports: ["5432:5432"]</code> to db, recreate it with ufw still denying 5432, and scan again. Remove it afterwards.</p>`,
          expect: "First scan: only 22, 80, 443 open. Second scan: 5432 open despite ufw. You have reproduced the Docker trap from Lesson 1.2.",
          solution: `${H.code(`# First scan
PORT     STATE    SERVICE
22/tcp   open     ssh
80/tcp   open     http
443/tcp  open     https
5432/tcp closed   postgresql
8000/tcp closed   http-alt

# After publishing 5432, with ufw still "denying" it
5432/tcp open     postgresql`, [10])}
            <ul><li><b>closed</b> = the machine answered "nothing here". <b>filtered</b> = no answer at all, usually a firewall dropping packets (what you see if the cloud firewall blocks a port). <b>open</b> = something accepts connections.</li><li>Docker adds its own iptables rules for published ports in a chain that runs before ufw's rules. ufw's "deny 5432" is never consulted.</li><li><b>Scanning your own laptop (localhost)</b> shows every program listening on it, not just this lab: another project, a local dev server, a leftover container. Find out what owns an unexpected port with <code>lsof -nP -iTCP:8000 -sTCP:LISTEN</code> (macOS/Linux) or <code>netstat -ano | findstr :8000</code> (Windows), and <code>docker ps --format "{{.Names}}  {{.Ports}}"</code> for containers. That is why the real test is from another machine against the VM.</li><li><b><code>EXPOSE 8000</code> in the Dockerfile does not open anything.</b> It is documentation: it tells readers and tools which port the app listens on, and shows up as <code>8000/tcp</code> (no arrow) in <code>docker ps</code>. Only <code>ports:</code> in compose (or <code>-p</code> / <code>-P</code> on <code>docker run</code>) publishes a port to the host.</li><li><b>Remember to remove the ports line</b> and run <code>docker compose up -d db</code> again.</li></ul>` },
        { id: "l1-5", why: "TLS (the S in HTTPS) encrypts traffic so passwords, cookies and data cannot be read or changed between the user and your server. A real certificate, signed by an authority browsers already trust, is what lets browsers and API clients connect without warnings or refusing outright; a self-signed one is only good for testing.", title: "Real TLS on the VM",
          body: `<p><b>On the VM only.</b> Point your domain's A record at the VM and set <code>DOMAIN</code> in <code>.env</code>. Issue the first certificate while port 80 is free (stop nginx if it is running), then deploy:</p>${H.code(`docker compose stop nginx
docker compose run --rm -p 80:80 certbot certonly --standalone \\
  -d app.example.com --email you@example.com --agree-tos --no-eff-email
docker compose up -d nginx`)}<p>Renewals then use the webroot that nginx already serves on port 80, with no downtime. Add the renewal cron line from the README.</p>
            <p><b>Doing it locally instead.</b> Skip the three commands above: they only work on a server with a public domain, and nginx must stay running for the checks below (if you already stopped it, run <code>docker compose up -d nginx</code>). Let's Encrypt cannot reach your laptop, so you cannot get a real certificate there. Everything nginx does with a certificate is the same, though, so check it against the self-signed one from step 3 (use your own <code>HTTP_PORT</code>/<code>HTTPS_PORT</code>; 80/443 if you did not change them):</p>${H.code(`# 1. Plain HTTP is redirected to HTTPS
curl -sI http://localhost:8080/notes | grep -iE "^HTTP|^location"
# 2. The HSTS header is set
curl -skI https://localhost:8443 | grep -i strict-transport
# 3. Which certificate is nginx serving, and until when?
openssl s_client -connect localhost:8443 -servername localhost </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -enddate
# 4. Rehearse a renewal: new certificate files, reload nginx, no restart
bash scripts/selfsigned.sh && docker compose exec nginx nginx -s reload
# then rerun command 3: the end date has moved`)}<p>Optional: for a padlock with no browser warning, install <a href="https://github.com/FiloSottile/mkcert">mkcert</a>, run <code>mkcert -install</code>, then <code>mkcert -cert-file certs/live/localhost/fullchain.pem -key-file certs/live/localhost/privkey.pem localhost 127.0.0.1</code> and reload nginx as in command 4. mkcert adds a private certificate authority to your laptop's trust store; run <code>mkcert -uninstall</code> when you no longer need it.</p>`,
          expect: "<code>curl -I http://app.example.com</code> returns 301 to HTTPS and the browser shows a valid certificate. SSL Labs grades it A. Locally: the 301 points at your HTTPS port, HSTS is present, and the renewal rehearsal changes the certificate's end date without restarting nginx.",
          solution: `${H.code(`$ curl -I http://app.example.com/notes
HTTP/1.1 301 Moved Permanently
Location: https://app.example.com:443/notes

$ curl -sI https://app.example.com | grep -i strict
strict-transport-security: max-age=31536000`)}
            <ul><li><b>The A record</b> maps your domain to the VM's IP address. Check it with <code>dig +short app.example.com</code> before running certbot; certbot fails if it points elsewhere.</li><li><b>Standalone mode</b> starts its own tiny web server on port 80 to answer Let's Encrypt's challenge, which is why nginx must be stopped the first time.</li><li><b>Renewal</b> uses webroot mode: certbot writes the challenge file into <code>certbot-www</code>, which nginx already serves at <code>/.well-known/acme-challenge/</code>, so nginx keeps running.</li><li>Certificates last 90 days; the cron job renews from day 60.</li></ul>
            <p><b>Local version, sample output:</b></p>${H.code(`HTTP/1.1 301 Moved Permanently
Location: https://localhost:8443/notes
strict-transport-security: max-age=31536000
subject=CN=localhost
issuer=CN=localhost              <- self-signed: it vouches for itself
notAfter=Nov 12 08:02:11 2026 GMT`, [5])}
            <ul><li><b>Issuer = subject</b> is what "self-signed" means. Browsers trust a certificate only if its issuer chains up to an authority already in their trust store, so this one gets a warning. Let's Encrypt on the VM, or mkcert locally, supplies a trusted issuer.</li><li><b>The renewal rehearsal</b> is exactly what the cron job does on the VM: replace the files, then <code>nginx -s reload</code>, which starts new worker processes with the new certificate while the old ones finish their requests. No dropped connections.</li><li><b>Checking the VM without changing it:</b> commands 1–3 are read-only. Point them at your domain from your laptop to verify the live setup.</li></ul>` },
        { id: "l1-6", why: "Deploys are the most common cause of outages. A script that health-checks and rolls back by itself turns a bad release into seconds of errors instead of an incident.", title: "Deploy, then deploy a broken build",
          body: `<p>First write an expand-only migration: create <code>api/migrations/002_add_pinned.sql</code> containing <code>ALTER TABLE notes ADD COLUMN pinned boolean NOT NULL DEFAULT false;</code></p>${H.code(`docker build -t app-api:v2 api/
bash scripts/deploy.sh v2              # applies 002, health check passes
docker build --build-arg BREAK=1 -t app-api:v3 api/
bash scripts/deploy.sh v3              # crashes on start -> automatic rollback
grep API_TAG .env; cat .deploy/history`)}<p>Ask yourself why the rollback to v2 still works even though v3's migrations ran. In real use continuous integration (CI) builds and pushes <code>ghcr.io/you/app-api:&lt;sha&gt;</code> and calls the script over SSH; <code>ci/github-actions-deploy.yml</code> is a working example.</p>`,
          expect: "v2 prints <code>migrate: applying 002_add_pinned.sql</code> and deploys. v3 prints <code>Health check failed, rolling back to v2</code>, <code>.env</code> still says <code>API_TAG=v2</code>, and the page kept working apart from a few seconds.",
          solution: `${H.code(`$ bash scripts/deploy.sh v3
[deploy 10:41:02] running migrations with v3
migrate: nothing to do
[deploy 10:41:04] starting api v3 (previous: v2)
api is crash-looping (2 restarts)
[deploy 10:41:15] Health check failed, rolling back to v2
api is healthy
api-1  | RuntimeError: Deliberately broken build: CRASH_ON_START=1

$ cat .deploy/history
2026-10-10T07:38:51Z v1 ok
2026-10-10T07:40:12Z v2 ok
2026-10-10T07:41:15Z v3 failed`, [5, 6])}
            <ul><li><b>Why rollback was safe:</b> v3 added no migrations, and v2's only migration added a new column with a default value. Old code selects explicit columns and never notices it. That is expand/contract in practice.</li><li><b>Where it would break:</b> if v3 had dropped or renamed a column, v2 would fail after the rollback. The deploy script cannot undo a schema change.</li><li><b>Downtime:</b> between the old container stopping and the rollback becoming healthy, requests get 502 from nginx for ~10 s. Zero-downtime deploys (running old and new side by side) are covered in Levels 2 and 10.</li></ul>` },
        { id: "l1-7", why: "Backups protect against what replicas and RAID cannot: deletion, corruption, losing the machine. Only a tested restore proves the backup works.", title: "Back up off-site and test the restore",
          body: `${H.code(`bash scripts/backup.sh            # pg_dump -> ./offsite (or a bucket via BACKUP_REMOTE)
bash scripts/restore-test.sh      # restores the latest dump into a throwaway Postgres and compares row counts`)}<p>On the VM, set <code>BACKUP_REMOTE</code> to a bucket in a different project or account and schedule both scripts with cron (see the README).</p>`,
          expect: "<code>restore-test.sh</code> prints <code>RESTORE OK</code> with matching row counts for every table.",
          solution: `${H.code(`[backup] dumping app -> backups/app-20261010T031500Z.dump
[backup] copying to gs://my-backups/app
[backup] done: backups/app-20261010T031500Z.dump (4211 bytes)

[restore-test] restoring backups/app-20261010T031500Z.dump
[restore-test] restore took 2s
  notes                    restored=4        live=4        ok
  schema_migrations        restored=2        live=2        ok
RESTORE OK`)}
            <ul><li><b>"restore took 2s"</b> is your measured restore time for this data size. Keep an eye on it as data grows; it is a large part of your recovery time objective (RTO).</li><li><b>A different account</b> for the bucket matters: if an attacker or a mistake deletes your project, backups in the same project go with it.</li><li><b>This gives a recovery point objective (RPO) of up to 24 h.</b> To get it down to minutes, Level 5 adds write-ahead log (WAL) archiving with pgBackRest or WAL-G, or use a managed database with point-in-time recovery (PITR).</li></ul>` },
        { id: "l1-8", why: "Monitoring tells you about failures before users do, including the silent ones, like a backup job that stopped running.", title: "Add monitoring",
          body: `<p>Create a free uptime check (UptimeRobot, Better Stack or Healthchecks.io) on <code>https://your-domain/api/health</code>. Create a heartbeat check and set its URL as <code>HEARTBEAT_URL</code> so <code>backup.sh</code> pings it after each successful backup.</p>`,
          expect: "Stop the api container: you get an alert within a few minutes. Skip a backup: the heartbeat alerts you the next day.",
          solution: `<p>Two different kinds of monitoring, and you need both:</p>
            <ul><li><b>Uptime check (pull):</b> an outside service requests <code>/api/health</code> every minute. It catches the app or VM being down. Use <code>/api/health</code>, not the home page, because it checks the database too.</li><li><b>Heartbeat (push):</b> your job pings a URL when it succeeds; silence triggers the alert. It catches things that fail quietly, like a backup cron job that stopped running months ago.</li><li><b>Test the alert</b>: <code>docker compose stop api</code>, wait for the email or push notification, then <code>docker compose start api</code>. An alert you have never received is as untested as a backup you have never restored.</li></ul>` },
        { id: "l1-9", why: "Your real recovery time is what you measure when you actually rebuild. A runbook makes recovery possible for someone who is stressed, or who isn't you.", title: "Write the rebuild runbook",
          body: `<p>In your own repo, write <code>RUNBOOK.md</code>: how to rebuild this VM from zero (create VM, harden, install Docker, restore .env from your secret store, restore the database, deploy the last tag). Then time yourself doing it on a fresh VM.</p>`,
          expect: "A measured RTO, for example \"47 minutes from nothing to serving traffic\". That number is your real recovery time, not a guess.",
          solution: `<p>A good runbook is a checklist someone else could follow at 3 a.m.:</p>${H.code(`# Rebuild production from zero (last tested 2026-10-12: 47 min)
1. Create VM (Ubuntu 24.04 LTS, 2 vCPU, 4 GB) in the usual region; attach the static IP
2. Cloud firewall: 80, 443 from anywhere; 22 from office IP
3. ssh in; install Docker (get.docker.com); git clone repo to /srv/app
4. sudo bash scripts/harden.sh deploy
5. Restore .env from the password manager entry "prod .env"; chmod 600 .env
6. Certificate: certbot --standalone (README step 4)
7. Restore DB: copy the latest dump from the bucket (gcloud storage cp / aws s3 cp); pg_restore into the db container
8. bash scripts/deploy.sh <last tag from .deploy/history or the registry>
9. Point DNS A record at the new IP (TTL is 300 s)
10. Check /api/health, uptime monitor green, run backup.sh once`)}
            <p>Timing it usually reveals surprises: a secret nobody wrote down, a DNS time to live (TTL) of 24 h that makes step 9 take a day. Fixing those is the real value of the exercise.</p>` }
      ]
    }
  });
})();
