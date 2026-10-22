"""checkout: takes an order, charges it through payments, and answers the user.

POST /checkout   {"order_id", "amount_cents", "country"}; header X-Policy picks how payments is called:
    none     one call, no timeout (what many HTTP clients do by default)
    timeout  one call, 300 ms timeout
    retry    300 ms timeout, up to 3 immediate retries
    backoff  300 ms timeout, up to 3 retries with exponential backoff and full jitter,
             and a retry budget: retries may be at most 10% of recent requests
    breaker  300 ms timeout, one call, through a circuit breaker
GET  /fast       does nothing, but like every `def` endpoint it needs one of the 40 worker threads
GET  /metrics    Prometheus metrics (an async endpoint: it never waits for a worker thread)

FastAPI runs `def` endpoints in a thread pool; AnyIO, underneath, allows 40 threads by default.
"""
import collections
import json
import os
import random
import threading
import time
import traceback

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from opentelemetry import trace
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from prometheus_client import Counter, Gauge, Histogram, make_asgi_app
from pydantic import BaseModel

import tracing

VERSION = os.environ.get("VERSION", "v1")
PAYMENTS = os.environ.get("PAYMENTS_URL", "http://toxiproxy:9000")
TIMEOUT = 0.3                       # seconds; chosen from payments' normal p99 (about 25 ms) with headroom
POLICIES = ("none", "timeout", "retry", "backoff", "breaker")

app = FastAPI()
tracing.setup(app)
HTTPXClientInstrumentor().instrument()          # a client span for every call to payments
tracer = trace.get_tracer("checkout")
client = httpx.Client(base_url=PAYMENTS, limits=httpx.Limits(max_connections=200, max_keepalive_connections=50))

# The four golden signals: traffic and errors (REQS), latency (LAT), saturation (INFLIGHT, BUSY).
REQS = Counter("checkout_requests_total", "Checkout requests answered", ["version", "policy", "code"])
LAT = Histogram("checkout_request_duration_seconds", "Arrival to response, including any wait for a thread",
                ["version"], buckets=(0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40))
CALLS = Counter("checkout_payment_calls_total", "Calls to payments by result (skipped = breaker open)", ["version", "result"])
INFLIGHT = Gauge("checkout_inflight_requests", "Requests received and not yet answered", ["version"])
BUSY = Gauge("checkout_threads_busy", "Worker threads running a request (the pool has 40)", ["version"])
BREAKER = Gauge("checkout_breaker_open", "1 while the circuit breaker is open or half-open", ["version"])
for result in ("ok", "error", "timeout", "connection", "skipped"):
    CALLS.labels(VERSION, result)


def log(**fields):
    print(json.dumps({"ts": round(time.time(), 3), "service": "checkout", "version": VERSION, **fields}), flush=True)


# ---------------------------------------------------------------- pricing (v2 changes this)
TAX = {"US": 0.0, "GB": 0.20, "DE": 0.19, "FR": 0.20, "ES": 0.21, "IT": 0.22, "NL": 0.21, "IE": 0.23, "PT": 0.23, "PL": 0.23}
if VERSION == "v2":
    # v2 ships a "new tax table". Two countries went missing when it was rebuilt: the bug the canary finds.
    TAX = {country: rate for country, rate in TAX.items() if country not in ("IE", "PT")}


def total_cents(order) -> int:
    return round(order.amount_cents * (1 + TAX[order.country]))


# ---------------------------------------------------------------- calling payments
class PaymentError(Exception):
    pass


def charge_once(order_id: str, amount: int, timeout) -> None:
    """One call to payments. Raises PaymentError with a short reason on any failure."""
    try:
        r = client.post("/charge", json={"order_id": order_id, "amount_cents": amount}, timeout=timeout)
    except httpx.TimeoutException:
        CALLS.labels(VERSION, "timeout").inc()
        raise PaymentError("timeout")
    except httpx.TransportError:
        CALLS.labels(VERSION, "connection").inc()
        raise PaymentError("connection error")
    if r.status_code >= 500:
        CALLS.labels(VERSION, "error").inc()
        raise PaymentError(f"payments answered {r.status_code}")
    CALLS.labels(VERSION, "ok").inc()


class RetryBudget:
    """Google SRE book, ch. 21: retries may be at most 10% of the requests seen in the last 10 seconds."""

    def __init__(self, ratio=0.1, window=10.0):
        self.ratio, self.window, self.lock = ratio, window, threading.Lock()
        self.requests, self.retries = collections.deque(), collections.deque()

    def _prune(self, now):
        for q in (self.requests, self.retries):
            while q and q[0] < now - self.window:
                q.popleft()

    def request(self):
        with self.lock:
            now = time.monotonic()
            self._prune(now)
            self.requests.append(now)

    def allow_retry(self) -> bool:
        with self.lock:
            now = time.monotonic()
            self._prune(now)
            if len(self.retries) < self.ratio * len(self.requests):
                self.retries.append(now)
                return True
            return False


