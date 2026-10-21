import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { bins, categories } from '@/lib/db/schema';
import {
  listCategories,
  normalizeHex,
  normalizeSlug,
  DEFAULT_CATEGORIES,
} from '@/lib/categories';
import { eq, sql } from 'drizzle-orm';

async function requireAdmin(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });
  return user;
}

/** GET /api/admin/categories — full catalogue incl. deactivated (admin only). */
export async function GET(request: Request) {
  await requireAdmin(request);
  return Response.json(await listCategories(false));
}

/** POST /api/admin/categories — create a category (admin only). */
export async function POST(request: Request) {
  await requireAdmin(request);

  const body = (await request.json()) as {
    slug?: string;
    name?: string;
    color?: string;
    emoji?: string;
  };
  const slug = normalizeSlug(body.slug ?? '');
  if (!slug.valid) {
    return Response.json({ error: slug.reason }, { status: 400 });
  }
  const name = (body.name ?? '').trim().slice(0, 48);
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

  try {
    const [row] = await db
      .insert(categories)
      .values({
        slug: slug.slug,
        name,
        color: normalizeHex(body.color ?? '', DEFAULT_CATEGORIES[0].color),
        emoji: (body.emoji ?? '♻️').slice(0, 8) || '♻️',
        active: true,
      })
      .returning();
    return Response.json(row, { status: 201 });
  } catch {
    return Response.json({ error: 'That slug already exists' }, { status: 409 });
  }
}

/** PATCH /api/admin/categories — update name/colours/active state. */
export async function PATCH(request: Request) {
  await requireAdmin(request);

  const body = (await request.json()) as {
    slug?: string;
    name?: string;
    color?: string;
    emoji?: string;
    active?: boolean;
  };
  if (!body.slug) return Response.json({ error: 'slug is required' }, { status: 400 });

  const patch: Partial<typeof categories.$inferInsert> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 48) || 'Category';
  if (typeof body.color === 'string') patch.color = normalizeHex(body.color);
  if (typeof body.emoji === 'string') patch.emoji = body.emoji.slice(0, 8) || '♻️';
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await db
    .update(categories)
    .set(patch)
    .where(eq(categories.slug, body.slug))
    .returning();
  if (updated.length === 0) return Response.json({ error: 'Unknown category' }, { status: 404 });
  return Response.json(updated[0]);
}

/**
 * DELETE /api/admin/categories — permanently remove a bin type.
 *
 * `bins.category` is a foreign key, so a type in use cannot be deleted
 * without breaking historical bins. Those are refused with a clear message;
 * hiding (PATCH active:false) is always available instead.
 */
export async function DELETE(request: Request) {
  await requireAdmin(request);

  const body = (await request.json().catch(() => ({}))) as { slug?: string };
  const slug = body.slug?.trim();
  if (!slug) return Response.json({ error: 'slug is required' }, { status: 400 });

  const [row] = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (!row) return Response.json({ error: 'Unknown category' }, { status: 404 });

  const [usage] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bins)
    .where(eq(bins.category, slug));
  const used = Number(usage?.count ?? 0);
  if (used > 0) {
    return Response.json(
      {
        error: `This type is used by ${used} bin${used === 1 ? '' : 's'}. Hide it instead.`,
      },
      { status: 409 },
    );
  }

  const [remaining] = await db.select({ count: sql<number>`count(*)` }).from(categories);
  if (Number(remaining?.count ?? 0) <= 1) {
    return Response.json({ error: 'Keep at least one bin type.' }, { status: 409 });
  }

  try {
    await db.delete(categories).where(eq(categories.slug, slug));
  } catch {
    // A bin started using the type between the check and the delete.
    return Response.json(
      { error: 'This type is now in use by a bin. Hide it instead.' },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, slug });
}
