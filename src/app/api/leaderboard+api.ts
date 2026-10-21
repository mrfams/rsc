import { getSessionUser } from '@/lib/auth';
import { getPublicLeaderboard } from '@/lib/report-service';

/**
 * GET /api/leaderboard — public top 10. Only members who explicitly allowed
 * their name to be shown appear here; signed-in viewers get `isYou` marked.
 */
export async function GET(request: Request) {
  const viewer = await getSessionUser(request).catch(() => null);
  return Response.json(await getPublicLeaderboard(10, viewer?.id));
}
