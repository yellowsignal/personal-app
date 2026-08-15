#!/usr/bin/env bash
# Build client and sync to /var/www/myfamily or /var/www/myfamily-dev on this host.
# Run from repo root on the OCI instance (or after rsync of the repo).
#
# Usage:
#   ./40_server/infra/scripts/deploy-static.sh dev
#   ./40_server/infra/scripts/deploy-static.sh prod
set -euo pipefail

TARGET="${1:-dev}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

case "$TARGET" in
  prod) DEST="/var/www/myfamilyhub" ;;
  # dig static root on OCI (deploy-dig.sh uses the same path)
  dev)  DEST="/var/www/myfamilyhub-dev" ;;
  *)
    echo "Usage: $0 prod|dev" >&2
    exit 1
    ;;
esac

echo "==> Building client (workspace)"
cd "$REPO_ROOT"
npm install
npm run build --workspace @personal-app/client

echo "==> Syncing to $DEST"
sudo mkdir -p "$DEST"
sudo rsync -a --delete "$REPO_ROOT/20_client/dist/" "$DEST/"
echo "Done. Open the $TARGET domain in Safari to verify."
