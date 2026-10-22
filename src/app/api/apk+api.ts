import { getAndroidDownloadUrl } from '@/lib/download-config';

/**
 * GET /api/apk — the stable install link.
 *
 * Redirects to the APK that is live right now (the URL the admin last set,
 * stored in `app_config`). Posters, QR codes and the README can point at this
 * one address forever: every new build just repoints the stored URL.
 *
 * The fallback below is the "latest release" asset on GitHub. It is written
 * out here instead of imported from the shared constant so this route can
 * never end up redirecting to itself.
 */
const RELEASE_FALLBACK = 'https://github.com/mrfams/rsc/releases/latest/download/app.apk';

export async function GET() {
  const url = await getAndroidDownloadUrl();
  return Response.redirect(url || RELEASE_FALLBACK, 302);
}
