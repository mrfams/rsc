import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/** PATCH /api/admin/users/[id] — grant or revoke admin role (admin only). */
export async function PATCH(request: Request, { id }: { id: string }) {
  const admin = await getSessionUser(request);
  if (!admin) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(admin)) throw new Response('Admins only', { status: 403 });

  const { isAdmin } = (await request.json()) as { isAdmin?: boolean };
  if (typeof isAdmin !== 'boolean') {
    return Response.json({ error: 'isAdmin boolean is required' }, { status: 400 });
  }
  if (id === admin.id && isAdmin === false) {
    return Response.json({ error: 'You cannot demote yourself' }, { status: 400 });
  }

  const updated = await db
    .update(user)
    .set({ role: isAdmin ? 'admin' : null, updatedAt: new Date() })
    .where(eq(user.id, id))
    .returning({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

  if (updated.length === 0) return Response.json({ error: 'User not found' }, { status: 404 });
  return Response.json(updated[0]);
}
