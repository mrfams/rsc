/**
 * Pure geospatial helpers. Safe for both client and server bundles.
 */
import { CAMPUS_POLYGON } from '@/lib/constants';

export type GeoPoint = { latitude: number; longitude: number };

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

/** Is a point inside a campus polygon (defaults to the built-in boundary)? */
export function isInsideCampus(
  lat: number,
  lng: number,
  polygon: GeoPoint[] = CAMPUS_POLYGON,
): boolean {
  return pointInPolygon(lat, lng, polygon);
}
