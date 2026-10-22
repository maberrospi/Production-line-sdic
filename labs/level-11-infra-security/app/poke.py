"""POST to this pod's own API, from inside it:  python poke.py /admin/hang   python poke.py "/admin/leak?mb=40" """
import sys
import urllib.request

req = urllib.request.Request("http://127.0.0.1:8000" + sys.argv[1], method="POST")
with urllib.request.urlopen(req, timeout=5) as r:
    print(r.read().decode())
