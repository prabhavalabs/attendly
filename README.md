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
pnpm install
pnpm --filter @tuition/db migrate:local
pnpm --filter @tuition/api dev        # wrangler dev on :8787
```

Full requirements & build guide: see the SRS. Conventions for contributors and AI
agents live in [CLAUDE.md](./CLAUDE.md).
