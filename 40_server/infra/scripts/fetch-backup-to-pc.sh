#!/usr/bin/env bash
# Run on your PC (not on OCI): download the newest prod dump via scp into 50_backup/,
# then optionally mark+delete it on the server.
#
# Default local folder (repo clone on Windows):
#   E:\personal-app\50_backup   →  Git Bash: <repo>/50_backup
#
# Prerequisites:
#   - OpenSSH / Git Bash on the PC, with the same key you use for OCI
#   - Server already has dumps: bash ~/personal-app/40_server/infra/scripts/backup-db.sh prod
#
# Usage (PC, from repo root or any cwd):
#   bash 40_server/infra/scripts/fetch-backup-to-pc.sh
#   DELETE_AFTER=1 bash 40_server/infra/scripts/fetch-backup-to-pc.sh
#   TARGET=dig bash 40_server/infra/scripts/fetch-backup-to-pc.sh
#   DEST="E:/other/folder" bash 40_server/infra/scripts/fetch-backup-to-pc.sh
#
# PowerShell wrapper:
#   powershell -File 40_server/infra/scripts/fetch-backup-to-pc.ps1
#   powershell -File 40_server/infra/scripts/fetch-backup-to-pc.ps1 -DeleteAfter
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

HOST="${HOST:-ubuntu@129.225.196.226}"
REMOTE_ROOT="${REMOTE_ROOT:-~/personal-app}"
TARGET="${TARGET:-prod}"
# Prefer repo 50_backup (E:\personal-app\50_backup when cloned there)
DEST="${DEST:-$REPO_ROOT/50_backup}"
DELETE_AFTER="${DELETE_AFTER:-0}"
SSH_OPTS=${SSH_OPTS:-}

mkdir -p "$DEST"

REMOTE_DIR="${REMOTE_ROOT}/30_data/backups/${TARGET}"
echo "==> Listing remote dumps ($HOST:$REMOTE_DIR)"
LATEST="$(ssh $SSH_OPTS "$HOST" "ls -1t ${REMOTE_DIR}/myfamilyhub-*.dump 2>/dev/null | head -1")"
if [[ -z "$LATEST" ]]; then
  echo "No dumps found on server for target=$TARGET" >&2
  echo "On OCI (Termius) run:" >&2
  echo "  bash ~/personal-app/40_server/infra/scripts/backup-db.sh $TARGET" >&2
  exit 1
fi

BASE_NAME="$(basename "$LATEST")"
LOCAL_PATH="$DEST/$BASE_NAME"
echo "==> Download $BASE_NAME → $LOCAL_PATH"
scp $SSH_OPTS "$HOST:$LATEST" "$LOCAL_PATH"
chmod 600 "$LOCAL_PATH" 2>/dev/null || true
ls -lh "$LOCAL_PATH"

REL="${TARGET}/${BASE_NAME}"
if [[ "$DELETE_AFTER" == "1" ]]; then
  echo "==> Mark + delete on server ($REL)"
  ssh $SSH_OPTS "$HOST" \
    "bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --mark ${REL} && bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --delete ${REL}"
else
  echo "==> Mark as downloaded on server (file kept until you purge)"
  ssh $SSH_OPTS "$HOST" \
    "bash ${REMOTE_ROOT}/40_server/infra/scripts/purge-backup.sh --mark ${REL}" || true
  echo "Delete on server later:"
  echo "  DELETE_AFTER=1 bash $SCRIPT_DIR/fetch-backup-to-pc.sh"
  echo "  or on OCI: bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete ${REL}"
fi

echo "Done. Local copy: $LOCAL_PATH"
echo "Do not commit .dump files (50_backup is gitignored except README)."
