"""Level 2 lab API: one of several interchangeable replicas.

GET  /         which replica answered
GET  /health   shallow health check used by HAProxy
GET  /work     ~20 ms of CPU, for load tests
POST /login    {"user": "alice"} -> sets a session cookie
GET  /me       who is logged in, according to THIS replica

SESSION_STORE=memory keeps sessions in this process only (the bug in step 3).
SESSION_STORE=redis keeps them in Redis, shared by all replicas (the fix in step 4).
EXTRA_DELAY_MS makes every request (except /health) slower, to play a degraded server.
"""
import asyncio
import hashlib
import os
import secrets
import socket
import time

import redis
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

SERVER = os.environ.get("SERVER_NAME") or socket.gethostname()   # in Docker: the container ID
STORE = os.environ.get("SESSION_STORE", "memory")
DELAY = float(os.environ.get("EXTRA_DELAY_MS", "0")) / 1000
SESSION_TTL = 3600

rds = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"),
                           socket_timeout=1, socket_connect_timeout=1, decode_responses=True)
memory_sessions: dict[str, str] = {}

app = FastAPI()


@app.middleware("http")
async def degrade_and_tag(request: Request, call_next):
    if DELAY and request.url.path != "/health":
        await asyncio.sleep(DELAY)
    response = await call_next(request)
    response.headers["X-Server"] = SERVER
    return response


@app.get("/")
def whoami():
    return {"server": SERVER, "pid": os.getpid()}


@app.get("/health")
def health():
    # Shallow on purpose: "can this process serve requests?" (Lesson 2.4)
    return {"status": "ok", "server": SERVER}


@app.get("/work")
def work():
    # 20 ms of CPU time for this thread (same as the Level 0 lab)
    deadline = time.thread_time() + 0.020
    h = b"seed"
    while time.thread_time() < deadline:
        h = hashlib.sha256(h).digest()
    return {"server": SERVER, "digest": h.hex()[:12]}


class Login(BaseModel):
    user: str = Field(min_length=1, max_length=64)


def save_session(sid: str, user: str) -> None:
    if STORE == "redis":
        rds.setex(f"session:{sid}", SESSION_TTL, user)
    else:
        memory_sessions[sid] = user


def load_session(sid: str) -> str | None:
    if STORE == "redis":
        return rds.get(f"session:{sid}")
    return memory_sessions.get(sid)


@app.post("/login")
def login(body: Login, response: Response):
    sid = secrets.token_urlsafe(16)
    try:
        save_session(sid, body.user)
    except redis.RedisError:
        raise HTTPException(503, f"session store unavailable (server {SERVER})")
    response.set_cookie("sid", sid, httponly=True, samesite="lax", max_age=SESSION_TTL)
    return {"user": body.user, "server": SERVER, "store": STORE}


@app.get("/me")
def me(request: Request):
    sid = request.cookies.get("sid")
    if not sid:
        raise HTTPException(401, f"no session cookie (server {SERVER})")
    try:
        user = load_session(sid)
    except redis.RedisError:
        raise HTTPException(503, f"session store unavailable (server {SERVER})")
    if user is None:
        raise HTTPException(401, f"not logged in on server {SERVER}")
    return {"user": user, "server": SERVER}
