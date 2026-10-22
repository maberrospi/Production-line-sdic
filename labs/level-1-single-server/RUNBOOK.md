1. Create VM (Ubuntu 24.04 LTS, 2 vCPU, 4 GB) in europe-west3; attach static IP
2. Cloud firewall: 80, 443 from anywhere; 22 from office IP
3. Allow only ssh connection via keys not password
4. Install Docker
5. Pull latest working commit from public repo
7. Restore .env from secret store
8. Build containers from existing docker compose
9. Restore latest DB backup onto new db volume.
10. Deploy latest working tag.

Sol:
1. Create VM (Ubuntu 24.04 LTS, 2 vCPU, 4 GB) in europe-west3; attach static IP
2. Cloud firewall: 80, 443 from anywhere; 22 from office IP
3. ssh in; install Docker (get.docker.com); git clone repo to /srv/app
4. sudo bash scripts/harden.sh deploy
5. Restore .env from the password manager entry "prod .env"; chmod 600 .env
6. Certificate: certbot --standalone (README step 4)
7. Restore DB: gcloud storage cp <latest dump> . ; pg_restore into the db container
8. bash scripts/deploy.sh <last tag from .deploy/history or the registry>
9. Point DNS A record at the new IP (TTL is 300 s)
10. Check /api/health, uptime monitor green, run backup.sh once