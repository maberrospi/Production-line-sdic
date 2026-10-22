import os
import socket

import httpx

APP = os.environ.get("APP", "http://app:8000")
GATEWAY = os.environ.get("GATEWAY", "http://gateway")


def replicas() -> list[str]:
    """Every app replica's address: Docker's DNS returns one A record per container."""
    host = APP.split("//")[1].split(":")[0]
    ips = sorted({ai[4][0] for ai in socket.getaddrinfo(host, 8000, proto=socket.IPPROTO_TCP)})
    return [f"http://{ip}:8000" for ip in ips]


def all_stats() -> list[dict]:
    return [httpx.get(f"{base}/internal/stats", timeout=5).json() for base in replicas()]


def reset_stats():
    for base in replicas():
        httpx.post(f"{base}/internal/stats/reset", timeout=5)
