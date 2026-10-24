import { getAndroidDownloadUrl } from '@/lib/download-config';

/**
 * GET /api/apk — download the APK directly.
 *
 * Streams the APK file from GitHub releases with Content-Disposition: attachment
 * so the browser downloads it instead of navigating to the GitHub page.
 * The URL is read from app_config so admins can update it without a new build.
 */
export async function GET() {
  const url = await getAndroidDownloadUrl();
  if (!url) {
    return new Response('No download URL configured', { status: 404 });
  }
  
  // Fetch the APK file and stream it as a download
  const response = await fetch(url);
  if (!response.ok) {
    return new Response('Could not fetch the APK', { status: 502 });
  }
  
  const blob = await response.blob();
  const filename = 'app.apk';
  
  return new Response(blob, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
