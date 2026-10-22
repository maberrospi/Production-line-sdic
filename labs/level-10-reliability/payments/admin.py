"""./payments.sh errors 0.1 | errors 0 | stats | reset  (runs inside the payments container)."""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8000"


def call(path, body=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r)


cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
if cmd == "errors":
    rate = float(sys.argv[2])
    call("/admin/faults", {"error_rate": rate})
    print(f"payments now fails {rate:.0%} of charges with HTTP 500")
elif cmd == "reset":
    call("/admin/reset", {})
    print("payments counters reset")
else:
    s = call("/stats")
    print(f"payments: {s['calls']:,} calls for {s['distinct_orders']:,} distinct orders, "
          f"{s['errors']:,} answered 500 (error rate set to {s['error_rate']:.0%})")
