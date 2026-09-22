# Docker deployment with GitHub Actions

## Architecture

GitHub Actions builds the production image on a GitHub-hosted runner and publishes a private, signed image to GHCR:

```text
pull request -> reproducible build validation
push to master -> build -> sign immutable digest -> SSH -> Droplet verifies -> migrations -> health check
```

Production traffic enters through Caddy:

```text
Internet :80/:443 -> Caddy (automatic HTTPS) -> private app network -> Next.js
                                      private app network -> PostgreSQL
```

Only ports 80 and 443 are public. The app port and PostgreSQL are not published to the host. Caddy persists ACME certificate state in the `caddy_data` volume.

## GitHub configuration

The workflow is `.github/workflows/deploy.yml`. It builds pull requests, publishes and deploys on pushes to `master`, and provides two manual modes:

- `build_and_deploy`: build, sign, publish, and deploy the selected commit.
- `deploy_existing`: resolve and verify an already-published signed image digest without rebuilding.

Required repository secrets:

- `DROPLET_HOST`
- `DROPLET_USER`
- `DROPLET_SSH_PRIVATE_KEY`
- `DROPLET_KNOWN_HOSTS`

Images are deployed by immutable digest, signed with keyless Cosign using GitHub Actions OIDC, and accompanied by an SPDX SBOM artifact. The Droplet verifies the certificate identity and OIDC issuer before pulling an image. Rollback verifies the previous digest through the same policy.

The deployment SSH key is manually rotated on a documented schedule: install the new public key, update the GitHub secret, verify a deployment, then remove the old public key. Caddy separately maintains HTTPS certificates and renewal keys.

## Droplet setup

Install Docker Engine, the Docker Compose plugin, `curl`, `ca-certificates`, and Cosign. Cosign must be installed before the first deployment because the deployment refuses to pull an image until its signature is verified. Create `/opt/languagerecap` and place these files there:

- `docker-compose.production.yml`
- `Caddyfile`
- `deploy-production.sh`
- `lib/schema.sql`
- `migrations/`
- `.env`
- `secrets/`
- `provision-production-secrets.sh`

### Install Cosign manually

Run these commands over SSH as an administrator, using the architecture shown by `uname -m`. Pin the approved release, download the binary and its checksum file from the official Sigstore GitHub release, verify the checksum before installing, and then remove the download directory:

```bash
set -euo pipefail
COSIGN_VERSION=v3.1.3
case "$(uname -m)" in
  x86_64) COSIGN_ARCH=amd64 ;;
  aarch64|arm64) COSIGN_ARCH=arm64 ;;
  *) printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
curl --fail --silent --show-error --location \
  --output "$tmp_dir/cosign-linux-$COSIGN_ARCH" \
  "https://github.com/sigstore/cosign/releases/download/$COSIGN_VERSION/cosign-linux-$COSIGN_ARCH"
curl --fail --silent --show-error --location \
  --output "$tmp_dir/cosign_checksums.txt" \
  "https://github.com/sigstore/cosign/releases/download/$COSIGN_VERSION/cosign_checksums.txt"
(cd "$tmp_dir" && grep "cosign-linux-$COSIGN_ARCH$" cosign_checksums.txt | sha256sum -c -)
install -m 0755 "$tmp_dir/cosign-linux-$COSIGN_ARCH" /usr/local/bin/cosign
cosign version
```

The checksum command must pass before installation. If the release asset, checksum entry, or architecture does not match, stop and investigate instead of installing the binary. Confirm the deployment user can execute it:

```bash
command -v cosign
cosign version
```

Do not replace this step with `curl | sh`, an unverified package, or a deployment script that skips signature verification.

The deployment user should own `/opt/languagerecap`, use a dedicated account, and have only the Docker permissions required by the deployment model. Keep SSH password login disabled and verify the host key independently.

The server must already be authenticated to private GHCR with a read-only deploy token:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
```

Configure DNS before the first deployment:

- `PUBLIC_HOSTNAME` must resolve to the Droplet.
- `ACME_EMAIL` must be a monitored address.
- The firewall should allow only SSH, HTTP, and HTTPS.

## Non-secret `.env`

Create `/opt/languagerecap/.env` on the Droplet, not in the repository:

```dotenv
POSTGRES_USER=languagerecap
POSTGRES_DB=languagerecap
DATABASE_URL_FILE=/run/secrets/database_url
AUTH_SECRET_FILE=/run/secrets/auth_secret
GEMINI_API_KEY_FILE=/run/secrets/gemini_api_key
GEMINI_MODEL=
GEMINI_VERIFIER_MODEL=
NEXT_PUBLIC_APP_URL=https://your-domain.example
PUBLIC_HOSTNAME=your-domain.example
ACME_EMAIL=admin@your-domain.example
SECRETS_DIR=/opt/languagerecap/secrets
```

Use mode 0600 for this file. `PUBLIC_HOSTNAME` and `ACME_EMAIL` are deployment-time values and must not be committed.

## Docker secrets

Secret files are provisioned manually on the Droplet, not in the repository or GitHub Actions. After the first workflow run transfers the helper, run it as the deployment user:

```bash
/opt/languagerecap/provision-production-secrets.sh
```

The helper prompts without echoing values, rejects empty values and malformed database URLs, requires an auth secret of at least 32 characters, writes through a private temporary directory, and sets mode `0600` on the four final files. The database URL must use the same PostgreSQL credentials configured by `POSTGRES_USER`, `POSTGRES_DB`, and `postgres_password`, for example `postgresql://languagerecap:PASSWORD@db:5432/languagerecap`.

Verify only metadata, never values:

```bash
stat -c '%A %U:%G %n' /opt/languagerecap/secrets/*
```

Expected permissions are `-rw-------`; the directory must be `drwx------` and owned by the deployment user that runs Docker Compose. The deployment will continue to fail closed if any file is missing or empty. If the current deployment reports missing files, provision them with the helper and rerun the deployment.

The app reads secret values from `/run/secrets`. Secret values are not passed as ordinary Compose environment variables. Rotate a secret by running the helper again, recreating the affected service, and removing the old value from the host.

## Deployment and rollback

The workflow transfers deployment artifacts to a unique mode-0700 staging directory and removes it after use. It does not use predictable shared `/tmp` paths or copy server secrets.

`deploy-production.sh`:

1. Requires an immutable `ghcr.io/...@sha256:...` reference.
2. Verifies the Cosign certificate identity and OIDC issuer.
3. Pulls the signed image.
4. Starts PostgreSQL and applies the base schema plus numbered migrations idempotently.
5. Recreates the app and Caddy services as needed.
6. Checks the app locally from inside its container.
7. Restores the previous signed digest recorded in `.deployed-image` if health checks fail.

The database volume is not removed during deployment. Keep external backups because a single Droplet is not a backup strategy.

## Runtime hardening

The app runs as a non-root user with a read-only root filesystem, dropped Linux capabilities, and `no-new-privileges`. Caddy terminates TLS, redirects HTTP to HTTPS, and adds security headers. PostgreSQL remains on an internal Docker network.

The Docker build uses the committed lockfile, `npm ci`, and pinned base-image digests. Keep dependency and base-image updates reviewable and run the deployment validation before rollout.
