/**
 * Server-side service layer for bins and reports.
 */

import { desc, eq, sql } from 'drizzle-orm';

import { put } from '@vercel/blob';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db } from '@/lib/db';
import { haversine, isInsideCampus } from '@/lib/geo';
import { isReportableCategory } from '@/lib/categories';
import { getCampusPolygon } from '@/lib/campus-config';
import { bins, reports, type BinCategory, type BinStatus } from '@/lib/db/schema';
import { sendToUsers } from '@/lib/push';
import type { ReportInput } from '@/lib/validation';

/** Two reports within this distance become the same bin. */
export const BIN_LINK_RADIUS_M = 25;

/**
 * Verification wave: once a bin has been sighted independently by this many
 * distinct members it becomes "verified".
 */
export const MIN_VERIFY_CONTRIBUTORS = 2;

export type BinDto = {
  id: string;
  category: BinCategory;
  lat: number;
  lng: number;
  area: string | null;
  status: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ReportDto = {
  id: string;
  binId: string;
  userId: string;
  userEmail: string;
  lat: number;
  lng: number;
  note: string | null;
  photoUrl: string | null;
  createdAt: string;
  bin?: BinDto;
};

export type BinDetailDto = BinDto & { reports: ReportDto[] };

function photoToUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  if (photoPath.startsWith('http')) return photoPath;
  // Local (no Blob token) photos are proxied through the API route.
  // The disk filename strips the blob-style prefix.
  const file = photoPath.replace(/^bins\/photos\//, '');
  return `/api/photos/${file}`;
}

function mapBin(row: {
  id: string;
  category: BinCategory;
  lat: number;
  lng: number;
  area: string | null;
  status: string;
  reportCount: number;
  createdAt: Date;
  updatedAt: Date;
}): BinDto {
  return {
    ...row,
    reportCount: Number(row.reportCount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReport(report: {
  id: string;
  binId: string;
  userId: string;
  userEmail: string;
  lat: number;
  lng: number;
  note: string | null;
  photoPath: string | null;
  createdAt: Date;
}): ReportDto {
  return {
    id: report.id,
    binId: report.binId,
    userId: report.userId,
    userEmail: report.userEmail,
    lat: report.lat,
    lng: report.lng,
    note: report.note,
    photoUrl: photoToUrl(report.photoPath),
    createdAt: report.createdAt.toISOString(),
  };
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
  updatedAt: bins.updatedAt,
};

/** Public map data. */
export async function listBins(): Promise<BinDto[]> {
  const rows = await db
    .select(sqlBins)
    .from(bins)
    .where(sql`${bins.status} <> 'removed'`)
    .orderBy(desc(bins.createdAt));

  return rows.map(mapBin);
}

/** Admin-only: every bin including removed ones, for moderation. */
export async function listAllBins(): Promise<BinDto[]> {
  const rows = await db.select(sqlBins).from(bins).orderBy(desc(bins.updatedAt));
  return rows.map(mapBin);
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
    const distance = haversine(
      { latitude: point.lat, longitude: point.lng },
      { latitude: row.lat, longitude: row.lng },
    );
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
  const [campusPolygon] = await Promise.all([getCampusPolygon()]);
  if (!isInsideCampus(input.lat, input.lng, campusPolygon)) {
    throw new Response('Bins must be inside the highlighted campus boundary', {
      status: 422,
    });
  }
  if (!(await isReportableCategory(input.category))) {
    throw new Response('Unknown or inactive category', { status: 422 });
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

  await refreshBinStatusFromWave(binId);

  // Best-effort notifications to previous contributors about this sighting.
  try {
    const others = await binContributorIds(binId, user.id);
    const categoryLabel = input.category;
    await sendToUsers(others, {
      title: 'Bin sighting 👀',
      body: `Someone reported a ${categoryLabel} bin you also reported. Check it on the map!`,
      data: { binId },
    });
  } catch {
    // push is best-effort
  }

  return {
    id: inserted.id,
    binId,
    userId: inserted.userId,
    userEmail: inserted.userEmail,
    lat: inserted.lat,
    lng: inserted.lng,
    note: inserted.note,
    photoUrl: photoToUrl(inserted.photoPath),
    createdAt: inserted.createdAt.toISOString(),
  };
}

/**
 * Verification wave: recount distinct contributors for the bin and set its
 * lifecycle status. A fresh independent sighting also clears a dispute.
 */
async function refreshBinStatusFromWave(binId: string): Promise<BinStatus> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${reports.userId})` })
    .from(reports)
    .where(eq(reports.binId, binId));
  const contributors = Number(row?.n ?? 0);
  const status: BinStatus = contributors >= MIN_VERIFY_CONTRIBUTORS ? 'verified' : 'pending';
  await db
    .update(bins)
    .set({ status, updatedAt: new Date() })
    .where(eq(bins.id, binId));
  return status;
}

/** Distinct contributor user ids for a bin, excluding one user. */
async function binContributorIds(binId: string, excludeUserId?: string): Promise<string[]> {
  const rows = await db
    .select({ userId: reports.userId })
    .from(reports)
    .where(eq(reports.binId, binId))
    .groupBy(reports.userId);
  return rows.map((r) => r.userId).filter((id) => id !== excludeUserId);
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
    ...mapReport(report),
    bin: mapBin(bin),
  };
}

/** Bin page data: the bin plus its recent sighting history. */
export async function getBinWithReports(id: string): Promise<BinDetailDto | null> {
  const binRows = await db.select(sqlBins).from(bins).where(eq(bins.id, id)).limit(1);
  if (binRows.length === 0) return null;

  const repRows = await db
    .select({ report: reports })
    .from(reports)
    .where(eq(reports.binId, id))
    .orderBy(desc(reports.createdAt))
    .limit(30);

  return { ...mapBin(binRows[0]), reports: repRows.map(({ report }) => mapReport(report)) };
}

/** A member flags the bin as missing/wrong → enters the disputed state. */
export async function disputeBin(binId: string): Promise<BinDto | null> {
  const updated = await db
    .update(bins)
    .set({ status: 'disputed', updatedAt: new Date() })
    .where(sql`${bins.id} = ${binId} and ${bins.status} <> 'removed'`)
    .returning(sqlBins);

  if (updated[0]) {
    try {
      const contributors = await binContributorIds(binId);
      await sendToUsers(contributors, {
        title: 'Bin reported missing ⚠️',
        body: 'A bin you reported was flagged missing. A new sighting clears it.',
        data: { binId },
      });
    } catch {
      // push is best-effort
    }
    return mapBin(updated[0]);
  }
  return null;
}

/** Moderation: force any lifecycle status. Admin-only routes call this. */
export async function setBinStatus(binId: string, status: BinStatus): Promise<BinDto | null> {
  const updated = await db
    .update(bins)
    .set({ status, updatedAt: new Date() })
    .where(eq(bins.id, binId))
    .returning(sqlBins);
  return updated[0] ? mapBin(updated[0]) : null;
}

/** Moderation: remove a bad report; keeps the bin count >= 0. */
export async function deleteReport(reportId: string): Promise<boolean> {
  const deleted = await db
    .delete(reports)
    .where(eq(reports.id, reportId))
    .returning({ binId: reports.binId });
  if (deleted.length === 0) return false;
  await db
    .update(bins)
    .set({ reportCount: sql`greatest(${bins.reportCount} - 1, 0)`, updatedAt: new Date() })
    .where(eq(bins.id, deleted[0].binId));
  return true;
}

/**
 * Trust score (v1): contributions to the map.
 * 100 → trusted expert; 15 per distinct bin + 3 per report, capped at 100.
 */
export async function getUserStats(userId: string): Promise<{
  reportsCount: number;
  binsContributed: number;
  trustScore: number;
}> {
  const [agg] = await db
    .select({
      reportsCount: sql<number>`count(*)`,
      binsContributed: sql<number>`count(distinct ${reports.binId})`,
    })
    .from(reports)
    .where(eq(reports.userId, userId));

  const reportsCount = Number(agg?.reportsCount ?? 0);
  const binsContributed = Number(agg?.binsContributed ?? 0);
  const trustScore = Math.min(100, 15 * binsContributed + 3 * reportsCount);
  return { reportsCount, binsContributed, trustScore };
}

export async function listMyReports(userId: string): Promise<ReportDto[]> {
  const rows = await db
    .select({ report: reports, bin: sqlBins })
    .from(reports)
    .innerJoin(bins, eq(reports.binId, bins.id))
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(50);

  return rows.map(({ report, bin }) => ({ ...mapReport(report), bin: mapBin(bin) }));
}

/** Public recent-feed (no user data beyond email). */
export async function listPublicReports(): Promise<ReportDto[]> {
  const rows = await db
    .select({ report: reports, bin: sqlBins })
    .from(reports)
    .innerJoin(bins, eq(reports.binId, bins.id))
    .orderBy(desc(reports.createdAt))
    .limit(20);

  return rows.map(({ report, bin }) => ({ ...mapReport(report), bin: mapBin(bin) }));
}
