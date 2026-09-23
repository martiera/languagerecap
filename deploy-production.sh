#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
STATE_FILE="${STATE_FILE:-$ROOT_DIR/.deployed-image}"
APP_IMAGE="${1:-}"
COSIGN_CERTIFICATE_IDENTITY="${COSIGN_CERTIFICATE_IDENTITY:-https://github.com/martiera/languagerecap/.github/workflows/deploy.yml@refs/heads/master}"
COSIGN_OIDC_ISSUER="${COSIGN_OIDC_ISSUER:-https://token.actions.githubusercontent.com}"

if [[ -z "$APP_IMAGE" ]]; then
  printf 'Usage: %s <image-reference>\n' "$0" >&2
  exit 64
fi
if [[ ! "$APP_IMAGE" =~ ^ghcr\.io/[^@]+@sha256:[0-9a-f]{64}$ ]]; then
  printf 'Production image must be an immutable GHCR digest reference.\n' >&2
  exit 64
fi
missing_file=0
for required_file in "$COMPOSE_FILE" "$ENV_FILE"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Missing required deployment file: %s\n' "$required_file" >&2
    missing_file=1
  fi
done
for required_secret in postgres_password database_url gemini_api_key auth_secret; do
  secret_path="${SECRETS_DIR:-$ROOT_DIR/secrets}/$required_secret"
  if [[ ! -f "$secret_path" || ! -s "$secret_path" ]]; then
    printf 'Missing required secret file: %s\n' "$secret_path" >&2
    missing_file=1
  fi
done
if (( missing_file )); then
  printf 'Provision secrets once with: %s\n' "$ROOT_DIR/provision-production-secrets.sh" >&2
  exit 1
fi

missing_config=0
for required_config in PUBLIC_HOSTNAME ACME_EMAIL; do
  if ! grep -Eq "^${required_config}=[^[:space:]#].*$" "$ENV_FILE"; then
    printf 'Missing required production setting in %s: %s\n' "$ENV_FILE" "$required_config" >&2
    missing_config=1
  fi
done
if (( missing_config )); then
  printf 'Set PUBLIC_HOSTNAME to the DNS name for this Droplet and ACME_EMAIL to a monitored address.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"
export APP_IMAGE
previous_image=""
if [[ -f "$STATE_FILE" ]]; then
  previous_image="$(tr -d '\r\n' < "$STATE_FILE")"
  if [[ -n "$previous_image" && ! "$previous_image" =~ ^ghcr\.io/[^@]+@sha256:[0-9a-f]{64}$ ]]; then
    printf 'Ignoring legacy or mutable rollback reference in %s: %s\n' "$STATE_FILE" "$previous_image" >&2
    previous_image=""
  fi
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

printf 'Pulling %s...\n' "$APP_IMAGE"
if ! command -v cosign >/dev/null 2>&1; then
  printf 'cosign is required to verify production images. Install it on the Droplet; see docs/DEPLOYMENT.md.\n' >&2
  exit 1
fi
cosign verify \
  --certificate-identity "$COSIGN_CERTIFICATE_IDENTITY" \
  --certificate-oidc-issuer "$COSIGN_OIDC_ISSUER" \
  "$APP_IMAGE" >/dev/null
"${compose[@]}" pull app
printf '%s\n' 'Starting PostgreSQL...'
"${compose[@]}" up -d db

printf '%s\n' 'Waiting for PostgreSQL to become ready...'
db_ready=0
for attempt in {1..30}; do
  if "${compose[@]}" exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 2
done
if (( ! db_ready )); then
  printf '%s\n' 'PostgreSQL did not become ready in time.' >&2
  "${compose[@]}" logs --tail 50 db >&2 || true
  exit 1
fi

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
"${compose[@]}" up -d --no-build --force-recreate app caddy
app_ready=0
for attempt in {1..30}; do
  if "${compose[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/').then(response => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))" >/dev/null 2>&1; then
    app_ready=1
    break
  fi
  sleep 2
done
if (( ! app_ready )); then
  printf 'Health check failed for %s.\n' "$APP_IMAGE" >&2
  printf '%s\n' 'Recent app logs:' >&2
  "${compose[@]}" logs --tail 100 app >&2 || true
  printf '%s\n' 'Recent Caddy logs:' >&2
  "${compose[@]}" logs --tail 100 caddy >&2 || true
  if [[ -n "$previous_image" && "$previous_image" != "$APP_IMAGE" ]]; then
    printf 'Rolling back to %s...\n' "$previous_image" >&2
    if cosign verify \
        --certificate-identity "$COSIGN_CERTIFICATE_IDENTITY" \
        --certificate-oidc-issuer "$COSIGN_OIDC_ISSUER" \
        "$previous_image" >/dev/null; then
      export APP_IMAGE="$previous_image"
      "${compose[@]}" up -d --no-build --force-recreate app caddy
    else
      printf 'Rollback image verification failed; leaving the failed deployment in place for manual recovery.\n' >&2
    fi
  else
    printf 'No verified immutable rollback image is available; manual recovery is required.\n' >&2
  fi
  exit 1
fi

printf '%s\n' "$APP_IMAGE" > "$STATE_FILE"
printf 'Deployment complete: %s\n' "$APP_IMAGE"
