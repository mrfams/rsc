import { getSessionUser } from '@/lib/auth';
import {
  createReport,
  listMyReports,
  listPublicReports,
} from '@/lib/report-service';
import { reportSchema } from '@/lib/validation';

/**
 * POST /api/reports — create a report (and implicitly a bin on first sighting).
 * Body: { lat, lng, category, note?, photoBase64? }
 */
export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Sign in to add bins', { status: 401 });

  const parsed = reportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 });
  }
  let report;
  try {
    report = await createReport(user, parsed.data);
  } catch (error) {
    // Validation problems are thrown as Responses and keep their status.
    if (error instanceof Response) throw error;
    console.error('[reports] could not create the report:', error);
    return Response.json(
      { error: 'The sighting could not be saved. Please try again in a moment.' },
      { status: 500 },
    );
  }
  if (report == null) {
    return Response.json({ error: 'Unable to create report' }, { status: 500 });
  }
  return Response.json(report, { status: 201 });
}

/**
 * GET /api/reports — recent feed (public), or ?mine=1 for the caller's own
 * reports (auth required).
 */
export async function GET(request: Request) {
  const mine = new URL(request.url).searchParams.get('mine') === '1';

  if (mine) {
    const user = await getSessionUser(request);
    if (!user) throw new Response('Unauthorized', { status: 401 });
    return Response.json({ reports: await listMyReports(user.id) });
  }

  return Response.json({ reports: await listPublicReports() });
}
