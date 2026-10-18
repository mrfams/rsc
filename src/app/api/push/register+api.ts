import { getSessionUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { pushTokens } from '@/lib/db/schema';
import { isValidExpoPushToken } from '@/lib/push';

/**
 * POST /api/push/register — attach an Expo push token to the session user.
 * Body: { token: string, platform: 'android' | 'ios' | 'web' }
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Sign in to enable notifications', { status: 401 });

  const body = (await request.json()) as { token?: unknown; platform?: unknown };
  const token = typeof body?.token === 'string' ? body.token : '';
  const platform = ['android', 'ios', 'web'].includes(String(body?.platform))
    ? String(body?.platform)
    : 'unknown';

  if (!token || !isValidExpoPushToken(token)) {
    return Response.json({ error: 'Invalid Expo push token' }, { status: 400 });
  }

  await db
    .insert(pushTokens)
    .values({ userId: user.id, token, platform })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId: user.id, platform },
    });

  return Response.json({ registered: true });
}

/** DELETE /api/push/register — detaches a device token (body: { token }). */
export async function DELETE(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const body = (await request.json()) as { token?: unknown };
  if (typeof body?.token !== 'string') {
    return Response.json({ error: 'token required' }, { status: 400 });
  }
  await db.delete(pushTokens).where(eq(pushTokens.token, body.token));
  return Response.json({ deleted: true });
}
