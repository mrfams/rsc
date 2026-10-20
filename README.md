# EMU Bin Tracker

Community map of recycling bins for Eastern Mediterranean University, built as
one Expo codebase: **web + native iOS/Android + API routes**, with Better Auth
and a Neon Postgres database, deployed on Vercel.

## What is in the app

| Area | Details |
|---|---|
| **Map** | MapLibre on native, Leaflet on web. Correct EMU campus boundary from OpenStreetMap (relation 15583365), place/building labels, street/satellite basemaps with a places overlay on satellite, recycling-pin markers (no circles), campus filter chips |
| **Bin cards** | Tapping a bin opens a Google-Maps-style card: desktop floating right panel, mobile anchored bottom sheet (tap the handle to expand). Place name, type, photo, **“I see it too” quick verification**, Directions, “This bin is gone”, moderation and sighting history — no navigation away from the map |
| **Layout** | Desktop: persistent navigation rail, floating map filters and panels. Mobile: floating tab bar with a central Report action, safe-area aware, plus a slide-in drawer with account, activity and contact links |
| **Feedback** | Every mutation reports back: a success dialog for meaningful actions (bin added, geofence saved, sighting verified) and a toast for lighter updates. Errors surface inline instead of failing silently |
| **Report** | Three clear steps: tap the pin, choose a category, add a note/photo. Camera or library photo, client-side compression, offline queue, geofence enforced on the server |
| **Auth** | One page with **Sign in / Create account** tabs. Any email can join; no campus-domain gate. Sessions work on web and native (SecureStore cookie) |
| **Bin lifecycle** | Reports within 25 m (same category) merge into one bin; two distinct contributors verify it; members can flag a bin missing; a new sighting restores it |
| **Profile** | Impact dashboard: trust score, reports, bins contributed, admin entry point and social/contact links |
| **Alerts** | Activity on your own reports with All / Awaiting / Resolved filters; tapping an alert opens the bin card on the map |
| **Admin** | A **hamburger-driven workspace** (Overview, Map studio, Bins, Bin types, People, Geofence) instead of a tab strip. Map studio pins, renames, retypes, moves and removes bins directly on the map with immediate boundary validation. Geofence editor has an explicit **Draw corners** mode (browsing never mutates the boundary), add/delete areas, numbered point editing, undo, reset to the real OSM boundary, and a confirm + success dialog on save |
| **Server** | `/api/health`, `/api/bins` (+`/[id]`, `/[id]/dispute`), `/api/reports` (+`/[id]`, `?mine=1`), `/api/me`, `/api/config`, `/api/photos/*`, `/api/admin/*`, `/api/auth/*` |
| **Safety** | Zod validation, JPEG magic-byte + size checks, auth and geofence enforcement on submissions, parameterised Drizzle queries |

### Geofence notes

The old campus polygon was about 28 km north of EMU (in the sea). The app now
uses the real OSM boundary (three rings: main campus, medical north, medical
south) and self-heals a stored polygon whose centroid is more than 10 km from
campus. Public bin queries hide rows outside the current boundary, so
legacy/seed pins cannot scatter across the map. Saving in the editor writes to
`app_config`, invalidates the public config query and takes effect immediately —
no deploy. The editor refuses to save malformed rings and reports the reason.

### Hydration + database notes

Web routes are statically rendered, so the root layout renders a branded splash
for the server pass and mounts the app after hydration. That keeps viewport- and
session-dependent UI from producing React hydration errors or blank flashes.
The Postgres pool listens for idle-client errors so a Neon network blip cannot
crash the server process.

### Contact links

Defaults point at EMU Sustainability on Instagram and the EMU support WhatsApp
line. Override them without code changes:

```bash
EXPO_PUBLIC_INSTAGRAM_URL=https://www.instagram.com/<your-handle>/
EXPO_PUBLIC_WHATSAPP_URL=https://wa.me/<international-number>
```

## Quick start

```bash
npm install
npm run db:push       # sync Drizzle schema to Neon (idempotent)
npm run seed          # categories, admin, 10 verified starter bins
npm run web           # Expo dev server on :8081 — web UI + API
```

Then run the end-to-end API flow:

```bash
node scripts/api-flow.mjs http://localhost:8081
```

Useful checks:

```bash
npx tsc --noEmit          # strict typecheck
npx expo lint             # ESLint flat config from eslint-config-expo
npx expo export -p web    # production web + API export into dist/
npm run seed              # categories, admin and starter bins inside the real campus
```

## Architecture

```
┌─ src/app ───────── screens (Expo Router: web + native from one source)
│   map · auth · report/new · report/[id] · bins/[id] · profile · alerts · admin
├─ src/app/api ────── server routes (+api.ts) — never bundled into the client
├─ src/components ── AppChrome (rail/tab bar), Sidebar, bins/BinDetails,
│                     map/MapView.tsx (MapLibre) / MapView.web.tsx (Leaflet),
│                     ui/* design primitives
├─ src/lib ─────────── shared client+server: validation, theme tokens, constants,
│                      auth-client, api-client, use-me, offline, push
├─ src/lib/db ──────── Drizzle schema + pg pool (Better Auth + app tables)
└─ api/index.ts ─────  Vercel adapter: routes every request to the Expo server
```

- **One codebase, two map engines.** Metro resolves `MapView.web.tsx` on web and
  `MapView.tsx` (MapLibre) on iOS/Android. Both share the same props in
  `types.ts` and the same pin/geofence behaviour.
- **Server/client isolation.** Secrets only exist in files imported by `+api.ts`
  route handlers — Metro strips them from client bundles.
- **Photos degrade gracefully.** With `BLOB_READ_WRITE_TOKEN` present (Vercel),
  uploads go to Vercel Blob; without it they land in `./.data/uploads` and are
  served locally.
- **Sessions.** Better Auth manages `user`/`session`/`account`/`verification`
  tables through the Drizzle adapter. Localhost and Expo dev origins are
  trusted in development; production/preview origins are derived from
  `BETTER_AUTH_URL`, `APP_URL` and `VERCEL_URL`.

## Deploy (Vercel + Neon)

1. **Environment variables** (project settings):
   - `DATABASE_URL` — Neon pooled connection string
   - `BETTER_AUTH_SECRET` — random 32+ chars
   - `BETTER_AUTH_URL` — production URL, e.g. `https://<project>.vercel.app`
   - `ADMIN_EMAILS` — comma-separated moderator emails (enables `/admin`)
   - `BLOB_READ_WRITE_TOKEN` — optional (photos), via Vercel Blob integration
   - `EXPO_PUBLIC_INSTAGRAM_URL`, `EXPO_PUBLIC_WHATSAPP_URL` — optional contact links
2. **Native apps** need the deployed URL baked in: set `EXPO_PUBLIC_API_URL` to
   the production origin and build with EAS.

### Native map note

Both platforms use **MapLibre** — no API key, no Google billing. Street tiles
come from the free OpenFreeMap "Liberty" style; satellite uses Esri World
Imagery with the places overlay. The map needs a development build
(`npx expo run:android` / EAS build); Expo Go cannot render the native module.

## Data model

- `user`, `session`, `account`, `verification` — Better Auth core schema
- `bins` — id, category, lat/lng, area, status, report_count
- `reports` — id, bin → user, lat/lng, note, photo_path, created_at
- `categories` — slug, name, colour, emoji, active
- `app_config` — JSON settings such as the campus geofence
- `push_tokens` — Expo push tokens per user

Schema lives in `src/lib/db/schema.ts`; `npm run db:push` applies it.
