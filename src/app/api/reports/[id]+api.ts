import { getReport } from '@/lib/report-service';

export async function GET(request: Request, { id }: { id: string }) {
  const report = await getReport(id);
  if (!report) throw new Response('Report not found', { status: 404 });
  return Response.json(report);
}
