"""Level 1 lab API: a tiny notes service behind nginx.

Routes live under /api so nginx can forward /api/* unchanged.
"""
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException, Response
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

if os.environ.get("CRASH_ON_START") == "1":
    # Simulates a broken build (bad import, missing env var...). Used in lab step 6.
    raise RuntimeError("Deliberately broken build: CRASH_ON_START=1")

DATABASE_URL = os.environ["DATABASE_URL"]
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open(wait=True, timeout=30)
    yield
    pool.close()


app = FastAPI(lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
api = APIRouter(prefix="/api")


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=500)


@api.get("/health")
def health(response: Response):
    try:
        with pool.connection(timeout=2) as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev")}
    except Exception:
        response.status_code = 503
        return {"status": "db unavailable"}


@api.get("/notes")
def list_notes():
    # Name the columns explicitly: new columns added by later migrations do not break this code.
    with pool.connection() as conn:
        rows = conn.execute("SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 50").fetchall()
    return [{"id": r[0], "body": r[1], "created_at": r[2].isoformat()} for r in rows]


@api.post("/notes", status_code=201)
def create_note(note: NoteIn):
    with pool.connection() as conn:
        row = conn.execute("INSERT INTO notes (body) VALUES (%s) RETURNING id", (note.body,)).fetchone()
    if not row:
        raise HTTPException(500, "insert failed")
    return {"id": row[0]}


app.include_router(api)
