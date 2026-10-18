import { getCampusPolygon } from '@/lib/campus-config';
import { listCategories } from '@/lib/categories';

/** GET /api/config — public app settings (geofence + active categories). */
export async function GET() {
  const [campusPolygon, categories] = await Promise.all([
    getCampusPolygon(),
    listCategories(true),
  ]);

  return Response.json(
    { campusPolygon, categories },
    { headers: { 'Cache-Control': 'public, max-age=15' } },
  );
}
