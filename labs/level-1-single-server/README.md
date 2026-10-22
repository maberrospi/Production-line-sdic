# Level 1 lab: Productionize the single server

A production-shaped single VM: nginx (TLS, routing, rate limits) → FastAPI → Postgres,
with isolated Docker networks, deploys with health checks and rollback, and tested backups.
Follow the steps in the course (Level 1 → Lab tab). This file is the reference.

```
internet ──443──▶ nginx ──frontend net──▶ api:8000 ──backend net (internal)──▶ db:5432
                  (only published ports)                                    (no internet route)
```

## Layout

| Path | What |
|---|---|
| `compose.yaml` | nginx, api, db, and a certbot tool service. Only nginx publishes ports. |
| `api/` | FastAPI app, Dockerfile, `migrate.py` and `migrations/*.sql` |
| `nginx/templates/` | nginx config; `${DOMAIN}` is filled in from `.env` at container start |
| `nginx/html/` | A tiny frontend that lists and adds notes |
| `scripts/harden.sh` | SSH keys-only, ufw, fail2ban, unattended upgrades (run once on the VM) |
| `scripts/deploy.sh` | Pull, migrate, swap the api container, health check, roll back on failure |
| `scripts/backup.sh` | `pg_dump` → local → off-site (`BACKUP_REMOTE`) → heartbeat |
| `scripts/restore-test.sh` | Restore the latest dump into a scratch Postgres and compare row counts |
| `docker/daemon.json` | Docker log rotation, copy to `/etc/docker/daemon.json` |
| `ci/github-actions-deploy.yml` | Example CI pipeline: test → build → push to GHCR → deploy |

## Ports

Only nginx publishes ports: 80 and 443 by default. If either is taken on your machine
(`lsof -i :443` on macOS/Linux, `netstat -ano | findstr :443` on Windows), set `HTTP_PORT` and
`HTTPS_PORT` in `.env` (for example 8080 and 8443) and use `https://localhost:8443` everywhere
this guide says `https://localhost`. The API and database have no published ports, so they never clash.

## Local quick start (Docker Desktop)

```bash
cp .env.example .env                 # set POSTGRES_PASSWORD
bash scripts/selfsigned.sh           # certificate for DOMAIN=localhost
docker build -t app-api:v1 api/
bash scripts/deploy.sh v1            # starts db, runs migrations, starts api, then nginx
open https://localhost               # accept the self-signed warning
```

## On the VM, in this order

1. **Harden** (once): `sudo bash scripts/harden.sh <you>`, then the cloud firewall: 80/443 from anywhere, 22 from your IP.
2. **Docker logs**: `sudo cp docker/daemon.json /etc/docker/daemon.json && sudo systemctl restart docker`
3. **Code and secrets**: clone your repo to `/srv/app`, create `.env` with a real `DOMAIN` and password, `chmod 600 .env`.
4. **Certificate** (before nginx ever starts, while port 80 is free):
   ```bash
   docker compose run --rm -p 80:80 certbot certonly --standalone \
     -d "$DOMAIN" --email you@example.com --agree-tos --no-eff-email
   ```
5. **Deploy**: build or pull the image, then `bash scripts/deploy.sh <tag>`.
6. **Cron** (`crontab -e` as the deploy user):
   ```cron
   15 3 * * *  cd /srv/app && bash scripts/backup.sh       >> /var/log/app/backup.log 2>&1
   30 4 * * 0  cd /srv/app && bash scripts/restore-test.sh >> /var/log/app/restore.log 2>&1
   0  5 * * *  cd /srv/app && docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet && docker compose exec nginx nginx -s reload
   ```

## Exercises built into the files

- **Broken build**: `docker build --build-arg BREAK=1 -t app-api:v3 api/` produces an image that crashes on start. `deploy.sh v3` must roll back by itself.
- **Your first expand migration**: add `api/migrations/002_add_pinned.sql` with
  `ALTER TABLE notes ADD COLUMN pinned boolean NOT NULL DEFAULT false;`, build `v2`, deploy it.
  The running code selects explicit columns, so the old version keeps working: that is what makes it safe to roll back.
- **The Docker/ufw trap**: temporarily add `ports: ["5432:5432"]` to `db`, recreate it, and scan from outside with `nmap`.
- **Rate limiting**: `for i in $(seq 1 60); do curl -sk -o /dev/null -w "%{http_code} " -X POST https://localhost/api/notes -H 'content-type: application/json' -d '{"body":"x"}'; done` — watch 201s turn into 429s.

## Useful commands

```bash
docker compose ps                         # health of each service
docker compose logs -f --tail 50 api
docker compose exec db psql -U app -d app # psql without publishing 5432
cat .deploy/history                       # what was deployed when
ssh -L 5432:localhost:5432 you@vm         # only if you bind db to 127.0.0.1:5432 on the VM
```
