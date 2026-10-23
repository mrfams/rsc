# EMU Bin Tracker

Community map of recycling bins for Eastern Mediterranean University, built as
one Expo codebase: **web + native iOS/Android + API routes**, with Better Auth
and a Neon Postgres database, deployed on Vercel.

## What is in the app

| Area | Details |
|---|---|
| **Map** | MapLibre on native, Leaflet on web. Correct EMU campus boundary from OpenStreetMap (relation 15583365), street/satellite basemaps (satellite is the web default), recycling-pin markers (no circles), bin-type filter chips. A campus dropdown above the type chips switches between **Main campus** and **South campus** (including the medical campus) and shows live bin counts per campus — computed from the database and counting only bin types that are switched on. Everything outside the geofence is dimmed so the campus is unmistakable. Curated campus place names (faculties, library, dorms) are drawn on both map engines, because raster basemaps do not label EMU buildings at campus zoom |
| **Bin cards** | Tapping a bin opens a Google-Maps-style card: desktop floating right panel, mobile anchored bottom sheet (tap the handle to expand). Place name, type, photo, **“I see it too” quick verification**, Directions, “This bin is gone”, moderation and sighting history — no navigation away from the map. A member confirms a bin only once: after that the button is replaced by a “you already confirmed this bin” thank-you. When someone flags the bin, the confirmation turns into **“Report this bin”** and **“This bin is gone”** takes the prominent spot (both behind a confirm modal) |
| **Layout** | Desktop: persistent navigation rail, floating map filters and panels. Mobile: floating tab bar with a central Add action, safe-area aware, plus a slide-in drawer with account, activity, the top-10 leaderboard and contact links. Admins get Map, Review, Add, Profile and Admin. Signed-out visitors are sent to the sign-in page from every tab, rail and drawer entry — only the map and the public Stats page stay open. The web build is a full PWA: `public/manifest.json`, `public/sw.js` and `+html.tsx` provide Chrome's install prompt, home-screen icons, an offline shell and cached map data |
| **Feedback** | Every mutation reports back: a success dialog for meaningful actions (bin added, geofence saved, sighting verified) and a toast for lighter updates. Errors surface inline instead of failing silently |
| **Add a bin** | Three clear steps: choose **Pick on map** (full-screen tap-to-place pin) or **Use my location**, confirm the auto-suggested place name, select the bin type from a dropdown, then add a photo and note (camera or existing photos, client-side compression, offline queue). The campus outline is a visual reference only — a bin can be added inside or outside it |
| **Auth** | One page with **Sign in / Create account** tabs. Any email can join; no campus-domain gate. Sessions work on web and native (SecureStore cookie) |
| **Bin lifecycle** | Reports within 25 m (same category) merge into one bin; two distinct contributors verify it; members can flag a bin missing; a new sighting restores it |
| **Stats** | The public campus page: the top-10 leaderboard, every bin we know about and a “how points work” guide (points for new bins, confirmations and photos). Guests see it too, with a sign-in prompt in place of their own numbers. Members are visible after their first point; the first-point notice (plus a push) explains this and offers a one-tap **Hide me**, and the choice can be changed later from Stats |
| **Profile** | The member's own page: identity, every sighting they reported, and account settings. Members can **edit their display name** and **delete their account** (password confirmed) from an Account card; deleting removes the profile, points and sightings and rebuilds the aggregates of every bin they touched. Signed-out visitors are redirected to sign-in |
| **Alerts** | Activity on your own reports with All / Awaiting / Resolved filters; tapping an alert opens the bin card on the map |
| **Admin** | A **hamburger-driven workspace** (Overview, Map studio, Bins, Bin types, People, Geofence). Map studio pins, renames, retypes, moves and removes bins directly on the map, anywhere in the world, with **Use my location** and an optional photo. People can be promoted, **disabled** (sessions and push tokens revoked immediately; sign-in blocked) or **deleted** (account, points, sightings and photos removed, bins kept). Bin cards expose the sighting history to admins with per-photo **Take down** and per-report delete controls. Overview cards open the matching section; bin types are created, edited and deleted in a modal. Geofence editor has an explicit **Draw corners** mode (browsing never mutates the boundary), add/delete areas, a numbered corner list, undo, reset to the real OSM boundary, and a confirm + success dialog on save |
| **Server** | `/api/health`, `/api/bins` (+`/[id]`, `/[id]/dispute`), `/api/reports` (+`/[id]`, `?mine=1`), `/api/review`, `/api/me` (GET/PATCH leaderboard consent), `/api/leaderboard`, `/api/config`, `/api/photos/*`, `/api/admin/*` (including user disable/delete and report photo takedown), `/api/auth/*` |
| **Safety** | Zod validation, JPEG magic-byte + size checks, auth enforcement on submissions, parameterised Drizzle queries |

