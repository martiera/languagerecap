#!/usr/bin/env bash
set -euo pipefail

SECRETS_DIR="${SECRETS_DIR:-/opt/languagerecap/secrets}"
if [[ "$SECRETS_DIR" != /* || "$SECRETS_DIR" == "/" ]]; then
  printf 'SECRETS_DIR must be an absolute path other than /.\n' >&2
  exit 64
fi

umask 077
install -d -m 700 "$SECRETS_DIR"
if [[ ! -w "$SECRETS_DIR" ]]; then
  printf 'Secret directory is not writable: %s\n' "$SECRETS_DIR" >&2
  exit 1
fi

read_secret() {
  local label="$1"
  local value
  while :; do
    read -r -s -p "$label: " value
    printf '\n' >&2
    if [[ -n "$value" ]]; then
      REPLY="$value"
      return
    fi
    printf '%s must not be empty.\n' "$label" >&2
  done
}

read_secret 'PostgreSQL password'
postgres_password="$REPLY"

read_secret 'Database URL (postgresql://user:password@db:5432/database)'
database_url="$REPLY"
if [[ ! "$database_url" =~ ^postgres(ql)?:// ]]; then
  printf 'Database URL must start with postgres:// or postgresql://.\n' >&2
  exit 64
fi

read_secret 'Gemini API key'
gemini_api_key="$REPLY"

read_secret 'Application auth secret (at least 32 random characters)'
auth_secret="$REPLY"
if (( ${#auth_secret} < 32 )); then
  printf 'Application auth secret must contain at least 32 characters.\n' >&2
  exit 64
fi

temporary_dir="$(mktemp -d "$SECRETS_DIR/.provision.XXXXXX")"
cleanup() {
  rm -rf "$temporary_dir"
}
trap cleanup EXIT
chmod 700 "$temporary_dir"

printf '%s' "$postgres_password" > "$temporary_dir/postgres_password"
printf '%s' "$database_url" > "$temporary_dir/database_url"
printf '%s' "$gemini_api_key" > "$temporary_dir/gemini_api_key"
printf '%s' "$auth_secret" > "$temporary_dir/auth_secret"
chmod 600 "$temporary_dir"/*

for secret_name in postgres_password database_url gemini_api_key auth_secret; do
  mv -f "$temporary_dir/$secret_name" "$SECRETS_DIR/$secret_name"
done

printf 'Production secret files created in %s with restrictive permissions.\n' "$SECRETS_DIR"
printf 'Run the deployment again after verifying the values and ownership.\n'
