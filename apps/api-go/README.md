# @tuition/api-go — self-hosted Go backend

A Go re-implementation of the attendly API, designed to run on a **VPS** with a
**local SQLite** database for microsecond-latency queries (the reason for moving
off remote D1). Same HTTP contract as the Worker, so the admin and mobile
clients work unchanged.

> Built alongside the Cloudflare Worker (`apps/api`) for a safe, parallel
> cutover. The Worker stays live until this reaches feature parity.

## Stack

- **Go** + **chi** (router/middleware)
- **modernc.org/sqlite** — pure-Go SQLite, so the build is a single static
  binary (no CGO / gcc on the server)
- Reuses the existing `packages/db` migrations (D1 *is* SQLite) — embedded via
  `go:embed` and applied on boot, tracked in `schema_migrations`
- Auth/crypto match the Worker exactly (HS256 JWT, PBKDF2 hash format, AES-GCM)
  so existing users and tokens keep working

## Run locally

```bash
cp .env.example .env   # fill JWT_SECRET / ENCRYPTION_KEY
go run .                # or: go build -o bin/attendly-api . && ./bin/attendly-api
curl localhost:8787/api/health
```

Config is read from the environment (and `.env`): `ADDR`, `DB_PATH`,
`ASSETS_DIR`, `JWT_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
`SETUP_TOKEN`, `CORS_ORIGINS`.

## Status

- [x] Phase 1 — scaffold: config, SQLite, migrations, health
- [ ] Phase 2 — auth + RBAC parity
- [ ] Phase 3 — route groups
- [ ] Phase 4 — PDFs, storage, cron, Google OAuth
- [ ] Phase 5 — VPS deploy + data migration + cutover
