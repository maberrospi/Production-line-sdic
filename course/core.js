/* Production Line — course shell: state, XP, routing, map, level views, shared lesson helpers. */
(function () {
  "use strict";

  const LEVELS = [
    { id: 0, title: "Foundations", sub: "Requests, latency, estimates", track: "core", x: 70, y: 210 },
    { id: 1, title: "The single server", sub: "Your VM, done right", track: "compute", x: 220, y: 110 },
    { id: 2, title: "Scaling out", sub: "Load balancers, stateless apps", track: "compute", x: 350, y: 110 },
    { id: 3, title: "Caching and CDNs", sub: "Redis, edge, invalidation", track: "compute", x: 480, y: 110 },
    { id: 4, title: "Databases", sub: "Indexes, transactions, pooling", track: "data", x: 220, y: 310 },
    { id: 5, title: "Replication and HA", sub: "Replicas, failover, PITR", track: "data", x: 370, y: 310 },
    { id: 6, title: "Sharding", sub: "Partitions, consistent hashing", track: "data", x: 520, y: 310 },
    { id: 7, title: "Distributed theory", sub: "CAP, consistency, Raft", track: "data", x: 670, y: 310 },
    { id: 8, title: "Async and events", sub: "Queues, Kafka, CDC", track: "data", x: 820, y: 310 },
    { id: 9, title: "Architecture", sub: "Services, gateways, APIs", track: "compute", x: 640, y: 110 },
    { id: 10, title: "Reliability and ops", sub: "SLOs, deploys, observability", track: "compute", x: 770, y: 110 },
    { id: 11, title: "Infra and security", sub: "Kubernetes, serverless, auth", track: "compute", x: 900, y: 110 },
    { id: 12, title: "Capstone", sub: "Design real systems", track: "core", x: 1040, y: 210 }
  ];
  const PLANNED = {
    2: ["Vertical vs horizontal scaling", "Stateless app servers and where sessions go", "L4 vs L7 load balancers, algorithms, health checks", "Cloud LB vs HAProxy + floating IP", "Autoscaling", "Lab: 3 FastAPI replicas behind nginx under k6 load"],
    3: ["The cache hierarchy, browser to DB", "Cache-aside, write-through, write-behind", "TTL, eviction, invalidation, stampedes", "Redis beyond caching", "CDN edge vs origin", "Lab: Redis cache-aside and a stampede on purpose"],
    4: ["SQL vs NoSQL families", "B-tree and LSM indexes", "Transactions, isolation levels, anomalies", "Connection pooling", "Reading query plans", "Lab: EXPLAIN ANALYZE and pgbouncer"],
    5: ["Leader-follower, multi-leader, leaderless", "Sync vs async replication and lag", "Failover, Patroni, split brain", "Backups and point-in-time recovery", "Lab: primary + replica, promote, PITR"],
    6: ["Range vs hash partitioning", "Consistent hashing", "Hot keys and rebalancing", "What you give up across shards"],
    7: ["CAP and PACELC", "Consistency models", "Consensus and Raft", "Clocks and ordering", "Idempotency and exactly-once"],
    8: ["Queues vs logs", "Kafka partitions, consumer groups, offsets", "Delivery guarantees, DLQs, backpressure", "CDC with Debezium, the outbox pattern", "Event sourcing, CQRS, sagas", "Lab: Postgres to Kafka with Debezium"],
    9: ["Monolith, modular monolith, microservices", "REST, gRPC, GraphQL, WebSockets", "API gateways and service discovery", "Rate limiting algorithms", "Pagination and versioning"],
    10: ["SLIs, SLOs, error budgets", "Timeouts, retries, circuit breakers", "Rolling, blue-green, canary", "Metrics, logs, traces", "Incident response, RPO/RTO, multi-region"],
    11: ["VM vs PaaS vs Kubernetes vs serverless", "VPCs, subnets, NAT, security groups", "Terraform", "TLS, sessions, JWT, OAuth/OIDC", "Lab: Kubernetes, OpenTofu and OIDC, run locally"],
    12: ["A repeatable design framework", "URL shortener, rate limiter, chat", "News feed, notifications", "Video streaming, ride-hailing"]
  };
  const RANKS = [
    [0, "Intern"], [300, "Junior engineer"], [800, "Engineer"], [1600, "Senior engineer"],
    [3000, "Staff engineer"], [5000, "Principal engineer"], [8000, "Architect"]
  ];
  const BADGES = [
    { id: "first-packet", name: "First packet", desc: "Finish your first lesson" },
    { id: "estimator", name: "Estimator", desc: "Nail the sizing challenge" },
    { id: "lvl0", name: "Foundations cleared", desc: "Score 80% on the Level 0 exam" },
    { id: "locked-down", name: "Locked down", desc: "Close every port but 80 and 443" },
    { id: "rollback", name: "Rollback hero", desc: "Survive a bad deploy" },
    { id: "backup", name: "Restore tested", desc: "Recover from all three disasters" },
    { id: "lvl1", name: "Single server cleared", desc: "Score 80% on the Level 1 exam" },
    { id: "lvl2", name: "Scaled out", desc: "Score 80% on the Level 2 exam" },
    { id: "lvl3", name: "Cache master", desc: "Score 80% on the Level 3 exam" },
    { id: "lvl4", name: "Query whisperer", desc: "Score 80% on the Level 4 exam" },
    { id: "lvl5", name: "Failover ready", desc: "Score 80% on the Level 5 exam" },
    { id: "lvl6", name: "Shard keeper", desc: "Score 80% on the Level 6 exam" },
    { id: "lvl7", name: "Consensus reached", desc: "Score 80% on the Level 7 exam" },
    { id: "lvl8", name: "Event driven", desc: "Score 80% on the Level 8 exam" },
    { id: "lvl9", name: "API architect", desc: "Score 80% on the Level 9 exam" },
    { id: "lvl10", name: "Reliability engineer", desc: "Score 80% on the Level 10 exam" },
    { id: "lvl11", name: "Cloud and security", desc: "Score 80% on the Level 11 exam" },
    { id: "lvl12", name: "System designer", desc: "Score 80% on the Level 12 exam" },
    { id: "lab-rat", name: "Lab rat", desc: "Finish every step of a lab" },
    { id: "perfect", name: "Perfect exam", desc: "Score 100% on any exam" }
  ];

  /* ---------- glossary: [expansion, definition, plural expansion?, noExpand?] ---------- */
  const GLOSSARY = {
    "ACME": ["Automatic Certificate Management Environment", "The protocol Let's Encrypt uses to prove you control a domain and issue certificates automatically."],
    "API": ["application programming interface", "The set of endpoints other programs (your frontend, mobile apps) call to use your backend."],
    "CDN": ["content delivery network", "Servers spread around the world that cache your content close to users, cutting round-trip time."],
    "CI": ["continuous integration", "Automatically testing (and usually building) every change pushed to the repository, e.g. GitHub Actions."],
    "CLI": ["command-line interface", "A program you drive by typing commands in a terminal."],
    "CPU": ["central processing unit", "The processor. Its cores execute your code; CPU-bound work is limited by how many cores you have."],
    "DAU": ["daily active users", "How many distinct users use the product on a given day. The starting point of most capacity estimates."],
    "DB": ["database", "Where your data lives; in this course usually Postgres."],
    "DNS": ["Domain Name System", "The internet's phone book: turns names like app.example.com into IP addresses."],
    "ECR": ["Elastic Container Registry", "AWS's container image registry."],
    "GC": ["garbage collection", "A language runtime pausing to free unused memory. A common source of occasional slow requests."],
    "GCP": ["Google Cloud Platform", "Google's public cloud."],
    "AWS": ["Amazon Web Services", "Amazon's public cloud."],
    "GHCR": ["GitHub Container Registry", "GitHub's registry for Docker images (ghcr.io)."],
    "GIL": ["global interpreter lock", "CPython's lock that lets only one thread run Python code at a time, so CPU-bound work needs more processes, not threads."],
    "HA": ["high availability", "Designing a system to keep working when parts of it fail, usually through redundancy."],
    "HDD": ["hard disk drive", "A spinning magnetic disk. Much slower than an SSD for random reads."],
    "HSTS": ["HTTP Strict Transport Security", "A header telling browsers to only ever use HTTPS for your domain."],
    "HTTP": ["Hypertext Transfer Protocol", "The request/response protocol of the web."],
    "HTTP/2": ["HTTP version 2", "Lets many requests share one connection at the same time, avoiding repeated handshakes."],
    "HTTPS": ["HTTP Secure", "HTTP encrypted with TLS."],
    "IP": ["Internet Protocol", "The addressing system of the internet. An IP address identifies a machine, like 203.0.113.7.", "Internet Protocol addresses"],
    "JSON": ["JavaScript Object Notation", "The text format most web APIs use to send data."],
    "LTS": ["long-term support", "An operating system release that gets security updates for years (e.g. Ubuntu 24.04 LTS)."],
    "N+1": ["N+1 query problem", "Running one query to get a list, then one more query per item. 100 items = 101 round trips.", null, true],
    "NVMe": ["Non-Volatile Memory Express", "The fast interface modern SSDs use."],
    "OS": ["operating system", "Linux, macOS, Windows: the software that manages the machine."],
    "PITR": ["point-in-time recovery", "Restoring a database to any exact moment, using a base backup plus the archived write-ahead log."],
    "RAID": ["redundant array of independent disks", "Combining disks so one can fail without losing data. It copies mistakes too, so it is not a backup."],
    "RAM": ["random-access memory", "The machine's working memory: ~100 ns to read, versus microseconds for disk."],
    "RPO": ["recovery point objective", "How much data you can afford to lose in a disaster, measured in time (e.g. 'at most 1 minute')."],
    "RTO": ["recovery time objective", "How long you can afford to be down before service is restored."],
    "RTT": ["round-trip time", "Time for a message to go to the other side and back."],
    "SHA": ["Secure Hash Algorithm", "A fingerprint function. A git commit SHA is the unique ID of a commit, e.g. a41f2c9."],
    "SLA": ["service level agreement", "A promise to customers about availability or speed, usually with penalties if broken."],
    "SLI": ["service level indicator", "The measurement behind an objective, e.g. 'fraction of requests faster than 300 ms'."],
    "SLO": ["service level objective", "An internal target for an indicator, e.g. '99% of requests under 300 ms over 30 days'. Covered in Level 10."],
    "SPA": ["single-page application", "A frontend (React, Vue...) that loads once and handles navigation in the browser."],
    "SQL": ["Structured Query Language", "The language relational databases like Postgres understand."],
    "SRE": ["site reliability engineer", "An engineer whose job is keeping production systems reliable, often by automating operations."],
    "SSD": ["solid-state drive", "Flash storage with no moving parts; ~100× faster than a spinning disk for random reads."],
    "SSH": ["Secure Shell", "Encrypted remote login to a server's terminal."],
    "TCP": ["Transmission Control Protocol", "Delivers bytes reliably and in order. Needs a handshake (one round trip) before data flows."],
    "TLS": ["Transport Layer Security", "The encryption behind HTTPS. Needs its own handshake after TCP's."],
    "TTL": ["time to live", "How long a cached answer (DNS record, cache entry) may be reused before it must be fetched again."],
    "URL": ["uniform resource locator", "A web address like https://app.example.com/api/notes."],
    "VM": ["virtual machine", "A computer rented from a cloud provider, carved out of a larger physical server."],
    "VPN": ["virtual private network", "An encrypted private network over the internet, e.g. Tailscale or WireGuard."],
    "VU": ["virtual user", "A simulated client in k6. Each VU sends one request at a time and waits for the response."],
    "WAL": ["write-ahead log", "Postgres's journal: every change is written here first. Archiving it enables point-in-time recovery."],
    "ufw": ["Uncomplicated Firewall", "Ubuntu's simple front end to the Linux firewall. Note: Docker-published ports bypass it."],
    "vCPU": ["virtual CPU", "One CPU thread allocated to a cloud VM."],
    "ACK": ["acknowledgement", "A TCP packet confirming that data (or a connection request) was received."],
    "SYN": ["synchronise", "The first packet of a TCP handshake, asking to open a connection."],
    "AOF": ["append-only file", "Redis persistence mode that logs every write so it can be replayed after a restart."],
    "RDB": ["Redis Database file", "Redis persistence mode that saves point-in-time snapshots of all data."],
    "EC2": ["Elastic Compute Cloud", "AWS's virtual machine service."],
    "HTML": ["HyperText Markup Language", "The format of web pages."],
    "JWT": ["JSON Web Token", "A signed, self-contained token carrying claims such as a user ID and an expiry. Level 11 covers when to use it."],
    "L4": ["layer 4 (transport layer)", "In the OSI networking model, the layer of TCP and UDP: addresses and ports, not request contents."],
    "L7": ["layer 7 (application layer)", "In the OSI networking model, the layer of HTTP: paths, headers, cookies."],
    "LB": ["load balancer", "Spreads incoming requests across several servers and skips unhealthy ones."],
    "LFU": ["least frequently used", "An eviction policy that removes the items read the fewest times."],
    "LRU": ["least recently used", "An eviction policy that removes the items not read for the longest time."],
    "MQTT": ["Message Queuing Telemetry Transport", "A lightweight publish/subscribe protocol common in IoT devices."],
    "OOM": ["out of memory", "A process or system has hit its memory limit."],
    "OWASP": ["Open Worldwide Application Security Project", "A non-profit that publishes widely used web security guidance, such as the OWASP Top 10."],
    "RDS": ["Relational Database Service", "AWS's managed database service (Postgres, MySQL and others)."],
    "RFC": ["Request for Comments", "The numbered documents that define internet standards, such as HTTP and TLS."],
    "S3": ["Simple Storage Service", "AWS's object storage. Google Cloud Storage and Azure Blob Storage are the equivalents."],
    "SIGTERM": ["terminate signal", "The polite 'please stop' signal sent to a process (by docker stop, Kubernetes, systemd). Apps should finish in-flight work and exit."],
    "SSL": ["Secure Sockets Layer", "The old name for TLS. People still say 'SSL certificate'."],
    "UDP": ["User Datagram Protocol", "A connectionless transport protocol: no handshake, no delivery guarantee. Used by DNS, video calls, QUIC."],
    "VPC": ["virtual private cloud", "Your own private network inside a cloud provider. Level 11."],
    "VRRP": ["Virtual Router Redundancy Protocol", "Lets a standby machine take over a shared (floating) IP address when the active one fails."],
    "ACID": ["atomicity, consistency, isolation, durability", "The four guarantees of a database transaction: all or nothing, rules hold, concurrent transactions don't interfere (to a chosen degree), and committed data survives crashes."],
    "ANSI": ["American National Standards Institute", "The body that publishes the SQL standard, including its isolation level definitions."],
    "BI": ["business intelligence", "Dashboards and reports for analysing business data."],
    "CRDT": ["conflict-free replicated data type", "A data structure designed so that copies edited independently can always be merged automatically, as in collaborative editors."],
    "DDIA": ["Designing Data-Intensive Applications", "Martin Kleppmann's book (O'Reilly), a standard reference for databases and distributed systems."],
    "JSONB": ["binary JSON", "Postgres's indexed, binary storage format for JSON documents."],
    "LSM": ["log-structured merge-tree", "A storage structure that buffers writes in memory and merges sorted files on disk later. Fast writes; used by Cassandra and RocksDB."],
    "LSN": ["log sequence number", "A position in Postgres's write-ahead log. Comparing LSNs tells you how far a replica is behind."],
    "LWW": ["last write wins", "Conflict resolution that keeps the write with the latest timestamp and silently drops the others."],
    "ORM": ["object-relational mapper", "A library that maps database rows to objects, such as SQLAlchemy or Django's ORM."],
    "SSI": ["serializable snapshot isolation", "How Postgres implements the Serializable level: snapshot isolation plus detection of dangerous read/write patterns."],
    "CAP": ["Consistency, Availability, Partition tolerance", "Brewer's theorem: while the network is partitioned, a replicated system must either refuse some requests (stay consistent) or answer with possibly stale data (stay available)."],
    "CP": ["consistent and partition-tolerant", "A system that, during a partition, refuses requests it cannot answer correctly. etcd, ZooKeeper and a single-primary Postgres behave this way."],
    "AP": ["available and partition-tolerant", "A system that keeps answering during a partition, accepting that replicas may disagree for a while. Cassandra and DynamoDB in their default modes."],
    "PACELC": ["if Partition, Availability or Consistency; Else, Latency or Consistency", "Daniel Abadi's extension of CAP: even with no failure, waiting for more replicas buys consistency at the cost of latency.", null, true],
    "NTP": ["Network Time Protocol", "How servers keep their clocks in sync with reference time sources. Good to milliseconds, never perfect."],
    "UTC": ["Coordinated Universal Time", "The time zone-free reference time. Store and log timestamps in UTC."],
    "UUID": ["universally unique identifier", "A 128-bit ID that can be generated anywhere without coordination. v4 is random; v7 starts with a timestamp so it sorts by creation time.", "universally unique identifiers"],
    "SIGKILL": ["kill signal", "Ends a process immediately; it cannot clean up. What a crash looks like. Sent by docker kill."],
    "SIGINT": ["interrupt signal", "What Ctrl-C sends. Programs usually catch it and exit cleanly."],
    "CDC": ["change data capture", "Reading a database's committed changes (usually from its write-ahead log) and publishing them as events. Debezium is the best-known open-source tool."],
    "DLQ": ["dead-letter queue", "Where messages go after repeated processing failures, with the error attached, so they stop blocking the stream and can be inspected and replayed.", "dead-letter queues"],
    "CQRS": ["Command Query Responsibility Segregation", "Using one model to change data and a different, read-optimised model (often built from events) to query it."],
    "CRUD": ["create, read, update, delete", "The plain way of storing and editing records directly. The right default for most systems."],
    "SQS": ["Simple Queue Service", "AWS's managed message queue."],
    "KIP": ["Kafka Improvement Proposal", "A numbered design document for a change to Apache Kafka, e.g. KIP-848 for the new consumer rebalance protocol.", null, true],
    "REST": ["Representational State Transfer", "The architectural style of the web, as used for APIs: resources at URLs, standard HTTP methods and status codes."],
    "SSE": ["Server-Sent Events", "A browser API and HTTP response format (text/event-stream) for a one-way stream of events from server to browser."],
    "IETF": ["Internet Engineering Task Force", "The body that publishes internet standards as RFCs, including HTTP."],
    "BFF": ["backend-for-frontend", "A thin API layer built for one kind of client (say, the mobile app) that aggregates calls to other services."],
    "RPC": ["remote procedure call", "Calling a function on another machine as if it were local, e.g. with gRPC."],
    "WAF": ["web application firewall", "A filter in front of web apps that blocks common attacks and abusive traffic."],
    "NAT": ["network address translation", "Many machines sharing one public IP address, as in an office or a cloud private network."],
    "p50": ["50th percentile (median)", "Half of requests were faster than this.", null, false],
    "p95": ["95th percentile", "95% of requests were faster; 1 in 20 was slower."],
    "p99": ["99th percentile", "99% of requests were faster; 1 in 100 was slower."]
  };
  const GL_TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const GL_RE = new RegExp("(?<![\\w/.+-])(" + GL_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|") + ")(s?)(?![\\w])", "g");
  const GL_SKIP = "a,.sources,code,pre,svg,h1,h2,h3,h4,abbr,script,style,canvas,textarea,select,.eyebrow,.seg,.readout,.ctl,label,.btn,.pill,.tag,.tab,.copy,summary,.stepnum,.rail,.brand,.hud";
  function annotate(root) {
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(GL_SKIP)) return NodeFilter.FILTER_REJECT;
        GL_RE.lastIndex = 0;
        return GL_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const s = n.nodeValue, frag = document.createDocumentFragment();
      let last = 0, m; GL_RE.lastIndex = 0;
      while ((m = GL_RE.exec(s))) {
        const term = m[1], plural = m[2], g = GLOSSARY[term];
        frag.append(s.slice(last, m.index));
        const ab = document.createElement("abbr"); ab.className = "ab"; ab.dataset.term = term;
        ab.title = g[0] + ": " + g[1]; ab.textContent = term + plural;
        const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
        const alreadyExplained = /\(\s*$/.test(before) || /^\s*\(/.test(after);
        if (!seen.has(term) && !alreadyExplained && !g[3]) {
          const exp = plural ? (g[2] || g[0] + "s") : g[0];
          const sp = document.createElement("span"); sp.className = "abx"; sp.textContent = exp + " (";
          frag.append(sp, ab, Object.assign(document.createElement("span"), { className: "abx", textContent: ")" }));
        } else frag.append(ab);
        seen.add(term);
        last = m.index + m[0].length;
      }
      frag.append(s.slice(last));
      n.replaceWith(frag);
    });
  }
  document.addEventListener("click", e => {
    const a = e.target.closest("abbr.ab");
    if (!a) return;
    const g = GLOSSARY[a.dataset.term]; if (!g) return;
    toast(g[0] + ". " + g[1], a.dataset.term, 6000);
  });
  function renderGlossary() {
    const v = document.getElementById("view-map");
    v.innerHTML = `<button class="back" type="button" id="gback">← Course map</button>
      <div class="eyebrow">Reference</div><h1 style="font-size:clamp(28px,4vw,40px);font-weight:800;font-stretch:118%;margin:6px 0 8px">Glossary</h1>
      <p class="lede" style="margin-top:0">Every abbreviation used in the course. In lessons, each one is spelled out the first time it appears, and you can tap any dotted-underlined term to see its definition.</p>
      <dl class="gl">${Object.keys(GLOSSARY).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(k => `<dt>${k}</dt><dd><b>${GLOSSARY[k][0]}</b>. ${GLOSSARY[k][1]}</dd>`).join("")}</dl>`;
    v.querySelector("#gback").onclick = () => go("map");
  }

  const modules = {};
  let state = blank();
  let db = null, uid = null, saving = false, saveAgain = false, saveTimer = null;
  const LS = "production-line-progress-v1";

  function blank() { return { v: 1, earned: {}, done: {}, exam: {}, labs: {}, badges: {}, lastHash: "" }; }

  /* ---------- persistence ---------- */
  function loadLocal() {
    try { const raw = localStorage.getItem(LS); if (raw) state = Object.assign(blank(), JSON.parse(raw)); } catch (e) {}
  }
  function merge(remote) {
    if (!remote || typeof remote !== "object") return;
    ["earned", "done", "labs", "badges"].forEach(k => { state[k] = Object.assign({}, remote[k] || {}, state[k]); });
    const ex = remote.exam || {};
    Object.keys(ex).forEach(l => {
      const mine = state.exam[l] || { answers: {}, best: 0 };
      state.exam[l] = { answers: Object.assign({}, ex[l].answers || {}, mine.answers || {}), best: Math.max(ex[l].best || 0, mine.best || 0) };
    });
  }
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
    if (!db || !uid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 900);
  }
  async function flush() {
    if (saving) { saveAgain = true; return; }
    saving = true;
    try {
      await db.doc("data/users/" + uid + "/progress").set(JSON.parse(JSON.stringify(state)));
      setSync("Saved to your account");
    } catch (e) {
      setSync("Saved on this device");
    }
    saving = false;
    if (saveAgain) { saveAgain = false; flush(); }
  }
  function setSync(t) { const s = document.getElementById("sync"); if (s) s.textContent = t; }
  async function connectDb() {
    if (!window.claude || !window.claude.use) return;
    try {
      const [d, u] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!d || !u) return;
      const id = await u.id();
      if (!id) return;
      db = d; uid = id;
      const snap = await db.doc("data/users/" + uid + "/progress").get();
      if (snap.exists) { merge(snap.data()); try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} route(); }
      setSync("Saved to your account");
      save();
    } catch (e) { db = null; }
  }

  /* ---------- progress file: move progress between copies (online artifact, downloaded copy) ---------- */
  const PFILE = "production-line-progress.json";
  function progressPanel() {
    const btn = document.getElementById("progbtn");
    const pop = H.el(`<div class="progpop" id="progpop" role="dialog" aria-label="Progress file" hidden>
      <h4>Progress file</h4>
      <p>Move your progress between copies of the course, such as this page and a downloaded copy. Importing merges: lessons, lab steps and badges from both are kept, and each exam keeps its best score.</p>
      <div class="row">
        <button class="btn primary" type="button" data-act="export">Export progress</button>
        <button class="btn" type="button" data-act="import">Import progress</button>
        <input type="file" accept=".json,application/json" hidden>
      </div>
      <details><summary>Copy or paste the file's contents instead</summary>
        <textarea spellcheck="false" aria-label="Progress file contents"></textarea>
        <div class="row"><button class="btn" type="button" data-act="copyout">Show my progress here</button><button class="btn" type="button" data-act="pastein">Import from this box</button></div>
      </details>
      <div class="pmsg" role="status"></div>
    </div>`);
    btn.closest(".topbar-in").appendChild(pop);
    const msg = pop.querySelector(".pmsg"), box = pop.querySelector("textarea"), file = pop.querySelector("input[type=file]");
    const say = (t, cls) => { msg.textContent = t; msg.className = "pmsg" + (cls ? " " + cls : ""); };
    const open = on => { pop.hidden = !on; btn.setAttribute("aria-expanded", on ? "true" : "false"); if (!on) say(""); };
    const dump = () => JSON.stringify(Object.assign({ app: "production-line", exported: new Date().toISOString() }, state), null, 2);
    const n = (k, w) => k + " " + w + (k === 1 ? "" : "s");
    const summary = () => `${n(Object.keys(state.done).length, "lesson")}, ${n(Object.keys(state.labs).length, "lab step")}, ${xp().toLocaleString()} XP`;
    function importText(text) {
      let data;
      try { data = JSON.parse(text); } catch (e) { say("That is not a progress file: it could not be read as JSON.", "bad"); return; }
      if (!data || typeof data !== "object" || !["earned", "done", "exam", "labs", "badges"].some(k => data[k] && typeof data[k] === "object")) {
        say("That file has no course progress in it.", "bad"); return;
      }
      merge(data); save(); hud(); route();
      say("Imported and merged. You now have " + summary() + ".", "ok");
      toast("Progress imported", "Merged");
    }
    async function exportFile() {
      const text = dump();
      let dl = null;
      try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({ filename: PFILE, data: text }); say("Saved " + PFILE + " (" + summary() + ").", "ok"); return; }
        catch (e) {
          if (e && e.code === "declined") { say("Download cancelled."); return; }
          if (e && e.code === "rate_limited") { say("A download prompt is already open."); return; }
        }
      }
      try {   // a downloaded copy opened from disk: an ordinary browser download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = PFILE; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say("Downloaded " + PFILE + ". If no file appeared, use the box below.", "ok");
      } catch (e) {
        pop.querySelector("details").open = true; box.value = text; box.select();
        say("Downloads are not available here: copy the text in the box and save it as " + PFILE + ".", "bad");
      }
    }
    btn.onclick = e => { e.stopPropagation(); open(pop.hidden); };
    pop.onclick = e => {
      e.stopPropagation();
      const act = e.target.closest("[data-act]"); if (!act) return;
      const a = act.dataset.act;
      if (a === "export") exportFile();
      if (a === "import") file.click();
      if (a === "copyout") { box.value = dump(); box.select(); say("Copy this text and paste it into the same box in the other copy.", "ok"); }
      if (a === "pastein") { if (box.value.trim()) importText(box.value); else say("Paste the contents of a progress file into the box first.", "bad"); }
    };
    file.onchange = () => {
      const f = file.files && file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => importText(String(r.result));
      r.onerror = () => say("The file could not be read. Paste its contents into the box below instead.", "bad");
      r.readAsText(f); file.value = "";
    };
    document.addEventListener("click", () => { if (!pop.hidden) open(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
  }

  /* ---------- XP & badges ---------- */
  function xp() { return Object.values(state.earned).reduce((a, b) => a + b, 0); }
  function rankFor(x) { let r = RANKS[0], next = null; for (let i = 0; i < RANKS.length; i++) { if (x >= RANKS[i][0]) { r = RANKS[i]; next = RANKS[i + 1] || null; } } return { name: r[1], from: r[0], next }; }
  function hud() {
    const x = xp(), r = rankFor(x);
    document.getElementById("xpnum").textContent = x.toLocaleString() + " XP";
    document.getElementById("rankname").textContent = r.name;
    const pct = r.next ? ((x - r.from) / (r.next[0] - r.from)) * 100 : 100;
    document.getElementById("xpfill").style.width = Math.max(2, Math.min(100, pct)) + "%";
  }
  function earn(key, amount, label) {
    if (state.earned[key]) return false;
    const before = rankFor(xp()).name;
    state.earned[key] = amount;
    toast(label || "Progress", "+" + amount + " XP");
    const after = rankFor(xp()).name;
    if (after !== before) setTimeout(() => toast("Promoted to " + after, "Rank up"), 600);
    save(); hud();
    return true;
  }
  function unearn(key) { if (state.earned[key]) { delete state.earned[key]; save(); hud(); } }
  function award(id) {
    if (state.badges[id]) return;
    state.badges[id] = Date.now();
    const b = BADGES.find(b => b.id === id);
    earn("badge:" + id, 100, "Badge: " + (b ? b.name : id));
  }
  function toast(text, pill, ms) {
    const t = document.createElement("div"); t.className = "toast";
    t.innerHTML = (pill ? '<span class="pill"></span>' : "") + "<span></span>";
    if (pill) t.firstChild.textContent = pill;
    t.lastChild.textContent = text;
    document.getElementById("toasts").appendChild(t);
    setTimeout(() => t.remove(), ms || 3200);
  }

  /* ---------- helpers for lesson authors ---------- */
  const H = {
    el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; },
    add(root, html) { const e = H.el(html); root.appendChild(e); return e; },
    panel(root, title, tag) {
      return H.add(root, `<div class="panel"><div class="panel-t"><h3>${title}</h3>${tag ? `<span class="tag">${tag}</span>` : ""}</div><div class="panel-b"></div></div>`).querySelector(".panel-b");
    },
    keys(root, items) {
      H.add(root, `<div class="keys">${items.map(([t, d]) => `<div class="key"><b>${t}</b>${d}</div>`).join("")}</div>`);
    },
    yourApp(root, title, text) {
      H.add(root, `<div class="yourapp"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="2" y="3" width="18" height="12" rx="2" fill="none" stroke="var(--xp)" stroke-width="2"/><path d="M7 19h8M11 15v4" stroke="var(--xp)" stroke-width="2"/></svg><div><b>${title}</b><p>${text}</p></div></div>`);
    },
    prose(root, html) { H.add(root, `<div class="prose">${html}</div>`); },
    code(text, hl) {
      const lines = text.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
      const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const body = lines.map((l, i) => {
        let h = esc(l).replace(/(^|\s)(#.*)$/, '$1<span class="c">$2</span>');
        return (hl && hl.includes(i + 1)) ? `<span class="hl">${h}</span>` : h;
      }).join("\n");
      return `<div class="codebox"><pre class="code">${body}</pre><button class="copy" type="button" data-copy>Copy</button></div>`;
    },
    svg(tag, attrs, parent) {
      const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    },
    fmtMs(ms) {
      if (ms < 0.001) return (ms * 1e6).toFixed(0) + " ns";
      if (ms < 1) return (ms * 1000).toFixed(ms < 0.01 ? 1 : 0) + " µs";
      if (ms < 1000) return (ms < 10 ? ms.toFixed(1) : ms.toFixed(0)) + " ms";
      return (ms / 1000).toFixed(1) + " s";
    },
    fmtNum(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e4) return (n / 1e3).toFixed(0) + "k";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
      return n < 10 ? n.toFixed(1) : Math.round(n).toString();
    },
    fmtBytes(b) {
      const u = ["B", "KB", "MB", "GB", "TB", "PB"]; let i = 0;
      while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
      return (b < 10 ? b.toFixed(1) : Math.round(b)) + " " + u[i];
    },
    earn, award, toast,
    flag(key) { return !!state.earned[key]; }
  };

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const pre = b.parentElement.querySelector("pre");
    const text = pre.innerText;
    const done = () => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1400); };
    try {
      navigator.clipboard.writeText(text).then(done, () => selectText(pre));
    } catch (err) { selectText(pre); }
  });
  function selectText(node) { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* Options are shown in a fresh random order each time, so position never hints at the answer. */
  function shuffled(n) {
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- checkpoint (lesson completion) ---------- */
  function checkpoint(root, lesson, level, onNext) {
    const c = lesson.check;
    const done = !!state.done[lesson.id];
    const box = H.add(root, `<div class="check"><h3><span class="tag">Checkpoint</span> ${done ? '<span class="pill ok">Completed</span>' : '<span class="pill">+50 XP</span>'}</h3><div class="q"></div><div class="opts"></div><div class="explain" hidden></div></div>`);
    box.querySelector(".q").textContent = c.q;
    const opts = box.querySelector(".opts"), ex = box.querySelector(".explain");
    let tries = 0;
    shuffled(c.opts.length).forEach((i, pos) => {
      const o = c.opts[i];
      const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.dataset.i = i;
      b.innerHTML = `<span class="ltr">${"ABCD"[pos]}</span><span></span>`; b.lastChild.textContent = o;
      b.addEventListener("click", () => {
        tries++;
        if (i === c.a) {
          b.classList.add("right");
          opts.querySelectorAll(".opt").forEach(x => (x.disabled = true));
          ex.hidden = false; ex.className = "explain callout good"; ex.textContent = c.why;
          if (!state.done[lesson.id]) {
            state.done[lesson.id] = true;
            earn("lesson:" + lesson.id, tries === 1 ? 50 : 30, "Lesson complete: " + lesson.title);
            award("first-packet");
            box.querySelector("h3 .pill").className = "pill ok"; box.querySelector("h3 .pill").textContent = "Completed";
            renderRail();
          }
        } else {
          b.classList.add("wrong"); b.disabled = true;
          ex.hidden = false; ex.className = "explain callout bad"; ex.textContent = (c.hints && c.hints[i]) || "Not quite. Look back at the interactive above and try another option.";
        }
      });
      opts.appendChild(b);
    });
    if (done) {
      const b = opts.querySelector(`.opt[data-i="${c.a}"]`); b.classList.add("right");
      ex.hidden = false; ex.className = "explain callout good"; ex.textContent = c.why;
    }
    const idx = level.lessons.indexOf(lesson);
    const nb = H.add(root, `<div class="nextbar"></div>`);
    if (idx > 0) { const p = H.el(`<button class="btn" type="button">← ${level.lessons[idx - 1].title}</button>`); p.onclick = () => go(`level-${level.id}-l${idx}`); nb.appendChild(p); } else nb.appendChild(document.createElement("span"));
    const nxt = idx < level.lessons.length - 1
      ? H.el(`<button class="btn primary" type="button">Next: ${level.lessons[idx + 1].title} →</button>`)
      : H.el(`<button class="btn primary" type="button">On to the lab →</button>`);
    nxt.onclick = () => go(idx < level.lessons.length - 1 ? `level-${level.id}-l${idx + 2}` : `level-${level.id}-lab`);
    nb.appendChild(nxt);
  }

  /* ---------- map view ---------- */
  function levelProgress(id) {
    const m = modules[id];
    if (!m) return null;
    const total = m.lessons.length, done = m.lessons.filter(l => state.done[l.id]).length;
    const steps = m.lab ? m.lab.steps.length : 0, sdone = m.lab ? m.lab.steps.filter(s => state.labs[s.id]).length : 0;
    const ex = state.exam["l" + id];
    return { total, done, steps, sdone, best: ex ? ex.best : 0, complete: done === total && ex && ex.best >= 0.8 };
  }
  function trackColor(t) { return t === "data" ? "var(--data)" : t === "compute" ? "var(--compute)" : "var(--ink)"; }

  function renderMap() {
    const v = document.getElementById("view-map");
    const totalLessons = Object.values(modules).reduce((a, m) => a + m.lessons.length, 0);
    const doneLessons = Object.keys(state.done).length;
    const labSteps = Object.keys(state.labs).filter(k => state.labs[k]).length;
    const next = nextUp();
    v.innerHTML = `
      <div class="map-hero">
        <div>
          <div class="eyebrow">A system design course · 13 stations · ~4 months at 8 h/week</div>
          <h1>From one VM to millions of users</h1>
          <p>Each station is a level. Ride the teal line to learn how to run and scale the compute side, and the violet line for data. Lessons are interactive, labs are real FastAPI and Postgres systems you run yourself.</p>
        </div>
        <div>
          <div class="stats">
            <div class="stat"><div class="k">Lessons done</div><div class="v">${doneLessons}/${totalLessons}</div></div>
            <div class="stat"><div class="k">Lab steps</div><div class="v">${labSteps}</div></div>
            <div class="stat"><div class="k">Badges</div><div class="v">${Object.keys(state.badges).length}/${BADGES.length}</div></div>
          </div>
          <div style="margin-top:10px"><button class="btn primary" id="resume" type="button">${next.label} →</button></div>
        </div>
      </div>
      <div class="mapcard"><div class="mapsvg"></div>
        <div class="legend">
          <span><i style="background:var(--compute)"></i>Compute line: servers, traffic, operations</span>
          <span><i style="background:var(--data)"></i>Data line: storage and distributed systems</span>
          <span><svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="var(--faint)" stroke-width="3" stroke-dasharray="3 3"/></svg>Under construction</span>
        </div>
      </div>
      <div class="section-h"><h2>How each station works</h2><p>Follow the numbers; the lines show which part of the system a level is about.</p></div>
      <div class="howto">
        <div><b>See it</b>Every lesson is built around something you can operate: sliders, simulations, things to break.</div>
        <div><b>Check it</b>A checkpoint question ends each lesson. Get it right first time for full XP.</div>
        <div><b>Build it</b>The lab is the real thing: Docker Compose, FastAPI and Postgres, with expected results to compare against.</div>
        <div><b>Prove it</b>The level exam unlocks the station badge at 80%.</div>
      </div>
      <div class="section-h"><h2>Badges</h2><p>${Object.keys(state.badges).length} of ${BADGES.length} earned</p></div>
      <div class="badges">${BADGES.map(b => `<div class="badge ${state.badges[b.id] ? "got" : ""}"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="none" stroke="${state.badges[b.id] ? "var(--xp)" : "var(--line-strong)"}" stroke-width="4"/><rect x="2" y="11.5" width="24" height="5" rx="1" fill="${state.badges[b.id] ? "var(--xp)" : "var(--line-strong)"}"/></svg><div><b>${b.name}</b>${b.desc}</div></div>`).join("")}</div>`;
    v.querySelector("#resume").onclick = () => go(next.hash);
    drawMap(v.querySelector(".mapsvg"), next.level);
    annotate(v.querySelector(".map-hero"));
  }
  function nextUp() {
    for (const L of LEVELS) {
      const m = modules[L.id]; if (!m) continue;
      const i = m.lessons.findIndex(l => !state.done[l.id]);
      if (i >= 0) return { hash: `level-${L.id}-l${i + 1}`, label: (Object.keys(state.done).length ? "Continue: " : "Start: ") + m.lessons[i].title, level: L.id };
      const ex = state.exam["l" + L.id];
      if (!ex || ex.best < 0.8) {
        const s = m.lab.steps.findIndex(s => !state.labs[s.id]);
        if (s >= 0) return { hash: `level-${L.id}-lab`, label: `Continue the Level ${L.id} lab`, level: L.id };
        return { hash: `level-${L.id}-exam`, label: `Take the Level ${L.id} exam`, level: L.id };
      }
    }
    return { hash: "level-1", label: "Review Level 1", level: 1 };
  }
  function drawMap(host, current) {
    const s = H.svg("svg", { viewBox: "0 0 1110 400", role: "img", "aria-label": "Course map with 13 levels on two lines" });
    const g = (a) => H.svg("g", a || {}, s);
    const lines = g();
    H.svg("path", { d: "M70 210 L150 110 L960 110 L1040 210", fill: "none", stroke: "var(--compute)", "stroke-width": 12, "stroke-linejoin": "round", "stroke-linecap": "round" }, lines);
    H.svg("path", { d: "M70 210 L150 310 L960 310 L1040 210", fill: "none", stroke: "var(--data)", "stroke-width": 12, "stroke-linejoin": "round", "stroke-linecap": "round" }, lines);
    const lt = (x, y, t, c) => { const e = H.svg("text", { x, y, "text-anchor": "middle", "font-size": 11, fill: c, "font-weight": 600, "letter-spacing": ".08em" }, s); e.textContent = t; };
    lt(560, 136, "COMPUTE LINE", "var(--compute)"); lt(445, 292, "DATA LINE", "var(--data)");
    LEVELS.forEach(L => {
      const ready = !!modules[L.id];
      const p = levelProgress(L.id);
      const st = g({ class: "station", tabindex: 0, role: "link", "aria-label": `Level ${L.id}: ${L.title}${ready ? "" : " (under construction)"}` });
      const col = trackColor(L.track);
      const big = L.track === "core";
      const r = big ? 20 : 15;
      if (L.id === current) {
        const halo = H.svg("circle", { cx: L.x, cy: L.y, r: r + 9, fill: "none", stroke: "var(--signal)", "stroke-width": 2.5, class: "halo" }, st);
        H.svg("animate", { attributeName: "r", values: `${r + 6};${r + 12};${r + 6}`, dur: "2.4s", repeatCount: "indefinite" }, halo);
        H.svg("animate", { attributeName: "opacity", values: "1;.35;1", dur: "2.4s", repeatCount: "indefinite" }, halo);
      }
      const filled = p && p.complete;
      if (big) {
        H.svg("circle", { cx: L.x, cy: L.y, r: r + 4, fill: "var(--compute)" }, st);
        H.svg("path", { d: `M${L.x - r - 4} ${L.y} A ${r + 4} ${r + 4} 0 0 0 ${L.x + r + 4} ${L.y} Z`, fill: "var(--data)" }, st);
        H.svg("circle", { cx: L.x, cy: L.y, r: r - 2, fill: filled ? "var(--ink)" : "var(--surface)", class: "ring", stroke: ready ? "var(--ink)" : "var(--faint)", "stroke-width": 3, "stroke-dasharray": ready ? "" : "4 4" }, st);
      } else {
        H.svg("circle", { cx: L.x, cy: L.y, r, fill: filled ? col : "var(--surface)", stroke: ready ? col : "var(--faint)", "stroke-width": 5, class: "ring", "stroke-dasharray": ready ? "" : "5 4" }, st);
      }
      const n = H.svg("text", { x: L.x, y: L.y + 4.5, "text-anchor": "middle", class: "st-num", fill: filled ? "var(--surface)" : (ready ? "var(--ink)" : "var(--faint)") }, st);
      n.textContent = L.id;
      const above = L.track === "compute";
      let ty = above ? L.y - 46 : L.y + 40, tx = L.x, anc = "middle";
      if (big) { ty = L.y - 3; tx = L.id === 0 ? L.x + 34 : L.x - 34; anc = L.id === 0 ? "start" : "end"; }
      const t1 = H.svg("text", { x: tx, y: ty, "text-anchor": anc, "font-size": 13.5, "font-weight": 600, fill: ready ? "var(--ink)" : "var(--muted)" }, st);
      t1.textContent = L.title;
      const t2 = H.svg("text", { x: tx, y: ty + 16, "text-anchor": anc, "font-size": 11.5, fill: "var(--muted)" }, st);
      t2.textContent = ready ? (p.done + "/" + p.total + " lessons" + (p.complete ? " · cleared" : "")) : "Under construction";
      const open = () => go("level-" + L.id);
      st.addEventListener("click", open);
      st.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    host.appendChild(s);
  }

  /* ---------- level view ---------- */
  let cur = { level: null, tab: "lessons", lesson: 0 };
  function roundel(L, size) {
    const col = trackColor(L.track);
    return `<svg class="roundel" viewBox="0 0 64 64" aria-hidden="true" style="width:${size}px;height:${size}px"><circle cx="32" cy="32" r="24" fill="none" stroke="${L.track === "core" ? "var(--ink)" : col}" stroke-width="9"/><rect x="2" y="25" width="60" height="14" rx="2" fill="${L.track === "core" ? "var(--data)" : col}"/><text x="32" y="36.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Archivo, sans-serif">LEVEL ${L.id}</text></svg>`;
  }
  function renderLevel() {
    const v = document.getElementById("view-level");
    const L = LEVELS[cur.level], m = modules[cur.level];
    const col = trackColor(L.track);
    v.style.setProperty("--trk", L.track === "core" ? "var(--compute)" : col);
    if (!m) {
      v.innerHTML = `<button class="back" type="button" id="back">← Course map</button>
        <div class="soon">${roundel(L, 80)}<h2>Level ${L.id}: ${L.title}</h2><p>This station is still being built. Here is what it will cover:</p>
        <ul>${(PLANNED[L.id] || []).map(x => `<li>${x}</li>`).join("")}</ul>
        <p class="note">New levels are added over time.</p></div>`;
      v.querySelector("#back").onclick = () => go("map");
      return;
    }
    const p = levelProgress(L.id);
    v.innerHTML = `<button class="back" type="button" id="back">← Course map</button>
      <div class="lvl-head">${roundel(L, 64)}<div><h1>${L.title}</h1><p>${m.blurb}</p></div></div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="lessons" aria-selected="${cur.tab === "lessons"}">Lessons <span class="pill ${p.done === p.total ? "ok" : ""}">${p.done}/${p.total}</span></button>
        <button class="tab" role="tab" data-tab="lab" aria-selected="${cur.tab === "lab"}">Lab <span class="pill ${p.sdone === p.steps ? "ok" : ""}">${p.sdone}/${p.steps}</span></button>
        <button class="tab" role="tab" data-tab="exam" aria-selected="${cur.tab === "exam"}">Level exam <span class="pill ${p.best >= 0.8 ? "ok" : ""}">${Math.round(p.best * 100)}%</span></button>
      </div>
      <div id="tabbody"></div>`;
    v.querySelector("#back").onclick = () => go("map");
    v.querySelectorAll(".tab").forEach(t => t.onclick = () => go(`level-${L.id}${t.dataset.tab === "lessons" ? "-l" + (cur.lesson + 1) : "-" + t.dataset.tab}`));
    const body = v.querySelector("#tabbody");
    if (cur.tab === "lessons") renderLessons(body, m);
    else if (cur.tab === "lab") renderLab(body, m);
    else renderExam(body, m);
  }
  function renderLessons(body, m) {
    body.innerHTML = `<div class="lvl-grid"><nav class="rail" aria-label="Lessons"><ol></ol></nav><article class="lesson"></article></div>`;
    renderRail();
    const lesson = m.lessons[cur.lesson];
    const art = body.querySelector(".lesson");
    H.add(art, `<header class="lesson-h"><div class="eyebrow">Lesson ${lesson.id} · ${lesson.minutes} min</div><h2>${lesson.title}</h2><p class="lede">${lesson.lede}</p></header>`);
    lesson.render(art, H);
    if (lesson.sources && lesson.sources.length) {
      H.add(art, `<aside class="sources"><h3>Sources and further reading</h3><ul>${lesson.sources.map(([t, u, n]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a>${n ? ` <span class="src-n">${n}</span>` : ""}</li>`).join("")}</ul></aside>`);
    }
    checkpoint(art, lesson, m, null);
    annotate(art);
  }
  function renderRail() {
    const m = modules[cur.level]; const ol = document.querySelector(".rail ol"); if (!ol || !m) return;
    ol.innerHTML = "";
    m.lessons.forEach((l, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" class="${state.done[l.id] ? "done" : ""} ${i === cur.lesson ? "cur" : ""}" ${i === cur.lesson ? 'aria-current="step"' : ""}><span class="dot"></span><span><span class="rl-t"></span><span class="rl-m">${l.id} · ${l.minutes} min</span></span></button>`;
      li.querySelector(".rl-t").textContent = l.title;
      li.firstChild.onclick = () => go(`level-${m.id}-l${i + 1}`);
      ol.appendChild(li);
    });
    const tab = document.querySelector('.tab[data-tab="lessons"] .pill');
    if (tab) { const p = levelProgress(m.id); tab.textContent = p.done + "/" + p.total; tab.className = "pill " + (p.done === p.total ? "ok" : ""); }
  }

  function renderLab(body, m) {
    const lab = m.lab;
    body.innerHTML = `<div class="lab-intro"><div class="prose"><div class="eyebrow">Lab · ${lab.time}</div><h2 style="font-size:28px;margin:6px 0 10px">${lab.title}</h2>${lab.intro}</div>
      <dl class="lab-meta"><dt>You will need</dt><dd>${lab.needs}</dd><dt>Files</dt><dd><code>${lab.folder}</code> in the labs download from our chat</dd><dt>Reward</dt><dd>25 XP per step, a badge for finishing</dd></dl></div>
      <div class="panel" style="margin-top:18px"><div class="steps"></div></div>
      ${lab.vmChecks ? `<div class="panel vmcheck"><div class="panel-t"><h3>Check on your VM</h3><span class="tag" style="background:var(--xp-soft);color:var(--xp)">Read-only</span></div><p class="note" style="margin-top:0">${lab.vmIntro || "These commands only look; none of them changes anything. Run them on your production VM to confirm it follows this level's practices."}</p><div class="vmlist">${lab.vmChecks.map(([what, cmd, good]) => `<div class="vmrow"><b>${what}</b>${cmd ? H.code(cmd) : ""}<div class="vmgood"><span>Good looks like:</span> ${good}</div></div>`).join("")}</div></div>` : ""}`;
    const host = body.querySelector(".steps");
    lab.steps.forEach((s, i) => {
      const row = H.add(host, `<div class="step"><div><button class="stepbox" type="button" role="checkbox" aria-checked="${!!state.labs[s.id]}" aria-label="Mark step ${i + 1} done"></button></div>
        <div style="min-width:0"><div class="stepnum">Step ${i + 1} of ${lab.steps.length}</div><h4>${s.title}</h4>${s.why ? `<p class="why"><b>Why:</b> ${s.why}</p>` : ""}${s.body}${s.expect ? `<div class="expect"><b>Expected:</b> ${s.expect}</div>` : ""}${s.solution ? `<details class="sol"><summary>Worked solution and how to read it</summary><div class="sol-body">${s.solution}</div></details>` : ""}</div></div>`);
      row.querySelector(".stepbox").onclick = (e) => {
        const on = !state.labs[s.id];
        state.labs[s.id] = on; e.currentTarget.setAttribute("aria-checked", on);
        if (on) earn("lab:" + s.id, 25, "Lab step: " + s.title); else unearn("lab:" + s.id);
        if (lab.steps.every(x => state.labs[x.id])) award("lab-rat");
        save();
        const p = levelProgress(m.id); const pill = document.querySelector('.tab[data-tab="lab"] .pill');
        if (pill) { pill.textContent = p.sdone + "/" + p.steps; pill.className = "pill " + (p.sdone === p.steps ? "ok" : ""); }
      };
    });
    annotate(body);
  }

  function renderExam(body, m) {
    renderExamInner(body, m);
    annotate(body);
  }
  function renderExamInner(body, m) {
    const key = "l" + m.id;
    const ex = state.exam[key] || (state.exam[key] = { answers: {}, best: 0 });
    body.innerHTML = `<div class="prose"><p class="lede" style="margin-top:0">${m.exam.length} questions mixing everything in this level. Score 80% to clear the station and earn its badge. Each correct answer is worth 20 XP the first time.</p></div><div class="examq"></div><div class="panel" id="score"></div>`;
    const host = body.querySelector(".examq");
    const live = {};
    const score = () => {
      const answered = Object.keys(live).length;
      const right = Object.values(live).filter(Boolean).length;
      const pct = right / m.exam.length;
      const sc = body.querySelector("#score");
      sc.innerHTML = `<div class="panel-t"><h3>Score: ${right} / ${m.exam.length} (${Math.round(pct * 100)}%)</h3><span class="pill ${ex.best >= 0.8 ? "ok" : ""}">Best ${Math.round(ex.best * 100)}%</span></div>
        <p class="note">${answered < m.exam.length ? `${m.exam.length - answered} still to answer.` : pct >= 0.8 ? "Station cleared. Head back to the map for the next level." : "Below 80%. Review the lessons for the ones you missed, then retake."}</p>
        <button class="btn" type="button" id="retake">Retake exam</button>`;
      sc.querySelector("#retake").onclick = () => { renderExam(body, m); };
      if (answered === m.exam.length) {
        if (pct > ex.best) { ex.best = pct; save(); }
        if (pct >= 0.8) award(m.examBadge);
        if (pct === 1) award("perfect");
        const pill = document.querySelector('.tab[data-tab="exam"] .pill');
        if (pill) { pill.textContent = Math.round(ex.best * 100) + "%"; pill.className = "pill " + (ex.best >= 0.8 ? "ok" : ""); }
      }
    };
    m.exam.forEach((q, qi) => {
      const box = H.add(host, `<div class="check" style="border-width:1px;border-color:var(--line)"><h3><span class="stepnum">Question ${qi + 1}</span></h3><div class="q"></div><div class="opts"></div><div class="explain" hidden></div></div>`);
      box.querySelector(".q").textContent = q.q;
      const opts = box.querySelector(".opts"), exb = box.querySelector(".explain");
      shuffled(q.opts.length).forEach((i, pos) => {
        const o = q.opts[i];
        const b = document.createElement("button"); b.type = "button"; b.className = "opt"; b.dataset.i = i;
        b.innerHTML = `<span class="ltr">${"ABCD"[pos]}</span><span></span>`; b.lastChild.textContent = o;
        b.onclick = () => {
          const ok = i === q.a; live[qi] = ok;
          opts.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (+x.dataset.i === q.a) x.classList.add("right"); });
          if (!ok) b.classList.add("wrong");
          exb.hidden = false; exb.className = "explain callout " + (ok ? "good" : "bad"); exb.textContent = q.why;
          if (ok) earn(`exam:${m.id}:${qi}`, 20, "Exam question " + (qi + 1));
          score();
        };
        opts.appendChild(b);
      });
    });
    score();
  }

  /* ---------- router ---------- */
  function go(hash) { if (location.hash.slice(1) === hash) route(); else location.hash = hash; }
  function route() {
    const h = location.hash.slice(1) || "map";
    const vm = document.getElementById("view-map"), vl = document.getElementById("view-level");
    const mm = h.match(/^level-(\d+)(?:-(l(\d+)|lab|exam))?$/);
    if (mm && LEVELS[+mm[1]]) {
      const id = +mm[1];
      if (cur.level !== id) cur.lesson = 0;
      cur.level = id;
      if (!mm[2]) { cur.tab = "lessons"; const m = modules[id]; if (m) { const i = m.lessons.findIndex(l => !state.done[l.id]); cur.lesson = i < 0 ? 0 : i; } }
      else if (mm[3]) { cur.tab = "lessons"; const m = modules[id]; cur.lesson = Math.max(0, Math.min((m ? m.lessons.length : 1) - 1, +mm[3] - 1)); }
      else cur.tab = mm[2];
      vm.hidden = true; vl.hidden = false; renderLevel();
    } else if (h === "glossary") {
      vl.hidden = true; vm.hidden = false; renderGlossary();
    } else {
      vl.hidden = true; vm.hidden = false; renderMap();
    }
    hud();
    window.scrollTo(0, 0);
  }

  window.Course = {
    register(m) { modules[m.id] = m; },
    H,
    start() {
      loadLocal();
      document.getElementById("home").onclick = () => go("map");
      document.getElementById("glossbtn").onclick = () => go("glossary");
      progressPanel();
      window.addEventListener("hashchange", route);
      route();
      connectDb();
    }
  };
})();
