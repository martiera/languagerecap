# Docker deployment with GitHub Actions

## Architecture

GitHub Actions builds the production image on a GitHub-hosted runner and publishes a private image to GHCR:

```text
pull request -> build validation
push to master -> build -> GHCR -> SSH -> Droplet pulls image -> migrations -> health check
```

The Droplet does not run `docker compose build`. This keeps the memory-heavy Next.js build off a 1 GB server.

## GitHub configuration

The workflow is `.github/workflows/deploy.yml`. It builds pull requests, publishes and deploys on pushes to `master`, and provides two manual deployment modes:

- `build_and_deploy`: build and publish the selected commit, then deploy it.
- `deploy_existing`: deploy an already-published SHA-tagged image without rebuilding it. The SHA must be reachable from `master`; leaving `image_sha` blank uses the selected workflow commit.

For a failed deployment after a successful build, run the workflow manually with `deploy_existing` and enter the SHA from the successful build. This reuses the immutable GHCR image.

Add these repository secrets:

- `DROPLET_HOST`: public hostname or IP.
- `DROPLET_USER`: deployment SSH user.
- `DROPLET_SSH_PRIVATE_KEY`: private key whose public key is installed for that user.
- `DROPLET_KNOWN_HOSTS`: output for the Droplet from `ssh-keyscan -H <host>` after independently verifying the fingerprint.

The workflow uses `GITHUB_TOKEN` with `packages: write` to publish to GHCR. The image remains private.

The numbered migrations also seed a read-only demo account at
`demo@languagerecap.local` with sample Italian vocabulary. The public **Try the
demo** link creates a session for this account and opens the normal dashboard
and review pages. Migrations also seed representative conjugations for all
forms stages. Demo review answers are evaluated but never change the shared
account's SRS state; lesson parsing and saving are blocked.

## Droplet setup

Install Docker Engine, the Docker Compose plugin, `curl`, and `ca-certificates`. Create `/opt/languagerecap` and place these files there:

- `docker-compose.production.yml`
- `deploy-production.sh`
- `lib/schema.sql`
- `migrations/`
- `.env`

The `.env` file must contain production-only values for PostgreSQL, `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `NEXT_PUBLIC_APP_URL`, and optional model names. Never commit it.

The deployment user needs permission to run Docker and must own `/opt/languagerecap`, because GitHub Actions installs the deployment files there without an interactive `sudo` password:

```bash
mkdir -p /opt/languagerecap
chown -R deploy:deploy /opt/languagerecap
```

The server must already be authenticated to private GHCR with a read-only deploy token:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
```

Create the initial `/opt/languagerecap` directory and `.env`, and ensure the database volume is persistent. Each `master` deployment transfers the production Compose file, schema, migrations, and deployment script automatically. PostgreSQL should not be publicly exposed; allow only SSH, HTTP, and HTTPS through the firewall.

Example `.env` structure (replace every placeholder with a real value):

```dotenv
POSTGRES_USER=languagerecap
POSTGRES_PASSWORD=replace-with-a-long-random-password
POSTGRES_DB=languagerecap
DATABASE_URL=postgresql://languagerecap:YOUR_DB_PASSWORD@db:5432/languagerecap
AUTH_SECRET=replace-with-at-least-32-random-bytes
GEMINI_API_KEY=replace-with-your-gemini-key
GEMINI_MODEL=
GEMINI_VERIFIER_MODEL=
NEXT_PUBLIC_APP_URL=https://your-domain.example
PORT=3000
```

The two Gemini model variables may remain empty; defining them explicitly avoids Compose warnings.

Create it on the Droplet, not in the repository:

```bash
umask 077
nano /opt/languagerecap/.env
chown deploy:deploy /opt/languagerecap/.env
chmod 600 /opt/languagerecap/.env
```

## Deployment and rollback

The workflow transfers `deploy-production.sh` and invokes it with the immutable image reference. The script:

1. Pulls the image.
2. Starts PostgreSQL.
3. Applies the base schema and numbered migrations idempotently.
4. Recreates only the app container.
5. Requests `NEXT_PUBLIC_APP_URL` with `curl`.
6. Restores the previous image recorded in `.deployed-image` if the health check fails.

The database volume is not removed during deployment. Keep external backups because a single Droplet is not a backup strategy.
