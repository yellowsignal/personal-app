#!/usr/bin/env bash
# After prod cutover: invite signup creates a NEW user, while dig personal rows
# stay on the old dig user ids. Reassign personal (and owned) rows to the new user.
#
# Usage on OCI (prod):
#   bash ~/personal-app/40_server/infra/scripts/transfer-personal-to-new-user.sh [newUserId]
# If newUserId omitted, uses the highest users.id (latest signup).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER_DIR="$REPO_ROOT/40_server"
PROD_ENV="$SERVER_DIR/.env.prod"
NEW_ID="${1:-}"

cd "$SERVER_DIR"

SQL_LIST=$(cat <<'SQL'
SELECT id, name, role, email FROM users ORDER BY id;
SELECT 'assets' AS t, user_id, count(*) FROM assets GROUP BY user_id
UNION ALL SELECT 'subscriptions', user_id, count(*) FROM subscriptions GROUP BY user_id
UNION ALL SELECT 'calendar_events', user_id, count(*) FROM calendar_events GROUP BY user_id
UNION ALL SELECT 'checklists', user_id, count(*) FROM checklists GROUP BY user_id
UNION ALL SELECT 'documents', user_id, count(*) FROM documents GROUP BY user_id
UNION ALL SELECT 'photos', user_id, count(*) FROM photos GROUP BY user_id
ORDER BY 1, 2;
SQL
)

echo "==> Current users / ownership"
sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -c "$SQL_LIST"

if [[ -z "$NEW_ID" ]]; then
  NEW_ID="$(sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
    psql -U myfamilyhub -d myfamilyhub -Atc 'SELECT id FROM users ORDER BY id DESC LIMIT 1;')"
fi
NEW_ID="$(echo "$NEW_ID" | tr -d '[:space:]')"
if [[ ! "$NEW_ID" =~ ^[0-9]+$ ]]; then
  echo "Could not resolve new user id" >&2
  exit 1
fi

FAMILY_ID="$(sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -Atc "SELECT family_id FROM users WHERE id=${NEW_ID};")"
FAMILY_ID="$(echo "$FAMILY_ID" | tr -d '[:space:]')"

echo "==> Transfer personal rows → user_id=${NEW_ID} (family_id=${FAMILY_ID})"
echo "    Sources: other users in the same family (dig accounts that cannot Passkey-login on prod)"

sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -v ON_ERROR_STOP=1 <<SQL
BEGIN;
-- Move owned rows from sibling family members to the new Passkey user.
UPDATE assets SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE subscriptions SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE calendar_events SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE checklists SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE documents SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE photos SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE recurring_deposits SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
UPDATE transactions SET user_id = ${NEW_ID}
  WHERE family_id = ${FAMILY_ID} AND user_id <> ${NEW_ID};
COMMIT;

SELECT 'assets' AS t, user_id, is_shared, count(*) FROM assets GROUP BY 1,2,3
UNION ALL SELECT 'subscriptions', user_id, is_shared, count(*) FROM subscriptions GROUP BY 1,2,3
UNION ALL SELECT 'calendar_events', user_id, is_shared, count(*) FROM calendar_events GROUP BY 1,2,3
ORDER BY 1,2,3;
SQL

echo "Done. Reload the prod app (pull to refresh). Wife should re-join later with a NEW invite and then we can split ownership if needed."
