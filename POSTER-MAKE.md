# Poster / Open Graph image

How to regenerate the social-share card used by `https://emu-bin-tracker.vercel.app`.

> **Agent quick start**
> 1. Edit `scripts/make-og.ps1` (text/colours/layout).
> 2. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-og.ps1`.
> 3. Convert `public/og-image.png` to `public/og-image.jpg` with the Pillow snippet in [step 5.3](#53-convert-the-png-to-jpeg).
> 4. If the image content changed, bump `VERSION` in `public/sw.js`.
> 5. Run typecheck + lint, commit, deploy with `vercel deploy --prod --yes`.
> 6. Verify the live page and image (commands in [section 6](#6-publish-and-verify)).

---

## 1. What this poster is

The poster is the **1200×630 link-preview image** shown when the site is shared in WhatsApp, Telegram, Slack, Discord, X/Twitter, LinkedIn, iMessage, etc.

It is served from:

```
https://emu-bin-tracker.vercel.app/og-image.jpg
```

and declared in `src/lib/site-metadata.ts` as `og:image`, `og:image:secure_url` and `twitter:image`.

There are two copies:

| File | Role |
|---|---|
| `public/og-image.png` | **Master / source of truth.** Drawn by the PowerShell script. RGBA PNG, ~283 KB. |
| `public/og-image.jpg` | **Published card.** RGB JPEG, currently ~103 KB. This is what crawlers download. |

Keep the PNG so the card can be edited later, but **never point `og:image` at it** — see [section 7](#7-why-jpeg-and-not-png).

---

## 2. Non-negotiable constraints

| Constraint | Value | Why |
|---|---|---|
| Dimensions | **1200 × 630 px** exactly | 1.91:1 is the size every platform expects. Smaller images get cropped or ignored. |
| Format | **JPEG** (`.jpg`) | WhatsApp/iMessage are unreliable with alpha PNGs. |
| Colour mode | **RGB, no alpha** | Transparency renders black or odd colours in some chat apps. Flatten onto white. |
| File size | **< 300 KB**, aim 80–150 KB | WhatsApp silently drops larger previews. Current file is ~103 KB. |
| URL | **Absolute** (`https://…/og-image.jpg`) | Crawlers do not resolve relative paths. |
| Text safe area | Keep text ≥ 64 px from every edge | Some apps crop the card to a wider aspect ratio. |
| Title size | ≥ 60 px at 1200 px wide | Must stay readable as a ~360 px thumbnail. |
| `og:image:alt` | **ASCII only** | Avoid encoding bugs in older crawlers. |
| Host | `https://emu-bin-tracker.vercel.app` | Deployment URLs are behind Vercel Authentication and return a login page to crawlers. |

Also add `< 300 KB` to your mental checklist before committing. A valid-looking 400 KB PNG will still fail on WhatsApp.

---

## 3. Current layout spec

The design is drawn by `scripts/make-og.ps1` using .NET `System.Drawing` (GDI+).

**Canvas:** 1200 × 630.

| Element | Details |
|---|---|
| Background | Linear gradient `#082F24` → `#0E7C5A`, angle 18° |
| Decorative glow | `#5EE0AE` at ~7% alpha, two ellipses on the right |
| Decorative rings | White at ~5.5% alpha, two circles on the right |
| Eyebrow | `EASTERN MEDITERRANEAN UNIVERSITY`, Segoe UI Bold 18, `#BCEBD9`, at `(84, 76)` |
| Title | `EMU Bin Tracker`, Segoe UI Bold **78** (auto-shrinks by 2 until it fits 720 px), white, at `(78, 120)` |
| Accent bar | `#F5B82E`, 92 × 7, at `(84, 236)` |
| Subtitle | `A community map of recycling bins` / `across the EMU campus.`, Segoe UI 31, `#E7F7F0`, at `(84, 278)` and `(84, 326)` |
| Chips | `Find bins` · `Add sightings` · `Track impact`, white 9% fill, 44 px tall, radius 22, starting at `(84, 414)` |
| Footer | `Recycling & Sustainability Club \| emu-bin-tracker.vercel.app`, Segoe UI 18, `#BCEBD9`, at `(84, 548)` |
| Logo card | 300 × 300 white rounded card (radius 58) at `(842, 152)`, soft `#001A12` shadow offset `(10, 14)` |
| Logo | `assets/icon.png` drawn at 236 × 236, centred in the card |
| Tag | `COMMUNITY-POWERED CAMPUS MAP`, Segoe UI Bold 16, white ~80%, centred under the card at `y = 486` |

