# ClassDesk (attendly)

A web + mobile system for managing **attendance, payments, students, lecturers,
timetables, and notifications** for a tuition class serving 100+ students.

Built to run on Cloudflare's free tier: Workers + D1 (replicated reads) + R2,
with an offline-capable door check-in flow (QR / NFC / search).

## Monorepo layout

| Path | Package | What |
|------|---------|------|
| `apps/api` | `@tuition/api` | Hono on Cloudflare Workers — all business logic, RBAC, cron |
| `apps/admin` | `@tuition/admin` | React + Vite admin portal *(scaffold via Vite CLI)* |
| `apps/mobile` | `@tuition/mobile` | Expo app + PWA — door check-in *(scaffold via Expo CLI)* |
| `packages/shared` | `@tuition/shared` | Zod schemas, permission catalog, default roles |
| `packages/db` | `@tuition/db` | D1 SQL migrations |

## Status

🚧 **Scaffolding only.** Monorepo skeleton + config in place; no business logic yet.
Build order follows the SRS roadmap (M0 Foundation → M7 Reports).

## Getting started

```bash
make up         # install deps, create apps/api/.dev.vars, migrate the local DB

make backend    # terminal 1 — API worker on :8787
make admin      # terminal 2 — admin portal on :5173
make seed       # once — create the owner account (POST /api/setup)
# then open http://localhost:5173
```

Run `make help` to see every target (backend, admin, dev, migrate, reset-db,
seed, build, typecheck, lint, clean, …).

Full requirements & build guide: see the SRS. Conventions for contributors and AI
agents live in [CLAUDE.md](./CLAUDE.md).
