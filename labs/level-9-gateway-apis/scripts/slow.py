"""Step 2: ask for a response that takes 3 s, through a gateway that waits at most 2 s."""
import os
import time

import httpx

G = os.environ.get("GATEWAY", "http://gateway")
t = time.perf_counter()
r = httpx.get(f"{G}/users/slow?ms=3000", headers={"X-Api-Key": "key-alice"}, timeout=10)   # we would wait 10 s
print(f"{r.status_code} after {time.perf_counter() - t:.2f} s")