The left column is text, the right column is the logo. If you change the wording, keep the title short enough that it still fits at 78 px; the script will shrink it automatically but the result looks worse below ~60 px.

The script uses **Segoe UI**, which is Windows-only. On macOS/Linux, substitute an available font (e.g. `DejaVu Sans`, `Helvetica Neue`, `Arial`) and re-check the layout, because font metrics differ.

---

## 4. Files and what each one does

| Path | Role | Edit? |
|---|---|---|
| `scripts/make-og.ps1` | Draws the 1200×630 PNG. **Edit this to change the poster.** | Yes |
| `public/og-image.png` | Generated master. Not used by crawlers. | Generated only |
| `public/og-image.jpg` | Published card used by `og:image`. **Must stay < 300 KB.** | Generated only |
| `src/lib/site-metadata.ts` | Declares `OG_IMAGE_URL`, `og:image`, `twitter:image`, dimensions, MIME type, alt text. | Only if the filename or dimensions change |
| `src/lib/constants.ts` | `APP_WEB_URL`, the absolute origin used for preview URLs. | Rarely (env override) |
| `vercel.json` | Sends `Content-Type: image/jpeg` and `Cache-Control: public, max-age=86400` for `/og-image.jpg`. | Only if the filename changes |
| `public/sw.js` | Precaches `/og-image.jpg` and `/og-image.png`; bump `VERSION` when the image changes. | Version bump only |

---

## 5. Regenerate the poster (step by step)

### 5.1 Edit the drawing script

Open `scripts/make-og.ps1` and change the strings, colours, or coordinates. The file is commented; the main things are:

- Top label: `EASTERN MEDITERRANEAN UNIVERSITY`
- Title: `EMU Bin Tracker`
- Subtitle: two `DrawString` calls
- Chips: the `$chips` array
- Footer: the `DrawString` near the bottom
- Logo: `assets/icon.png`
- Colours: `#082F24`, `#0E7C5A`, `#F5B82E`, `#BCEBD9`, `#E7F7F0`

The script resolves paths from its own location, so it works from any checkout:

```powershell
$root = Split-Path -Parent $PSScriptRoot   # scripts/ -> repo root
```

### 5.2 Run it

From the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-og.ps1
```

Expected output:

```
Wrote <repo>\public\og-image.png
```

Open `public/og-image.png` and look at it before converting. This is the step where you catch clipped text or a title that shrank too far.

> GDI+ can re-encode the PNG with a few bytes' difference even when the artwork is unchanged. If you only ran the script to confirm it works and did not intend to change the card, restore the committed copy with `git checkout -- public/og-image.png` so you do not commit a pointless binary diff.

> The script uses Windows PowerShell 5.1 + .NET `System.Drawing`, which ships with Windows. `pwsh` 7 on non-Windows may not have `System.Drawing`; run it on Windows or port the drawing calls.

### 5.3 Convert the PNG to JPEG

The published file must be **RGB, no alpha, under 300 KB**. Flatten transparency onto white first:

```python
from PIL import Image

im = Image.open("public/og-image.png").convert("RGBA")

# Flatten alpha onto white so chat apps do not render a black/odd background.
bg = Image.new("RGB", im.size, (255, 255, 255))
bg.paste(im, mask=im.split()[3])

