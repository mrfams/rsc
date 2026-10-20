/**
 * Pure geospatial helpers. Safe for both client and server bundles.
 */
import {
  CAMPUS_PLACES,
  CAMPUS_POLYGONS,
  type CampusPlace,
  type CampusPoint,
} from '@/lib/constants';

export type GeoPoint = CampusPoint;

/** Distance in metres between two WGS84 points (haversine). */
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Ray-casting containment test for a lat/lng polygon (odd crossings rule). */
export function pointInPolygon(lat: number, lng: number, polygon: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Accept the legacy single-ring shape or the current multi-ring shape. */
export function normalizeCampusPolygons(
  polygons: GeoPoint[] | GeoPoint[][] = CAMPUS_POLYGONS,
): GeoPoint[][] {
  if (polygons.length === 0) return [];
  return Array.isArray(polygons[0]) ? (polygons as GeoPoint[][]) : [polygons as GeoPoint[]];
}

/** Is a point inside any ring of a multi-ring campus geofence? */
export function isInsideCampus(
  lat: number,
  lng: number,
  polygons: GeoPoint[] | GeoPoint[][] = CAMPUS_POLYGONS,
): boolean {
  return normalizeCampusPolygons(polygons).some((ring) => pointInPolygon(lat, lng, ring));
}

/** Arithmetic centroid — good enough for framing small campus polygons. */
export function centroidOfPolygon(polygon: GeoPoint[]): GeoPoint {
  if (polygon.length === 0) return { latitude: 0, longitude: 0 };
  const sum = polygon.reduce(
    (acc, p) => ({ lat: acc.lat + p.latitude, lng: acc.lng + p.longitude }),
    { lat: 0, lng: 0 },
  );
  return { latitude: sum.lat / polygon.length, longitude: sum.lng / polygon.length };
}

/** Nearest curated campus place, optionally bounded by a radius. */
export function nearestCampusPlace(
  point: GeoPoint,
  maxMeters = Number.POSITIVE_INFINITY,
): { place: CampusPlace; distance: number } | null {
  let best: { place: CampusPlace; distance: number } | null = null;
  for (const place of CAMPUS_PLACES) {
    const distance = haversine(point, place);
    if (distance > maxMeters) continue;
    if (!best || distance < best.distance) best = { place, distance };
  }
  return best;
}

/**
 * A human place name for a coordinate, e.g. "DAU 3 Dormitory". Used to
 * auto-name new bins so the map never shows only a category.
 */
export function placeNameFor(point: GeoPoint, maxMeters = 180): string | null {
  const nearest = nearestCampusPlace(point, maxMeters);
  return nearest?.place.name ?? null;
}
