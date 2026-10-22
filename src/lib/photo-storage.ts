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
import { del, put } from '@vercel/blob';
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

function r2Client(config: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    // R2 ignores the region but still requires one in the signature scope.
    region: 'auto',
  });
}

/** Signed PUT to an R2 bucket. Returns the public URL of the object. */
async function putToR2(config: R2Config, key: string, bytes: Buffer): Promise<string> {
  const client = r2Client(config);
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

/** Extract the object key from a public R2 URL, or null for anything else. */
function r2KeyFor(config: R2Config, photoPath: string): string | null {
  const prefix = `${config.publicBase}/`;
  if (!photoPath.startsWith(prefix)) return null;
  return photoPath.slice(prefix.length).replace(/[?#].*$/, '');
}

async function deleteFromR2(config: R2Config, key: string): Promise<void> {
  if (!key || key.includes('..') || key.startsWith('/')) {
    throw new Error('Refusing to delete an invalid R2 key');
  }

  const client = r2Client(config);
  const url = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`;
  const response = await client.fetch(url, { method: 'DELETE' });
  // R2 returns 204 for an object that is already gone.
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => '');
    throw new Error(`R2 delete failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

/**
 * Delete the stored object behind a report photo.
 *
 * The database stores an absolute URL for R2/Blob and a key for local disk, so
 * this accepts all three forms. It is deliberately best-effort: moderation must
 * still succeed when storage is temporarily unavailable.
 */
export async function deletePhoto(photoPath: string): Promise<boolean> {
  if (!photoPath) return false;

  const config = r2Config();
  if (config) {
    const r2Key = r2KeyFor(config, photoPath);
    if (r2Key) {
      await deleteFromR2(config, r2Key);
      return true;
    }
  }

  if (photoPath.startsWith('http')) {
    let host: string;
    try {
      host = new URL(photoPath).hostname;
    } catch {
      return false;
    }

    // Vercel Blob public URLs are the only other remote URLs this app writes.
    if (host.endsWith('.blob.vercel-storage.com')) {
      await del(photoPath);
      return true;
    }
    return false;
  }

  const isLocalPath =
    photoPath.startsWith('/api/photos/') ||
    photoPath.startsWith('bins/photos/') ||
    /^[0-9a-f-]+\.jpe?g$/i.test(photoPath);
  if (!isLocalPath) return false;

  const file = path.basename(
    photoPath.startsWith('/api/photos/')
      ? photoPath.slice('/api/photos/'.length)
      : photoPath,
  );
  try {
    await fs.unlink(path.join(process.cwd(), '.data', 'uploads', file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return true;
}

/** Delete several report photos without letting one failure block the rest. */
export async function deletePhotos(
  photoPaths: (string | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(photoPaths.filter((value): value is string => Boolean(value)))];
  const results = await Promise.allSettled(unique.map((photoPath) => deletePhoto(photoPath)));
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[photos] cleanup failed:', result.reason);
    }
  }
}