bg.save(
    "public/og-image.jpg",
    "JPEG",
    quality=88,
    optimize=True,
    progressive=True,
    subsampling=0,  # keeps small text crisp
)
```

Run it with Python (Pillow is already installed on this machine):

```powershell
python -c "from PIL import Image; im=Image.open('public/og-image.png').convert('RGBA'); bg=Image.new('RGB', im.size, (255,255,255)); bg.paste(im, mask=im.split()[3]); bg.save('public/og-image.jpg','JPEG',quality=88,optimize=True,progressive=True,subsampling=0)"
```

Do **not** save a palette PNG or a transparent JPEG. Do **not** skip the flatten step.

### 5.4 Check dimensions, mode and size

```powershell
python -c "from PIL import Image; import os; im=Image.open('public/og-image.jpg'); print(im.size, im.mode, os.path.getsize('public/og-image.jpg'), 'bytes')"
```

Expected:

```
(1200, 630) RGB 103094 bytes
```

The byte count can vary, but it must be **under 300000**. If it is larger, lower `quality` to 82–85 or simplify the artwork; do not exceed 300 KB.

### 5.5 Bump the service worker version

`public/sw.js` precaches `/og-image.jpg` and serves images **cache-first**. An installed PWA will keep the old image forever at the same URL unless the cache name changes.

If the image content changed:

```js
const VERSION = 'rsc-v4';   // -> 'rsc-v5', 'rsc-v6', ...
```

Bump the number. This deletes the old caches on activation. If you only changed docs or code and the image bytes are identical, leave it alone.

### 5.6 Keep the metadata in sync

You only need to touch `src/lib/site-metadata.ts` if:

- the filename changes (then update `OG_IMAGE_URL`, `vercel.json`, and `public/sw.js`), or
- the dimensions change (then update `width` / `height`), or
- you change the alt text.

The MIME type must stay `image/jpeg`.

### 5.7 Typecheck and lint before committing

```powershell
node node_modules/typescript/bin/tsc --noEmit
npx expo lint
```

Both must pass. The poster script is not part of the TypeScript build, but the metadata file is.

---

## 6. Publish and verify

### 6.1 Commit only poster-related files

Do not sweep unrelated work-in-progress into the commit. Check `git status` first.

```powershell
git add POSTER-MAKE.md scripts/make-og.ps1 public/og-image.png public/og-image.jpg public/sw.js src/lib/site-metadata.ts vercel.json
git commit -m "Document how to generate the Open Graph poster"
git push
```

### 6.2 Deploy

In practice, a push has not reliably created a production deployment for this project. After pushing, check for a new production deployment:

```powershell
vercel ls
```

If none appears, deploy explicitly:

```powershell
vercel deploy --prod --yes
```

Only `https://emu-bin-tracker.vercel.app` is public. Deployment URLs such as `emu-bin-tracker-8xva8mp87-mrfams-projects.vercel.app` redirect to `vercel.com/login` because of Vercel Authentication, so **never share those** and never use them for preview testing.

### 6.3 Verify the page tags

```powershell
curl.exe -s https://emu-bin-tracker.vercel.app/ | Select-String -Pattern 'og:image|og:image:type|og:title'
```

Expected:

```html
<meta property="og:image" content="https://emu-bin-tracker.vercel.app/og-image.jpg"/>
<meta property="og:image:type" content="image/jpeg"/>
```

### 6.4 Verify the image itself

```powershell
curl.exe -sI https://emu-bin-tracker.vercel.app/og-image.jpg
```

Expected:

```
HTTP/1.1 200 OK
content-type: image/jpeg
content-length: 103094
cache-control: public, max-age=86400
```

Then confirm a real crawler can resolve it:

```
https://api.microlink.io/?url=https%3A%2F%2Femu-bin-tracker.vercel.app%2F&meta=true
```

The response should include `image.url` pointing at `/og-image.jpg`, with `image.width = 1200` and `image.height = 630`.

### 6.5 Chat-app cache

Chat apps cache previews per URL for days. If the live tags are correct but an old card still appears:

