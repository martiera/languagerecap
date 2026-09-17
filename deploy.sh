#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

printf '%s\n' 'Building the LanguageRecap app image...'
docker compose build app

printf '%s\n' 'Deploying the app service while preserving PostgreSQL data...'
docker compose up -d --force-recreate app

APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:${PORT:-3000}}"
printf 'Waiting for %s ...\n' "$APP_URL"
curl --fail --silent --show-error --location --retry 10 --retry-delay 2 --retry-connrefused --retry-all-errors "$APP_URL" > /dev/null

printf '%s\n' 'Deployment complete.'
docker compose ps
