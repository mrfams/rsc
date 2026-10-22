import { getSessionUser, isAdminUser } from '@/lib/auth';
import { getAndroidDownloadUrl, setAndroidDownloadUrl } from '@/lib/download-config';

async function requireAdmin(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });
  return user;
}

/** GET /api/admin/download — current install link (admin only). */
export async function GET(request: Request) {
  await requireAdmin(request);
  return Response.json({ androidUrl: await getAndroidDownloadUrl() });
}

/**
 * PUT /api/admin/download — point the app at a newer EAS build (admin only).
 *
 * Every EAS build gets its own artifact URL, so after a new build the admin
 * pastes the link here and the download page (plus its QR code) updates for
 * everyone immediately.
 */
export async function PUT(request: Request) {
  await requireAdmin(request);

  const body = (await request.json().catch(() => ({}))) as { androidUrl?: unknown };
  const url = typeof body.androidUrl === 'string' ? body.androidUrl : '';
  if (!url.trim()) {
    return Response.json({ error: 'The download link is required' }, { status: 400 });
  }

  try {
    const androidUrl = await setAndroidDownloadUrl(url);
    return Response.json({ androidUrl });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not save the link' },
      { status: 400 },
    );
  }
}
