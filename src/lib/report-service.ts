/**
 * Server-side service layer for bins and reports.
 */

import { desc, eq, sql } from 'drizzle-orm';

import { put } from '@vercel/blob';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db } from '@/lib/db';
import { bins, reports, type BinCategory } from '@/lib/db/schema';
import type { ReportInput } from '@/lib/validation';

/** Distance in metres between two WGS84 points (haversine). */
export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Two reports within this distance become the same bin. */
export const BIN_LINK_RADIUS_M = 25;

/** Campus geofence centre — EMU, Famagusta. Reports must arrive near campus. */
export const CAMPUS = { lat: 35.3786, lng: 33.9422 };
export const CAMPUS_RADIUS_M = 15_000;

export type BinDto = {
  id: string;
  category: BinCategory;
  lat: number;
  lng: number;
  area: string | null;
  status: string;
  reportCount: number;
  createdAt: string;
};

export type ReportDto = {
  id: string;
  binId: string;
  userId: string;
  lat: number;
  lng: number;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin?: BinDto;
};

function photoToUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith('http')) return photoPath;
  // Local (no Blob token) photos are proxied through the API route.
  // The disk filename strips the blob-style prefix.
  const file = photoPath.replace(/^bins\/photos\//, '');
  return `/api/photos/${file}`;
}

const sqlBins = {
  id: bins.id,
  category: bins.category,
  lat: bins.lat,
  lng: bins.lng,
  area: bins.area,
  status: bins.status,
  reportCount: bins.reportCount,
  createdAt: bins.createdAt,
};

/** Public map data. */
export async function listBins(): Promise<BinDto[]> {
  const rows = await db
    .select(sqlBins)
    .from(bins)
    .where(sql`${bins.status} <> 'removed'`)
    .orderBy(desc(bins.createdAt));

  return rows.map((row) => ({
    ...row,
    reportCount: Number(row.reportCount),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Find the closest bin of the same category to a point, or null when farther than radius. */
async function findNearbyBin(
  point: { lat: number; lng: number },
  category: BinCategory,
  radiusM: number,
): Promise<string | null> {
  const rows = await db
    .select({ id: bins.id, lat: bins.lat, lng: bins.lng, category: bins.category })
    .from(bins)
    .where(sql`${bins.status} <> 'removed'`);

  let best: { id: string; distance: number } | null = null;
  for (const row of rows) {
    if (row.category !== category) continue;
    const distance = haversine(point, row);
    if (distance <= radiusM && (!best || distance < best.distance)) {
      best = { id: row.id, distance };
    }
  }
  return best?.id ?? null;
}

/**
 * Store an uploaded photo. On Vercel this goes to the Vercel Blob store
 * (BLOB_READ_WRITE_TOKEN); locally it falls back to ./.data/uploads so the
 * whole app works with zero external accounts.
 */
async function storePhoto(base64: string): Promise<string> {
  const encoded = base64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > 450_000) {
    throw new Response('Photo too large (max 450 KB after compression)', { status: 413 });
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Response('Only JPEG photos are supported', { status: 415 });
  }

  const key = `bins/photos/${crypto.randomUUID()}.jpg`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, bytes, {
      access: 'public',
      contentType: 'image/jpeg',
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), '.data', 'uploads');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, key.replace(/^bins\/photos\//, '')), bytes);
  return key;
}

export async function createReport(
  user: { id: string; email: string },
  input: ReportInput,
): Promise<ReportDto> {
  if (haversine(CAMPUS, input) > CAMPUS_RADIUS_M) {
    throw new Response('Reports must be submitted on or near campus', { status: 422 });
  }

  const photoPath = input.photoBase64 ? await storePhoto(input.photoBase64) : null;

  const binId =
    (await findNearbyBin(input, input.category, BIN_LINK_RADIUS_M)) ??
    (
      await db
        .insert(bins)
        .values({ category: input.category, lat: input.lat, lng: input.lng })
        .returning({ id: bins.id })
    )[0].id;

  const inserted = (
    await db
      .insert(reports)
      .values({
        binId,
        userId: user.id,
        userEmail: user.email,
        lat: input.lat,
        lng: input.lng,
        note: input.note ?? null,
        photoPath,
      })
      .returning()
  )[0];

  await db
    .update(bins)
    .set({
      reportCount: sql`${bins.reportCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(bins.id, binId));

  return {
    id: inserted.id,
    binId,
    userId: inserted.userId,
    lat: inserted.lat,
    lng: inserted.lng,
    note: inserted.note,
    photoUrl: photoToUrl(inserted.photoPath),
    createdAt: inserted.createdAt.toISOString(),
  };
}

export async function getReport(id: string): Promise<ReportDto | null> {
  const rows = await db
    .select({ report: reports, bin: sqlBins })
    .from(reports)
    .innerJoin(bins, eq(reports.binId, bins.id))
    .where(eq(reports.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  const { report, bin } = rows[0];
  return {
    id: report.id,
    binId: report.binId,
    userId: report.userId,
    lat: report.lat,
    lng: report.lng,
    note: report.note,
    photoUrl: photoToUrl(report.photoPath),
    createdAt: report.createdAt.toISOString(),
    bin: {
      ...bin,
      reportCount: Number(bin.reportCount),
      createdAt: bin.createdAt.toISOString(),
    },
  };
}

export async function listMyReports(userId: string): Promise<ReportDto[]> {
  const rows = await db
    .select({ report: reports, bin: sqlBins })
    .from(reports)
    .innerJoin(bins, eq(reports.binId, bins.id))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(50);

  return rows.map(({ report, bin }) => ({
    id: report.id,
    binId: report.binId,
    userId: report.userId,
    lat: report.lat,
    lng: report.lng,
    note: report.note,
    photoUrl: photoToUrl(report.photoPath),
    createdAt: report.createdAt.toISOString(),
    bin: {
      ...bin,
      reportCount: Number(bin.reportCount),
      createdAt: bin.createdAt.toISOString(),
    },
  }));
}

/** Public recent-feed (no user data beyond email). */
export async function listPublicReports(): Promise<ReportDto[]> {
  const rows = await db
    .select({ report: reports, bin: sqlBins })
    .from(reports)
    .innerJoin(bins, eq(reports.binId, bins.id))
    .orderBy(desc(reports.createdAt))
    .limit(20);

  return rows.map(({ report, bin }) => ({
    id: report.id,
    binId: report.binId,
    userId: report.userId,
    lat: report.lat,
    lng: report.lng,
    note: report.note,
    photoUrl: photoToUrl(report.photoPath),
    createdAt: report.createdAt.toISOString(),
    bin: {
      ...bin,
      reportCount: Number(bin.reportCount),
      createdAt: bin.createdAt.toISOString(),
    },
  }));
}
