# Production deploy (EC2 + Docker Compose)

Every push to `main` (or a manual *Run workflow*) runs `.github/workflows/deploy.yml`:

1. Builds `ghcr.io/amitavrchy/medora-backend` and `ghcr.io/amitavrchy/medora-frontend` (tags `latest` + commit SHA) in GitHub Actions.
2. Copies `deploy/docker-compose.prod.yml` to `/opt/apps/medora/docker-compose.yml` on the server.
3. Logs the server into GHCR, `docker compose pull && docker compose up -d`, runs `prisma migrate deploy` in a backend container, prunes old images.

| Service  | Image                                    | Host port (127.0.0.1) | Public URL                               |
|----------|------------------------------------------|-----------------------|------------------------------------------|
| frontend | ghcr.io/amitavrchy/medora-frontend       | 3004                  | https://medora.13.203.3.1.sslip.io       |
| backend  | ghcr.io/amitavrchy/medora-backend        | 4004                  | https://api.medora.13.203.3.1.sslip.io   |

The browser only talks to the frontend origin: `/api/*` is proxied by the Next.js server to `http://medora-backend:4004/*`
on `apps-net` (the `/api` prefix is stripped; the backend has no global prefix, e.g. `/health`, `/auth/login`).
Session cookies are `SameSite=Strict` on the frontend host. Exposing the API host publicly is optional.

## One-time server setup

- External Docker network `apps-net` with the `shared-postgres` (Postgres 16) container on it; database + user `medora`.
- `/opt/apps/medora/.env` created from `deploy/.env.example` (`chmod 600`).
- Host Nginx: frontend host -> `127.0.0.1:3004`, (optional) API host -> `127.0.0.1:4004`; forward `X-Forwarded-For` / `X-Forwarded-Proto`.
- After the first deploy, create the initial accounts (there is no public sign-up). The seed creates 5 role accounts **and demo catalogue/stock data**:

  ```bash
  cd /opt/apps/medora
  # SEED_PASSWORD (12+ chars) must be set in .env
  docker compose run --rm -T backend node dist/prisma/seed.js
  ```

  Sign in as `owner@medora.local`, change the password, and set the real licence/address/team in Settings.

## Manual operations

```bash
cd /opt/apps/medora
docker compose run --rm -T backend prisma migrate deploy   # migrations
docker compose logs -f backend
docker compose --profile worker up -d                       # maintenance worker (needs REDIS_URL)
```
