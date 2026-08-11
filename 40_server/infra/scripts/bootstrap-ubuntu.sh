#!/usr/bin/env bash
# Run once on the Oracle Cloud Ubuntu ARM instance (as a sudo-capable user).
# Installs Docker, renders HTTP nginx config, starts postgres+nginx+certbot.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Installing Docker Engine + Compose plugin (if needed)"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
fi

if [[ ! -f "$INFRA_DIR/.env" ]]; then
  cp "$INFRA_DIR/.env.example" "$INFRA_DIR/.env"
  echo "Created $INFRA_DIR/.env from example. Edit DOMAIN / passwords / DuckDNS token, then re-run."
  exit 1
fi

echo "==> Rendering HTTP nginx config"
bash "$SCRIPT_DIR/render-nginx.sh" http

echo "==> Starting infra stack (postgres + nginx + certbot renew loop)"
cd "$INFRA_DIR"
sudo docker compose pull
sudo docker compose up -d

echo
echo "Bootstrap complete."
echo "Next:"
echo "  1) Open OCI VCN security list / NSG for TCP 80 and 443 (ingress)"
echo "  2) ./update-duckdns.sh <PUBLIC_IP>"
echo "  3) ./issue-cert.sh"
echo "  4) curl -I http://\$DOMAIN"
