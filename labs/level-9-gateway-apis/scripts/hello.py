"""Step 1: talk to the gateway with and without an API key."""
import os

import httpx

G = os.environ.get("GATEWAY", "http://gateway")
for label, path, headers in [("no key", "/users/1", {}), ("key-alice", "/users/1", {"X-Api-Key": "key-alice"}),
                             ("health check", "/health", {}), ("unknown path", "/nope", {"X-Api-Key": "key-alice"})]:
    r = httpx.get(G + path, headers=headers, timeout=5)
    print(f"{label:<13} {r.status_code}  X-Request-ID {r.headers.get('x-request-id')}  {r.text.strip()}")
