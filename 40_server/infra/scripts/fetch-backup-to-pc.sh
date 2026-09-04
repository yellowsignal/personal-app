#!/usr/bin/env bash
# Run on your PC (not on OCI): download the newest prod dump via scp, then
# optionally mark+delete it on the server.
#
# Prerequisites:
#   - SSH access to the OCI host (Termius / OpenSSH key)
#   - Server already has dumps under ~/personal-app/30_data/backups/
#
# Usage (PC):
#   bash fetch-backup-to-pc.sh
#   HOST=ubuntu@129.225.196.226 DEST=~/Backups/myfamilyhub bash fetch-backup-to-pc.sh
#   DELETE_AFTER=1 bash fetch-backup-to-pc.sh          # scp then purge on server
#   TARGET=dig bash fetch-backup-to-pc.sh
#
# Copy this script out of the repo or run from a clone:
#   bash 40_server/infra/scripts/fetch-backup-to-pc.sh
set -euo pipefail

HOST="${HOST:-ubuntu@129.225.196.226}"
REMOTE_ROOT="${REMOTE_ROOT:-~/personal-app}"
TARGET="${TARGET:-prod}"
DEST="${DEST:-$HOME/Backups/myfamilyhub}"
DELETE_AFTER="${DELETE_AFTER:-0}"
SSH_OPTS=${SSH_OPTS:-}

mkdir -p "$DEST"

REMOTE_DIR="${REMOTE_ROOT}/30_data/backups/${TARGET}"
echo "==> Listing remote dumps ($HOST:$REMOTE_DIR)"
LATEST="$(ssh $SSH_OPTS "$HOST" "ls -1t ${REMOTE_DIR}/myfamilyhub-*.dump 2>/dev/null | head -1")"
if [[ -z "$LATEST" ]]; then
  echo "No dumps found on server for target=$TARGET" >&2
  echo "On OCI run: bash ~/personal-app/40_server/infra/scripts/backup-db.sh $TARGET" >&2
  exit 1
fi

BASE_NAME="$(basename "$LATEST")"
LOCAL_PATH="$DEST/$BASE_NAME"
echo "==> Download $BASE_NAME → $LOCAL_PATH"
scp $SSH_OPTS "$HOST:$LATEST" "$LOCAL_PATH"
chmod 600 "$LOCAL_PATH"
ls -lh "$LOCAL_PATH"

REL="${TARGET}/${BASE_NAME}"
if [[ "$DELETE_AFTER" == "1" ]]; then
  echo "==> Mark + delete on server ($REL)"
  ssh $SSH_OPTS "$HOST" \
    "bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --mark ${REL} && bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --delete ${REL}"
else
  echo "==> Mark as downloaded on server (file kept until you purge)"
  ssh $SSH_OPTS "$HOST" \
    "bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --mark ${REL}"
  echo "Later, on OCI or via:"
  echo "  DELETE_AFTER=1 HOST=$HOST bash $0"
fi

echo "Done. Keep $LOCAL_PATH on an encrypted disk / password-protected folder."
echo "Do not commit dumps or store them next to JWT/DB passwords."
