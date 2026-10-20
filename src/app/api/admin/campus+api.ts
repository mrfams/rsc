import { getSessionUser, isAdminUser } from '@/lib/auth';
import { getCampusPolygons, setCampusPolygons } from '@/lib/campus-config';
import { CAMPUS_POLYGONS, type CampusPoint } from '@/lib/constants';

const MAX_RINGS = 8;
const MAX_POINTS = 512;

function sanitizeRing(input: unknown): CampusPoint[] | null {
  if (!Array.isArray(input) || input.length < 3) return null;
  const points: CampusPoint[] = [];
  for (const raw of input) {
    const lat = Number((raw as { latitude?: unknown; lat?: unknown })?.latitude ?? (raw as { lat?: unknown })?.lat);
    const lng = Number(
      (raw as { longitude?: unknown; lng?: unknown })?.longitude ?? (raw as { lng?: unknown })?.lng,
    );
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    points.push({ latitude: lat, longitude: lng });
  }
  return points;
}

function sanitizePolygons(body: unknown): CampusPoint[][] | null {
  const source = (body as { campusPolygons?: unknown; campusPolygon?: unknown })?.campusPolygons ??
    (body as { campusPolygon?: unknown })?.campusPolygon;
  if (!Array.isArray(source)) return null;

  // Legacy body: a flat array of points.
  const rings = Array.isArray(source[0]) ? source : [source];
  if (rings.length === 0 || rings.length > MAX_RINGS) return null;

  const polygons: CampusPoint[][] = [];
  let total = 0;
  for (const raw of rings) {
    const ring = sanitizeRing(raw);
    if (!ring) return null;
    total += ring.length;
    if (total > MAX_POINTS) return null;
    polygons.push(ring);
  }
  return polygons;
}

/** GET /api/admin/campus — current geofence polygons (admin only). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const campusPolygons = await getCampusPolygons();
  return Response.json({
    campusPolygons,
    campusPolygon: campusPolygons[0],
    defaultPolygons: CAMPUS_POLYGONS,
    defaultPolygon: CAMPUS_POLYGONS[0],
  });
}

/** PUT /api/admin/campus — replace the geofence polygons (admin only). */
export async function PUT(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const polygons = sanitizePolygons(await request.json());
  if (!polygons) {
    return Response.json(
      { error: 'Geofence needs 1-8 rings, each with 3-512 valid lat/lng points' },
      { status: 400 },
    );
  }
  try {
    const saved = await setCampusPolygons(polygons);
    return Response.json({ campusPolygons: saved, campusPolygon: saved[0] });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Could not save the geofence' },
      { status: 422 },
    );
  }
}
