import { getBinWithReports } from '@/lib/report-service';

/** GET /api/bins/[id] — bin details + sighting history. Public. */
export async function GET(_request: Request, { id }: { id: string }) {
  const bin = await getBinWithReports(id);
  if (!bin) throw new Response('Bin not found', { status: 404 });
  return Response.json(bin, { headers: { 'Cache-Control': 'no-store' } });
}
