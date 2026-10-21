import { getSessionUser } from '@/lib/auth';
import { getBinWithReports } from '@/lib/report-service';

/** GET /api/bins/[id] — bin details + sighting history. Public. */
export async function GET(request: Request, { id }: { id: string }) {
  const viewer = await getSessionUser(request).catch(() => null);
  const bin = await getBinWithReports(id, viewer?.id);
  if (!bin) throw new Response('Bin not found', { status: 404 });
  return Response.json(bin, { headers: { 'Cache-Control': 'no-store' } });
}
