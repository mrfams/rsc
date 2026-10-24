import { getSessionUser, isAdminUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { editSuggestions, bins } from '@/lib/db/schema';

type VerifyAction = 'verify' | 'reject';

/** PUT /api/admin/bins/[id]/suggest-edits/[sugId]/verify — admin verifies or rejects an edit suggestion */
export async function PUT(request: Request, { params }: { params: { id: string; sugId: string } }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const { action } = await request.json() as { action: VerifyAction };

  if (action === 'verify') {
    // Verify the edit - update the bin with the suggested changes
    const [suggestion] = await db
      .select({ name: editSuggestions.name, category: editSuggestions.category, area: editSuggestions.area })
      .from(editSuggestions)
      .where(eq(editSuggestions.id, params.sugId));

    if (!suggestion) {
      return Response.json({ error: 'Edit suggestion not found' }, { status: 404 });
    }

    // Update the bin with the suggested changes
    const patch: any = { updatedAt: new Date() };

    if (suggestion.name) {
      patch.name = suggestion.name.trim() || null;
      patch.placeName = suggestion.name.trim() || null;
    }
    if (suggestion.category) {
      patch.category = suggestion.category;
    }
    if (suggestion.area !== undefined) {
      patch.area = suggestion.area;
    }

    const [updated] = await db
      .update(bins)
      .set(patch)
      .where(eq(bins.id, params.id))
      .returning();

    // Mark the suggestion as verified
    await db
      .update(editSuggestions)
      .set({ status: 'verified', verifiedAt: new Date() })
      .where(eq(editSuggestions.id, params.sugId));

    return Response.json({ success: true, bin: updated });
  } else if (action === 'reject') {
    // Reject the edit - just mark it as rejected
    await db
      .update(editSuggestions)
      .set({ status: 'rejected' })
      .where(eq(editSuggestions.id, params.sugId));

    return Response.json({ success: true });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}