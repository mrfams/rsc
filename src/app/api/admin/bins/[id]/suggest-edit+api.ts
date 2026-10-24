import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { bins, editSuggestions } from '@/lib/db/schema';
import { categoryEnum } from '@/lib/db/schema';

/** GET /api/admin/bins/[id]/suggest-edits — get all edit suggestions for a bin (admin only) */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const suggestions = await db
    .select({
      id: editSuggestions.id,
      userId: editSuggestions.userId,
      userEmail: editSuggestions.userEmail,
      name: editSuggestions.name,
      category: editSuggestions.category,
      area: editSuggestions.area,
      status: editSuggestions.status,
      createdAt: editSuggestions.createdAt,
    })
    .from(editSuggestions)
    .where(eq(editSuggestions.binId, params.id))
    .orderBy(desc(editSuggestions.createdAt));

  return Response.json({ suggestions });
}

/** POST /api/admin/bins/[id]/suggest-edits — submit an edit suggestion for admin review */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });

  // Normal users can suggest edits, admins should use the direct edit endpoint
  if (isAdminUser(user)) {
    return Response.json(
      { error: 'Admins should use the direct edit endpoint' },
      { status: 403 }
    );
  }

  const { name, category, area } = await request.json();

  // Validate the input
  if (!name && !category && !area) {
    return Response.json(
      { error: 'At least one field (name, category, or area) must be provided' },
      { status: 400 }
    );
  }

  // Store the edit suggestion
  const [suggestion] = await db
    .insert(editSuggestions)
    .values({
      binId: params.id,
      userId: user.id,
      userEmail: user.email,
      name,
      category,
      area,
      status: 'pending',
    })
    .returning();

  return Response.json({ success: true, suggestion });
}