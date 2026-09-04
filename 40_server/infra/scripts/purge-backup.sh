#!/usr/bin/env bash
# Mark a server dump as downloaded, then optionally delete it from the server.
# Run on OCI after you have confirmed the file is on your PC.
#
# Usage on OCI:
#   bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --list
#   bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --mark prod/myfamilyhub-20260904-031500.dump
#   bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete prod/myfamilyhub-20260904-031500.dump
#   bash ~/personal-app/40_server/infra/scripts/purge-backup.sh --delete-downloaded   # remove all marked dumps
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE="$REPO_ROOT/30_data/backups"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

resolve_path() {
  local rel="$1"
  if [[ "$rel" == /* ]]; then
    echo "$rel"
    return
  fi
  if [[ -f "$BASE/$rel" ]]; then
    echo "$BASE/$rel"
    return
  fi
  if [[ -f "$rel" ]]; then
    echo "$(cd "$(dirname "$rel")" && pwd)/$(basename "$rel")"
    return
  fi
  echo ""
}

ACTION=""
ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) ACTION=list ;;
    --mark)
      ACTION=mark
      ARG="${2:-}"
      shift
      ;;
    --delete)
      ACTION=delete
      ARG="${2:-}"
      shift
      ;;
    --delete-downloaded) ACTION=delete_downloaded ;;
    -h|--help) usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
  shift
done

case "$ACTION" in
  ""|list)
    bash "$REPO_ROOT/40_server/infra/scripts/list-backups.sh"
    ;;
  mark)
    [[ -n "$ARG" ]] || { echo "--mark needs a path" >&2; exit 1; }
    PATH_RESOLVED="$(resolve_path "$ARG")"
    [[ -n "$PATH_RESOLVED" && -f "$PATH_RESOLVED" ]] || { echo "Not found: $ARG" >&2; exit 1; }
    date -u +"%Y-%m-%dT%H:%M:%SZ" >"${PATH_RESOLVED}.downloaded"
    chmod 600 "${PATH_RESOLVED}.downloaded"
    echo "Marked downloaded: $PATH_RESOLVED"
    ;;
  delete)
    [[ -n "$ARG" ]] || { echo "--delete needs a path" >&2; exit 1; }
    PATH_RESOLVED="$(resolve_path "$ARG")"
    [[ -n "$PATH_RESOLVED" && -f "$PATH_RESOLVED" ]] || { echo "Not found: $ARG" >&2; exit 1; }
    rm -f "$PATH_RESOLVED" "${PATH_RESOLVED}.downloaded"
    echo "Deleted: $PATH_RESOLVED"
    ;;
  delete_downloaded)
    count=0
    while IFS= read -r marker; do
      dump="${marker%.downloaded}"
      if [[ -f "$dump" ]]; then
        rm -f "$dump" "$marker"
        echo "Deleted: $dump"
        count=$((count + 1))
      else
        rm -f "$marker"
      fi
    done < <(find "$BASE" -type f -name 'myfamilyhub-*.dump.downloaded' 2>/dev/null || true)
    echo "Removed $count downloaded dump(s)."
    ;;
  *)
    usage 1
    ;;
esac
