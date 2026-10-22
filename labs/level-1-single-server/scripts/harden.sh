#!/usr/bin/env bash
# Baseline hardening for an Ubuntu VM that runs Docker.
#
#   sudo bash scripts/harden.sh <your-username>
#
# Read every line before running it. It disables SSH password login, so confirm
# that key-based login works for <your-username> first or you will lock yourself out.
set -euo pipefail

USER_NAME="${1:?usage: sudo bash harden.sh <your-username>}"
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo" >&2; exit 1; }

KEYS="/home/${USER_NAME}/.ssh/authorized_keys"
if [ ! -s "$KEYS" ]; then
  echo "No SSH keys in $KEYS. Add your public key first, then rerun." >&2
  exit 1
fi

echo "== Packages: security updates, firewall, fail2ban"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== SSH: keys only, no root login"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

echo "== Firewall: deny inbound except SSH, HTTP, HTTPS"
# Reminder: ports PUBLISHED by Docker bypass these rules. Keep db and api unpublished.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban for sshd"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== Docker group for ${USER_NAME} (if Docker is installed)"
if getent group docker > /dev/null; then usermod -aG docker "$USER_NAME"; fi

echo
echo "Done. Before closing this session, open a NEW terminal and check you can still log in:"
echo "  ssh ${USER_NAME}@<this-vm>"
ufw status verbose
