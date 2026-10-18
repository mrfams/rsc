# EMU Bin Tracker

Community map of recycling bins for Eastern Mediterranean University, built as a
single Expo codebase: **web (PWA-ready) + native iOS/Android + API routes**, with
Better Auth and a Neon Postgres database, deployed on Vercel.

## What works

| Area | Details |
|---|---|
| **Auth** | Email + password sign-up/sign-in restricted to campus emails (@emu.edu.tr by default), DB-backed sessions, sign-out — web **and** native (SecureStore cookie storage) |
| **Map** | Web: Leaflet with Google-style CARTO Voyager tiles + satellite toggle; native: Apple Maps / Google Maps via `expo-maps`, same toggle; campus geofence polygon drawn everywhere; category filter chips |
| **Reports** | Tap-to-place map pin, category picker, note, optional photo (≤ ~450 KB), campus-polygon geofence enforced server-side |
| **Bin lifecycle** | Reports within 25 m (per category) merge into the same bin; **verification waves** promote a bin to `verified` after sight by 2 distinct members; members can flag bins **missing** (disputed); a new independent sighting clears it again |
| **Trust** | `/api/me` computes trust score (15 pts per distinct bin + 3 per report, capped 100) shown on the profile |
| **Moderation** | `/admin` panel (env `ADMIN_EMAILS` gate): list every bin incl. removed, force lifecycle status, delete bad reports |
| **Server** | API routes: `/api/health`, `/api/bins` (+`/[id]`, `/[id]/dispute`), `/api/reports` (+`/[id]`, `?mine=1`), `/api/me`, `/api/photos/*`, `/api/admin/*`, `/api/auth/*` (Better Auth) |
| **Safety** | Zod validation on all inputs, JPEG magic-byte check + size cap, unauthenticated/off-campus submissions rejected, SQL parameterised through Drizzle |
| **Tests** | `node scripts/api-flow.mjs` — 13-step end-to-end flow incl. domain gate, verification wave, dispute, trust stats and admin gates |

Backed up from the previous rewrite: `SPEC.md` and `ROADMAP.md` live in
`C:\Users\asano\Desktop\RSC-backup` — verification waves, trust scoring,
moderation, offline mode and push notifications are the planned next phases.

## Quick start

```bash
npm install
# .env already points DATABASE_URL at the shared Neon dev database
npm run db:push       # sync Drizzle schema to Neon (idempotent)
npm run web           # Expo dev server on :8081 — web UI + API both served here
```

Then run the API flow test against it:

```bash
node scripts/api-flow.mjs http://localhost:8081
```

Useful checks:

```bash
npx tsc --noEmit      # strict typecheck (also runs on CI)
npx expo lint         # ESLint flat config from eslint-config-expo
npx expo export -p web   # production web + API export into dist/
```

## Architecture

```
┌─ src/app ───────── screens (Expo Router: web + native from one source)
│   map · sign-in · sign-up · report/new · report/[id] · profile
├─ src/app/api ────── server routes (+api.ts) — never bundled into the client
├─ src/components/map  MapView.tsx (native expo-maps) / MapView.web.tsx (Leaflet)
├─ src/lib ─────────── shared client+server: validation (zod), constants,
│                      auth-client, api-client (adds SecureStore cookie on native)
├─ src/lib/db ──────── Drizzle schema + pg pool (Better Auth + app tables)
└─ api/index.ts ─────  Vercel adapter: routes every request to the Expo server
```

- **One codebase, two map motors.** Metro resolves `MapView.web.tsx` on web and
  `MapView.tsx` (expo-maps) on iOS/Android. Both share the same props in
  `types.ts`.
- **Server/client isolation.** Secrets only exist in files imported by `+api.ts`
  route handlers — Metro strips them from client bundles.
- **Photos degrade gracefully.** With `BLOB_READ_WRITE_TOKEN` present (Vercel),
  they upload to Vercel Blob; without it, they land in `./.data/uploads` and are
  served locally — zero external accounts needed to develop.
- **Sessions.** Better Auth manages `user`/`session`/`account`/`verification`
  tables through the Drizzle adapter; the native client persists cookies in
  SecureStore and re-attaches them via the Expo plugin.

## Deploy (Vercel + Neon)

Already wired: pushing to GitHub deploys automatically (Expo project on Vercel).

1. **Environment variables** (project settings):
   - `DATABASE_URL` — Neon pooled connection string
   - `BETTER_AUTH_SECRET` — random 32+ chars
   - `BETTER_AUTH_URL` — production URL, e.g. `https://<project>.vercel.app`
   - `ADMIN_EMAILS` — comma-separated moderator emails (enables `/admin`)
   - `ALLOWED_EMAIL_DOMAINS` — optional, defaults to `emu.edu.tr`
   - `BLOB_READ_WRITE_TOKEN` — optional (photos), via Vercel Blob integration
2. **Native apps** need the deployed URL baked in: set
   `EXPO_PUBLIC_API_URL` to the production origin and build via
   `bunx eas build` (an `eas.json` can be added when app-store first).

### Native map note

Apple Maps needs no configuration. **Google Maps on Android** requires a free
Google Cloud API key enabled for *Maps SDK for Android*, stored in
`app.json → android.config.googleMaps.apiKey`, plus the app's SHA-1 fingerprint
in the Google Console. Native map testing needs a development build
(`npx expo run:android`) rather than Expo Go, because `expo-maps` is a native
module bundled with dev clients only.

## Data model

- `user`, `session`, `account`, `verification` — Better Auth core schema
  (`src/lib/db/auth-schema.ts`)
- `bins` — id, category, lat/lng, area, status, report_count
- `reports` — id, bin → user, lat/lng, note, photo_path, created_at

Schema lives in `src/lib/db/schema.ts`; `npm run db:push` applies it.

## Known gaps (next phases per ROADMAP.md)

- Marker clustering on the map for very large datasets
- Offline queue + service-worker caching for the web PWA (report queue done,
  full map cache pending)
- Dispute/photo similarity verification beyond the wave count

## Native build (EAS + Google Maps key)

1. `bunx eas-cli login` (free Expo account) → `bunx eas-cli init` (creates
   `eas.json` and wires `extra.eas.projectId` into `app.json` — needed for
   push tokens).
2. Google Maps API key (Android): console.cloud.google.com → new project →
   *"Maps SDK for Android"* → Enable → Credentials → API key. The free tier is
   generous (about 20k map loads/month). Restrict the key to the Android app
   (package name `com.<yourslug>.rsc`, SHA-1 shown by `eas credentials` or
   `cd android && gradlew signingReport` in a prebuild).
3. Put the key in `app.json → android.config.googleMaps.apiKey`.
4. Build a development client: set `EXPO_PUBLIC_API_URL` to the server you
   want the app to talk to, then `bunx eas-cli build --profile development
   --platform android` (or `npx expo run:android` on a machine with the SDK).
   Install the produced APK on a phone → sign in → push tokens register
   automatically.
