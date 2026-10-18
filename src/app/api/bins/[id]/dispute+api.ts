import { getSessionUser } from '@/lib/auth';
import { disputeBin } from '@/lib/report-service';

/** POST /api/bins/[id]/dispute — flag the bin as missing/wrong (auth). */
export async function POST(request: Request, { id }: { id: string }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Sign in to report a missing bin', { status: 401 });

  const bin = await disputeBin(id);
  if (!bin) throw new Response('Bin not found or already removed', { status: 404 });
  return Response.json(bin);
}
