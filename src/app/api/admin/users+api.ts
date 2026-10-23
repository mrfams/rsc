import { asc } from 'drizzle-orm';

import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

/** GET /api/admin/users — every member with role and suspension state (admin only). */
export async function GET(request: Request) {
  const admin = await getSessionUser(request);
  if (!admin) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(admin)) throw new Response('Admins only', { status: 403 });

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      leaderboardOptIn: user.leaderboardOptIn,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.email));

  return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}
