"""Part C: register (or update) the Debezium outbox connector with Kafka Connect's REST API."""
import json
import os
import time

import httpx

CONNECT = os.environ.get("CONNECT_URL", "http://connect:8083")
config = json.load(open("/connect/outbox-connector.json"))
r = httpx.put(f"{CONNECT}/connectors/orders-outbox/config", json=config, timeout=30)
print(f"PUT /connectors/orders-outbox/config -> {r.status_code}")
if r.status_code >= 300:
    raise SystemExit(r.text)
for _ in range(30):
    s = httpx.get(f"{CONNECT}/connectors/orders-outbox/status", timeout=10).json()
    tasks = s.get("tasks", [])
    if s["connector"]["state"] == "RUNNING" and tasks and tasks[0]["state"] == "RUNNING":
        break
    time.sleep(1)
print(f"connector orders-outbox: {s['connector']['state']}, " + ", ".join(f"task {t['id']}: {t['state']}" for t in tasks))
for t in tasks:
    if t.get("trace"):
        print(t["trace"].splitlines()[0])
