#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
STATE_FILE="${STATE_FILE:-$ROOT_DIR/.deployed-image}"
APP_IMAGE="${1:-}"

if [[ -z "$APP_IMAGE" ]]; then
  printf 'Usage: %s <image-reference>\n' "$0" >&2
  exit 64
fi
if [[ ! -f "$COMPOSE_FILE" || ! -f "$ENV_FILE" ]]; then
  printf 'Missing production Compose file or environment file.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"
export APP_IMAGE
previous_image=""
if [[ -f "$STATE_FILE" ]]; then
  previous_image="$(tr -d '\r\n' < "$STATE_FILE")"
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

printf 'Pulling %s...\n' "$APP_IMAGE"
"${compose[@]}" pull app
printf '%s\n' 'Starting PostgreSQL...'
"${compose[@]}" up -d db

printf '%s\n' 'Applying schema and migrations...'
"${compose[@]}" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/001-schema.sql'
"${compose[@]}" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT NOW())"'

for migration in "$ROOT_DIR"/migrations/[0-9][0-9][0-9]_*.sql; do
  [[ -e "$migration" ]] || continue
  migration_id="$(basename "$migration" .sql)"
  applied="$("${compose[@]}" exec -T db sh -c "psql -At -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"SELECT 1 FROM schema_migrations WHERE version='${migration_id}'\"")"
  if [[ "$applied" == "1" ]]; then
    continue
  fi
  "${compose[@]}" exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -f \"/migrations/${migration_id}.sql\""
  "${compose[@]}" exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO schema_migrations (version) VALUES ('${migration_id}')\""
done

printf 'Starting app image %s...\n' "$APP_IMAGE"
"${compose[@]}" up -d --no-build --force-recreate app

app_url="${NEXT_PUBLIC_APP_URL:-http://localhost:${PORT:-3000}}"
if ! curl --fail --silent --show-error --location --retry 15 --retry-delay 2 --retry-connrefused --retry-all-errors "$app_url" >/dev/null; then
  printf 'Health check failed for %s.\n' "$APP_IMAGE" >&2
  if [[ -n "$previous_image" && "$previous_image" != "$APP_IMAGE" ]]; then
    printf 'Rolling back to %s...\n' "$previous_image" >&2
    export APP_IMAGE="$previous_image"
    "${compose[@]}" up -d --no-build --force-recreate app
  fi
  exit 1
fi

printf '%s\n' "$APP_IMAGE" > "$STATE_FILE"
printf 'Deployment complete: %s\n' "$APP_IMAGE"