### Geofence notes

The old campus polygon was about 28 km north of EMU (in the sea). The app now
uses the real OSM boundary (three rings: main campus, medical north, medical
south) and self-heals a stored polygon whose centroid is more than 10 km from
campus. The outline is drawn on every map as a reference, but it no longer
gates placement: bins, reports and admin edits work anywhere, and every bin is
listed publicly. Saving in the editor writes to `app_config`, invalidates the
public config query and takes effect immediately — no deploy. The editor
refuses to save malformed rings and reports the reason.

### Hydration + database notes

Web routes are statically rendered, so the root layout renders a branded splash
for the server pass and mounts the app after hydration. That keeps viewport- and
session-dependent UI from producing React hydration errors or blank flashes.
The Postgres pool listens for idle-client errors so a Neon network blip cannot
crash the server process.

### Contact links

Defaults point at the RSC EMU Instagram club (`rsemu_club`) and the club's
WhatsApp group invite. Every in-app chip reads from `SOCIAL_LINKS`, so there is
one place to change them. Override without code changes:

```bash
EXPO_PUBLIC_INSTAGRAM_URL=https://www.instagram.com/rsemu_club/
EXPO_PUBLIC_WHATSAPP_URL=https://chat.whatsapp.com/HfmvqCAdJ629e6kG2k9x0T?s=cl&p=a&mlu=4&ilr=4
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
│   map · auth · report/new · report/[id] · bins/[id] · stats · profile · alerts · admin
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
- **Photos degrade gracefully.** Uploads go to Cloudflare R2 (`R2_*`), Vercel Blob
  (`BLOB_READ_WRITE_TOKEN`) or — in local development only — `./.data/uploads`.
  When the store is unreachable the sighting is still posted, just without its
  photo, and the member is told; `/api/health` reports which backend is live.
- **Sessions.** Better Auth manages `user`/`session`/`account`/`verification`
  tables through the Drizzle adapter. Localhost and Expo dev origins are
  trusted in development; production/preview origins are derived from
  `BETTER_AUTH_URL`, `APP_URL` and `VERCEL_URL`.

## Deploy (Vercel + Neon)

The live API origin is **`https://emu-bin-tracker.vercel.app`** (the
`emu-bin-tracker` Vercel project). `EXPO_PUBLIC_API_URL` and the installed app
point there; keep `.vercel` linked to that project when you deploy so an OTA
update never talks to an older API.

1. **Environment variables** (project settings):
   - `DATABASE_URL` — Neon pooled connection string
   - `BETTER_AUTH_SECRET` — random 32+ chars
   - `BETTER_AUTH_URL` — production URL, e.g. `https://<project>.vercel.app`
   - `ADMIN_EMAILS` — comma-separated moderator emails (enables `/admin`)
   - `BLOB_READ_WRITE_TOKEN` — optional (photos), via Vercel Blob integration
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` — optional (photos), via Cloudflare R2
   - `EXPO_PUBLIC_INSTAGRAM_URL`, `EXPO_PUBLIC_WHATSAPP_URL` — optional contact links
2. **Native apps** need the deployed URL baked in: set `EXPO_PUBLIC_API_URL` to
   the production origin and build with EAS.

### Photo storage (Cloudflare R2)

Photos are optional, but without a bucket the app saves the sighting and drops
the photo with a toast. To turn photos on:

1. Cloudflare dashboard → **R2** → **Create bucket** (for example `rsc-photos`).
2. Open the bucket → **Settings** → **Public access** → enable the **r2.dev**
   subdomain (or connect a custom domain). Copy that public URL.
3. **R2 → Manage R2 API Tokens** → create a token with **Object Read & Write**
   for this bucket. Copy the Access Key ID and Secret Access Key.
4. Add these to **Vercel → Project → Settings → Environment Variables** (and to
   the EAS `production`/`preview` environments if you build there):

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=rsc-photos
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev   # no trailing slash
```

5. Redeploy, then open `/api/health` — it should report `"photos": "Cloudflare R2"`.
   Upload a photo from the app to confirm the round trip.

Vercel Blob (`BLOB_READ_WRITE_TOKEN`) works too if you prefer not to use
Cloudflare. The app picks R2 first, then Blob, then local disk in development.

### Native map note

Both platforms use **MapLibre** — no API key, no Google billing. Street tiles
come from the free OpenFreeMap "Liberty" style, which already carries place and
building labels; satellite uses Esri World Imagery with a labels overlay. The
app adds bin pins only — it does not draw its own place names. The map needs a
development build (`npx expo run:android` / EAS build); Expo Go cannot render
the native module.

## Native builds, OTA updates and distribution

