/* Level 11 — Infrastructure and security */
(function () {
  "use strict";
  const H = Course.H;
  const seg = (host, items, cur, on) => {
    host.innerHTML = "";
    items.forEach(([v, l]) => { const b = H.el(`<button type="button" aria-pressed="${v === cur}">${l}</button>`); b.onclick = () => { host.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); on(v); }; host.appendChild(b); });
  };
  const readout = (el, rows) => { el.innerHTML = rows.map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v ${c || ""}">${v}</div></div>`).join(""); };
  const txt = (parent, x, y, s, attrs) => { const t = H.svg("text", Object.assign({ x, y, "font-size": 12, fill: "var(--ink)" }, attrs || {}), parent); t.textContent = s; return t; };

  /* ---------------- 11.1 Where your code runs ---------------- */
  const LAYERS = ["Data centre, hardware", "Virtual machine", "Operating system and patches", "Container runtime / language runtime", "Scaling and load balancing", "Your code and its configuration", "Your data and who can access it"];
  const MODELS = {
    vm: { n: "VM (IaaS)", you: 2, note: "You get a virtual machine: patch the OS, install Docker, run the app, set up the load balancer and scaling yourself. Maximum control, maximum chores. This is your current setup.", ex: "Compute Engine, EC2, Azure VMs" },
    k8s: { n: "Managed Kubernetes", you: 3, note: "The provider runs the control plane (and often the nodes). You own container images, manifests, autoscaling settings and a lot of platform knowledge. Worth it when many services share one platform.", ex: "GKE, EKS, AKS" },
    paas: { n: "Container PaaS", you: 5, note: "Hand over a container image; the platform runs it, load-balances, scales (even to zero) and patches the hosts. You keep code, config and data. A strong default for a single web API.", ex: "Cloud Run, App Runner, Azure Container Apps, Fly.io" },
    fn: { n: "Functions (FaaS)", you: 5, note: "Hand over a function; it runs per event and scales per request. Pay per invocation, nothing when idle. Trade-offs: cold starts, execution time limits, and an architecture shaped around events.", ex: "Cloud Run functions, Lambda, Azure Functions" }
  };
  function stack(root) {
    const p = H.panel(root, "Who looks after what?", "Try it");
    p.innerHTML = `<div class="controls"><div class="seg" id="st-m"></div></div><div class="svgwrap" id="st-svg"></div><div class="callout" id="st-v"></div>`;
    let k = "vm";
    function draw() {
      const M = MODELS[k], W = 680, rh = 30, Hh = LAYERS.length * (rh + 6) + 30, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Responsibility stack" });
      LAYERS.slice().reverse().forEach((l, ri) => {
        const i = LAYERS.length - 1 - ri, you = i >= M.you, y = 6 + ri * (rh + 6);
        H.svg("rect", { x: 20, y, width: 470, height: rh, rx: 6, fill: you ? "var(--compute-soft)" : "var(--surface)", stroke: you ? "var(--compute)" : "var(--line)" }, s);
        txt(s, 34, y + 20, l, { "font-size": 12, "font-weight": you ? 600 : 400 });
        txt(s, 500, y + 20, you ? "you" : "provider", { "font-size": 12, fill: you ? "var(--compute)" : "var(--muted)", "font-weight": 600 });
      });
      txt(s, 20, Hh - 6, "Examples: " + M.ex, { "font-size": 11, fill: "var(--muted)" });
      const h = p.querySelector("#st-svg"); h.innerHTML = ""; h.appendChild(s);
      p.querySelector("#st-v").className = "callout"; p.querySelector("#st-v").textContent = M.note + " Whatever the model, the bottom-most green rows, your code and your data, are always yours: that is the shared responsibility model.";
    }
    seg(p.querySelector("#st-m"), Object.entries(MODELS).map(([a, b]) => [a, b.n]), k, v => { k = v; draw(); });
    draw();
  }

  /* ---------------- 11.2 Networks ---------------- */
  function vpc(root) {
    const p = H.panel(root, "Design a private network", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">A typical cloud layout: a load balancer in a public subnet, app servers and the database in private subnets. Change the settings, then test who can reach what.</p>
      <div class="controls" style="flex-direction:column;align-items:flex-start;gap:6px">
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="vp-dbpub"> Put the database in the public subnet with a public IP</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="vp-sg"> Database security group allows 5432 from 0.0.0.0/0 (anywhere)</label>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="vp-nat" checked> Private subnets route outbound traffic through a NAT gateway</label>
      </div>
      <div class="svgwrap" id="vp-svg"></div>
      <div class="controls"><div class="seg" id="vp-t"></div></div><div class="callout" id="vp-v"></div>`;
    let test = "inet-db";
    const TESTS = { "inet-db": "Internet → database", "inet-app": "Internet → app server", "lb-app": "Load balancer → app", "app-db": "App → database", "app-out": "App → pypi.org (updates)" };
    function evaluate() {
      const dbpub = p.querySelector("#vp-dbpub").checked, sg = p.querySelector("#vp-sg").checked, nat = p.querySelector("#vp-nat").checked;
      const R = {
        "inet-db": dbpub && sg ? [false, "Reachable from the whole internet. Public subnet + public IP + a security group open to 0.0.0.0/0: scanners find exposed Postgres within hours. This is how many data breaches start."] : dbpub ? [true, "Blocked, but only by the security group. One mistaken rule away from exposure; there is no reason for a database to have a public IP."] : [true, "Blocked: a private subnet has no route from the internet at all, whatever the security group says. Two independent layers."],
        "inet-app": [true, "Blocked: app servers are private. The only way in is through the load balancer, which only forwards ports 80/443 to them."],
        "lb-app": [true, "Allowed: the app's security group accepts port 8000 from the load balancer's security group (a rule that references a group, not IP addresses)."],
        "app-db": sg ? [true, "Allowed, but by an overly broad rule. Better: allow 5432 only from the app's security group."] : [true, "Allowed: the database security group accepts 5432 from the app servers' security group, and nothing else."],
        "app-out": nat ? [true, "Allowed: outbound connections leave through the NAT gateway, which has a public IP. Replies come back; nobody outside can start a connection inward."] : [false, "No route out: private instances cannot fetch packages or call external APIs without a NAT gateway (or a proxy, or private endpoints for cloud services)."]
      };
      return R;
    }
    function draw() {
      const R = evaluate(), dbpub = p.querySelector("#vp-dbpub").checked, nat = p.querySelector("#vp-nat").checked;
      const W = 680, Hh = 230, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "VPC diagram" });
      H.svg("rect", { x: 100, y: 10, width: 570, height: 210, rx: 12, fill: "none", stroke: "var(--xp)", "stroke-dasharray": "6 4" }, s); txt(s, 110, 28, "VPC 10.0.0.0/16", { "font-size": 11, fill: "var(--xp)", "font-weight": 600 });
      txt(s, 20, 120, "Internet", { "font-weight": 700 });
      const box = (x, y, w, h, label, col) => { H.svg("rect", { x, y, width: w, height: h, rx: 8, fill: "var(--surface)", stroke: col }, s); txt(s, x + 8, y + 16, label, { "font-size": 11, fill: col, "font-weight": 600 }); };
      box(120, 40, 170, 170, "Public subnet 10.0.1.0/24", "var(--signal)");
      box(310, 40, 170, 80, "Private subnet: app 10.0.2.0/24", "var(--compute)");
      box(310, 130, 170, 80, "Private subnet: data 10.0.3.0/24", "var(--data)");
      const node = (x, y, l) => { H.svg("rect", { x, y, width: 110, height: 28, rx: 14, fill: "var(--surface-2, var(--surface))", stroke: "var(--line-strong)" }, s); txt(s, x + 55, y + 18, l, { "text-anchor": "middle", "font-size": 11 }); };
      node(150, 70, "Load balancer"); if (nat) node(150, 110, "NAT gateway"); node(340, 70, "App servers");
      if (dbpub) node(150, 160, "Postgres (public IP)"); else node(340, 165, "Postgres");
      txt(s, 500, 70, "Security groups:", { "font-size": 11, "font-weight": 600 }); txt(s, 500, 88, "LB: 443 from anywhere", { "font-size": 10, fill: "var(--muted)" }); txt(s, 500, 104, "App: 8000 from LB", { "font-size": 10, fill: "var(--muted)" }); txt(s, 500, 120, p.querySelector("#vp-sg").checked ? "DB: 5432 from 0.0.0.0/0 ⚠" : "DB: 5432 from App", { "font-size": 10, fill: p.querySelector("#vp-sg").checked ? "var(--bad)" : "var(--muted)" });
      const h = p.querySelector("#vp-svg"); h.innerHTML = ""; h.appendChild(s);
      const [ok, why] = R[test], v = p.querySelector("#vp-v"); v.className = "callout " + (ok ? "good" : "bad"); v.textContent = why;
    }
    seg(p.querySelector("#vp-t"), Object.entries(TESTS), test, v => { test = v; draw(); });
    p.querySelectorAll("input").forEach(i => i.addEventListener("change", draw)); draw();
  }

  /* ---------------- 11.3 Kubernetes ---------------- */
  function rollout(root) {
    const p = H.panel(root, "A rolling update, with and without a readiness probe", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">Three pods run v1. You roll out v2 with maxSurge 1 and maxUnavailable 0. Step through it.</p>
      <div class="controls"><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ro-p" checked> Readiness probe</label><label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ro-b" checked> v2 is broken</label>
      <button class="btn" type="button" id="ro-s">Next step</button><button class="btn" type="button" id="ro-x">Reset</button></div>
      <div class="svgwrap" id="ro-svg"></div><div class="readout" id="ro-r"></div><div class="callout" id="ro-v"></div>`;
    let pods, stepN, msg;
    const reset = () => { pods = [{ v: 1, ready: true }, { v: 1, ready: true }, { v: 1, ready: true }]; stepN = 0; msg = "Press Next step to start the rollout."; draw(); };
    function step() {
      const probe = p.querySelector("#ro-p").checked, broken = p.querySelector("#ro-b").checked;
      const newPod = pods.find(x => x.v === 2 && !x.ready);
      if (newPod) { if (broken && probe) { msg = "The new pod never passes its readiness check, so the rollout waits. Old pods keep serving every request. Nothing more happens until you roll back (kubectl rollout undo)."; return draw(); } newPod.ready = true; }
      const old = pods.findIndex(x => x.v === 1);
      if (pods.some(x => x.v === 2 && x.ready) && pods.filter(x => x.v === 2).length > pods.filter(x => x.v === 1).length - 0 && old === -1) { msg = "Rollout complete."; return draw(); }
      if (pods.length > 3 && old !== -1) { pods.splice(old, 1); msg = "A new pod became ready, so one old pod is removed. Capacity never dropped below three."; }
      else if (old !== -1) { pods.push({ v: 2, ready: !probe ? true : false }); msg = probe ? "A v2 pod starts (the surge). It gets no traffic until its readiness probe passes." : "A v2 pod starts and, with no readiness probe, counts as ready immediately: it gets traffic right away."; }
      else msg = "Rollout complete: all pods run v2.";
      stepN++; draw();
    }
    function draw() {
      const broken = p.querySelector("#ro-b").checked, W = 680, Hh = 90, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "Pods during a rollout" });
      txt(s, 20, 16, "Service sends traffic to ready pods only", { "font-size": 11, fill: "var(--muted)" });
      pods.forEach((x, i) => { const bad = x.v === 2 && broken && x.ready, col = bad ? "var(--bad)" : x.v === 2 ? "var(--data)" : "var(--compute)"; H.svg("rect", { x: 20 + i * 130, y: 28, width: 118, height: 48, rx: 10, fill: x.ready ? (bad ? "var(--bad-soft)" : x.v === 2 ? "var(--data-soft)" : "var(--compute-soft)") : "transparent", stroke: col, "stroke-dasharray": x.ready ? "" : "5 4", "stroke-width": 2 }, s); txt(s, 79 + i * 130, 50, "v" + x.v, { "text-anchor": "middle", "font-weight": 700, fill: col }); txt(s, 79 + i * 130, 67, x.ready ? (bad ? "ready, but failing" : "ready") : "not ready", { "text-anchor": "middle", "font-size": 11 }); });
      const h = p.querySelector("#ro-svg"); h.innerHTML = ""; h.appendChild(s);
      const ready = pods.filter(x => x.ready), failing = ready.filter(x => x.v === 2 && broken).length;
      readout(p.querySelector("#ro-r"), [["Pods receiving traffic", ready.length], ["Requests hitting broken v2", ready.length ? Math.round(failing / ready.length * 100) + "%" : "0%", failing ? "bad" : "good"]]);
      const v = p.querySelector("#ro-v"); v.className = "callout " + (failing ? "bad" : ""); v.textContent = msg + (failing && !p.querySelector("#ro-p").checked ? " Without a readiness probe Kubernetes cannot tell a broken pod from a working one, so it keeps replacing healthy v1 pods with broken ones." : "");
    }
    p.querySelector("#ro-s").onclick = step; p.querySelector("#ro-x").onclick = reset;
    p.querySelectorAll("input").forEach(i => i.addEventListener("change", reset)); reset();
  }

  /* ---------------- 11.4 Infrastructure as code ---------------- */
  function plan(root) {
    const p = H.panel(root, "terraform plan: desired vs real", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">The code says how many web containers you want and which image. Reality is what is actually running. <code>plan</code> compares them and lists the changes; <code>apply</code> makes them.</p>
      <div class="controls"><div class="ctl" style="min-width:200px"><label for="tf-n">web_count in code <output id="tf-no"></output></label><input type="range" id="tf-n" min="1" max="5" value="2"></div>
      <div class="seg" id="tf-i"></div></div>
      <div class="controls"><button class="btn" type="button" id="tf-d">Someone deletes tf-web-1 by hand</button><button class="btn" type="button" id="tf-a">terraform apply</button></div>
      <div class="callout" id="tf-plan" style="font-family:var(--f-mono);font-size:12.5px;white-space:pre-wrap"></div><div class="callout" id="tf-v"></div>`;
    let img = "1.0", real;
    const reset = () => { real = [{ n: "tf-web-0", img: "1.0" }, { n: "tf-web-1", img: "1.0" }]; };
    function planLines() {
      const n = +p.querySelector("#tf-n").value, lines = [];
      for (let i = 0; i < Math.max(n, real.length + 5); i++) {
        const want = i < n, have = real.find(r => r.n === "tf-web-" + i);
        if (want && !have) lines.push(`  + docker_container.web[${i}]  (create)`);
        else if (!want && have) lines.push(`  - docker_container.web[${i}]  (destroy)`);
        else if (want && have && have.img !== img) lines.push(`-/+ docker_container.web[${i}]  (replace: image ${have.img} → ${img})`);
      }
      return lines;
    }
    function draw(note) {
      p.querySelector("#tf-no").textContent = p.querySelector("#tf-n").value;
      const L = planLines(), add = L.filter(l => l.trim().startsWith("+")).length, del = L.filter(l => l.trim().startsWith("-")).length - L.filter(l => l.startsWith("-/+")).length, rep = L.filter(l => l.startsWith("-/+")).length;
      p.querySelector("#tf-plan").className = "callout"; p.querySelector("#tf-plan").textContent = (L.length ? L.join("\n") : "  No changes. Your infrastructure matches the configuration.") + `\n\nPlan: ${add + rep} to add, 0 to change, ${del + rep} to destroy.`;
      const v = p.querySelector("#tf-v"); v.className = "callout"; v.textContent = note || "Running: " + (real.map(r => `${r.n} (${r.img})`).join(", ") || "nothing");
    }
    p.querySelector("#tf-n").addEventListener("input", () => draw());
    seg(p.querySelector("#tf-i"), [["1.0", "image 1.0"], ["1.1", "image 1.1"]], img, v => { img = v; draw(); });
    p.querySelector("#tf-d").onclick = () => { real = real.filter(r => r.n !== "tf-web-1"); draw("Drift: reality no longer matches the state Terraform recorded. The next plan notices (it refreshes first) and proposes to recreate it. Infrastructure changed by hand is infrastructure Terraform will 'fix' back."); };
    p.querySelector("#tf-a").onclick = () => { const n = +p.querySelector("#tf-n").value; real = Array.from({ length: n }, (_, i) => ({ n: "tf-web-" + i, img })); draw("Applied. Reality matches the code, and the state file records it. Run plan again: no changes."); };
    reset(); draw();
  }

  /* ---------------- 11.5 Identity: JWT and OAuth ---------------- */
  function jwtSim(root) {
    const p = H.panel(root, "Validate a JWT like an API should", "Try it");
    p.innerHTML = `<p class="note" style="margin-top:0">An access token issued by Keycloak for <code>orders-api</code>. Tamper with it and watch which check catches it.</p>
      <div class="controls"><div class="seg" id="jw-m"></div></div>
      <div id="jw-tok" class="mono" style="font-size:12px;word-break:break-all;padding:10px;border:1px solid var(--line);border-radius:8px"></div>
      <div id="jw-c" style="display:grid;gap:4px;margin-top:10px"></div><div class="callout" id="jw-v"></div>`;
    let mode = "good";
    const MODES = { good: "Valid token", edit: "Edit the payload", none: "alg: none", exp: "Expired", aud: "Wrong audience", role: "No role" };
    function draw() {
      const now = 1790000000;
      const hdr = { alg: mode === "none" ? "none" : "RS256", typ: "JWT", kid: "1ozQ78Sk…" };
      const pl = { iss: "http://keycloak:8080/realms/lab", aud: mode === "aud" ? "account" : "orders-api", azp: mode === "edit" ? "admin-tool" : "reporting-job", exp: mode === "exp" ? now - 60 : now + 120, iat: now - (mode === "exp" ? 180 : 0), resource_access: mode === "role" ? {} : { "orders-api": { roles: ["orders.read"] } } };
      const t = p.querySelector("#jw-tok"); t.innerHTML = "";
      [[hdr, "var(--bad)"], [pl, "var(--compute)"], [mode === "none" ? "" : "kJ3…signature…Qw", "var(--data)"]].forEach(([part, c], i) => { const sp = document.createElement("span"); sp.style.color = c; sp.textContent = (i ? "." : "") + (typeof part === "string" ? part : JSON.stringify(part)); t.appendChild(sp); });
      const checks = [
        ["Algorithm is one we allow (RS256)", mode !== "none"],
        ["Signature verifies with the issuer's public key", mode !== "edit" && mode !== "none"],
        ["Not expired (exp > now, with small leeway)", mode !== "exp"],
        ["Issuer is our Keycloak realm (iss)", true],
        ["Audience is this API (aud = orders-api)", mode !== "aud"],
        ["Has the role this endpoint needs", mode !== "role"]
      ];
      const c = p.querySelector("#jw-c"); c.innerHTML = "";
      let failedAt = -1; checks.forEach(([l, ok], i) => { if (!ok && failedAt < 0) failedAt = i; const skipped = failedAt >= 0 && i > failedAt; const d = H.el(`<div style="display:flex;gap:8px;font-size:13px;${skipped ? "opacity:.4" : ""}"><b style="width:18px"></b><span></span></div>`); d.children[0].textContent = skipped ? "·" : ok ? "✓" : "✗"; d.children[0].style.color = skipped ? "var(--muted)" : ok ? "var(--ok)" : "var(--bad)"; d.children[1].textContent = l; c.appendChild(d); });
      const code = failedAt < 0 ? 200 : failedAt === 5 ? 403 : 401;
      const v = p.querySelector("#jw-v"); v.className = "callout " + (code === 200 ? "good" : "bad");
      v.textContent = `→ ${code}. ` + { good: "Every check passes. Note that the API never contacted Keycloak for this request: it verified the signature with a cached public key. That is what makes JWTs fast, and also why they cannot be revoked before they expire: keep lifetimes short.", edit: "Anyone can decode and edit a JWT; it is only base64. Changing one character of the payload breaks the signature, which only Keycloak's private key can produce.", none: "The classic attack: claim the token needs no signature. A library that trusts the token's own 'alg' header accepts it. Always pass the list of allowed algorithms (RFC 8725).", exp: "Expired tokens are rejected even though the signature is fine. The client must get a new one (for users, with a refresh token).", aud: "A real, correctly signed token, but issued for a different service. Without the audience check, a token stolen from any app in your company would open this API (RFC 9700: audience-restrict tokens).", role: "Authenticated but not authorized: we know who this is, and they may not do this. 403, not 401." }[mode];
    }
    seg(p.querySelector("#jw-m"), Object.entries(MODES), mode, v => { mode = v; draw(); });
    draw();
  }

  const FLOW = [
    ["Browser", "App", "User clicks 'Log in'. The app creates a random code_verifier and sends its hash (code_challenge) along."],
    ["App", "Keycloak", "Browser is redirected to Keycloak's /authorize with client_id, redirect_uri, scope=openid, state and code_challenge."],
    ["Browser", "Keycloak", "The user logs in on Keycloak's page (password, passkey, MFA). The app never sees the password."],
    ["Keycloak", "App", "Keycloak redirects back with a short-lived, single-use authorization code (and the state, which the app checks)."],
    ["App", "Keycloak", "The app exchanges the code plus the original code_verifier for tokens. A stolen code is useless without the verifier: that is PKCE."],
    ["Keycloak", "App", "Tokens: an ID token (who the user is, for the app) and an access token (what the app may call, for APIs), plus a refresh token."],
    ["App", "API", "The app calls the API with 'Authorization: Bearer <access token>'. The API validates it as in the panel above."]
  ];
  function oauth(root) {
    const p = H.panel(root, "Log in with OpenID Connect: authorization code + PKCE", "Try it");
    p.innerHTML = `<div class="controls"><button class="btn" type="button" id="oa-p">Back</button><button class="btn" type="button" id="oa-n">Next</button></div><div class="svgwrap" id="oa-svg"></div><div class="callout" id="oa-v"></div>`;
    let i = 0;
    function draw() {
      const W = 680, Hh = 70 + FLOW.length * 22, cols = { Browser: 80, App: 260, Keycloak: 440, API: 610 }, s = H.svg("svg", { viewBox: `0 0 ${W} ${Hh}`, role: "img", "aria-label": "OIDC authorization code flow" });
      const defs = H.svg("defs", {}, s), mk = H.svg("marker", { id: "oa-ar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs); H.svg("path", { d: "M1 1L9 5L1 9", fill: "none", stroke: "context-stroke", "stroke-width": 1.6 }, mk);
      Object.entries(cols).forEach(([n, x]) => { H.svg("rect", { x: x - 50, y: 6, width: 100, height: 26, rx: 7, fill: "var(--surface)", stroke: "var(--line-strong)" }, s); txt(s, x, 24, n, { "text-anchor": "middle", "font-weight": 600 }); H.svg("line", { x1: x, x2: x, y1: 32, y2: Hh - 4, stroke: "var(--line)", "stroke-dasharray": "3 3" }, s); });
      FLOW.forEach(([a, b], k) => { const y = 50 + k * 22, on = k <= i; H.svg("line", { x1: cols[a], y1: y, x2: cols[b] + (cols[b] > cols[a] ? -4 : 4), y2: y, stroke: k === i ? "var(--xp)" : on ? "var(--compute)" : "var(--line)", "stroke-width": k === i ? 2.5 : 1.5, "marker-end": "url(#oa-ar)" }, s); txt(s, Math.min(cols[a], cols[b]) + 6, y - 4, (k + 1) + "", { "font-size": 10, fill: on ? "var(--ink)" : "var(--muted)" }); });
      const h = p.querySelector("#oa-svg"); h.innerHTML = ""; h.appendChild(s);
      p.querySelector("#oa-v").className = "callout"; p.querySelector("#oa-v").textContent = `Step ${i + 1} of ${FLOW.length}: ${FLOW[i][2]}`;
    }
    p.querySelector("#oa-n").onclick = () => { i = Math.min(FLOW.length - 1, i + 1); draw(); };
    p.querySelector("#oa-p").onclick = () => { i = Math.max(0, i - 1); draw(); };
    draw();
  }

  Course.register({
    id: 11,
    blurb: "The ground your app stands on: choosing where it runs, building the network around it, running it on Kubernetes, describing it all as code, and proving who is calling it.",
    examBadge: "lvl11",
    lessons: [
      { id: "11.1", sources: [["Shared Responsibility Model", "https://aws.amazon.com/compliance/shared-responsibility-model/", "AWS"], ["What is Cloud Run", "https://cloud.google.com/run/docs/overview/what-is-cloud-run", "Google Cloud documentation"], ["Overview of Kubernetes", "https://kubernetes.io/docs/concepts/overview/", "Kubernetes documentation"], ["Lambda execution environment lifecycle", "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html", "AWS documentation: cold starts"]],
        title: "VMs, PaaS, Kubernetes and serverless", minutes: 20,
        lede: "The same container can run on a VM you patch yourself, on a platform that does almost everything for you, or on Kubernetes. The question is not which is best but which chores you want to own.",
        render(r) { stack(r); H.keys(r, [["VM", "Full control and full responsibility: patching, scaling, recovery. Cheapest per CPU at steady load."], ["Container PaaS", "Give it an image; it handles TLS, scaling (to zero) and hosts. The best default for one or a few APIs."], ["Kubernetes", "A platform for running many services consistently. Powerful, but a platform to learn and operate even when managed."], ["Functions", "Per-event, pay-per-use, scale to zero; cold starts and time limits shape your design."], ["Containers make moving easy", "A well-built image runs on all of them, so choose for today and move when you outgrow it."]]); H.yourApp(r, "In practice", "A single VM with Docker Compose is a legitimate production setup for one product. The upgrade path that changes least is a container PaaS (Cloud Run, AWS App Runner, Azure Container Apps, Fly.io): same image, managed TLS and scaling, no OS to patch."); },
        check: { q: "On a container PaaS like Cloud Run, which of these is still your responsibility?", opts: ["Patching the operating system on the hosts", "Scaling the number of instances up and down", "Securing your application code and its data access", "Replacing failed hardware in the provider's datacenter"], a: 2, why: "Your code, its configuration and your data are always yours." } },
      { id: "11.2", sources: [["Subnets for your VPC", "https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html", "AWS documentation: public and private subnets"], ["NAT gateways", "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html", "AWS documentation"], ["Security groups", "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html", "AWS documentation"], ["VPC networks", "https://cloud.google.com/vpc/docs/vpc", "Google Cloud documentation"]],
        title: "VPCs, subnets, NAT and security groups", minutes: 20,
        lede: "In the cloud you draw your own network. Done well, nothing but the load balancer is reachable from the internet, and every other path is opened deliberately and narrowly.",
        render(r) { vpc(r); H.keys(r, [["VPC", "Your private network, with an address range (10.0.0.0/16) split into subnets."], ["Public vs private subnet", "Public subnets route to an internet gateway; private ones do not. Only load balancers (and NAT) belong in public subnets."], ["NAT gateway", "Lets private machines start outbound connections (updates, external APIs) without being reachable inbound."], ["Security groups", "Stateful firewalls per instance. Reference other groups ('from the app servers') instead of IP ranges."], ["Defence in depth", "Routing and firewall rules are independent layers: a mistake in one is caught by the other."]]); },
        check: { q: "App servers in a private subnet need to download OS updates. What do they need?", opts: ["A public IP address on each server", "A route to a NAT gateway", "A security group allowing 0.0.0.0/0 inbound", "To be moved into the public subnet"], a: 1, why: "NAT allows outbound connections while keeping the servers unreachable from outside." } },
      { id: "11.3", sources: [["Liveness, readiness and startup probes", "https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/", "Kubernetes documentation"], ["Deployments", "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/", "Kubernetes documentation"], ["Resource management for pods and containers", "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/", "Kubernetes documentation"], ["Horizontal Pod Autoscaling", "https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/", "Kubernetes documentation"]],
        title: "Kubernetes: the parts you will actually use", minutes: 25,
        lede: "Kubernetes is a control loop: you declare what should be running and it keeps making reality match. Five objects and two probes cover most of what a web API needs.",
        render(r) { rollout(r); H.keys(r, [["Pod", "One or more containers scheduled together. Disposable: never fix one by hand."], ["Deployment", "Keeps N identical pods running and rolls out changes gradually (maxSurge, maxUnavailable)."], ["Service", "A stable name and virtual IP in front of whichever pods are ready right now."], ["Readiness vs liveness", "Readiness: send me traffic? Liveness: restart me? Never make liveness depend on the database, or a database blip restarts everything."], ["Requests and limits", "Requests reserve capacity for scheduling; going over the memory limit gets the container OOM-killed, over the CPU limit gets it throttled."], ["HorizontalPodAutoscaler", "Adjusts replicas from metrics (Level 2's formula), using requests as the yardstick."]]); },
        check: { q: "A new release starts but cannot connect to its cache, so it never becomes ready. With a readiness probe and maxUnavailable: 0, what happens?", opts: ["All pods are replaced anyway and the site goes down", "The rollout stalls; old pods keep serving traffic", "Kubernetes deletes the Service until the pods are ready", "The new pods restart forever while traffic is split"], a: 1, why: "New pods never become ready, so no old pod is removed; users see nothing." } },
      { id: "11.4", sources: [["State", "https://developer.hashicorp.com/terraform/language/state", "Terraform documentation"], ["terraform plan", "https://developer.hashicorp.com/terraform/cli/commands/plan", "Terraform documentation"], ["OpenTofu documentation", "https://opentofu.org/docs/", "The open-source fork of Terraform, same language"], ["Docker provider", "https://registry.terraform.io/providers/kreuzwerker/docker/latest/docs", "kreuzwerker/docker on the Terraform Registry"]],
        title: "Infrastructure as code with Terraform", minutes: 20,
        lede: "Clicking through a cloud console works once. Infrastructure as code makes your setup reviewable, repeatable and recoverable: the same files can rebuild everything after a disaster.",
        render(r) { plan(r); H.keys(r, [["Declarative", "You describe the end state; Terraform works out the steps."], ["State", "Terraform's record of what it created. Store it remotely, locked and encrypted (it contains secrets), never in git."], ["Plan, review, apply", "Every change shows its diff before it happens. Read the '-/+' lines: those destroy and recreate."], ["Drift", "Manual changes outside Terraform get reverted on the next apply. Make all changes in code."], ["Secrets", "Not in .tf files or git: use a secret manager, or variables injected by CI."]]); },
        check: { q: "Someone changes a firewall rule by hand in the console. What happens on the next terraform apply?", opts: ["Terraform notices it and adopts the manual change into its state", "The plan shows the difference, and apply reverts it to the code", "Terraform deletes and then recreates the whole VPC around it", "Nothing: Terraform only manages resources while creating them"], a: 1, why: "The code is the source of truth; drift is detected on refresh and corrected." } },
      { id: "11.5", sources: [["RFC 7519: JSON Web Token", "https://www.rfc-editor.org/rfc/rfc7519.html", "IETF"], ["RFC 8725: JWT Best Current Practices", "https://www.rfc-editor.org/rfc/rfc8725.html", "IETF: algorithm, issuer and audience validation"], ["RFC 9700: Best Current Practice for OAuth 2.0 Security", "https://www.rfc-editor.org/rfc/rfc9700.html", "IETF, 2025: PKCE, no implicit or password grants"], ["OpenID Connect Core 1.0", "https://openid.net/specs/openid-connect-core-1_0.html", "OpenID Foundation"], ["Session Management Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", "OWASP"]],
        title: "TLS, sessions, JWT, OAuth and OIDC", minutes: 30,
        lede: "Authentication answers 'who is this?', authorization 'may they do this?'. Modern systems hand the first to an identity provider and verify its signed tokens everywhere else.",
        render(r) { jwtSim(r); oauth(r); H.keys(r, [["TLS everywhere", "Tokens and session cookies are only as safe as the connection carrying them (Level 1)."], ["Sessions vs tokens", "A server-side session (an ID in an HttpOnly, Secure cookie) is simple and instantly revocable: ideal for one web app. JWTs suit many services verifying the same identity."], ["Validate fully", "Signature with an allowed algorithm, exp, iss, aud; then roles. 401 for bad tokens, 403 for missing permission."], ["Short-lived access tokens", "Minutes, not days, because a JWT cannot be revoked; refresh tokens get new ones."], ["Use the code flow with PKCE", "For browsers and apps. The implicit and password grants must not be used (RFC 9700)."]]); },
        check: { q: "An API receives a correctly signed token from your identity provider, but it was issued for a different service. What should it do?", opts: ["Accept it: the signature is valid", "Reject it with 401: the audience does not match", "Reject it with 403: the user lacks the role", "Ask the identity provider whether to accept it"], a: 1, why: "Audience validation stops a token for one service being replayed against another." } }
    ],
    exam: [
      { q: "Which model leaves you patching the operating system?", opts: ["Functions", "Container PaaS", "Virtual machines", "None of them"], a: 2, why: "On IaaS the OS is yours." },
      { q: "Where should a production database live?", opts: ["A public subnet with a public IP and a strong password", "A private subnet, reachable only from the app's security group", "On the load balancer, next to the TLS certificates", "Anywhere, as long as connections use TLS"], a: 1, why: "No route from the internet and a narrow firewall rule: two independent protections." },
      { q: "What does a NAT gateway provide?", opts: ["Inbound access from the internet to servers in private subnets", "Outbound internet access for private servers, with no way in", "TLS termination for traffic that leaves the VPC for the internet", "DNS resolution for private names, so servers can find each other"], a: 1, why: "Connections may start inside and go out; not the reverse." },
      { q: "A liveness probe checks the database. The database has a 30-second blip. What happens?", opts: ["Nothing, because liveness probes ignore dependency errors", "Every pod fails liveness and is restarted at once, making recovery slower", "Pods are marked unready and stop getting traffic, but keep running", "Kubernetes restarts the database pod, because its dependents failed"], a: 1, why: "Liveness should reflect only the process's own health; dependency checks belong in readiness (if anywhere)." },
      { q: "A container exceeds its memory limit. What happens?", opts: ["It is throttled to stay under the limit", "It is OOM-killed and restarted", "Kubernetes raises the limit automatically", "Nothing, as long as the node has spare memory"], a: 1, why: "CPU over the limit is throttled; memory over the limit is fatal." },
      { q: "Why should Terraform state not be committed to git?", opts: ["It is too large for git to store and diff efficiently", "It can contain secrets and needs locking against parallel changes", "Git cannot store the binary format that state files use", "Terraform deletes and rewrites the state file after every apply"], a: 1, why: "Use a remote backend with locking and encryption." },
      { q: "Which check stops the 'alg: none' attack?", opts: ["Checking that the exp claim is still in the future", "Passing an explicit list of allowed algorithms to the verifier", "Checking that the aud claim names this API exactly", "Accepting tokens only over HTTPS with a valid certificate"], a: 1, why: "Never let the token choose how it is verified (RFC 8725)." },
      { q: "What does PKCE protect against?", opts: ["Access tokens being reused by the client after they expire", "An intercepted authorization code being redeemed by an attacker", "Users choosing weak or reused passwords on the login page", "Logins timing out on slow mobile networks before the redirect"], a: 1, why: "Only the client that created the code_verifier can redeem the code." }
    ],
    lab: {
      title: "Kubernetes on your laptop, Terraform against Docker, and an API that checks tokens",
      time: "about 6 hours, in four independent parts",
      folder: "level-11-infra-security/",
      needs: "Docker Desktop (or Docker Engine) with about 4 GB of memory; kind and kubectl for Part A, OpenTofu or Terraform for Part B (single binaries: see the README); a terminal",
      intro: `<p>Four parts you can do in any order. <b>A</b>: a three-node Kubernetes cluster in Docker (kind): deploy, roll out a broken release, watch self-healing, autoscale. <b>B</b>: Terraform creates containers, a network and an nginx proxy on your local Docker: plan, apply, drift, destroy. <b>C</b>: Keycloak issues tokens and a FastAPI service validates them. <b>D</b>: scan dependencies for known vulnerabilities.</p><p>Part A needs <a href="https://kind.sigs.k8s.io/docs/user/quick-start/#installation">kind</a> v0.33.0 (Kubernetes v1.37.0) and <a href="https://kubernetes.io/docs/tasks/tools/">kubectl</a>; Part B needs <a href="https://opentofu.org/docs/intro/install/">OpenTofu</a> 1.13 or Terraform 1.16. Ports used, all on 127.0.0.1: 8088 (Part B, <code>-var proxy_port=…</code>) and 8180 (Part C, <code>KC_PORT</code>).</p><p class="note">How the solutions were produced: Docker could not run where this lab was built, so Part A ran on a single-node k3s v1.37.1 cluster (a certified Kubernetes distribution) with these manifests unchanged, and Part B ran OpenTofu 1.13.1 and the kreuzwerker/docker provider 4.6.0 against Podman's Docker-compatible API. Parts C and D ran exactly as written: Keycloak 26.8.1, PyJWT 2.15.1 and pip-audit 2.10.1. The README lists the small differences you will see.</p>`,
      vmIntro: "Read-only checks for the security of your VM and API.",
      vmChecks: [
        ["Is only what should be public, public?", "sudo ss -tlnp | grep -vE '127.0.0.1|::1'", "Only 22 (ideally restricted by the cloud firewall to your IP), 80 and 443. Postgres (5432) and the API (8000) listen on localhost or a Docker network only."],
        ["Does the cloud firewall agree?", "gcloud compute firewall-rules list --format='table(name,sourceRanges.list(),allowed[].map().firewall_rule().list())'   # or your provider's equivalent", "No rule allowing 0.0.0.0/0 to anything but 80/443. SSH from your IP or via IAP / a bastion."],
        ["SSH hardened?", "sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'", "passwordauthentication no, permitrootlogin no (or prohibit-password), pubkeyauthentication yes."],
        ["Certificate valid and renewing?", "echo | openssl s_client -connect your-domain:443 -servername your-domain 2>/dev/null | openssl x509 -noout -dates -issuer", "notAfter more than ~30 days away (Let's Encrypt renews at 30 days left), issued by Let's Encrypt or your CA."],
        ["Does the API verify tokens fully?", "grep -rnE 'jwt\\.decode|verify_signature|algorithms=' --include=*.py .", "Every decode passes algorithms=[...], audience= and issuer=, and none sets verify_signature False."],
        ["Are secrets out of the repository?", "git log -p | grep -iE 'password=|secret=|api_key=|BEGIN (RSA|OPENSSH) PRIVATE KEY' | head", "Nothing. Secrets live in an .env file excluded by .gitignore, or in a secret manager. Anything ever committed must be rotated."],
        ["Are dependencies scanned?", "pip-audit -r requirements.txt   # or: docker scout cves <image>, trivy image <image>", "No known vulnerabilities, or each one triaged. Run it in CI on every build and weekly on what is deployed."]
      ],
      steps: [
        { id: "l11-a1", why: "kind runs each Kubernetes node as a Docker container, so you get a real multi-node cluster, the same software managed services run, for free and disposable. The image has to be copied into the nodes because they have their own container runtime, separate from your Docker.", title: "A1. Create a three-node cluster and load the app",
          body: `${H.code(`cd level-11-infra-security
kind create cluster --config k8s/kind.yaml
kubectl get nodes
docker build -t lab-api:1 app
docker build -t lab-api:2 --build-arg APP_VERSION=2 app
kind load docker-image lab-api:1 lab-api:2 --name lab
kubectl apply -f k8s/metrics-server.yaml`)}<p>Read <code>k8s/app.yaml</code> while the images build: every field used later is commented.</p>`,
          expect: "Three nodes, all Ready, running Kubernetes v1.37.0: lab-control-plane, lab-worker and lab-worker2. kind loads both images into every node, and metrics-server's objects are created.",
          solution: `${H.code(`NAME                STATUS   ROLES           AGE   VERSION
lab-control-plane   Ready    control-plane   48s   v1.37.0
lab-worker          Ready    <none>          33s   v1.37.0
lab-worker2         Ready    <none>          33s   v1.37.0

Image: "lab-api:1" with ID "sha256:…" not yet present on node "lab-worker", loading...
…
deployment.apps/metrics-server created
apiservice.apiregistration.k8s.io/v1beta1.metrics.k8s.io created`)}
            <ul><li><b>The control plane</b> (API server, scheduler, controllers, etcd) runs on <code>lab-control-plane</code>; your pods run on the two workers. On a managed service (GKE, EKS, AKS) you never see the control plane: the provider runs it.</li><li><b>Why load images?</b> Each node runs its own containerd, which cannot see your Docker's images. In a real cluster, nodes pull from a registry (Artifact Registry, ECR, GHCR); <code>kind load</code> stands in for that. The manifest's <code>imagePullPolicy: IfNotPresent</code> stops Kubernetes from trying Docker Hub.</li><li><b>metrics-server</b> collects CPU and memory from each node's kubelet. <code>kubectl top</code> and the autoscaler (step A6) need it. The vendored copy adds one flag for kind's self-signed kubelet certificates.</li><li>The node table above follows kind's naming; the reference run used a single-node k3s cluster (see the README), so node names and ages in later outputs say <code>vm</code>.</li></ul>` },

        { id: "l11-a2", why: "A Deployment declares how many copies should run; a Service gives them one stable name. Calling the Service from inside the cluster shows the load balancing that replaces Level 2's HAProxy.", title: "A2. Deploy three pods behind a Service",
          body: `${H.code(`kubectl apply -f k8s/app.yaml
kubectl rollout status deploy/api
kubectl get deploy,rs,pods,svc -o wide
kubectl exec deploy/api -- python hit.py http://api/ --count 30`)}`,
          expect: "The rollout finishes with 3 of 3 pods ready, all from one ReplicaSet. The Service has a cluster IP and no external IP. The 30 calls to http://api/ are spread across the three pods.",
          solution: `${H.code(`deployment "api" successfully rolled out
NAME                  READY   UP-TO-DATE   AVAILABLE   CONTAINERS   IMAGES      SELECTOR
deployment.apps/api   3/3     3            3           api          lab-api:1   app=api
NAME                             DESIRED   CURRENT   READY
replicaset.apps/api-7677565799   3         3         3
NAME                       READY   STATUS    RESTARTS   IP           NODE
pod/api-7677565799-5lmfq   1/1     Running   0          10.42.0.54   vm
pod/api-7677565799-7rl82   1/1     Running   0          10.42.0.56   vm
pod/api-7677565799-gzljk   1/1     Running   0          10.42.0.55   vm
NAME          TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)
service/api   ClusterIP   10.43.74.195   <none>        80/TCP

30 requests in 0.1 s
      7  api-7677565799-5lmfq (version 1)
     11  api-7677565799-7rl82 (version 1)
     12  api-7677565799-gzljk (version 1)`)}
            <ul><li><b>Deployment → ReplicaSet → Pods.</b> The Deployment owns a ReplicaSet per version of the pod template (the hash in the name); the ReplicaSet keeps 3 pods alive. Rollouts work by growing a new ReplicaSet and shrinking the old one.</li><li><b>The Service</b> is a stable virtual IP and DNS name (<code>api</code>, or <code>api.default.svc.cluster.local</code>). Each connection goes to one of the ready pods, chosen at random by kube-proxy; that is why the split is uneven over 30 calls. It is only reachable inside the cluster (ClusterIP); exposing it to the internet would be an Ingress or a LoadBalancer Service.</li><li><b>Why <code>kubectl exec</code>?</b> To call the Service as another pod would. <code>kubectl port-forward svc/api</code> would also work, but it connects to a single pod, so you would not see the balancing.</li><li>On kind, the NODE column shows a mix of <code>lab-worker</code> and <code>lab-worker2</code>: the scheduler spreads replicas across nodes.</li></ul>` },

        { id: "l11-a3", why: "Self-healing is the reason to run on Kubernetes at all. Deleting a pod, and making one stop answering its liveness probe, shows the two separate loops that repair things: the ReplicaSet replacing missing pods, and the kubelet restarting unhealthy containers.", title: "A3. Kill a pod, then hang one",
          body: `${H.code(`kubectl get pods
kubectl delete pod <one of the pod names>
kubectl get pods            # run it a few times

kubectl exec <another pod> -- python poke.py /admin/hang
kubectl get pods -w         # Ctrl+C after the RESTARTS column changes
kubectl describe pod <that pod> | tail -n 12`)}`,
          expect: "A replacement pod with a new name appears within seconds of the delete; the count never stays below 3 for long. After the hang, the pod keeps its name but RESTARTS goes to 1 about 15 s later, and the events say the liveness probe failed with status 500.",
          solution: `${H.code(`pod "api-7677565799-5lmfq" deleted
api-7677565799-7rl82   1/1   Running   0     51s
api-7677565799-ddnl9   0/1   Running   0     4s       <- the replacement, not ready yet
api-7677565799-gzljk   1/1   Running   0     51s
… 3 s later: api-7677565799-ddnl9   1/1   Running   0     7s

{"hung":true,"pod":"api-7677565799-ddnl9"}
api-7677565799-ddnl9   1/1   Running   0            24s
api-7677565799-ddnl9   0/1   Running   0            28s
api-7677565799-ddnl9   1/1   Running   1 (6s ago)   32s

Warning  Unhealthy  (x3 over 26s)  kubelet  Liveness probe failed: HTTP probe failed with statuscode: 500
Normal   Killing                   kubelet  Container api failed liveness probe, will be restarted`, [4, 9, 12, 13])}
            <ul><li><b>Two different repairs.</b> Deleting a pod removes it entirely, and the ReplicaSet controller creates a new pod (new name) to get back to 3. A failed liveness probe keeps the pod and has the kubelet restart its container in place (same name, RESTARTS +1).</li><li><b>Timing:</b> liveness runs every 5 s and needs 3 failures in a row, so about 15 s from hang to restart. Readiness kept the restarted container out of the Service until it answered again (0/1, then 1/1).</li><li><b>Why liveness must never check dependencies:</b> if <code>/health/live</code> checked the database, a 30 s database blip would fail liveness on every pod at once, and Kubernetes would restart all of them together, turning a blip into an outage. Dependencies belong in readiness, if anywhere.</li><li>A hung process that still answers HTTP is caught only if the liveness endpoint goes through the same machinery as real requests. If your app takes long to start, add a <code>startupProbe</code> so liveness does not kill it while it boots; the reference run's events show one "connection refused" liveness failure during a boot, harmless only because three failures are needed.</li></ul>` },

        { id: "l11-a4", why: "A bad release is the most common way to break production. With readiness probes and maxUnavailable: 0, Kubernetes refuses to remove a working pod until its replacement is ready, so a release that never becomes ready simply stalls, and users never notice.", title: "A4. Roll out a release that never becomes ready",
          body: `${H.code(`kubectl set image deploy/api api=lab-api:2
kubectl annotate deploy/api kubernetes.io/change-cause="v2: adds a cache"
kubectl rollout status deploy/api --timeout=90s
kubectl get rs,pods
kubectl exec deploy/api -- python hit.py http://api/ --count 30
kubectl get endpointslices -l kubernetes.io/service-name=api \\
  -o jsonpath='{range .items[*].endpoints[*]}{.targetRef.name}{"  ready="}{.conditions.ready}{"\\n"}{end}'
kubectl describe pod <the 0/1 pod> | grep Readiness | tail -n 1

kubectl rollout history deploy/api
kubectl rollout undo deploy/api
kubectl rollout status deploy/api`)}`,
          expect: "One v2 pod starts and stays 0/1 while the three v1 pods keep running; after 60 s the rollout reports it exceeded its progress deadline. Every call still reaches version 1, and the EndpointSlice marks the v2 pod ready=false. Undo removes the v2 pod.",
          solution: `${H.code(`Waiting for deployment "api" rollout to finish: 1 out of 3 new replicas have been updated...
error: deployment "api" exceeded its progress deadline

replicaset.apps/api-6f59579f46   1   1   0   61s      <- v2
replicaset.apps/api-7677565799   3   3   3   2m30s    <- v1, untouched
pod/api-6f59579f46-gkknr   0/1   Running   0   61s

30 requests in 0.1 s
      9  api-7677565799-7rl82 (version 1)
     10  api-7677565799-ddnl9 (version 1)
     11  api-7677565799-gzljk (version 1)

api-7677565799-gzljk  ready=true
api-7677565799-7rl82  ready=true
api-7677565799-ddnl9  ready=true
api-6f59579f46-gkknr  ready=false

Readiness probe failed: HTTP probe failed with statuscode: 503
(the pod's /health/ready says: cannot reach cache at cache:6379: gaierror)

REVISION  CHANGE-CAUSE
1         v1
2         v2: adds a cache
deployment.apps/api rolled back
deployment "api" successfully rolled out`, [2, 4, 5])}
            <ul><li><b>maxSurge 1, maxUnavailable 0:</b> Kubernetes may add one extra pod, and may not remove any old pod until a new one is ready. The new pod never got ready, so nothing old was ever removed: users saw only version 1 the whole time.</li><li><b>Readiness is what the Service obeys.</b> The EndpointSlice lists the v2 pod with <code>ready=false</code>, so kube-proxy sends it no traffic. Without a readiness probe, Kubernetes would consider the pod ready as soon as the process started, and would have carried on replacing v1 with broken v2 pods.</li><li><b>progressDeadlineSeconds: 60</b> turns "stuck" into a clear failure that a deploy pipeline can act on: <code>kubectl rollout status</code> exits non-zero, so CI can roll back automatically.</li><li><b>Undo is quick but not the long-term fix.</b> kubectl warns that <code>rollout undo</code> leaves your manifest and the cluster disagreeing. In practice you revert the change in git and apply it (or let a GitOps tool such as Argo CD do it), so the files stay the truth.</li></ul>` },

        { id: "l11-a5", why: "Requests and limits decide where pods fit and what happens when they misbehave. Watching a container get OOM-killed at its memory limit makes the difference between a CPU limit (throttling) and a memory limit (death) concrete.", title: "A5. Hit the memory limit",
          body: `${H.code(`kubectl top pods
kubectl exec <a pod> -- python poke.py "/admin/leak?mb=40"     # repeat until it fails
kubectl get pod <that pod>
kubectl describe pod <that pod> | grep -A 3 "Last State"`)}<p>Each pod has <code>requests: memory 64Mi</code> and <code>limits: memory 128Mi</code>.</p>`,
          expect: "A pod uses about 30-50 MiB at rest. Two leaks succeed; the third pushes it past 128 MiB, the kernel kills the container (exit code 137), and Kubernetes restarts it: RESTARTS 1, Last State OOMKilled.",
          solution: `${H.code(`NAME                   CPU(cores)   MEMORY(bytes)
api-7677565799-gzljk   3m           31Mi

{"pod":"api-7677565799-gzljk","held_mb":40}
{"pod":"api-7677565799-gzljk","held_mb":80}
command terminated with exit code 137

api-7677565799-gzljk   1/1   Running   1 (7s ago)   2m52s
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137`, [6, 10])}
            <ul><li><b>31 MiB at rest plus 80 MiB held is 111 MiB; the third 40 MiB would pass the 128 MiB limit,</b> so the kernel's out-of-memory killer ended the process during that call (137 = 128 + signal 9, SIGKILL). The leaked memory is gone with it, and the restarted container starts fresh.</li><li><b>CPU is different:</b> going over a CPU limit only slows the container down (throttling). That is why many teams set a memory limit but no CPU limit, and size CPU requests carefully instead.</li><li><b>Requests are for the scheduler:</b> a node only accepts pods whose requests fit in what is left. Set them from measurements (<code>kubectl top</code>, Prometheus) rather than guesses; too low and nodes get overcommitted, too high and you pay for idle capacity.</li><li>A pod that keeps getting OOM-killed ends in <code>CrashLoopBackOff</code>, with longer and longer waits between restarts: a loud signal to fix the leak or raise the limit.</li></ul>` },

        { id: "l11-a6", why: "Autoscaling closes the loop from Level 2: measure utilisation, compute how many instances are needed, adjust. Watching the HorizontalPodAutoscaler do it shows its formula, its limits, and why it waits before scaling down.", title: "A6. Autoscale on CPU",
          body: `${H.code(`kubectl apply -f k8s/hpa.yaml
kubectl get hpa api            # wait until TARGETS shows a percentage, not <unknown>

# terminal 2: two and a half minutes of CPU-heavy requests
kubectl exec deploy/api -- python hit.py "http://api/work?ms=50" --seconds 150 --concurrency 6

# terminal 1
kubectl get hpa api -w         # Ctrl+C about 2 minutes after the load ends
kubectl describe hpa api | tail -n 5`)}`,
          expect: "Under load, CPU jumps far above 50% and replicas go straight to the maximum of 6. About a minute after the load stops, the HPA scales back down to its minimum of 2.",
          solution: `${H.code(`NAME   REFERENCE        TARGETS       MINPODS   MAXPODS   REPLICAS
api    Deployment/api   cpu: 3%/50%   2         6         3
 +30s  cpu: 254%/50%   -> scaled to 6 (the maximum)
 +45s  cpu: 357%/50%
 …     cpu: 255-300%/50%, still 6 replicas
+180s  cpu: 149%/50%   <- the load ends
+195s  cpu: 3%/50%
 about +255s  -> scaled to 2

4223 requests in 150.2 s, spread over 6 pods (563 to 824 each)
Normal  SuccessfulRescale  4m45s  New size: 6; reason: cpu resource utilization (percentage of request) above target
Normal  SuccessfulRescale  74s    New size: 2; reason: All metrics below target`, [3, 8])}
            <ul><li><b>The formula</b> (Kubernetes documentation): desired = ceil(current × current utilisation / target). At 254%: ceil(3 × 254 / 50) = 16, capped at maxReplicas 6. It is Level 2's capacity arithmetic, run every 15 s.</li><li><b>Utilisation is relative to the request</b> (100m). 265% means each pod used about 265 millicores. That is why requests must be realistic: with a tiny request, the HPA sees huge percentages and over-scales.</li><li><b>Still 265% at 6 pods?</b> The reference ran on a 2-core machine, so 6 pods could not get more CPU in total. On your laptop the number will drop further. Either way, maxReplicas is your cost ceiling: the HPA never goes past it.</li><li><b>Why the scale-down waits:</b> the HPA looks at the highest recommendation over the stabilisation window (60 s in <code>hpa.yaml</code>, 300 s by default) before shrinking, so a short lull does not remove pods that will be needed again a moment later.</li></ul>` },

        { id: "l11-b1", why: "init downloads the provider; plan shows exactly what would change before anything does. Reading a plan is the core Terraform skill: it is your chance to catch a mistake before it reaches real infrastructure.", title: "B1. Initialise and read the plan",
          body: `${H.code(`cd level-11-infra-security/terraform
docker image inspect lab-api:1 >/dev/null || docker build -t lab-api:1 ../app
export TF_VAR_api_key=lab-secret-123      # PowerShell: $env:TF_VAR_api_key="lab-secret-123"
tofu init
tofu plan`)}<p>Read <code>main.tf</code>, <code>variables.tf</code> and <code>nginx.conf.tftpl</code> first (about 90 lines in all). With Terraform, type <code>terraform</code> instead of <code>tofu</code>.</p>`,
          expect: "init installs kreuzwerker/docker 4.6.x and writes .terraform.lock.hcl. The plan reads the lab-api:1 image and proposes 5 resources to create: the network, two app containers, the nginx image and the proxy. The env attribute shows as (sensitive value); the proxy's generated nginx config lists tf-api-0 and tf-api-1.",
          solution: `${H.code(`- Installing kreuzwerker/docker v4.6.0...
OpenTofu has been successfully initialized!

data.docker_image.app: Read complete after 1s [id=sha256:ffb4747b…]
  # docker_container.app[0] will be created
  + resource "docker_container" "app" {
      + env      = (sensitive value)
      + name     = "tf-api-0"
      + restart  = "unless-stopped"
      + wait     = true
  …
  # docker_container.proxy will be created
      + upload {
          + content = <<-EOT
                upstream app {
                    server tf-api-0:8000;
                    server tf-api-1:8000;
                }
  …
Plan: 5 to add, 0 to change, 0 to destroy.`, [17])}
            <ul><li><b>Commit <code>.terraform.lock.hcl</code></b> (it pins the exact provider build, like a lockfile), but never <code>.terraform/</code> or state; <code>.gitignore</code> already says so.</li><li><b>The plan is a diff</b> between the code and what exists. Here nothing exists, so everything is <code>+</code>. Later plans will show <code>~</code> (change in place) and <code>-/+</code> (destroy and recreate).</li><li><b>The dependency graph comes from references.</b> The proxy's config uses <code>docker_container.app[*].name</code>, so Terraform creates the app containers first; the network comes before both. You never write the order yourself.</li><li><b>Secrets as variables:</b> the key comes from the environment (<code>TF_VAR_api_key</code>), and <code>sensitive = true</code> hides it in plan output. Hidden in output is not the same as protected, as step B5 shows.</li></ul>` },

        { id: "l11-b2", why: "apply turns the plan into real resources and records them in state. Calling the proxy proves the pieces are wired together, and the healthcheck shows why created is not the same as ready.", title: "B2. Apply and call the result",
          body: `${H.code(`tofu apply            # type yes
docker ps --format '{{.Names}}  {{.Status}}  {{.Ports}}'
for i in 1 2 3 4; do curl -s localhost:8088/; echo; done`)}<p>PowerShell: <code>1..4 | % { curl.exe -s localhost:8088/ }</code></p>`,
          expect: "5 added. The app containers report (healthy); the proxy is published on 127.0.0.1:8088. Requests alternate between tf-api-0 and tf-api-1.",
          solution: `${H.code(`docker_network.lab: Creation complete after 2s
docker_container.app[0]: Creation complete after 3s
docker_container.app[1]: Creation complete after 4s
docker_container.proxy: Creating...
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.
Outputs:
app_containers = ["tf-api-0", "tf-api-1"]
url = "http://localhost:8088/"

tf-api-0  Up 5 seconds (healthy)   8000/tcp
tf-api-1  Up 4 seconds (healthy)   8000/tcp
tf-proxy  Up Less than a second    127.0.0.1:8088->80/tcp
                                   <- the first curl came back empty: nginx was still starting
{"pod":"tf-api-0","version":"1"}
{"pod":"tf-api-0","version":"1"}
{"pod":"tf-api-1","version":"1"}`)}
            <ul><li><b>"Creation complete after 3s/4s":</b> <code>wait = true</code> made Terraform wait until each app container's healthcheck passed before creating the proxy. Without it, the first run of this lab got 502s for about 10 seconds: nginx started first, found no live backends, and marked them failed. Created is not ready, in Terraform as in Kubernetes.</li><li><b>State now exists</b> (<code>terraform.tfstate</code>): Terraform's record of the IDs it created, so the next plan can compare code with reality.</li><li><b>Port 8088 on 127.0.0.1 only:</b> the <code>ip</code> argument in <code>ports</code>, the same rule as every Compose file in this course. Change it with <code>-var proxy_port=…</code> if 8088 is taken.</li></ul>` },

        { id: "l11-b3", why: "Changing code and re-planning is everyday Terraform. This change hides a replacement: reading the plan's -/+ lines before applying is how you notice that something will be destroyed, and a saved plan guarantees you apply exactly what you reviewed.", title: "B3. Scale out, and spot the replacement",
          body: `${H.code(`echo 'app_count = 3' > terraform.tfvars
tofu plan -out scale.tfplan
tofu apply scale.tfplan
for i in 1 2 3 4 5 6; do curl -s localhost:8088/; echo; done`)}`,
          expect: "The plan adds tf-api-2 and replaces the proxy: its upload block, now listing three servers, is marked '# forces replacement'. Plan: 2 to add, 0 to change, 1 to destroy. Afterwards requests reach all three app containers.",
          solution: `${H.code(`  # docker_container.app[2] will be created
  # docker_container.proxy must be replaced
-/+ resource "docker_container" "proxy" {
      - upload { # forces replacement
                    server tf-api-0:8000;
                    server tf-api-1:8000;
      + upload { # forces replacement
                    server tf-api-0:8000;
                    server tf-api-1:8000;
                    server tf-api-2:8000;
Plan: 2 to add, 0 to change, 1 to destroy.
Saved the plan to: scale.tfplan

docker_container.proxy: Destroying...
docker_container.proxy: Destruction complete after 0s
docker_container.app[2]: Creation complete after 3s
docker_container.proxy: Creation complete after 0s
Apply complete! Resources: 2 added, 0 changed, 1 destroyed.
{"pod":"tf-api-2","version":"1"} …`, [2, 3, 11])}
            <ul><li><b><code>-/+</code> means destroy, then create.</b> The provider cannot change an uploaded file in a running container, so it recreates the container. Here that cost a few seconds without a proxy; on a database server it could cost your data. Always look for <code>-/+</code> and <code>forces replacement</code> before typing yes.</li><li><b>Why not create the new proxy first?</b> <code>lifecycle { create_before_destroy = true }</code> does that, but the new container would need the same name and port as the old one, so it would fail. Cloud resources usually allow it (a new VM next to the old one); zero-downtime changes are designed, not automatic.</li><li><b>A saved plan</b> (<code>-out</code>) is applied exactly as reviewed. If anything changed in between, apply refuses. This is how CI pipelines separate "plan on the pull request" from "apply after approval".</li><li><b>terraform.tfvars</b> holds non-secret settings and can be committed; the API key stays in the environment.</li></ul>` },

        { id: "l11-b4", why: "Someone will eventually change production by hand. Terraform detects drift by reading the real resources back and comparing them with the code, but it can only see what the provider reads. Both halves of that sentence matter.", title: "B4. Drift: three hand changes, two detected",
          body: `${H.code(`docker rm -f tf-api-1
docker stop tf-api-2
docker exec tf-proxy sh -c 'echo "# edited by hand" >> /etc/nginx/conf.d/default.conf'
tofu plan
tofu apply                # type yes
docker ps --format '{{.Names}}  {{.Status}}'
docker exec tf-proxy tail -n 1 /etc/nginx/conf.d/default.conf`)}`,
          expect: "The plan refreshes every resource and proposes to recreate tf-api-1 and restart tf-api-2 (must_run false → true): 1 to add, 1 to change. The hand edit inside the proxy is not mentioned, and it is still there after the apply.",
          solution: `${H.code(`docker_container.app[1]: Refreshing state... [id=6d3254ff…]
  # docker_container.app[1] will be created
  # docker_container.app[2] will be updated in-place
      ~ must_run = false -> true
Plan: 1 to add, 1 to change, 0 to destroy.
(tofu plan -detailed-exitcode exits with 2: "there are changes")

docker_container.app[2]: Modifications complete after 1s
docker_container.app[1]: Creation complete after 5s
Apply complete! Resources: 1 added, 1 changed, 0 destroyed.
tf-api-0  Up 29 seconds (healthy)
tf-api-2  Up 5 seconds (healthy)
tf-proxy  Up 16 seconds
tf-api-1  Up 4 seconds (healthy)
# edited by hand`, [2, 3, 15])}
            <ul><li><b>Missing and stopped were caught</b> because the provider asks Docker for each container on every refresh. The apply put reality back to what the code says, which is why manual changes "get reverted".</li><li><b>The file edit was not caught.</b> The provider uploads the file but never reads it back, so Terraform cannot know it changed. Cloud providers have the same blind spots: settings the API does not return, or resources created outside Terraform entirely (they are not in state, so plan never mentions them).</li><li><b>The fix is process, not tooling:</b> no hand changes in production, everything through code and review, and a scheduled <code>plan</code> (with <code>-detailed-exitcode</code>, which exits 2 when there is drift) to raise an alert when reality and code disagree.</li><li><code>tofu apply -replace=docker_container.proxy</code> would recreate the proxy and wipe the hand edit, if you wanted it gone.</li></ul>` },

        { id: "l11-b5", why: "State is the most sensitive file Terraform produces. Finding your 'sensitive' variable in it, in plain text, is the clearest argument for remote, encrypted, access-controlled state.", title: "B5. Look inside the state",
          body: `${H.code(`tofu state list
tofu state show 'docker_container.app[0]' | grep -E 'env|name '
grep -n "lab-secret-123" terraform.tfstate | head -n 3
docker inspect tf-api-0 --format '{{json .Config.Env}}'`)}`,
          expect: "state list shows the data source and six resources. state show hides env as (sensitive value), but the state file itself contains API_KEY=lab-secret-123 in plain text, once per app container, and so does docker inspect.",
          solution: `${H.code(`data.docker_image.app
docker_container.app[0]
docker_container.app[1]
docker_container.app[2]
docker_container.proxy
docker_image.nginx
docker_network.lab

    env   = (sensitive value)
    name  = "tf-api-0"

89:              "API_KEY=lab-secret-123",
234:              "API_KEY=lab-secret-123",
379:              "API_KEY=lab-secret-123",

[… "POD_NAME=tf-api-0", "API_KEY=lab-secret-123", …]          <- docker inspect`, [12, 13, 14, 16])}
            <ul><li><b><code>sensitive</code> only hides output.</b> Terraform must store the real value to detect changes, so state holds every secret any resource uses: database passwords, API keys, private keys.</li><li><b>So state belongs in a remote backend</b> (a GCS or S3 bucket, Terraform Cloud, or similar) with encryption at rest, locking (so two people cannot apply at once) and access restricted like a secret. OpenTofu can also encrypt state itself before it is written (its state encryption feature, added in 1.7).</li><li><b>Better still, keep secrets out of resources:</b> let the app fetch them at runtime from a secret manager (GCP Secret Manager, AWS Secrets Manager, Vault) so Terraform only knows the secret's name. The <code>docker inspect</code> line shows the second problem with environment variables: anyone who can inspect the container can read them.</li></ul>` },

        { id: "l11-b6", why: "Being able to remove everything as easily as you created it is half the value of infrastructure as code: test environments that cost nothing when idle, and confidence that nothing was left behind.", title: "B6. Destroy",
          body: `${H.code(`tofu destroy               # type yes
docker ps -a --filter name=tf-
docker network ls --filter name=tf-lab
docker image ls nginx`)}`,
          expect: "6 destroyed. No tf- containers and no tf-lab network remain; the nginx image is still there because of keep_locally = true.",
          solution: `${H.code(`Plan: 0 to add, 0 to change, 6 to destroy.
Destroy complete! Resources: 6 destroyed.

CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
NETWORK ID     NAME    DRIVER    SCOPE
REPOSITORY   TAG           IMAGE ID       CREATED       SIZE
nginx        1.27-alpine   …`)}
            <ul><li><b>Destroy follows the dependency graph in reverse:</b> proxy and apps first, then the network.</li><li><b>6, not 7:</b> the data source was only read, never created, so there is nothing to destroy. The image resource is removed from state, but <code>keep_locally</code> leaves the image itself on disk.</li><li><b>In the cloud, guard production</b> with <code>lifecycle { prevent_destroy = true }</code> on databases and buckets, and with separate state (and credentials) per environment, so a destroy meant for staging cannot touch production.</li><li><code>terraform.tfstate</code> still exists but is empty of resources; delete it, <code>.terraform/</code> and <code>scale.tfplan</code> when you are done.</li></ul>` },

        { id: "l11-c1", why: "An identity provider takes passwords, logins and token signing out of your code. Starting one and logging in through its own page, once, shows the browser side of the flow that the scripts in the next steps reproduce.", title: "C1. Start Keycloak and log in once in the browser",
          body: `${H.code(`cd level-11-infra-security/auth
docker compose up -d --build        # Keycloak takes 20-60 s to become healthy
docker compose ps                   # wait for keycloak (healthy)
docker compose build tools`)}<p>Then open <b>http://localhost:8180/realms/lab/account</b> and sign in as <code>alice</code> / <code>alice-pass</code>. Before typing the password, look at the address bar: you have been redirected to Keycloak's <code>…/protocol/openid-connect/auth?client_id=account-console&amp;…&amp;code_challenge=…&amp;code_challenge_method=S256</code>. Read <code>keycloak/lab-realm.json</code> (users, roles, clients) and <code>api/main.py</code> (about 50 lines that matter).</p>`,
          expect: "keycloak shows (healthy) and api is running. In the browser, the account console redirects you to Keycloak's login page with a code_challenge in the URL; after you sign in you land back on the account page.",
          solution: `<p>The address bar during login looks like this (shortened):</p>${H.code(`http://localhost:8180/realms/lab/protocol/openid-connect/auth
  ?client_id=account-console
  &redirect_uri=http%3A%2F%2Flocalhost%3A8180%2Frealms%2Flab%2Faccount%2F
  &response_type=code
  &scope=openid
  &state=…
  &code_challenge=…
  &code_challenge_method=S256`, [4, 7, 8])}
            <ul><li><b>The account console is itself an OIDC client</b> of Keycloak, using the authorization code flow with PKCE: the same flow RFC 9700 recommends for every browser and mobile app. The password goes only to Keycloak's page, never to the app.</li><li><b>Three kinds of client in <code>lab-realm.json</code>:</b> <code>lab-web</code> is public (a browser app cannot keep a secret), so PKCE is required; <code>reports-job</code> is confidential (a server with a secret) and gets tokens as itself; <code>orders-api</code> never logs anyone in: it only receives tokens, and its name is the audience the tokens must carry.</li><li><b>Roles</b> are defined once in Keycloak and travel inside the token (<code>realm_access.roles</code>), so the API does not need its own user table.</li><li>The admin console (http://localhost:8180, admin / admin) shows the same realm; changes there take effect immediately.</li></ul>` },

        { id: "l11-c2", why: "The authorization code flow with PKCE is the login every modern web and mobile app should use. Running it step by step, and reading the resulting token, takes the mystery out of what 'log in with…' does and of what an API receives.", title: "C2. The code flow with PKCE, step by step",
          body: `${H.code(`docker compose run --rm tools python login.py alice`)}<p>The script plays the browser: it fetches the login page, submits the form, and reads the code from the redirect instead of following it. Read <code>scripts/oidc.py</code>: <code>pkce_pair</code>, <code>get_code</code> and <code>exchange</code> are the whole flow.</p>`,
          expect: "Five numbered steps: create the verifier and challenge, GET the authorize URL (200, login page), POST the form (302 to the redirect URI), a code plus the same state, and the token request (200). The access token is RS256 with a kid, issued by http://keycloak:8080/realms/lab for audience orders-api, expiring 60 s after it was issued, with alice's roles.",
          solution: `${H.code(`0. app creates code_verifier=EwRr06aB8sZh… (kept secret) and code_challenge=SHA256(verifier)=wl3vQO7B_Zk-…
1. browser -> GET http://keycloak:8080/realms/lab/protocol/openid-connect/auth?client_id=lab-web&response_type=code
   &code_challenge=wl3vQO7B_Zk-…&code_challenge_method=S256&state=HXdGIPZadwR9L1fl
   Keycloak answers 200 with its login page
2. browser -> POST the login form as alice; Keycloak answers 302, redirecting to
   http://localhost:9999/callback?state=HXdGIPZadwR9L1fl&session_state=wIDA3NDS…&iss=http%3A%2F%2F…
3. the redirect carries code=f887b824-4d43-c8… and the same state, so it answers our request
4. app -> POST http://keycloak:8080/realms/lab/protocol/openid-connect/token with the code and the code_verifier;
   Keycloak answers 200
   received: access_token, refresh_token, id_token; access token expires in 60 s

access token header: {'alg': 'RS256', 'typ': 'JWT', 'kid': 'HN-JQGh11kY87HCumvQmmsFq8VPWSRCGGQbFgACihcI'}
access token claims (the ones the API checks):
  iss                  http://keycloak:8080/realms/lab
  aud                  ['orders-api', 'account']
  sub                  97c53ab5-9eda-4e85-a86a-4118499faf4c
  azp                  lab-web
  preferred_username   alice
  iat / exp            10:40:27 UTC / 10:41:27 UTC
  realm_access.roles   ['default-roles-lab', 'offline_access', 'orders.read', 'orders.write', 'uma_authorization']`, [16, 17, 21, 22])}
            <ul><li><b>Why a code, then a second request?</b> The code travels through the browser (the URL), where it can leak into history, logs or a malicious app. It is worthless on its own: only the token endpoint turns it into tokens, and only for whoever can prove they started the login (step C5).</li><li><b>PKCE (RFC 7636):</b> the app sends the SHA-256 of a random secret at the start and the secret itself at the end. Keycloak checks they match. <b>state</b> does a similar job for the app: it proves the redirect answers a login this browser started (protection against cross-site request forgery).</li><li><b>Three tokens:</b> the <i>access token</i> is for APIs (short-lived: 60 s here, often 5-15 minutes); the <i>ID token</i> tells the app who logged in (OpenID Connect); the <i>refresh token</i> gets new access tokens without asking for the password again.</li><li><b>Reading a JWT is not verifying it.</b> The header and claims are just base64-encoded JSON that anyone can read. Never put secrets in them. The signature (the third part) is what the API must check.</li><li><b>aud has two values:</b> <code>orders-api</code> from the audience mapper on <code>lab-web</code>, and <code>account</code>, which Keycloak adds for its own account service.</li></ul>` },

        { id: "l11-c3", why: "Authentication and authorization fail differently and must answer differently. Running every combination (no token, garbage, two users with different roles, a token meant for someone else) shows the API's checks one by one, and the difference between 401 and 403.", title: "C3. Call the API as everyone",
          body: `${H.code(`docker compose run --rm tools python call.py`)}`,
          expect: "401 without a token or with garbage (with a WWW-Authenticate header); alice can read and create; bob can read but gets 403 on create; the reports-job service token is rejected with 401 because its audience is not orders-api.",
          solution: `${H.code(`no token                           GET  /orders  401  missing bearer token
                                   WWW-Authenticate: Bearer realm="orders"
not a JWT at all                   GET  /orders  401  invalid token: Not enough segments
alice (read + write)               GET  /orders  200  {'user': 'alice', 'orders': [ … 2 orders … ]}
alice                              POST /orders  200  {'id': 3, 'item': 'new item', 'owner': 'alice'}
bob (read only)                    GET  /orders  200  {'user': 'bob', 'orders': [ … 3 orders … ]}
bob                                POST /orders  403  bob needs role orders.write; has ['orders.read']
reports-job (client credentials)   GET  /orders  401  invalid token: Audience doesn't match
                                   WWW-Authenticate: Bearer error="invalid_token", error_description="Audience doesn't match"`, [7, 8])}
            <ul><li><b>401 means "I don't know who you are"</b> (no token, or one that fails verification); the <code>WWW-Authenticate</code> header tells the client to get a token (RFC 6750). <b>403 means "I know who you are, and you may not"</b>: bob's token is perfectly valid, he just lacks the role.</li><li><b>The audience check</b> is what stops a token issued for one service being replayed against another. reports-job's token is genuine and correctly signed by the same Keycloak, but it was issued for <code>account</code>, not <code>orders-api</code>. Without <code>audience=</code>, any token from your identity provider would open every API.</li><li><b>The API made no call to Keycloak per request.</b> It fetched Keycloak's public keys once (cached for 5 minutes) and checks signatures locally. That is why JWTs scale across many services, and also why they cannot be revoked before they expire (step C5).</li><li>In FastAPI, the checks live in dependencies (<code>Depends(require_role(...))</code>), so every endpoint declares what it needs and none can forget.</li></ul>` },

        { id: "l11-c4", why: "Every check in verified_claims exists because of a real attack. Forging tokens yourself, and watching the naive endpoint accept all of them, is the fastest way to never write jwt.decode without verification again.", title: "C4. Forge three tokens",
          body: `${H.code(`docker compose run --rm tools python forge.py`)}<p>Each forged token claims bob has <code>orders.write</code>. It is sent to the real endpoint and to <code>/naive/orders</code>, which decodes the token with <code>verify_signature: False</code>.</p>`,
          expect: "The real check rejects all three with 401: signature verification failed, then 'the specified alg value is not allowed' twice. The naive endpoint accepts all three and believes bob has orders.write.",
          solution: `${H.code(`1. edited roles, old signature
   POST /orders        401  invalid token: Signature verification failed
   GET  /naive/orders  200  {'accepted_user': 'bob', 'accepted_roles': ['orders.read', 'orders.write']}
2. alg none, no signature
   POST /orders        401  invalid token: The specified alg value is not allowed
   GET  /naive/orders  200  {'accepted_user': 'bob', 'accepted_roles': ['orders.read', 'orders.write']}
3. HS256 with the public key
   POST /orders        401  invalid token: The specified alg value is not allowed
   GET  /naive/orders  200  {'accepted_user': 'bob', 'accepted_roles': ['orders.read', 'orders.write']}`, [2, 5, 8])}
            <ul><li><b>1. Edited claims:</b> the signature covers the header and payload, so changing one byte breaks it. Only the holder of Keycloak's private key can produce a valid one.</li><li><b>2. <code>alg: none</code>:</b> the JWT standard allows unsigned tokens. Libraries that let the token's header choose the algorithm have accepted these in the past (RFC 8725 section 2.1). <code>algorithms=["RS256"]</code> is an allow-list, so the token never gets to choose.</li><li><b>3. Key confusion:</b> the attacker takes the public key (which anyone can download) and uses it as an HMAC secret with HS256. A verifier that trusted the header would check the HMAC with that same public key, and it would match. The allow-list stops this too.</li><li><b>The naive endpoint is not a strawman:</b> "decode without verifying to read the user ID" appears in real code, often in gateways or logging middleware that assume someone else verified the token. Verify once, at every service boundary that makes a decision.</li></ul>` },

        { id: "l11-c5", why: "Tokens are bearer credentials: whoever holds one can use it. Two defences limit the damage when one leaks: short lifetimes for access tokens, and PKCE for the code that becomes them. Seeing both in action shows why the defaults matter.", title: "C5. Expiry, and a stolen code",
          body: `${H.code(`docker compose run --rm tools python call.py --wait 65
docker compose run --rm tools python login.py bob --steal`)}`,
          expect: "alice's token works, then 65 s later the same token gets 401 'Signature has expired'; a fresh login works again. For the stolen code, the token request without the code_verifier fails with 400 invalid_grant, 'PKCE code verifier not specified'.",
          solution: `${H.code(`alice, fresh token                 GET  /orders  200  {'user': 'alice', …}
... waiting 65 s (lab-web's access tokens live 60 s)
alice, same token 65 s later       GET  /orders  401  invalid token: Signature has expired
alice, logs in again               GET  /orders  200  {'user': 'alice', …}

3. the redirect carries code=a80f2359-d27e-7a… and the same state, so it answers our request
4. attacker -> POST http://keycloak:8080/realms/lab/protocol/openid-connect/token with the code but no code_verifier
   Keycloak answers 400: {'error': 'invalid_grant', 'error_description': 'PKCE code verifier not specified'}`, [3, 7])}
            <ul><li><b>"Signature has expired"</b> is PyJWT's wording for a failed <code>exp</code> check: the signature is fine, but the token's lifetime is over (plus the 5 s leeway for clock skew).</li><li><b>Short-lived access tokens are the revocation story for JWTs.</b> The API never asks Keycloak whether a token is still valid, so a leaked token works until it expires. Keep access tokens to minutes; the app uses its refresh token (which Keycloak <i>can</i> revoke, for example at logout) to get new ones silently.</li><li><b>PKCE made the stolen code useless.</b> The attacker had the code and the client ID (both public) but not the verifier, which never left the real app. Keycloak refuses because <code>lab-web</code> requires S256 PKCE. RFC 9700 requires PKCE for public clients and recommends it for all of them.</li><li><b>Sessions are still a fine choice</b> for a single web app with its own backend: a random session ID in an HttpOnly, Secure, SameSite cookie, revocable instantly by deleting it server-side (OWASP Session Management Cheat Sheet). Tokens shine when many services must verify the same user.</li></ul>` },

        { id: "l11-d1", why: "Most of the code you ship is other people's. A scanner compares your exact versions with published advisories, and running it on this course's own 2024 pins shows how quickly perfectly good dependencies collect known vulnerabilities.", title: "D1. Scan an old requirements file",
          body: `${H.code(`cd level-11-infra-security
./audit.sh -r audit/requirements-2024.txt
echo "exit code: $?"
./audit.sh -r audit/requirements-2024.txt --aliases on --desc on | less`)}<p>On Windows without a POSIX shell: <code>docker build -t lab-pip-audit audit</code>, then <code>docker run --rm -v "\${PWD}:/work:ro" lab-pip-audit -r audit/requirements-2024.txt</code>.</p>`,
          expect: "Findings in exactly one package, starlette 0.41.3, which is not in the file: it comes with fastapi 0.115.6. Seven distinct advisories (pip-audit lists each one twice), with fixes in starlette 0.47.2 to 1.3.1. The exit code is 1.",
          solution: `${H.code(`Found 14 known vulnerabilities in 1 package
Name      Version ID              Fix Versions Aliases
--------- ------- --------------- ------------ -------------------------------------------------
starlette 0.41.3  PYSEC-2026-1941 0.47.2       CVE-2025-54121, GHSA-2c2j-9gv5-cj73
starlette 0.41.3  PYSEC-2026-1942 0.49.1       CVE-2025-62727, GHSA-7f5h-v6xp-fcq8
starlette 0.41.3  PYSEC-2026-161  1.0.1        CVE-2026-48710, GHSA-86qp-5c8j-p5mr
starlette 0.41.3  PYSEC-2026-2280 1.1.0        CVE-2026-48817, GHSA-x746-7m8f-x49c
starlette 0.41.3  PYSEC-2026-2281 1.1.0        CVE-2026-48818, GHSA-wqp7-x3pw-xc5r
starlette 0.41.3  PYSEC-2026-248  1.3.0        CVE-2026-54282, GHSA-jp82-jpqv-5vv3
starlette 0.41.3  PYSEC-2026-249  1.3.1        CVE-2026-54283, GHSA-82w8-qh3p-5jfq
exit code: 1

(scanned when this lab was written, October 2026; your results will include anything published since)`, [1, 11])}
            <ul><li><b>The vulnerable package is transitive.</b> Nobody wrote <code>starlette</code> in the file; FastAPI depends on it. pip-audit resolves the whole dependency tree before checking, which is why it finds what a glance at the file would not.</li><li><b>One advisory, three names:</b> PYSEC (the Python Packaging Advisory Database), GHSA (GitHub) and CVE (the global identifier) are the same issue. Search the CVE or GHSA ID to read it.</li><li><b>Triage, then fix:</b> some advisories affect code you do not use (one concerns <code>StaticFiles</code> on Windows; two concern multipart form parsing, which an API without uploads never runs). That changes how urgently you must act, not whether: upgrading is cheaper than proving you are safe, and your usage changes.</li><li><b>These are the pins this course's labs started with,</b> versions from late 2024 that aged the way every real project's do. Finding them is why every lab now pins fastapi 0.143.0 and uvicorn 0.54.0. If you copied the older pins into your own app, step D2 is the fix.</li></ul>` },

        { id: "l11-d2", why: "Fixing a transitive vulnerability means upgrading the package that pulls it in, then proving the result is clean and still works. Scanning the installed image as well checks what actually ships, not just what the file says.", title: "D2. Fix it, and scan what you ship",
          body: `${H.code(`cat app/requirements.txt              # this lab's app already uses current versions
./audit.sh -r app/requirements.txt
echo "exit code: $?"

docker run --rm lab-api:1 pip freeze > shipped.txt     # PowerShell: … | Out-File -Encoding utf8 shipped.txt
cat shipped.txt
./audit.sh -r shipped.txt --no-deps`)}`,
          expect: "app/requirements.txt pins fastapi 0.143.0 and uvicorn 0.54.0; the scan finds no known vulnerabilities and exits 0. pip freeze lists everything installed in the image (starlette 1.8.0 among them), and scanning that list is clean too.",
          solution: `${H.code(`fastapi==0.143.0
uvicorn==0.54.0
No known vulnerabilities found
exit code: 0

annotated-doc==0.0.5
annotated-types==0.8.0
anyio==4.15.1
click==8.5.0
fastapi==0.143.0
h11==0.16.0
idna==3.20
opentelemetry-api==1.45.1
pydantic==2.14.1
pydantic_core==2.50.1
starlette==1.8.0
typing-inspection==0.4.4
typing_extensions==4.16.0
uvicorn==0.54.0
No known vulnerabilities found`, [3, 15, 18])}
            <ul><li><b>Upgrade the parent, not the child.</b> Pinning <code>starlette</code> yourself would fight FastAPI's own requirements; upgrading FastAPI brings a starlette it was tested with. After any upgrade, run your tests (here: rebuild the image and repeat Part A) before shipping.</li><li><b>Scan what ships.</b> <code>pip freeze</code> inside the image is the truth about what runs, including versions pip chose for unpinned dependencies. A lock file (pip-tools, uv or Poetry, ideally with hashes) makes that list reproducible, which is what the <code>--no-deps</code> warning is nudging you towards.</li><li><b>Make it automatic:</b> pip-audit exits non-zero on findings, so one CI line (<code>pip-audit -r requirements.txt</code>) fails the build. Dependabot or Renovate open upgrade pull requests on their own, and a weekly scheduled scan catches advisories published after you deployed.</li><li><b>The operating system counts too.</b> pip-audit only sees Python packages. Image scanners such as Trivy, Grype or Docker Scout also check the base image's system packages; rebuilding regularly on a current <code>python:3.12-slim</code> picks up its fixes.</li></ul>` },

        { id: "l11-x", why: "A kind cluster holds several gigabytes of memory while it runs, and leftover Terraform state or containers make the next experiment confusing.", title: "Clean up all four parts",
          body: `${H.code(`kind delete cluster --name lab
(cd terraform && tofu destroy && rm -rf .terraform terraform.tfstate* scale.tfplan terraform.tfvars)
(cd auth && docker compose --profile tools down -v)
docker image rm lab-pip-audit; rm -f shipped.txt`)}`,
          expect: "The cluster's node containers are gone, Terraform reports nothing left to destroy (or destroys what remains), and Keycloak's containers and volumes are removed.",
          solution: `<p>Nothing here holds data you need. Keep <code>terraform/.terraform.lock.hcl</code> if you want the same provider build next time; it is the one generated file meant to be committed.</p>` }
      ]
    }
  });
})();
