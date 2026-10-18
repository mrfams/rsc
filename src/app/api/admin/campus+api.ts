import { getSessionUser, isAdminUser } from '@/lib/auth';
import { getCampusPolygon, setCampusPolygon } from '@/lib/campus-config';
import { CAMPUS_POLYGON } from '@/lib/constants';

const MAX_POINTS = 64;

function sanitizePolygon(input: unknown): { latitude: number; longitude: number }[] | null {
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_POINTS) return null;
  const points: { latitude: number; longitude: number }[] = [];
  for (const raw of input) {
    const lat = Number(raw?.latitude ?? raw?.lat);
    const lng = Number(raw?.longitude ?? raw?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    points.push({ latitude: lat, longitude: lng });
  }
  return points;
}

/** GET /api/admin/campus — current geofence polygon (admin only). */
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  return Response.json({
    campusPolygon: await getCampusPolygon(),
    defaultPolygon: CAMPUS_POLYGON,
  });
}

/** PUT /api/admin/campus — replace the geofence polygon (admin only). */
export async function PUT(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new Response('Unauthorized', { status: 401 });
  if (!isAdminUser(user)) throw new Response('Admins only', { status: 403 });

  const points = sanitizePolygon((await request.json())?.campusPolygon);
  if (!points) {
    return Response.json(
      { error: 'Polygon needs a lat/lng list with 3-64 valid points' },
      { status: 400 },
    );
  }
  return Response.json({ campusPolygon: await setCampusPolygon(points) });
}
