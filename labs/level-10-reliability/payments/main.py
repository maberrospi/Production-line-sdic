"""payments: the dependency that checkout calls. Fast and healthy unless you break it.

POST /charge          {"order_id", "amount_cents"}: about 15 ms of work, then 200 (or 500 at the error rate)
GET  /stats           calls received and distinct orders charged since the last reset
POST /admin/faults    {"error_rate": 0.1}: answer 500 to this share of charges
POST /admin/reset     zero the counters

Latency and broken connections are added outside this service, by Toxiproxy, the way a slow
network or an overloaded host would look. Error responses are added here.
"""
import asyncio
import random

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_client import Counter, make_asgi_app

import tracing

app = FastAPI()
tracing.setup(app)

CALLS = Counter("payments_charges_total", "Charge requests received", ["result"])
state = {"error_rate": 0.0, "calls": 0, "errors": 0, "orders": set()}


@app.post("/charge")
async def charge(request: Request):
    body = await request.json()
    state["calls"] += 1
    state["orders"].add(body["order_id"])
    await asyncio.sleep(0.015)                     # talk to the card network
    if random.random() < state["error_rate"]:
        state["errors"] += 1
        CALLS.labels("error").inc()
        return JSONResponse({"error": "card network unavailable"}, status_code=500)
    CALLS.labels("ok").inc()
    return {"status": "charged", "order_id": body["order_id"]}


@app.get("/stats")
async def stats():
    return {"calls": state["calls"], "errors": state["errors"], "distinct_orders": len(state["orders"]),
            "error_rate": state["error_rate"]}


@app.post("/admin/faults")
async def faults(request: Request):
    state["error_rate"] = float((await request.json())["error_rate"])
    return {"error_rate": state["error_rate"]}


@app.post("/admin/reset")
async def reset():
    state.update(calls=0, errors=0, orders=set())
    return {"reset": True}


@app.get("/health")
async def health():
    return {"ok": True}


app.mount("/metrics", make_asgi_app())
