"""Log in with the authorization code flow and PKCE, printing every step, then show the token.

  python login.py alice
  python login.py alice --steal      an attacker who intercepted the code, but not the verifier
"""
import argparse
import datetime

from oidc import exchange, get_code, parts, pkce_pair

ap = argparse.ArgumentParser()
ap.add_argument("user", choices=["alice", "bob"])
ap.add_argument("--steal", action="store_true")
a = ap.parse_args()

verifier, challenge = pkce_pair()
print(f"0. app creates code_verifier={verifier[:12]}… (kept secret) and code_challenge=SHA256(verifier)={challenge[:12]}…")
code = get_code(a.user, challenge, say=print)

if a.steal:
    r = exchange(code, verifier=None)
    print(f"4. attacker -> POST {r.request.url} with the code but no code_verifier")
    print(f"   Keycloak answers {r.status_code}: {r.json()}")
    raise SystemExit

r = exchange(code, verifier)
print(f"4. app -> POST {r.request.url} with the code and the code_verifier; Keycloak answers {r.status_code}")
tokens = r.json()
print(f"   received: {', '.join(k for k in tokens if k.endswith('token'))}; access token expires in {tokens['expires_in']} s")

header, claims = parts(tokens["access_token"])
when = lambda t: datetime.datetime.fromtimestamp(t, datetime.UTC).strftime("%H:%M:%S UTC")
print("\naccess token header:", {k: header[k] for k in ("alg", "typ", "kid")})
print("access token claims (the ones the API checks):")
for k in ("iss", "aud", "sub", "azp", "preferred_username"):
    print(f"  {k:<20} {claims.get(k)}")
print(f"  {'iat / exp':<20} {when(claims['iat'])} / {when(claims['exp'])}")
print(f"  {'realm_access.roles':<20} {sorted(claims['realm_access']['roles'])}")
