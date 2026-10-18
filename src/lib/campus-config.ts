/**
 * Server-side campus settings. Lives in the `app_config` table as JSON under
 * the `campus_polygon` key, so the admin can re-draw the geofence from /admin
 * without a deploy. Falls back to the hand-tuned default polygon.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { appConfig } from '@/lib/db/schema';
import { CAMPUS_POLYGON } from '@/lib/constants';

export type CampusPoint = { latitude: number; longitude: number };

export const CAMPUS_POLYGON_KEY = 'campus_polygon';

export async function getCampusPolygon(): Promise<CampusPoint[]> {
  try {
    const rows = await db
      .select({ value: appConfig.value })
      .from(appConfig)
      .where(eq(appConfig.key, CAMPUS_POLYGON_KEY))
      .limit(1);
    if (rows[0]) {
      const parsed = JSON.parse(rows[0].value) as CampusPoint[];
      if (Array.isArray(parsed) && parsed.length >= 3) return parsed;
    }
  } catch {
    // DB hiccup → fall through to the static default.
  }
  return CAMPUS_POLYGON;
}

export async function setCampusPolygon(polygon: CampusPoint[]): Promise<CampusPoint[]> {
  const value = JSON.stringify(polygon);
  await db
    .insert(appConfig)
    .values({ key: CAMPUS_POLYGON_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: new Date() },
    });
  return polygon;
}
