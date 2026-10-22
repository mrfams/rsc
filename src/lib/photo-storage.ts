/**
 * Where uploaded photos live.
 *
 * Three backends, picked automatically in this order:
 *
 *  1. **Cloudflare R2** (recommended) — set `R2_ACCOUNT_ID`,
 *     `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`. R2 speaks
 *     the S3 API, so the upload is a signed PUT. It is cheap, has no egress
 *     fees and can be served from your own domain (`R2_PUBLIC_URL`).
 *  2. **Vercel Blob** — set `BLOB_READ_WRITE_TOKEN`.
 *  3. **Local disk** — `./.data/uploads`. Development only: a serverless
 *     function has a read-only filesystem, so photos are refused with a clear
 *     message instead of a bare 500.
 */
import { put } from '@vercel/blob';
import { AwsClient } from 'aws4fetch';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** The client compresses to ~900 KB; 1 MB leaves room for base64 rounding. */
export const MAX_PHOTO_BYTES = 1_000_000;

export type PhotoBackend = 'r2' | 'vercel-blob' | 'local' | 'unconfigured';

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL of the bucket (custom domain or the r2.dev URL). */
  publicBase: string;
};

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  // R2's S3 endpoint is authenticated; the app needs a public bucket URL
  // (r2.dev subdomain or custom domain) to render the uploaded image.
  const publicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

/** Which backend this server would use right now. */
export function photoBackend(): PhotoBackend {
  if (r2Config()) return 'r2';
  if (process.env.BLOB_READ_WRITE_TOKEN) return 'vercel-blob';
  // Serverless deployments cannot write to their own filesystem.
  if (process.env.VERCEL) return 'unconfigured';
  return 'local';
}

export function photoStorageLabel(): string {
  switch (photoBackend()) {
    case 'r2':
      return 'Cloudflare R2';
    case 'vercel-blob':
      return 'Vercel Blob';
    case 'local':
      return 'local disk';
    default:
      return 'not configured';
  }
}

/** Signed PUT to an R2 bucket. Returns the public URL of the object. */
async function putToR2(config: R2Config, key: string, bytes: Buffer): Promise<string> {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    // R2 ignores the region but still requires one in the signature scope.
    region: 'auto',
  });

  const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  const response = await client.fetch(url, {
    method: 'PUT',
    // A plain Uint8Array keeps the body a valid ArrayBufferView for both
    // fetch() and the SigV4 payload hash.
    body: new Uint8Array(bytes),
    headers: { 'Content-Type': 'image/jpeg' },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`R2 upload failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return `${config.publicBase}/${key}`;
}

/**
 * Store the bytes and return the value to keep in the database: an absolute
 * URL for remote buckets, the object key for the local disk.
 */
export async function storePhotoBytes(bytes: Buffer, key: string): Promise<string> {
  const backend = photoBackend();

  if (backend === 'r2') {
    const config = r2Config();
    if (!config) throw new Error('Cloudflare R2 is not configured');
    return putToR2(config, key, bytes);
  }

  if (backend === 'vercel-blob') {
    const blob = await put(key, bytes, {
      access: 'public',
      contentType: 'image/jpeg',
    });
    return blob.url;
  }

  if (backend === 'local') {
    const dir = path.join(process.cwd(), '.data', 'uploads');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, path.basename(key)), bytes);
    return key;
  }

  throw new Error(
    'Photo storage is not configured on this server. Set R2_* (Cloudflare R2) or BLOB_READ_WRITE_TOKEN (Vercel Blob).',
  );
}

/**
 * Validate and store a base64 photo coming from the app.
 * Throws a `Response` for input the client can fix (too large, not a JPEG).
 */
export async function storePhoto(base64: string): Promise<string> {
  const encoded = base64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Buffer.from(encoded, 'base64');

  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    throw new Response('Photo too large (max 1 MB after compression)', { status: 413 });
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Response('Only JPEG photos are supported', { status: 415 });
  }

  const key = `bins/photos/${crypto.randomUUID()}.jpg`;
  return storePhotoBytes(bytes, key);
}
