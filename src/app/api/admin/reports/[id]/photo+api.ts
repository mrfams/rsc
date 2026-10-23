import { getSessionUser, isAdminUser } from '@/lib/auth';
import { removeReportPhoto } from '@/lib/report-service';

/**
 * DELETE /api/admin/reports/[id]/photo — remove a sighting photo without
 * deleting the sighting itself. Admin only.
 */
export async function DELETE(request: Request, { id }: { id: string }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const result = await removeReportPhoto(id);
  if (result === 'not-found') return Response.json({ error: 'Report not found' }, { status: 404 });
  if (result === 'no-photo') {
    return Response.json({ error: 'This sighting has no photo' }, { status: 409 });
  }
  return Response.json({ removed: true });
}
