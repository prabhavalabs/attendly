# Deployment

attendly is **self-hosted** on a VPS:

- **API** — a Go backend (`apps/api`) with an **embedded SQLite** database, run
  as a Docker container. Uploads/PDFs use **Cloudflare R2** (S3-compatible) when
  configured, else local disk.
- **Admin portal** — a static **Vite** SPA (`apps/admin`), served by your
  reverse proxy (Caddy/nginx) or any static host.
- **Mobile** — the Expo app ships via EAS / app stores (and a PWA).

CI/CD lives in [`.github/workflows`](.github/workflows):

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | PRs + pushes to `develop`/`main` | Go backend `vet` + `test -race` + build; admin typecheck + build |
| `deploy.yml` | push to `main` (merged PR) | SSH to the VPS, pull `main`, `docker compose up -d --build`, health check |

## Local development

```bash
make up        # install deps, create apps/api/.env (with generated dev secrets)
make backend   # Go API on :8787 (live logs)   — terminal 1
make admin     # admin portal on :5173          — terminal 2
make seed      # create the owner via /api/setup
make test      # go test -race + admin typecheck
```

SQLite needs no server — the DB is a file (`apps/api/data/attendly.db`). There
is no separate "infrastructure" to start locally.

## Server configuration (`apps/api/.env`)

| Variable | Required | Notes |
| --- | --- | --- |
| `ADDR` | — | listen address (default `:8787`) |
| `DB_PATH` | — | SQLite file path (default `./data/attendly.db`, `/data/...` in Docker) |
| `JWT_SECRET` | ✅ | HS256 token signing secret (keep stable) |
| `ENCRYPTION_KEY` | ✅ | AES-GCM key for OAuth tokens at rest |
| `CORS_ORIGINS` | ✅ | comma-separated allowed origins (the admin URL) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google Calendar OAuth |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | optional | object storage; falls back to local disk if unset |

> R2 uploads use the S3 API. Create an **R2 API token** (Access Key ID + Secret)
> in the Cloudflare dashboard and set the four `R2_*` vars. Without them, uploads
> and PDFs are stored on the container's `/data` volume.

## One-time VPS setup

On the VPS (Docker + Docker Compose installed):

```bash
sudo mkdir -p /opt/attendly && sudo chown "$USER" /opt/attendly
git clone <repo-url> /opt/attendly
cd /opt/attendly
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env: set JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGINS, (R2_*, GOOGLE_*)
docker compose up -d --build
curl -fsS http://localhost:8787/api/health
```

Put **Caddy** (auto-HTTPS) or nginx in front, proxying your domain → `:8787`
(and serving the built admin SPA). Example Caddyfile:

```
api.yourdomain.com {
    reverse_proxy localhost:8787
}
admin.yourdomain.com {
    root * /opt/attendly/apps/admin/dist
    try_files {path} /index.html
    file_server
}
```

Build the admin once (`pnpm --filter @tuition/admin build` with
`VITE_API_BASE_URL=https://api.yourdomain.com`) and point the proxy at
`apps/admin/dist`.

## GitHub configuration (for auto-deploy)

**Settings → Secrets and variables → Actions.**

| Type | Name | Notes |
| --- | --- | --- |
| Secret | `VPS_HOST` | VPS host/IP |
| Secret | `VPS_USER` | SSH user |
| Secret | `VPS_SSH_KEY` | private key authorized on the VPS |
| Variable | `VPS_APP_DIR` | repo path on the VPS (e.g. `/opt/attendly`) |
| Variable | `VPS_PORT` | SSH port (optional, default 22) |

Then a merge to `main` SSHes in, pulls, and rebuilds the container.

## First boot

Seed the owner once the API is reachable:

```bash
curl -X POST https://api.yourdomain.com/api/setup \
  -H 'content-type: application/json' \
  -d '{"email":"you@institute.lk","name":"Owner","password":"<strong>","org_name":"Your Class"}'
```

## Migrating data from the old Cloudflare D1

D1 is SQLite, so the data ports directly:

```bash
# from the old setup (one-time), export the remote D1 to SQL:
wrangler d1 export tuition-db --remote --output attendly-dump.sql
# load it into the Go backend's SQLite file:
sqlite3 apps/api/data/attendly.db < attendly-dump.sql
```

(Schema is identical — the Go backend applies the same `apps/api/migrations`.)
