# Deployment

attendly deploys to the **Cloudflare** free tier:

- **API** — a Cloudflare **Worker** (`apps/api`) with a **D1** database, an
  **R2** bucket and scheduled **cron** triggers.
- **Admin portal** — a static **Vite** SPA (`apps/admin`) on **Cloudflare Pages**.
- **Mobile** — the Expo app ships via EAS / app stores (and a PWA); it is **not**
  part of the web deploy pipeline.

CI/CD lives in [`.github/workflows`](.github/workflows):

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | PRs + pushes to `develop`/`main` | typecheck all workspaces, build the admin portal, dry-run the Worker bundle, **apply D1 migrations to a throwaway local DB**, bundle the mobile web target |
| `deploy.yml` | push to `main` (i.e. a merged PR) | apply D1 migrations to **production**, sync Worker secrets, deploy the Worker, build + deploy the admin portal to Pages |

## One-time Cloudflare setup

Run locally with the Cloudflare CLI authenticated (`wrangler login`):

```bash
# 1. D1 database — copy the printed database_id
pnpm --filter @tuition/api exec wrangler d1 create tuition-db --location apac

# 2. R2 bucket for assets / generated PDFs
pnpm --filter @tuition/api exec wrangler r2 bucket create attendly-assets

# 3. Pages project for the admin portal
pnpm --filter @tuition/api exec wrangler pages project create attendly-admin \
  --production-branch main
```

> `apps/api/wrangler.toml` ships `database_id = "PASTE_ID"`; the deploy workflow
> substitutes it from the `CF_D1_DATABASE_ID` variable, so you don't commit it.
> (For local dev you can paste the real id in, or just use `--local`.)

## GitHub configuration

**Settings → Secrets and variables → Actions.**

### Secrets

| Secret | Required | Notes |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | ✅ | Token with **Workers Scripts:Edit**, **D1:Edit** and **Pages:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | Your Cloudflare account id |
| `JWT_SECRET` | optional | If set, synced to the Worker on each deploy |
| `ENCRYPTION_KEY` | optional | AES-GCM key for OAuth tokens at rest |
| `GOOGLE_CLIENT_ID` | optional | Google Calendar OAuth (M6) |
| `GOOGLE_CLIENT_SECRET` | optional | Google Calendar OAuth (M6) |

If you prefer to manage Worker secrets by hand, set them once and leave the
optional secrets unset — the deploy step skips any that are empty:

```bash
cd apps/api
pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put ENCRYPTION_KEY
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET if using calendar sync
```

### Variables

| Variable | Required | Example |
| --- | --- | --- |
| `CF_D1_DATABASE_ID` | ✅ | the id from `wrangler d1 create` |
| `CF_PAGES_PROJECT` | ✅ | `attendly-admin` |
| `VITE_API_BASE_URL` | ✅ | `https://tuition-api.<your-subdomain>.workers.dev` |

After the first deploy, add the admin portal's Pages URL to the Worker's
`CORS_ORIGINS` (`wrangler secret put CORS_ORIGINS` or a `[vars]` entry) and
register the API callback URL in Google Cloud if you use calendar sync.

## Deploy flow

1. Open a PR → **CI** runs (must be green to merge).
2. Merge the PR into `main` → **Deploy** runs: migrations → Worker → admin.

The `production` GitHub environment on the deploy job lets you add required
reviewers or protection rules if you want a manual approval gate before release.

## Migration safety

- Migrations are plain SQL in `packages/db/migrations`, applied in filename
  order by `wrangler d1 migrations apply` (it tracks applied migrations in D1).
- CI proves they apply cleanly to a fresh local database on **every PR**, so a
  broken migration never reaches `main`.
- They are **forward-only** and additive by convention; never edit an applied
  migration — add a new one.
