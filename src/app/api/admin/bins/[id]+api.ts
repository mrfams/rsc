import { getSessionUser, isAdminEmail } from '@/lib/auth';
import { setBinStatus } from '@/lib/report-service';
import { binStatusSchema } from '@/lib/validation';

/** PATCH /api/admin/bins/[id] — force a bin lifecycle status (admin only). */
export async function PATCH(request: Request, { id }: { id: string }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminEmail(user.email)) throw new Response('Admins only', { status: 403 });

  const parsed = binStatusSchema.safeParse((await request.json())?.status);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }

  const bin = await setBinStatus(id, parsed.data);
  if (!bin) throw new Response('Bin not found', { status: 404 });
  return Response.json(bin);
}
