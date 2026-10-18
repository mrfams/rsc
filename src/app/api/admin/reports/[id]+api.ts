import { getSessionUser, isAdminUser } from '@/lib/auth';
import { deleteReport } from '@/lib/report-service';

/** DELETE /api/admin/reports/[id] — remove a bad report (admin only). */
export async function DELETE(request: Request, { id }: { id: string }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const ok = await deleteReport(id);
  if (!ok) throw new Response('Report not found', { status: 404 });
  return Response.json({ deleted: true });
}
