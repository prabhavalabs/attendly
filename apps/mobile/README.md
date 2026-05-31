# @tuition/mobile — Door check-in app (M3)

Expo (SDK 56) app + PWA for offline-first door check-in (SRS §10, §11.7).
Lecturers/staff sign in, pick today's session, and check students in by
scanning their QR card or searching the roster — working fully offline and
syncing when a connection returns.

## Stack

- **Expo SDK 56** / React Native 0.85 / Expo Router v4 (typed routes)
- **React Native Web** — the same code ships as an installable PWA
- **expo-camera** — QR card scanning
- **expo-sqlite** — offline roster cache + check-in outbox queue
- **expo-secure-store** — auth tokens at rest (localStorage on web)
- **expo-network** — connectivity detection / auto-sync
- **TanStack Query**, **Zustand**, **Zod** (`@tuition/shared` contracts)

> The SRS pins SDK 54; the Expo CLI now scaffolds SDK 56, which is what this app
> uses. Same APIs, current release.

## How it works (offline-first)

1. **Roster prefetch** — opening a session fetches `GET /api/sessions/:id/roster`
   and caches it into SQLite (`roster` table). Offline, the cached roster is
   served so manual/search check-in and name display keep working.
2. **Local outbox** — every check-in is written to the SQLite `outbox` first
   (so the door never blocks), with a client-generated `client_dedup_key`.
3. **Batch sync** — `flush()` drains pending rows to `POST /api/checkin/batch`.
   The server dedups on `client_dedup_key`, so retries/replays are safe. Sync
   runs on check-in, on screen mount, and whenever connectivity returns.
4. **Idempotent** — duplicates come back flagged (`duplicate: true`), never as
   errors; payment alerts never block check-in.

## Screens

- `login` — email/password sign-in (reuses the API's `/api/auth` flow).
- `sessions` — today's sessions with live/queued status and present counts.
- `session/[id]` — the check-in screen: **Scan QR** (camera) or **Manual**
  (search the roster and tap), a Present/Late selector, a live result banner,
  pending-queue count, and a manual **Sync now**.

## Run locally

The API must be running (`pnpm --filter @tuition/api dev`, on `:8787`).

```bash
# point the app at the API (defaults to http://localhost:8787)
export EXPO_PUBLIC_API_BASE_URL="http://localhost:8787"

pnpm --filter @tuition/mobile start      # dev server (press w / i / a)
pnpm --filter @tuition/mobile web        # PWA in the browser
pnpm --filter @tuition/mobile typecheck
```

For a device on your LAN, set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN
IP (e.g. `http://192.168.1.x:8787`) and add that origin to the API's
`CORS_ORIGINS`.

## Monorepo notes

- `metro.config.js` watches the workspace root, resolves modules from both the
  app and the root `node_modules` (so Metro can transform `@tuition/shared`,
  consumed as raw TypeScript), and registers `.wasm` as an asset for
  expo-sqlite's web build.
- pnpm's default (isolated) linker is used. For **native (dev-client) builds**
  with React Native autolinking, add a root `.npmrc` with
  `node-linker=hoisted` and reinstall — not required for Metro/web/Expo Go.
- The PWA uses `expo-sqlite` (wa-sqlite/WASM); serving it needs cross-origin
  isolation headers (`COOP: same-origin`, `COEP: require-corp`).

## Not yet implemented

- **Native NFC** (`react-native-nfc-manager`) needs a custom dev client and is
  deferred; QR + manual search cover door check-in today. Web NFC can be layered
  on the web target later.
- Push notifications (M5) are out of scope here.
