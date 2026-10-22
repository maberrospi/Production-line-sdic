"""orders-api: a resource server. It never sees a password; it checks the signed access token
that comes with every request (RFC 8725, JWT Best Current Practices).

GET  /orders         needs the realm role orders.read
POST /orders         needs the realm role orders.write
GET  /naive/orders   THE WRONG WAY, for step C4: reads the token without verifying it
"""
import os

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from jwt import PyJWKClient

ISSUER = os.environ.get("OIDC_ISSUER", "http://keycloak:8080/realms/lab")
AUDIENCE = os.environ.get("OIDC_AUDIENCE", "orders-api")
# Keycloak publishes its public signing keys here. PyJWKClient fetches and caches them, and picks
# the right one by the token's "kid" header, so key rotation needs no change on this side.
jwks = PyJWKClient(f"{ISSUER}/protocol/openid-connect/certs", cache_keys=True, lifespan=300)

app = FastAPI()
ORDERS = [{"id": 1, "item": "keyboard", "owner": "alice"}, {"id": 2, "item": "monitor", "owner": "bob"}]


def bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "missing bearer token", headers={"WWW-Authenticate": 'Bearer realm="orders"'})
    return token


def verified_claims(request: Request) -> dict:
    token = bearer_token(request)
    try:
        key = jwks.get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "cannot fetch the identity provider's keys")
    except jwt.PyJWTError as e:
        raise invalid(e)
    try:
        return jwt.decode(
            token, key.key,
            algorithms=["RS256"],          # an allow-list: never let the token choose how it is checked
            audience=AUDIENCE,             # issued for this API, not for some other service
            issuer=ISSUER,                 # issued by our identity provider
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=5,                      # seconds of clock skew tolerated on exp and iat
        )
    except jwt.PyJWTError as e:
        raise invalid(e)


def invalid(e: Exception) -> HTTPException:
    return HTTPException(401, f"invalid token: {e}",
                         headers={"WWW-Authenticate": f'Bearer error="invalid_token", error_description="{e}"'})


def require_role(role: str):
    def check(claims: dict = Depends(verified_claims)) -> dict:
        roles = claims.get("realm_access", {}).get("roles", [])
        if role not in roles:
            mine = sorted(r for r in roles if r.startswith("orders."))
            raise HTTPException(403, f"{claims.get('preferred_username', claims['sub'])} needs role {role}; has {mine}")
        return claims
    return check


@app.get("/orders")
def list_orders(claims: dict = Depends(require_role("orders.read"))):
    return {"user": claims.get("preferred_username"), "orders": ORDERS}


@app.post("/orders")
def create_order(claims: dict = Depends(require_role("orders.write"))):
    order = {"id": len(ORDERS) + 1, "item": "new item", "owner": claims.get("preferred_username")}
    ORDERS.append(order)
    return order


@app.get("/naive/orders")
def naive(request: Request):
    # DO NOT DO THIS. Without verifying the signature, anyone can write any claims they like.
    claims = jwt.decode(bearer_token(request), options={"verify_signature": False})
    roles = claims.get("realm_access", {}).get("roles", [])
    return {"accepted_user": claims.get("preferred_username"), "accepted_roles": sorted(r for r in roles if r.startswith("orders."))}


@app.get("/health")
def health():
    return {"ok": True}
