import { pool } from '@/lib/db';

export async function GET() {
  try {
    const { rows } = await pool.query('select 1 as ok');
    return Response.json({ status: 'ok', db: rows[0].ok === 1 }, { status: 200 });
  } catch (error) {
    // Surface the driver message so connectivity issues (environment, TLS,
    // network) are diagnosable from the public status endpoint. It never
    // contains credentials.
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ status: 'degraded', db: false, error: message }, { status: 200 });
  }
}
