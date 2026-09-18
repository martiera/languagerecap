#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
IMPORTER="$SCRIPT_DIR/add-vocabulary-to-user.js"

if [[ ! -f "$IMPORTER" ]]; then
  printf 'Importer not found: %s\n' "$IMPORTER" >&2
  exit 1
fi

if [[ $# -lt 1 || "$1" == -* ]]; then
  printf 'Usage: %s <email> [--language <code>] [--create --password <password>]\n' "$0" >&2
  exit 1
fi

cd "$REPO_DIR"

if command -v node >/dev/null 2>&1; then
  exec node "$IMPORTER" "$@"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  printf '%s\n' 'Node.js was not found; using the project Docker environment.' >&2
  docker compose build app >/dev/null
  docker compose up -d db >/dev/null
  exec docker compose run --rm \
    --entrypoint node \
    -e NODE_PATH=/app/node_modules \
    -v "$REPO_DIR:/workspace:ro" \
    app \
    /workspace/scripts/add-vocabulary-to-user.js "$@"
fi

printf '%s\n' 'Node.js 20+ or Docker Compose is required.' >&2
exit 1
