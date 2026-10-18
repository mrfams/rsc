import { getSessionUser, isAdminUser } from '@/lib/auth';
import { listAllBins } from '@/lib/report-service';

/** GET /api/admin/bins — every bin including removed ones (admin only). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  return Response.json(await listAllBins(), { headers: { 'Cache-Control': 'no-store' } });
}
