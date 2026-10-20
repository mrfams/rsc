import { getSessionUser, isAdminUser } from '@/lib/auth';
import { updateBinDetails } from '@/lib/report-service';
import { adminBinUpdateSchema } from '@/lib/validation';

/** PATCH /api/admin/bins/[id] — edit a bin's name, type, position or status. */
export async function PATCH(request: Request, { id }: { id: string }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const parsed = adminBinUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid bin update', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const bin = await updateBinDetails(id, parsed.data);
  if (!bin) throw new Response('Bin or category not found', { status: 404 });
  return Response.json(bin);
}