- Share the URL with a query string, e.g. `https://emu-bin-tracker.vercel.app/?v=2`.
- WhatsApp: use the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and click **Scrape Again**.
- Telegram: message [@WebpageBot](https://t.me/WebpageBot) with the URL.
- X/Twitter: use the [Card Validator](https://cards-dev.twitter.com/validator) (or just post a test tweet).

Do not change the design to “fix” a cache problem.

---

## 7. Why JPEG and not PNG

The card originally shipped as a 283 KB RGBA PNG. WhatsApp and some Android share sheets either refused it or silently dropped the image, so the preview showed only the title (or nothing). The published file is now a **103 KB RGB JPEG** at the same 1200×630.

Rules that follow from this:

- Do not switch `og:image` back to `.png`.
- Do not keep the alpha channel “for a nicer edge”. Flatten onto white.
- Do not exceed 300 KB, even if the file looks fine in a browser.
- Keep `og:image:type` as `image/jpeg`.

If you need transparency in the design, bake it into the background colour instead.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No preview at all (no title, no image) | Shared a deployment URL behind Vercel Authentication | Share `https://emu-bin-tracker.vercel.app` only |
| Title shows, image missing | Image > 300 KB, alpha PNG, or relative URL | Re-export as RGB JPEG < 300 KB; check absolute URL |
| Old image still shows | Chat-app cache | Add `?v=2`, or re-scrape with the Facebook debugger |
| Old image shows for installed PWA users | Service-worker cache-first at the same URL | Bump `VERSION` in `public/sw.js` |
| Image works in browser but not on WhatsApp | WhatsApp rejects large/alpha images | Follow section 7 |
| `og:image` points at a login page | Using a Vercel deployment hostname | Use the production alias, or disable Vercel Authentication for that deployment |
| Text is clipped on LinkedIn/X | Content outside the safe area | Keep text ≥ 64 px from edges |
| `og:image:alt` shows mojibake | Non-ASCII characters | Use plain ASCII in `alt` |
| Build fails after editing the script | The `.ps1` is not part of the web build | It should not be imported anywhere; it is a tool, not app code |

Platform limitations to know:

- **Instagram** DMs and Stories do not render link cards. Nothing in the metadata can change that.
- **WhatsApp** may show a small square crop of a wide image depending on the surface.
- **iMessage** caches aggressively and sometimes shows only the title until the image is re-fetched.

---

## 9. Pre-commit checklist

- [ ] `scripts/make-og.ps1` runs without errors on Windows
- [ ] `public/og-image.png` is 1200 × 630
- [ ] `public/og-image.jpg` is 1200 × 630, **RGB**, **< 300 KB**
- [ ] Title/text is readable at thumbnail size and inside the safe area
- [ ] `og:image` still points at `/og-image.jpg` with `image/jpeg`
- [ ] `public/sw.js` `VERSION` bumped if the image bytes changed
- [ ] `tsc --noEmit` and `npx expo lint` pass
- [ ] Only poster-related files are staged
- [ ] Deployed and verified on `https://emu-bin-tracker.vercel.app`
- [ ] Microlink (or a real chat app) resolves the image

---

## 10. Provenance

- **Oct 22, 2026, 21:18–21:19** — the original 283 KB RGBA PNG was generated by a previous OpenCode session (`ses_e9bafb03bffewF1CdFmQG9gZlF`, model `deepseek-v4.1-flash-free`) using an earlier version of this GDI+ script. It was committed in `b5140ce` (“Clean up report photos and add social previews”).
- **Oct 23, 2026, `6c5f100`** — converted to the 103 KB RGB JPEG, pointed `og:image`/`twitter:image` at it, added the `vercel.json` headers, and bumped the service worker to `rsc-v4`.
- **This file** — moves the generator into `scripts/make-og.ps1` and documents the process so any agent can reproduce or edit the card without guessing.

If you change the visual identity (new logo, new club name), update both the script and the strings in `src/lib/site-metadata.ts` (`SITE_NAME`, `SITE_DESCRIPTION`, alt text), then follow the full checklist above.
