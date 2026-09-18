# Docker deployment with GitHub Actions

## Architecture

GitHub Actions builds the production image on a GitHub-hosted runner and publishes a private image to GHCR:

```text
pull request -> build validation
push to main -> build -> GHCR -> SSH -> Droplet pulls image -> migrations -> health check
```

The Droplet does not run `docker compose build`. This keeps the memory-heavy Next.js build off a 1 GB server.

## GitHub configuration

The workflow is `.github/workflows/deploy.yml`. It builds pull requests, publishes on pushes to `main`, and deploys only from `main`.

Add these repository secrets:

- `DROPLET_HOST`: public hostname or IP.
- `DROPLET_USER`: deployment SSH user.
- `DROPLET_SSH_PRIVATE_KEY`: private key whose public key is installed for that user.
- `DROPLET_KNOWN_HOSTS`: output for the Droplet from `ssh-keyscan -H <host>` after independently verifying the fingerprint.

The workflow uses `GITHUB_TOKEN` with `packages: write` to publish to GHCR. The image remains private.

## Droplet setup

Install Docker Engine, the Docker Compose plugin, `curl`, and `ca-certificates`. Create `/opt/languagerecap` and place these files there:

- `docker-compose.production.yml`
- `deploy-production.sh`
- `lib/schema.sql`
- `migrations/`
- `.env`

The `.env` file must contain production-only values for PostgreSQL, `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`, and optional model names. Never commit it.

The deployment user needs permission to run Docker and to install the deployment script under `/opt/languagerecap`. The server must already be authenticated to private GHCR with a read-only deploy token:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
```

Create the initial `/opt/languagerecap` directory and `.env`, and ensure the database volume is persistent. Each main-branch deployment transfers the production Compose file, schema, migrations, and deployment script automatically. PostgreSQL should not be publicly exposed; allow only SSH, HTTP, and HTTPS through the firewall.

## Deployment and rollback

The workflow transfers `deploy-production.sh` and invokes it with the immutable image reference. The script:

1. Pulls the image.
2. Starts PostgreSQL.
3. Applies the base schema and numbered migrations idempotently.
4. Recreates only the app container.
5. Requests `NEXT_PUBLIC_APP_URL` with `curl`.
6. Restores the previous image recorded in `.deployed-image` if the health check fails.

The database volume is not removed during deployment. Keep external backups because a single Droplet is not a backup strategy.
