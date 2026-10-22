import { pool } from '@/lib/db';
import { photoStorageLabel } from '@/lib/photo-storage';

export async function GET() {
  const raw = process.env.DATABASE_URL;
  let host: string | null = null;
  let length: number | null = null;
  try {
    if (raw) {
      const u = new URL(raw);
      host = u.host;
      length = raw.length;
    }
  } catch {
    host = 'unparseable';
    length = raw?.length ?? null;
  }
  // Which bucket photos land in. "not configured" means uploads are refused
  // and sightings are posted without their photo — worth seeing from here.
  const photos = photoStorageLabel();

  try {
    const { rows } = await pool.query('select 1 as ok');
    return Response.json(
      { status: 'ok', db: rows[0].ok === 1, dbHost: host, urlLength: length, photos },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // Surface the driver message so connectivity issues (environment, TLS,
    // network) are diagnosable from the public status endpoint. It never
    // contains credentials.
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { status: 'degraded', db: false, error: message, dbHost: host, urlLength: length, photos },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
