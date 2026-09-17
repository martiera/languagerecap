#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

printf '%s\n' 'Building the LanguageRecap app image...'
docker compose build app

printf '%s\n' 'Starting PostgreSQL while preserving its data...'
docker compose up -d db

printf '%s\n' 'Applying database schema...'
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/001-schema.sql'

docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())"'

for migration in migrations/[0-9][0-9][0-9]_*.sql; do
  migration_id="$(basename "$migration" .sql)"
  applied="$(docker compose exec -T db sh -c "psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT 1 FROM schema_migrations WHERE version='${migration_id}'\"")"
  if [ "$applied" = "1" ]; then
    printf 'Skipping migration %s (already applied)\n' "$migration_id"
    continue
  fi
  printf 'Applying migration %s\n' "$migration_id"
  docker compose exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -f \"/migrations/${migration_id}.sql\""
  docker compose exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO schema_migrations (version) VALUES ('${migration_id}')\""
done

printf '%s\n' 'Deploying the app service while preserving PostgreSQL data...'
docker compose up -d --force-recreate app

APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:${PORT:-3000}}"
printf 'Waiting for %s ...\n' "$APP_URL"
curl --fail --silent --show-error --location --retry 10 --retry-delay 2 --retry-connrefused --retry-all-errors "$APP_URL" > /dev/null

printf '%s\n' 'Deployment complete.'
docker compose ps
