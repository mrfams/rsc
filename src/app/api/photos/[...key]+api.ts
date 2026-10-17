import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * GET /api/photos/<key> — serves photos stored locally under ./.data/uploads
 * (dev mode without a Blob token). Blob-hosted photos are direct URLs and
 * never hit this route.
 */
export async function GET(request: Request, { key }: { key: string | string[] }) {
  const parts = (Array.isArray(key) ? key : [key]).map(decodeURIComponent);
  if (parts.length === 0 || parts.some((p) => p.includes('..') || p.includes('\\'))) {
    throw new Response('Not found', { status: 404 });
  }

  const safe = path.join(process.cwd(), '.data', 'uploads', ...parts);
  if (!safe.startsWith(path.join(process.cwd(), '.data', 'uploads'))) {
    throw new Response('Not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(safe);
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    throw new Response('Not found', { status: 404 });
  }
}
