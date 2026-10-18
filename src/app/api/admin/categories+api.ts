import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import {
  listCategories,
  normalizeHex,
  normalizeSlug,
  DEFAULT_CATEGORIES,
} from '@/lib/categories';
import { eq } from 'drizzle-orm';

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
