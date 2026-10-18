import { getSessionUser, isAdminEmail } from '@/lib/auth';
import { getUserStats } from '@/lib/report-service';

/** GET /api/me — session user + trust stats + admin flag (auth required). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  return Response.json({
    user: { name: user.name, email: user.email },
    isAdmin: isAdminEmail(user.email),
    stats: await getUserStats(user.id),
  });
}
