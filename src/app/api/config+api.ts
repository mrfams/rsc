import { getCampusPolygons } from '@/lib/campus-config';
import { listCategories } from '@/lib/categories';

/** GET /api/config — public app settings (geofence + active categories). */
export async function GET() {
  const [campusPolygons, categories] = await Promise.all([
    getCampusPolygons(),
    listCategories(true),
  ]);

  return Response.json(
    {
      campusPolygons,
      // Kept for older native builds that only know the single-ring shape.
      campusPolygon: campusPolygons[0],
      categories,
    },
    // Admin edits (geofence, categories) must take effect immediately.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
