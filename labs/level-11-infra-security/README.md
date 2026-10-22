# Level 11 lab: Kubernetes on your laptop, Terraform against Docker, tokens, and dependency scanning

Four independent parts; do them in any order. Follow the steps in the course (Level 11 → Lab tab);
this file is the reference.

| Part | Folder | What you need |
|---|---|---|
| A. Kubernetes with kind | `app/`, `k8s/` | Docker, [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) v0.33.0 and [kubectl](https://kubernetes.io/docs/tasks/tools/) (single binaries) |
| B. Terraform / OpenTofu | `terraform/` | Docker, and [OpenTofu](https://opentofu.org/docs/intro/install/) 1.13 or [Terraform](https://developer.hashicorp.com/terraform/install) 1.16 |
| C. Keycloak and JWT checks | `auth/` | Docker; port 8180 free on 127.0.0.1 (or set `KC_PORT`) |
| D. Dependency scanning | `audit/` | Docker, internet access to PyPI |

Memory: Part A's three-node cluster wants about 4 GB for Docker; the other parts much less.

## Part A: Kubernetes (kind)

```
kind cluster "lab": control-plane, worker, worker
  Deployment api (3 pods, lab-api:1) ──▶ Service api (ClusterIP, port 80) ◀── kubectl exec … hit.py
  HorizontalPodAutoscaler api (2-6 pods, 50% CPU) ◀── metrics-server
```

| File | What |
|---|---|
| `app/main.py` | The API: `/`, `/health/live`, `/health/ready`, `/work?ms=`, `POST /admin/hang`, `POST /admin/leak?mb=` |
| `app/hit.py`, `app/poke.py` | Run inside a pod: call a URL many times and count who answered; POST to the pod itself |
| `k8s/kind.yaml` | One control-plane node and two workers |
| `k8s/app.yaml` | Deployment (probes, requests/limits, rolling update, non-root) and Service |
| `k8s/hpa.yaml` | Autoscaler, with a 60 s scale-down window for the lab |
| `k8s/metrics-server.yaml` | metrics-server v0.9.0, plus `--kubelet-insecure-tls` for kind |

Version 2 of the image (`--build-arg APP_VERSION=2`) only becomes ready if it can reach a cache at
`cache:6379`, which does not exist: the broken release of step A4.

## Part B: Terraform

`terraform/` creates a network, `app_count` app containers (from `lab-api:1`, built in Part A or with
`docker build -t lab-api:1 app`), and an nginx proxy on `127.0.0.1:8088` whose config is generated
from the list of app containers. `api_key` is a pretend secret passed as `TF_VAR_api_key`.
Commands below say `tofu`; `terraform` takes the same arguments.

## Part C: Keycloak

| Service | What |
|---|---|
| `keycloak` | Keycloak 26.8.1 in dev mode; imports `keycloak/lab-realm.json` (realm `lab`) on start |
| `api` | orders-api: verifies tokens with PyJWT (`api/main.py`) |
| `tools` | Scripts in `scripts/`: `login.py`, `call.py`, `forge.py` |

Realm `lab`: users `alice` / `alice-pass` (roles orders.read, orders.write) and `bob` / `bob-pass`
(orders.read). Clients: `lab-web` (public, code flow with PKCE S256 required, 60 s access tokens,
adds audience `orders-api`), `orders-api` (the API; receives tokens only), `reports-job`
(confidential, client credentials). Keycloak admin console: http://localhost:8180, `admin` / `admin`.

The scripts reach Keycloak as `http://keycloak:8080`, so tokens carry
`iss: http://keycloak:8080/realms/lab`, which is what the API expects. In production, set
`KC_HOSTNAME` so the issuer never depends on how Keycloak was reached.

## Part D: pip-audit

`./audit.sh -r <requirements file>` runs pip-audit 2.10.1 in a container. `audit/requirements-2024.txt`
holds the pins the earlier labs of this course used.

## How the reference output was produced

Docker could not run where this lab was built, so each part ran on the closest real equivalent:

- **Part A** ran on k3s v1.37.1+k3s1, a CNCF-certified Kubernetes distribution, as a single node
  (kind v0.33.0 runs Kubernetes v1.37.0). The manifests in `k8s/` were applied unchanged, with images
  built from `app/` and loaded into the cluster the way `kind load` does. Differences you will see:
  your NODE column shows `lab-worker` and `lab-worker2`; pods start faster; k3s ships its own
  metrics-server, so `k8s/metrics-server.yaml` was only validated (server-side dry run).
- **Part B** ran OpenTofu 1.13.1 with the kreuzwerker/docker provider 4.6.0 against Podman's
  Docker-compatible API. One test-only addition, not in these files: Podman reports an IPAM option
  that Docker does not, so the network had `ignore_changes = [ipam_options]` to avoid a spurious
  replacement.
- **Parts C and D** ran for real: Keycloak 26.8.1, the API and scripts as written, and pip-audit 2.10.1.

## Clean up

```bash
kind delete cluster --name lab                 # Part A
(cd terraform && tofu destroy)                 # Part B
(cd auth && docker compose --profile tools down -v)   # Part C
docker image rm lab-pip-audit                  # Part D
```
