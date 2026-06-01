# attendly

A web + mobile system for managing **attendance, payments, students, lecturers,
timetables, and notifications** for a tuition class serving 100+ students.

Self-hosted on a VPS: a **Go** backend with embedded **SQLite** (microsecond
queries), Dockerized, with an offline-capable door check-in flow (QR / NFC /
search). Cloudflare **R2** (S3 API) is used for uploads/PDFs when configured.

## Monorepo layout

| Path | What |
|------|------|
| `apps/api` | **Go** backend (chi) + embedded SQLite — all business logic, RBAC, cron, PDFs |
| `apps/admin` | `@tuition/admin` — React + Vite admin portal |
| `apps/mobile` | `@tuition/mobile` — Expo app + PWA, door check-in |
| `packages/shared` | `@tuition/shared` — Zod schemas, permission catalog, default roles (clients) |

## Getting started

```bash
make up         # install deps, create apps/api/.env (generated dev secrets)

make backend    # terminal 1 — Go API on :8787 (migrations auto-apply on boot)
make admin      # terminal 2 — admin portal on :5173
make seed       # once — create the owner account (POST /api/setup)
# then open http://localhost:5173
```

Run `make help` to see every target (backend, admin, dev, test, docker-up,
seed, build, …). Deployment: see [DEPLOYMENT.md](./DEPLOYMENT.md).

Full requirements & build guide: see the SRS. Conventions for contributors and AI
agents live in [CLAUDE.md](./CLAUDE.md).
