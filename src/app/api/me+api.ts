import { eq } from 'drizzle-orm';

import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { getUserStats } from '@/lib/report-service';

/** GET /api/me — session user + points/leaderboard stats + admin flag (auth required). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const stats = await getUserStats(user.id);
  return Response.json({
    user: { name: user.name, email: user.email, role: (user as { role?: string }).role ?? null },
    isAdmin: isAdminUser(user),
    leaderboardOptIn: stats.leaderboardOptIn,
    stats,
  });
}

/** PATCH /api/me — record whether this member agreed to appear on the leaderboard. */
export async function PATCH(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  let body: { leaderboardOptIn?: unknown };
  try {
    body = await request.json();
  } catch {
    throw new Response('Invalid JSON body', { status: 400 });
  }
  if (typeof body.leaderboardOptIn !== 'boolean') {
    throw new Response('leaderboardOptIn must be true or false', { status: 422 });
  }

  const [updated] = await db
    .update(userTable)
    .set({ leaderboardOptIn: body.leaderboardOptIn, updatedAt: new Date() })
    .where(eq(userTable.id, user.id))
    .returning({ leaderboardOptIn: userTable.leaderboardOptIn });

  if (!updated) throw new Response('Member not found', { status: 404 });
  return Response.json(updated);
}
