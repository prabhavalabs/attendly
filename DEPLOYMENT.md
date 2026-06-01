# Deployment

attendly runs as two independently-deployed pieces, both triggered by a merge
to **`main`**:

| Piece | Hosting | How it deploys on merge to `main` |
| --- | --- | --- |
| **API** (`apps/api`, Go + embedded SQLite, Docker) | self-hosted VPS behind host **nginx** + **Cloudflare** | `deploy.yml` SSHes in, `git reset --hard origin/main`, `docker compose up -d --build`, health-checks `:8787` |
| **Admin portal** (`apps/admin`, Vite SPA) | **Vercel** (Git integration) | Vercel auto-builds & deploys the production domain |
| **Mobile** (`apps/mobile`, Expo) | EAS / app stores + PWA | manual `eas build` / store submit |

CI (`ci.yml`) runs on every PR and push to `develop`/`main`: Go `vet` +
`test -race` + build, and admin typecheck + build.

## Production topology

```
                       ┌── Cloudflare (TLS, proxied) ──┐
 attendly-api.junioremployer.com  ─────────────────────▶  VPS 178.104.111.17
                                                            host nginx :80
                                                              └─▶ 127.0.0.1:8787  (attendly-backend container)
                                                                    └─▶ /data volume (SQLite + uploads)

 <admin-domain> (Vercel)  ──fetch──▶  https://attendly-api.junioremployer.com
```

The VPS is **shared** with other stacks (openpay, paperslk, masariya, geopop).
attendly slots in cleanly: the container binds **`127.0.0.1:8787`** (free, not
internet-exposed) and a dedicated nginx vhost routes the hostname to it — the
same Cloudflare-proxied `:80` pattern the other sites already use.

---

## 1. DNS (Cloudflare)

| Type | Name | Content | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `A` | `attendly-api` | `178.104.111.17` | **Proxied** (orange) | API origin |
| `CNAME` | `<admin-subdomain>` | `cname.vercel-dns.com` | DNS only (grey) | added/verified by Vercel when you attach the domain |

SSL/TLS mode: **match your other sites on this box** (they terminate TLS at
Cloudflare and talk to the origin on `:80`, i.e. *Flexible* — or *Full* if you
later add an origin cert). The attendly vhost listens on `:80` only, like the rest.

## 2. API — one-time VPS setup

All commands run as a user that can use Docker (root works; a dedicated
`attendly` deploy user in the `docker` group is recommended).

```bash
# clone to the standard path
sudo mkdir -p /opt/attendly && sudo chown "$USER" /opt/attendly
git clone https://github.com/theetaz/attendly.git /opt/attendly
cd /opt/attendly && git checkout main

# production secrets (gitignored)
cp apps/api/.env.example apps/api/.env
#   JWT_SECRET      = openssl rand -base64 32
#   ENCRYPTION_KEY  = openssl rand -base64 32
#   CORS_ORIGINS    = https://<admin-domain>
#   (optional) GOOGLE_*, R2_*  — see the table below
nano apps/api/.env

# build + start (binds 127.0.0.1:8787)
docker compose up -d --build
curl -fsS http://127.0.0.1:8787/api/health   # {"ok":true,...}
```

Then add the nginx vhost (file is in the repo at
[`deploy/nginx/attendly-api.conf`](deploy/nginx/attendly-api.conf)):

```bash
sudo cp /opt/attendly/deploy/nginx/attendly-api.conf /etc/nginx/sites-available/attendly-api
sudo ln -s /etc/nginx/sites-available/attendly-api /etc/nginx/sites-enabled/attendly-api
sudo nginx -t && sudo systemctl reload nginx   # -t first: don't reload a bad config on a shared box
```

### `apps/api/.env`

| Variable | Required | Notes |
| --- | --- | --- |
| `JWT_SECRET` | ✅ | HS256 token signing secret (keep stable across deploys) |
| `ENCRYPTION_KEY` | ✅ | AES-GCM key for OAuth tokens at rest |
| `CORS_ORIGINS` | ✅ | comma-separated allowed origins — the admin domain(s) |
| `ADDR` / `DB_PATH` / `ASSETS_DIR` | — | set by compose (`:8787`, `/data/...`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google Calendar OAuth |
| `R2_*` | optional | object storage for uploads/PDFs; falls back to the `/data` volume |

> If you are **migrating existing data**, reuse the *old* `JWT_SECRET` /
> `ENCRYPTION_KEY` so existing tokens and encrypted values keep working. A fresh
> install can generate new ones and create the owner via `/api/setup`.

## 3. API — auto-deploy (GitHub Actions → VPS over SSH)

Create a dedicated deploy key (don't reuse a personal key) and authorize it:

```bash
# on your machine
ssh-keygen -t ed25519 -f attendly_deploy -C "attendly-ci" -N ""
# copy the PUBLIC key onto the VPS deploy user:
ssh-copy-id -i attendly_deploy.pub <user>@178.104.111.17
#   (or append attendly_deploy.pub to ~/.ssh/authorized_keys there)
```

Then set **Settings → Secrets and variables → Actions**:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `VPS_HOST` | `178.104.111.17` |
| Secret | `VPS_USER` | the deploy user (e.g. `root` or `attendly`) |
| Secret | `VPS_SSH_KEY` | contents of the **private** `attendly_deploy` key |
| Variable | `VPS_APP_DIR` | `/opt/attendly` |
| Variable | `VPS_PORT` | `22` |

After this, every merge to `main` pulls and rebuilds the container, then
health-checks `http://localhost:8787/api/health`.

## 4. Admin portal — Vercel

1. **Import** the GitHub repo into Vercel. Leave **Root Directory** at the repo
   root — the repo's [`vercel.json`](vercel.json) drives the build:
   - install: `pnpm install --frozen-lockfile`
   - build: `pnpm --filter @tuition/admin build`
   - output: `apps/admin/dist`
   - SPA rewrite: all paths → `index.html`
2. **Environment variable** (Production):
   `VITE_API_BASE_URL = https://attendly-api.junioremployer.com`
3. **Domain**: add `<admin-domain>` in Vercel → it provisions TLS and gives the
   DNS record to add in Cloudflare (CNAME, grey-cloud).
4. Set the API's `CORS_ORIGINS` to that domain (step 2) and redeploy the API.

> Production deploys on merge to `main`. Vercel preview URLs (per-PR) won't pass
> the API's CORS unless you add them to `CORS_ORIGINS`; fine to skip for now.

## 5. First boot

```bash
curl -X POST https://attendly-api.junioremployer.com/api/setup \
  -H 'content-type: application/json' \
  -d '{"email":"you@institute.lk","name":"Owner","password":"<strong>","org_name":"Your Class"}'
```

## Local development

```bash
make up        # install deps, create apps/api/.env (generated dev secrets)
make backend   # Go API on :8787 (live logs)
make admin     # admin portal on :5173
make seed      # create the owner via /api/setup
make test      # go test -race + admin typecheck
```
