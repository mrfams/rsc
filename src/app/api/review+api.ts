import { getSessionUser } from '@/lib/auth';
import { listReviewQueue } from '@/lib/report-service';

/**
 * GET /api/review — the signed-in member's actionable review queue.
 *
 * Bins they already sighted are excluded: a bin needs an independent second
 * sighting, and self-confirmation must never award points. Auth-only because
 * the response is personalised.
 */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Sign in to review bins', { status: 401 });

  return Response.json(
    { items: await listReviewQueue(user.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
