import { getAndroidDownloadUrl } from '@/lib/download-config';

/**
 * GET /api/download — where to install the app.
 *
 * Public on purpose: the download page is reachable without an account, and
 * the QR code on it has to work for guests.
 */
export async function GET() {
  const androidUrl = await getAndroidDownloadUrl();
  return Response.json(
    { androidUrl },
    // A new EAS build means a new link — never cache it.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
