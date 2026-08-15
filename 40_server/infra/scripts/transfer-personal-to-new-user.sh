#!/usr/bin/env bash
# After prod cutover: invite signup creates a NEW user, while dig personal rows
# stay on the old dig user ids. Reassign rows from same-name dig accounts to the new user.
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

echo "==> Current users / ownership"
sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -c "SELECT id, name, role FROM users ORDER BY id;"
sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -c "SELECT user_id, is_shared, count(*) FROM assets GROUP BY 1,2 ORDER BY 1,2;"

if [[ -z "$NEW_ID" ]]; then
  NEW_ID="$(sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
    psql -U myfamilyhub -d myfamilyhub -Atc 'SELECT id FROM users ORDER BY id DESC LIMIT 1;')"
fi
NEW_ID="$(echo "$NEW_ID" | tr -d '[:space:]')"
[[ "$NEW_ID" =~ ^[0-9]+$ ]] || { echo "bad new user id: $NEW_ID" >&2; exit 1; }

echo "==> Transfer dig personal rows for same name → user_id=${NEW_ID}"

sudo docker compose -p myfamilyhub-prod -f docker-compose.prod.yml --env-file "$PROD_ENV" exec -T postgres \
  psql -U myfamilyhub -d myfamilyhub -v ON_ERROR_STOP=1 <<SQL
BEGIN;
CREATE TEMP TABLE src AS
  SELECT id FROM users
  WHERE id <> ${NEW_ID}
    AND family_id = (SELECT family_id FROM users WHERE id = ${NEW_ID})
    AND name = (SELECT name FROM users WHERE id = ${NEW_ID});

SELECT id AS source_user_id FROM src;

UPDATE assets SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE subscriptions SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE calendar_events SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE checklists SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE documents SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE photos SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE recurring_deposits SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
UPDATE transactions SET user_id = ${NEW_ID} WHERE user_id IN (SELECT id FROM src);
COMMIT;

SELECT user_id, is_shared, count(*) AS assets FROM assets GROUP BY 1,2 ORDER BY 1,2;
SQL

echo "Done. Pull-to-refresh prod. If name differed from dig, re-run with explicit old/new ids."
