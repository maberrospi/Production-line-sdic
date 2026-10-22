"""Level 9: the users service. It has NO authentication code: only the gateway can reach it."""
import asyncio

from fastapi import FastAPI, Request

app = FastAPI()
NAMES = ["Grace", "Alan", "Ada", "Edsger", "Barbara", "Leslie", "Margaret", "Donald"]


@app.get("/users/slow")
async def slow(ms: int = 3000):
    await asyncio.sleep(ms / 1000)      # a dependency having a bad day (step 2)
    return {"slept_ms": ms}


@app.get("/users/{user_id}")
async def user(user_id: int, request: Request):
    return {"id": user_id, "name": NAMES[(user_id - 1) % len(NAMES)],
            "seen_request_id": request.headers.get("x-request-id"),
            "seen_client": request.headers.get("x-client")}