class Breaker:
    """Martin Fowler's circuit breaker: open after 5 failures in a row, stay open 5 s, then let one trial through."""

    def __init__(self, threshold=5, cooldown=5.0):
        self.threshold, self.cooldown, self.lock = threshold, cooldown, threading.Lock()
        self.state, self.failures, self.opened_at = "closed", 0, 0.0

    def allow(self) -> bool:
        with self.lock:
            if self.state == "closed":
                return True
            if self.state == "open" and time.monotonic() - self.opened_at >= self.cooldown:
                self._move("half-open")           # this caller is the trial; everyone else is still rejected
                return True
            return False

    def record(self, ok: bool):
        with self.lock:
            if self.state == "open":
                return                             # a late reply from before it opened: ignore
            if ok:
                self.failures = 0
                if self.state == "half-open":
                    self._move("closed")
            elif self.state == "half-open":
                self.opened_at = time.monotonic()
                self._move("open")
            else:
                self.failures += 1
                if self.failures >= self.threshold:
                    self.opened_at = time.monotonic()
                    self._move("open")

    def _move(self, state):
        self.state = state
        BREAKER.labels(VERSION).set(0 if state == "closed" else 1)
        log(event="breaker", state=state)


budget, breaker = RetryBudget(), Breaker()


def pay(order, amount: int, policy: str) -> tuple[str | None, int]:
    """Charge using the chosen policy. Returns (failure reason or None, calls made to payments)."""
    if policy == "none":
        try:
            charge_once(order.order_id, amount, timeout=None)       # httpx's default would be 5 s; None waits forever
            return None, 1
        except PaymentError as e:
            return str(e), 1
    if policy == "timeout":
        try:
            charge_once(order.order_id, amount, TIMEOUT)
            return None, 1
        except PaymentError as e:
            return str(e), 1
    if policy == "breaker":
        if not breaker.allow():
            CALLS.labels(VERSION, "skipped").inc()
            trace.get_current_span().add_event("circuit open: payments not called")
            return "circuit open", 0
        try:
            charge_once(order.order_id, amount, TIMEOUT)
            breaker.record(True)
            return None, 1
        except PaymentError as e:
            breaker.record(False)
            return str(e), 1
    # retry and backoff: up to 4 attempts in total
    if policy == "backoff":
        budget.request()
    reason = None
    for attempt in range(4):
        if attempt:
            if policy == "backoff":
                if not budget.allow_retry():
                    trace.get_current_span().add_event("retry budget exhausted: not retrying")
                    return reason + " (retry budget exhausted)", attempt
                # Full jitter: sleep a random time between 0 and min(cap, base * 2^attempt).
                pause = random.uniform(0, min(1.0, 0.05 * 2 ** attempt))
                with tracer.start_as_current_span("backoff", attributes={"sleep_ms": round(pause * 1000)}):
                    time.sleep(pause)
        try:
            charge_once(order.order_id, amount, TIMEOUT)
            return None, attempt + 1
        except PaymentError as e:
            reason = str(e)
    return reason + " (after 4 attempts)", 4


# ---------------------------------------------------------------- endpoints
class Order(BaseModel):
    order_id: str
    amount_cents: int
    country: str


@app.middleware("http")
async def measure(request: Request, call_next):
    if request.url.path in ("/metrics", "/health") or request.url.path.startswith("/metrics/"):
        return await call_next(request)
    INFLIGHT.labels(VERSION).inc()
    started, code, policy = time.perf_counter(), 500, request.headers.get("x-policy", "none")
    try:
        if request.url.path == "/checkout" and policy not in POLICIES:
            code = 400
            return JSONResponse({"error": f"X-Policy must be one of {', '.join(POLICIES)}"}, 400)
        try:
            response = await call_next(request)
            code = response.status_code
        except Exception as e:                    # a bug in the handler: log it, answer 500
            frame = traceback.extract_tb(e.__traceback__)[-1]
            log(level="error", path=request.url.path, error=repr(e),
                where=f"{frame.filename.rsplit('/', 1)[-1]}:{frame.lineno} in {frame.name}()")
            response = JSONResponse({"error": "internal error"}, 500)
        response.headers["X-Version"] = VERSION
        return response
    finally:
        INFLIGHT.labels(VERSION).dec()
        if request.url.path == "/checkout":
            elapsed = time.perf_counter() - started
            REQS.labels(VERSION, policy, str(code)).inc()
            LAT.labels(VERSION).observe(elapsed)
            ctx = trace.get_current_span().get_span_context()
            log(path="/checkout", policy=policy, code=code, ms=round(elapsed * 1000),
                payment_calls=getattr(request.state, "calls", 0), trace_id=format(ctx.trace_id, "032x"))


@app.post("/checkout")
def checkout(order: Order, request: Request):
    BUSY.labels(VERSION).inc()
    try:
        # The gap between the server span starting and this span starting is time spent waiting for a thread.
        with tracer.start_as_current_span("checkout handler (worker thread)") as span:
            policy = request.headers.get("x-policy", "none")
            span.set_attributes({"checkout.policy": policy, "order.country": order.country})
            amount = total_cents(order)
            reason, calls = pay(order, amount, policy)
            request.state.calls = calls
            if reason:
                span.set_status(trace.StatusCode.ERROR, reason)
                return JSONResponse({"error": "payment failed", "reason": reason}, 503)
            return {"status": "confirmed", "order_id": order.order_id, "charged_cents": amount}
    finally:
        BUSY.labels(VERSION).dec()


@app.get("/fast")
def fast():
    return {"ok": True}


@app.get("/health")
async def health():
    return {"ok": True, "version": VERSION}


app.mount("/metrics", make_asgi_app())
