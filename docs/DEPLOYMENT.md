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

Install Docker Engine, the Docker Compose plugin, `curl`, `ca-certificates`, and Cosign. Create `/opt/languagerecap` and place these files there:

- `docker-compose.production.yml`
- `Caddyfile`
- `deploy-production.sh`
- `lib/schema.sql`
- `migrations/`
- `.env`
- `secrets/`

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

Create secret files on the Droplet, not in the repository:

```bash
install -d -m 700 /opt/languagerecap/secrets
printf '%s' 'replace-with-a-long-random-postgres-password' > /opt/languagerecap/secrets/postgres_password
printf '%s' 'postgresql://languagerecap:replace-with-a-long-random-postgres-password@db:5432/languagerecap' > /opt/languagerecap/secrets/database_url
printf '%s' 'replace-with-at-least-32-random-bytes' > /opt/languagerecap/secrets/auth_secret
printf '%s' 'replace-with-your-gemini-key' > /opt/languagerecap/secrets/gemini_api_key
chmod 600 /opt/languagerecap/secrets/*
chown -R deploy:deploy /opt/languagerecap/secrets
```

The app reads secret values from `/run/secrets`. Secret values are not passed as ordinary Compose environment variables. Rotate a secret by replacing the file with mode 0600, recreating the affected service, and removing the old value from the host.

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
