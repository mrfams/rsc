/**
 * Server-side campus settings. Lives in the `app_config` table as JSON under
 * the `campus_polygon` key, so the admin can re-draw the geofence from /admin
 * without a deploy. Falls back to the built-in OSM multipolygon.
 *
 * The stored value may be either the legacy single ring (CampusPoint[]) or
 * the current CampusPoint[][] (one entry per disjoint campus area).
 */
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { appConfig } from '@/lib/db/schema';
import { CAMPUS_CENTER, CAMPUS_POLYGONS, type CampusPoint } from '@/lib/constants';
import { centroidOfPolygon, haversine, normalizeCampusPolygons } from '@/lib/geo';

export const CAMPUS_POLYGON_KEY = 'campus_polygon';

/** How far a legitimate campus ring may sit from the EMU centre. */
const MAX_CENTRE_OFFSET_M = 10_000;
const MAX_TOTAL_POINTS = 512;

function isValidPoint(p: CampusPoint): boolean {
  return (
    Number.isFinite(p?.latitude) &&
    Number.isFinite(p?.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

/** Guard against legacy/bad data (the old app stored a polygon in the sea). */
export function isPlausibleCampusPolygon(polygon: CampusPoint[]): boolean {
  return isPlausibleCampusPolygons([polygon]);
}

export function isPlausibleCampusPolygons(polygons: CampusPoint[][]): boolean {
  if (!Array.isArray(polygons) || polygons.length === 0) return false;
  const total = polygons.reduce((n, ring) => n + (Array.isArray(ring) ? ring.length : 0), 0);
  if (total > MAX_TOTAL_POINTS) return false;
  for (const ring of polygons) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    if (!ring.every(isValidPoint)) return false;
    if (haversine(centroidOfPolygon(ring), CAMPUS_CENTER) > MAX_CENTRE_OFFSET_M) return false;
  }
  return true;
}

export async function getCampusPolygons(): Promise<CampusPoint[][]> {
  try {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, CAMPUS_POLYGON_KEY))
      .limit(1);
    if (rows[0]) {
      const parsed = JSON.parse(rows[0].value) as CampusPoint[] | CampusPoint[][];
      const polygons = normalizeCampusPolygons(parsed);
      if (isPlausibleCampusPolygons(polygons)) return polygons;
      console.warn('[campus] stored geofence is outside EMU — using the default polygons');
    }
  } catch {
    // DB hiccup → fall through to the static default.
  }
  return CAMPUS_POLYGONS;
}

/** Legacy single-ring accessor. */
export async function getCampusPolygon(): Promise<CampusPoint[]> {
  return (await getCampusPolygons())[0] ?? CAMPUS_POLYGONS[0];
}

export async function setCampusPolygons(polygons: CampusPoint[][]): Promise<CampusPoint[][]> {
  if (!isPlausibleCampusPolygons(polygons)) {
    throw new Error('The geofence must be drawn around the EMU campus');
  }
  const value = JSON.stringify(polygons);
  await db
    .insert(appConfig)
    .values({ key: CAMPUS_POLYGON_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
  return polygons;
}

/** Legacy single-ring writer. */
export async function setCampusPolygon(polygon: CampusPoint[]): Promise<CampusPoint[]> {
  const saved = await setCampusPolygons([polygon]);
  return saved[0];
}
