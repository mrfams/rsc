/**
 * Server-side service layer for bins and reports.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { haversine, placeNameFor } from '@/lib/geo';
import { isReportableCategory } from '@/lib/categories';
import { bins, reports, user, type BinCategory, type BinStatus } from '@/lib/db/schema';
import { POINT_RULES, type ContributionStats, type PublicLeaderboard } from '@/lib/points';
import { storePhoto } from '@/lib/photo-storage';
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
  /** Human place name, e.g. "DAU 3 Dormitory". */
  name: string | null;
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
  /** Set when something went wrong that the member should know about. */
  warning?: string | null;
};

export type BinDetailDto = BinDto & {
  reports: ReportDto[];
  /** True when the signed-in viewer already sighted this bin. */
  hasSighted?: boolean;
};

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
  name: string | null;
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
  name: bins.name,
  lat: bins.lat,
  lng: bins.lng,
  area: bins.area,
  status: bins.status,
  reportCount: bins.reportCount,
  createdAt: bins.createdAt,
  updatedAt: bins.updatedAt,
};

/**
 * Public map data. Every non-removed bin is listed, including bins placed
 * outside the campus outline: the geofence is a visual reference, never a
 * limit on where someone may add or see a bin.
 */
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

export async function createReport(
  user: { id: string; email: string },
  input: ReportInput,
): Promise<ReportDto> {
  if (!(await isReportableCategory(input.category))) {
    throw new Response('Unknown or inactive category', { status: 422 });
  }

  // A photo that cannot be stored must not lose the sighting: the report is
  // saved without it and the member is told what happened.
  let photoPath: string | null = null;
  let warning: string | null = null;
  if (input.photoBase64) {
    try {
      photoPath = await storePhoto(input.photoBase64);
    } catch (error) {
      // A rejected photo must never lose the sighting. The member keeps the
      // bin and gets a precise explanation instead of a 500/413 dead end.
      console.error('[photos] upload failed:', error);
      const detail = error instanceof Response ? await error.text().catch(() => '') : '';
      warning =
        detail.trim() ||
        'The photo could not be saved, so this sighting was posted without it.';
    }
  }

  const suggestedName =
    input.name?.trim() || placeNameFor({ latitude: input.lat, longitude: input.lng }) || null;

  const nearbyBinId = await findNearbyBin(input, input.category, BIN_LINK_RADIUS_M);
  const binId =
    nearbyBinId ??
    (
      await db
        .insert(bins)
        .values({
          category: input.category,
          name: suggestedName,
          lat: input.lat,
          lng: input.lng,
        })
        .returning({ id: bins.id })
    )[0].id;

  // A reported place name is useful even when matching an existing bin that
  // was created before names existed.
  if (nearbyBinId && suggestedName) {
    await db
      .update(bins)
      .set({ name: sql`coalesce(${bins.name}, ${suggestedName})` })
      .where(eq(bins.id, nearbyBinId));
  }

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

  // Best-effort: tell the contributor when this action moves them up.
  try {
    await notifyLeaderboardClimb(user.id, inserted.id);
  } catch {
    // leaderboard notifications are best-effort
  }

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
    warning,
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
export async function getBinWithReports(
  id: string,
  viewerId?: string,
): Promise<BinDetailDto | null> {
  const binRows = await db.select(sqlBins).from(bins).where(eq(bins.id, id)).limit(1);
  if (binRows.length === 0) return null;

  const [repRows, mineRows] = await Promise.all([
    db
      .select({ report: reports })
      .from(reports)
      .where(eq(reports.binId, id))
      .orderBy(desc(reports.createdAt))
      .limit(30),
    viewerId
      ? db
          .select({ id: reports.id })
          .from(reports)
          .where(and(eq(reports.binId, id), eq(reports.userId, viewerId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    ...mapBin(binRows[0]),
    reports: repRows.map(({ report }) => mapReport(report)),
    hasSighted: mineRows.length > 0,
  };
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

/**
 * Admin: create a named bin directly from the map. Placement is deliberately
 * unrestricted — the admin can pin a real bin anywhere, not only inside the
 * drawn campus outline. An optional photo is stored as the admin's first
 * sighting so the bin card shows it immediately.
 */
export async function createBinByAdmin(
  user: { id: string; email: string },
  input: {
    name: string;
    category: string;
    lat: number;
    lng: number;
    status?: BinStatus;
    photoBase64?: string;
  },
): Promise<BinDto | null> {
  if (!(await isReportableCategory(input.category))) return null;

  // The photo is stored before the bin is written, so a photo the admin can
  // fix (too large, not a JPEG) fails the request while nothing has been
  // saved yet. A storage failure the admin cannot fix only costs the photo:
  // the bin is still created.
  let photoPath: string | null = null;
  if (input.photoBase64) {
    try {
      photoPath = await storePhoto(input.photoBase64);
    } catch (error) {
      // The bin still gets created; only the optional photo is lost.
      console.error('[photos] admin upload failed:', error);
    }
  }

  const inserted = await db
    .insert(bins)
    .values({
      name: input.name.trim() || null,
      category: input.category,
      lat: input.lat,
      lng: input.lng,
      status: input.status ?? 'verified',
    })
    .returning(sqlBins);

  if (!inserted[0]) return null;

  if (photoPath) {
    await db.insert(reports).values({
      binId: inserted[0].id,
      userId: user.id,
      userEmail: user.email,
      lat: input.lat,
      lng: input.lng,
      note: 'Added by a moderator',
      photoPath,
    });
    const [updated] = await db
      .update(bins)
      .set({ reportCount: sql`${bins.reportCount} + 1`, updatedAt: new Date() })
      .where(eq(bins.id, inserted[0].id))
      .returning(sqlBins);
    return updated ? mapBin(updated) : mapBin(inserted[0]);
  }

  return mapBin(inserted[0]);
}

/** Admin: rename, retype or move an existing bin. */
export async function updateBinDetails(
  binId: string,
  input: {
    name?: string | null;
    category?: string;
    lat?: number;
    lng?: number;
    status?: BinStatus;
  },
): Promise<BinDto | null> {
  if (input.category && !(await isReportableCategory(input.category))) return null;

  const patch: {
    name?: string | null;
    category?: string;
    lat?: number;
    lng?: number;
    status?: BinStatus;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name?.trim() || null;
  if (input.category !== undefined) patch.category = input.category;
  if (input.lat !== undefined) patch.lat = input.lat;
  if (input.lng !== undefined) patch.lng = input.lng;
  if (input.status !== undefined) patch.status = input.status;

  const updated = await db.update(bins).set(patch).where(eq(bins.id, binId)).returning(sqlBins);
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

type ContributionEntry = {
  userId: string;
  name: string;
  leaderboardOptIn: boolean;
  reportsCount: number;
  binsContributed: number;
  newBins: number;
  confirmations: number;
  photos: number;
  points: number;
  rank: number;
};

type ContributionSourceRow = {
  id: string;
  binId: string;
  userId: string;
  photoPath: string | null;
  createdAt: Date;
  name: string;
  leaderboardOptIn: boolean;
};

function isEarlier(a: ContributionSourceRow, b: ContributionSourceRow): boolean {
  const delta = a.createdAt.getTime() - b.createdAt.getTime();
  return delta < 0 || (delta === 0 && a.id < b.id);
}

/**
 * Points are derived from immutable report history rather than stored, so a
 * corrected/deleted report can never leave a stale score behind. Campus scale
 * keeps the scan small; `excludeReportId` produces the "before this action"
 * snapshot used to detect a rank climb.
 */
async function computeLeaderboard(excludeReportId?: string): Promise<ContributionEntry[]> {
  const rows = await db
    .select({
      id: reports.id,
      binId: reports.binId,
      userId: reports.userId,
      photoPath: reports.photoPath,
      createdAt: reports.createdAt,
      name: user.name,
      leaderboardOptIn: user.leaderboardOptIn,
    })
    .from(reports)
    .innerJoin(user, eq(reports.userId, user.id))
    .where(excludeReportId ? ne(reports.id, excludeReportId) : undefined);

  // The earliest report on a bin is the one that put it on the map.
  const firstByBin = new Map<string, { id: string; row: ContributionSourceRow }>();
  for (const row of rows) {
    const current = firstByBin.get(row.binId);
    if (!current || isEarlier(row, current.row)) firstByBin.set(row.binId, { id: row.id, row });
  }

  const totals = new Map<
    string,
    {
      name: string;
      leaderboardOptIn: boolean;
      reportsCount: number;
      bins: Set<string>;
      newBins: number;
      photos: number;
    }
  >();

  for (const row of rows) {
    const agg =
      totals.get(row.userId) ??
      {
        name: row.name,
        leaderboardOptIn: row.leaderboardOptIn,
        reportsCount: 0,
        bins: new Set<string>(),
        newBins: 0,
        photos: 0,
      };
    agg.reportsCount += 1;
    agg.bins.add(row.binId);
    if (firstByBin.get(row.binId)?.id === row.id) agg.newBins += 1;
    if (row.photoPath) agg.photos += 1;
    totals.set(row.userId, agg);
  }

  const entries: Omit<ContributionEntry, 'rank'>[] = [];
  for (const [userId, agg] of totals) {
    const confirmations = Math.max(0, agg.reportsCount - agg.newBins);
    entries.push({
      userId,
      name: agg.name,
      leaderboardOptIn: agg.leaderboardOptIn,
      reportsCount: agg.reportsCount,
      binsContributed: agg.bins.size,
      newBins: agg.newBins,
      confirmations,
      photos: agg.photos,
      points:
        agg.newBins * POINT_RULES.newBin +
        confirmations * POINT_RULES.confirmation +
        agg.photos * POINT_RULES.photo,
    });
  }

  entries.sort(
    (a, b) =>
      b.points - a.points ||
      b.binsContributed - a.binsContributed ||
      b.reportsCount - a.reportsCount ||
      a.name.localeCompare(b.name) ||
      a.userId.localeCompare(b.userId),
  );

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Shared board: only members who explicitly agreed to appear are listed. The
 * current member is appended when they sit outside the top five.
 */
function leaderboardRows(entries: ContributionEntry[], userId: string) {
  const shared = entries.filter((entry) => entry.leaderboardOptIn);
  const rows = shared.slice(0, 5).map((entry, index) => ({
    name: entry.name,
    points: entry.points,
    rank: index + 1,
    isYou: entry.userId === userId,
  }));
  const mineIndex = shared.findIndex((entry) => entry.userId === userId);
  if (mineIndex >= 5) {
    const mine = shared[mineIndex];
    rows.push({ name: mine.name, points: mine.points, rank: mineIndex + 1, isYou: true });
  }
  return rows;
}

/** Read just the leaderboard consent flag (works before the first sighting). */
export async function getLeaderboardOptIn(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ leaderboardOptIn: user.leaderboardOptIn })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.leaderboardOptIn ?? false;
}

/** Public top 10: names and points of members who agreed to share them. */
export async function getPublicLeaderboard(
  limit = 10,
  viewerId?: string,
): Promise<PublicLeaderboard> {
  const shared = (await computeLeaderboard()).filter((entry) => entry.leaderboardOptIn);
  return {
    rows: shared.slice(0, limit).map((entry, index) => ({
      name: entry.name,
      points: entry.points,
      rank: index + 1,
      isYou: Boolean(viewerId && entry.userId === viewerId),
    })),
    total: shared.length,
  };
}

/**
 * Contribution stats for a member: points, leaderboard position and exactly
 * how many points it takes to overtake the person above them.
 */
export async function getUserStats(userId: string): Promise<ContributionStats> {
  const [allEntries, leaderboardOptIn] = await Promise.all([
    computeLeaderboard(),
    getLeaderboardOptIn(userId),
  ]);

  /*
   * A member always gets a private standing, even before they agree to appear
   * publicly. The public board is a separate, opt-in view of the same points.
   */
  const index = allEntries.findIndex((entry) => entry.userId === userId);
  const mineAll = index >= 0 ? allEntries[index] : null;
  const above = index > 0 ? allEntries[index - 1] : null;
  const last = allEntries.at(-1) ?? null;

  const pointsToNextRank =
    mineAll && index === 0
      ? null
      : mineAll
        ? Math.max(1, (above?.points ?? 0) - mineAll.points + 1)
        : last
          ? last.points + 1
          : POINT_RULES.newBin;

  const publicEntries = allEntries
    .filter((entry) => entry.leaderboardOptIn)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return {
    reportsCount: mineAll?.reportsCount ?? 0,
    binsContributed: mineAll?.binsContributed ?? 0,
    points: mineAll?.points ?? 0,
    rank: mineAll ? index + 1 : null,
    totalContributors: allEntries.length,
    leaderboardOptIn,
    pointsToNextRank,
    breakdown: {
      newBins: mineAll?.newBins ?? 0,
      confirmations: mineAll?.confirmations ?? 0,
      photos: mineAll?.photos ?? 0,
    },
    leaderboard: leaderboardRows(publicEntries, userId),
  };
}

/** Push a one-off encouragement when a contribution lifts the member's rank. */
async function notifyLeaderboardClimb(userId: string, reportId: string): Promise<void> {
  const [current, previous] = await Promise.all([
    computeLeaderboard(),
    computeLeaderboard(reportId),
  ]);
  const nowIndex = current.findIndex((entry) => entry.userId === userId);
  if (nowIndex < 0) return;
  const beforeIndex = previous.findIndex((entry) => entry.userId === userId);
  if (beforeIndex >= 0 && nowIndex >= beforeIndex) return;

  const now = current[nowIndex];
  await sendToUsers([userId], {
    title: 'You moved up the campus standings 🎉',
    body: `You're now #${nowIndex + 1} of ${current.length} contributors with ${now.points} points.`,
    data: { open: 'stats' },
  });
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