There is no Play Store or App Store listing yet, so Android users install the
APK that EAS builds and iPhone users use the web app. The important part:
**an EAS build embeds the JavaScript bundle**, so the installed app runs on its
own — nobody needs `npx expo start` on your laptop, and the app keeps working
when your laptop is off.

| Piece | What it is |
|---|---|
| EAS project | `@famara2ray/rscemu` (`projectId` lives in `app.json` → `extra.eas.projectId`) |
| Build | `npm run build:android:production` → signed, installable APK |
| Update | `npm run update:production` → new JS/UI for every installed copy |
| Install link | GitHub release asset (`npm run publish:apk`) + QR code on `/download` |

### Build profiles and channels (`eas.json`)

| Profile | Channel | What it is for |
|---|---|---|
| `development` | `development` | Dev client with the dev menu — for you while coding |
| `preview` | `preview` | Short-lived test APK, not the one students keep |
| `production` | `production` | The APK you hand to students; every OTA update is published here |

A build's **channel** decides which updates it pulls. `preview` builds listen
to the `preview` channel, `production` builds to `production`. Publish to the
channel that matches the build your users have.

### Everyday workflow

```bash
# 1. change the code, then commit
git add -A && git commit -m "Tweak the bin card layout"

# 2. ship it to every installed copy — no new APK, no store review
npm run update:production     # -> eas update --channel production --environment production --auto
```

Use the `preview` channel only for a throwaway test build. An APK built with
the `preview` profile ignores updates published to `production` (and the other
way around), so keep the build your students install on `production`.

The app checks for updates on launch, downloads the new bundle in the
background and shows a **“New version available — Update / Restart”** banner
(`src/components/updates/UpdateBanner.tsx`). Users can also tap **Check for
updates** on the `/download` page. Web builds deploy through Vercel instead —
`src/lib/updates.web.ts` is a no-op twin of the native module.

Roll out gradually, watch the error rate, roll back if it goes wrong:

```bash
npx eas-cli@latest update --channel production --environment production --rollout-percentage 20
npx eas-cli@latest update:republish --branch main     # roll back to the previous update
npx eas-cli@latest channel:pause production           # stop serving updates on a channel
```

### What OTA can and cannot do

| Change | OTA? |
|---|---|
| UI, copy, colours, layouts, new screens | ✅ yes |
| API calls, business logic, server-side changes | ✅ yes (the API deploys on its own) |
| New native module, new permission, icon/splash, SDK upgrade | ❌ needs a new build |

`runtimeVersion` uses the **fingerprint** policy, so the runtime only changes
when native dependencies change — a cosmetic rebuild keeps serving OTA updates
to everyone who already installed the app.

### Shipping a new APK (new native code)

```bash
npm run build:android:production   # eas build --platform android --profile production

# optional: download the newest production APK, attach it to a GitHub release
# and point the stored install link at it
npm run publish:apk
```

`publish:apk` needs the EAS CLI (logged in), the GitHub CLI (`gh`) and
`DATABASE_URL`. It writes the release URL into `app_config`, so the
`/download` page, its QR code and the in-app button point at the new build
immediately — no app update, no redeploy. You can also paste the **Application
Archive URL** from the build page into `/admin → Overview → App download link`.
The value is mirrored in `EXPO_PUBLIC_ANDROID_DOWNLOAD_URL` (build env) and
`ANDROID_DOWNLOAD_URL` (`src/lib/constants.ts`) as the offline fallback.

### Environment variables for updates

SDK 55+ requires `--environment` on `eas update`, and only variables from that
EAS environment are bundled (local `.env` files are ignored). `EXPO_PUBLIC_API_URL`
is set for `production`, `preview` and `development` on the EAS project:

```bash
npx eas-cli@latest env:list production
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL \
  --value https://emu-bin-tracker.vercel.app --environment production
```

### iPhone

Without an Apple Developer account there is no installable iOS build, so
iPhone users get the web app (`https://emu-bin-tracker.vercel.app`) and add it
to the home screen. When you want a real iOS app: an Apple Developer account
($99/yr) + `eas build --platform ios` + TestFlight. TestFlight builds expire
after 90 days, but OTA updates still work inside them.

### Free-plan limits

EAS Build and EAS Update both work on the free Expo plan (low-priority builds
and free updates, with monthly limits). If you need more builds or more
monthly active users on updates, the Starter plan is $19/month.

## Data model

- `user`, `session`, `account`, `verification` — Better Auth core schema; `user.leaderboard_opt_in` defaults to true and `user.disabled_at` suspends an account
- `bins` — id, category, lat/lng, area, status, report_count
- `reports` — id, bin → user, lat/lng, note, photo_path, created_at
- `categories` — slug, name, colour, emoji, active
- `app_config` — JSON settings such as the campus geofence
- `push_tokens` — Expo push tokens per user

Schema lives in `src/lib/db/schema.ts`; `npm run db:push` applies it.
