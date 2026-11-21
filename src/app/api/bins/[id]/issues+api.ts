import { getSessionUser } from '@/lib/auth';
import { createBinIssue } from '@/lib/report-service';
import { binIssueSchema } from '@/lib/validation';

/** POST /api/bins/[id]/issues — report an issue with a bin (auth). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Sign in to report an issue', { status: 401 });

  const parsed = binIssueSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid issue', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const issue = await createBinIssue(user, params.id, parsed.data);
    return Response.json(issue);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status) throw err;
    throw new Response('Could not report the issue', { status: 500 });
  }
}