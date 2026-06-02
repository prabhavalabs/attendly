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

Set the API URL once (`cp .env.example .env`). The simplest setup points at the
deployed API — a native build needs no CORS and works on emulator and device:

```
EXPO_PUBLIC_API_BASE_URL=https://attendly-api.junioremployer.com
```

### Android (primary target)

This app uses native modules (camera, NFC, SQLite) via **`expo-dev-client`**, so
it runs in a custom dev build — **not Expo Go**. First time, build & install that
dev client; after that, just start the Metro server for fast JS reloads.

```bash
pnpm install                              # repo root (workspace; .npmrc pins node-linker=hoisted for autolinking)

# 1) one-time native build → installs the dev client + launches (needs Android Studio + SDK)
pnpm --filter @tuition/mobile android     # = expo run:android (Gradle build, a few min)

# 2) day-to-day: just the JS dev server (connects to the installed dev client)
pnpm --filter @tuition/mobile start       # = expo start --dev-client
```

- **Emulator** — start an Android Virtual Device (Android Studio ▸ Device
  Manager) **before** step 1.
- **Physical device** — enable USB debugging and plug in (or `--device`).
- **Local backend instead of prod?** Use `http://10.0.2.2:8787` for the
  emulator (the host is `10.0.2.2`, not `localhost`) or your machine's LAN IP for
  a device — see `.env.example`.

> `expo start --android` / Expo Go won't work here — they can't load the NFC/
> camera native modules. Use `expo run:android` (the `android` script) to build
> the dev client.

### Other targets

```bash
pnpm --filter @tuition/mobile ios         # iOS simulator (later)
pnpm --filter @tuition/mobile web         # PWA in the browser (no camera/NFC)
pnpm --filter @tuition/mobile typecheck
```

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

## Notes

- **NFC** (`react-native-nfc-manager`) is wired into the check-in screen (an NFC
  tab appears when the device supports it). It needs a **dev client** build, not
  Expo Go; with the default isolated pnpm linker, add a root `.npmrc` with
  `node-linker=hoisted` and reinstall before the native build.
- Push notifications (M5) are out of scope for this app.
- The **student / guardian** experience (home, attendance, fees, timetable,
  digital card, notifications) is a separate, future app surface.
