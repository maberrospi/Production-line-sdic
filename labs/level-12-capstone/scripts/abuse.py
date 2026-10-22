"""Step 6: bad input and too many creations, through the public gateway."""
import httpx

from common import GATEWAY

for url in ["javascript:alert(1)", "ftp://example.com/file", "not a url", "https://" + "a" * 2100 + ".com",
            "http://localhost:8090/abc1234"]:
    r = httpx.post(f"{GATEWAY}/api/links", json={"url": url})
    print(f"{r.status_code}  {url[:40]:<42} {r.json().get('detail', r.json())}")

codes = []
with httpx.Client() as c:
    for i in range(12):
        codes.append(c.post(f"{GATEWAY}/api/links", json={"url": f"https://example.com/spam/{i}"}).status_code)
print("12 quick creations from one client:", " ".join(map(str, codes)))
print("internal endpoint through the gateway:", httpx.get(f"{GATEWAY}/internal/stats").status_code)
