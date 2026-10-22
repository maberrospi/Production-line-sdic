"""OpenID Connect helpers: the authorization code flow with PKCE, done the way a browser would.

A real web app redirects the browser to Keycloak, the user types their password on Keycloak's page,
and Keycloak redirects back with a one-time code. Here a script plays the browser: it fetches the
login page, submits the form, and catches the redirect instead of following it.
"""
import base64
import hashlib
import html
import json
import os
import re
import secrets
import urllib.parse

import httpx

ISSUER = os.environ.get("OIDC_ISSUER", "http://keycloak:8080/realms/lab")
AUTH_URL = f"{ISSUER}/protocol/openid-connect/auth"
TOKEN_URL = f"{ISSUER}/protocol/openid-connect/token"
CLIENT_ID = "lab-web"
REDIRECT_URI = "http://localhost:9999/callback"      # never actually called: we read the code from the redirect
PASSWORDS = {"alice": "alice-pass", "bob": "bob-pass"}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def pkce_pair() -> tuple[str, str]:
    """RFC 7636: a random code_verifier, and its SHA-256 as the code_challenge."""
    verifier = b64url(secrets.token_bytes(32))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge


def get_code(user: str, challenge: str, say=lambda *a: None) -> str:
    """Steps 1-3 of the code flow. Returns the authorization code."""
    state = b64url(secrets.token_bytes(12))
    params = {"client_id": CLIENT_ID, "response_type": "code", "scope": "openid", "redirect_uri": REDIRECT_URI,
              "state": state, "code_challenge": challenge, "code_challenge_method": "S256"}
    with httpx.Client(follow_redirects=False, timeout=10) as browser:
        page = browser.get(AUTH_URL, params=params)
        say(f"1. browser -> GET {AUTH_URL}?client_id={CLIENT_ID}&response_type=code&code_challenge={challenge[:12]}…"
            f"&code_challenge_method=S256&state={state}")
        say(f"   Keycloak answers {page.status_code} with its login page")
        action = html.unescape(re.search(r'id="kc-form-login"[^>]*action="([^"]+)"', page.text).group(1))
        done = browser.post(action, data={"username": user, "password": PASSWORDS[user], "credentialId": ""})
        location = done.headers.get("location", "")
        say(f"2. browser -> POST the login form as {user}; Keycloak answers {done.status_code}, redirecting to")
        say(f"   {location[:110]}…")
    query = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
    if "code" not in query:
        raise SystemExit(f"login failed: {done.status_code} {location or done.text[:200]}")
    if query["state"][0] != state:
        raise SystemExit("state mismatch: possible CSRF, refusing the code")
    say(f"3. the redirect carries code={query['code'][0][:16]}… and the same state, so it answers our request")
    return query["code"][0]


def exchange(code: str, verifier: str | None) -> httpx.Response:
    """Step 4: the app swaps the code (plus the PKCE verifier) for tokens, server to server."""
    data = {"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI, "client_id": CLIENT_ID}
    if verifier:
        data["code_verifier"] = verifier
    return httpx.post(TOKEN_URL, data=data, timeout=10)


def login(user: str) -> str:
    """The whole flow, quietly. Returns an access token."""
    verifier, challenge = pkce_pair()
    r = exchange(get_code(user, challenge), verifier)
    r.raise_for_status()
    return r.json()["access_token"]


def client_credentials(client_id="reports-job", secret="reports-job-secret") -> str:
    """Service-to-service: a confidential client gets a token as itself, with no user involved."""
    r = httpx.post(TOKEN_URL, data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": secret}, timeout=10)
    r.raise_for_status()
    return r.json()["access_token"]


def parts(token: str) -> tuple[dict, dict]:
    """Decode (NOT verify) a JWT's header and payload, for display."""
    def dec(s):
        return json.loads(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)))
    h, p, _ = token.split(".")
    return dec(h), dec(p)
