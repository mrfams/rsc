import { getSessionUser, isAdminUser } from '@/lib/auth';
import { createBinByAdmin, listAllBins } from '@/lib/report-service';
import { adminBinCreateSchema } from '@/lib/validation';

/** GET /api/admin/bins — every bin including removed ones (admin only). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  return Response.json(await listAllBins(), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST /api/admin/bins — create a named bin directly on the map. */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const parsed = adminBinCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid bin', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const bin = await createBinByAdmin(user, parsed.data);
  if (!bin) return Response.json({ error: 'Unknown category' }, { status: 422 });
  return Response.json(bin, { status: 201 });
}
