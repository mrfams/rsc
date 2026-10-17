import { listBins } from '@/lib/report-service';

/** GET /api/bins — all public bins for the map. No auth required. */
export async function GET(request: Request) {
  const bins = await listBins();
  return Response.json(bins, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
