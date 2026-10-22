"""Call the orders API with or without a token.

  python call.py                     the standard set of calls for step C3
  python call.py --wait 65           get alice's token, wait, then use it (step C5: expiry)
"""
import argparse
import time

import httpx

from oidc import client_credentials, login

API = "http://api:8000"
ap = argparse.ArgumentParser()
ap.add_argument("--wait", type=int, default=0)
a = ap.parse_args()


def show(label, method, path, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    r = httpx.request(method, API + path, headers=headers, timeout=10)
    detail = r.json().get("detail", r.json())
    print(f"{label:<34} {method:<4} {path:<8} {r.status_code}  {detail}")
    if r.status_code == 401 and "www-authenticate" in r.headers:
        print(f"{'':<34} WWW-Authenticate: {r.headers['www-authenticate'][:100]}")


if a.wait:
    token = login("alice")
    show("alice, fresh token", "GET", "/orders", token)
    print(f"... waiting {a.wait} s (lab-web's access tokens live 60 s)")
    time.sleep(a.wait)
    show(f"alice, same token {a.wait} s later", "GET", "/orders", token)
    show("alice, logs in again", "GET", "/orders", login("alice"))
    raise SystemExit

alice, bob = login("alice"), login("bob")
show("no token", "GET", "/orders")
show("not a JWT at all", "GET", "/orders", "hello")
show("alice (read + write)", "GET", "/orders", alice)
show("alice", "POST", "/orders", alice)
show("bob (read only)", "GET", "/orders", bob)
show("bob", "POST", "/orders", bob)
show("reports-job (client credentials)", "GET", "/orders", client_credentials())
