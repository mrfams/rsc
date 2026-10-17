import { pool } from '@/lib/db';

export async function GET() {
  try {
    const { rows } = await pool.query('select 1 as ok');
    return Response.json({ status: 'ok', db: rows[0].ok === 1 }, { status: 200 });
  } catch {
    return Response.json({ status: 'degraded', db: false }, { status: 200 });
  }
}
