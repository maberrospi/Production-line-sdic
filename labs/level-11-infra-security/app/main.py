"""lab-api: a small service for the Kubernetes (Part A) and Terraform (Part B) experiments.

GET  /               which pod (or container) answered, and which version
GET  /health/live    liveness: can this process serve at all? Never checks dependencies.
GET  /health/ready   readiness: should this instance get traffic right now?
GET  /work?ms=50     burn about ms milliseconds of CPU (to make the autoscaler react)
POST /admin/hang     make liveness fail from now on, like a deadlocked process
POST /admin/leak?mb=40  allocate memory and keep it, to reach the memory limit

Version 2 adds a cache: it is only ready once it can open a TCP connection to CACHE_ADDR
(default cache:6379). Nobody deployed the cache. That is the bug in Part A, step 4.
"""
import os
import socket
import time

from fastapi import FastAPI, Response

VERSION = os.environ.get("APP_VERSION", "1")
NAME = os.environ.get("POD_NAME") or socket.gethostname()
CACHE = os.environ.get("CACHE_ADDR", "cache:6379")
app = FastAPI()
state = {"hung": False, "leak": []}


@app.get("/")
def root():
    return {"pod": NAME, "version": VERSION}


@app.get("/health/live")
def live(response: Response):
    if state["hung"]:
        response.status_code = 500
        return {"live": False}
    return {"live": True}


@app.get("/health/ready")
def ready(response: Response):
    if VERSION == "2":
        host, port = CACHE.rsplit(":", 1)
        try:
            socket.create_connection((host, int(port)), timeout=0.5).close()
        except OSError as e:
            response.status_code = 503
            return {"ready": False, "reason": f"cannot reach cache at {CACHE}: {e.__class__.__name__}"}
    return {"ready": True}


@app.get("/work")
def work(ms: int = 50):
    end = time.thread_time() + ms / 1000
    n = 0
    while time.thread_time() < end:
        n += 1
    return {"pod": NAME, "loops": n}


@app.post("/admin/hang")
def hang():
    state["hung"] = True
    return {"hung": True, "pod": NAME}


@app.post("/admin/leak")
def leak(mb: int = 40):
    state["leak"].append(bytearray(os.urandom(1024)) * (mb * 1024))   # touch every page so it really counts
    return {"pod": NAME, "held_mb": sum(len(b) for b in state["leak"]) // (1024 * 1024)}
