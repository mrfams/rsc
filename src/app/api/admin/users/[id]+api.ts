import { eq } from 'drizzle-orm';

import { purgeUserAccount, setUserDisabled } from '@/lib/account-service';
import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

type PatchBody = { isAdmin?: unknown; disabled?: unknown };

/**
 * PATCH /api/admin/users/[id] — change a member's role or suspend/reactivate
 * the account. Suspending revokes sessions and push tokens immediately.
 */
export async function PATCH(request: Request, { id }: { id: string }) {
  const admin = await getSessionUser(request);
  if (!admin) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(admin)) throw new Response('Admins only', { status: 403 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hasRole = typeof body.isAdmin === 'boolean';
  const hasDisabled = typeof body.disabled === 'boolean';
  if (!hasRole && !hasDisabled) {
    return Response.json({ error: 'isAdmin or disabled boolean is required' }, { status: 400 });
  }
  if (body.isAdmin !== undefined && typeof body.isAdmin !== 'boolean') {
    return Response.json({ error: 'isAdmin must be a boolean' }, { status: 400 });
  }
  if (body.disabled !== undefined && typeof body.disabled !== 'boolean') {
    return Response.json({ error: 'disabled must be a boolean' }, { status: 400 });
  }
  if (id === admin.id) {
    if (body.isAdmin === false) {
      return Response.json({ error: 'You cannot demote yourself' }, { status: 400 });
    }
    if (body.disabled === true) {
      return Response.json({ error: 'You cannot disable your own account' }, { status: 400 });
    }
  }

  if (hasRole) {
    const updated = await db
      .update(user)
      .set({ role: body.isAdmin ? 'admin' : null, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning({ id: user.id });
    if (updated.length === 0) return Response.json({ error: 'User not found' }, { status: 404 });
  }

  if (hasDisabled) {
    const ok = await setUserDisabled(id, body.disabled as boolean);
    if (!ok) return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const [row] = await db
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
    .where(eq(user.id, id))
    .limit(1);

  if (!row) return Response.json({ error: 'User not found' }, { status: 404 });
  return Response.json(row, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * DELETE /api/admin/users/[id] — permanently remove an account.
 *
 * Reports cascade away with the account; stored photos and the affected bin
 * aggregates are cleaned up by the shared account service. Admins cannot
 * delete themselves here (the profile screen has the guarded self-service
 * flow).
 */
export async function DELETE(request: Request, { id }: { id: string }) {
  const admin = await getSessionUser(request);
  if (!admin) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(admin)) throw new Response('Admins only', { status: 403 });
  if (id === admin.id) {
    return Response.json(
      { error: 'Use the profile page to delete your own account' },
      { status: 400 },
    );
  }

  const deleted = await purgeUserAccount(id);
  if (!deleted) return Response.json({ error: 'User not found' }, { status: 404 });
  return Response.json({ deleted: true });
}
