/**
 * Idempotent seed: default categories, the ft@rsc.com admin account and a
 * starter set of bins across campus. Run with: npm run seed
 * Uses DATABASE_URL from .env — safe to re-run.
 */
import 'dotenv/config';
import { eq, like } from 'drizzle-orm';

import { auth } from '../src/lib/auth';
import { db } from '../src/lib/db';
import { bins, user } from '../src/lib/db/schema';
import { ensureDefaultCategories } from '../src/lib/categories';
import { getCampusPolygons } from '../src/lib/campus-config';
import { isInsideCampus } from '../src/lib/geo';
import { createReport } from '../src/lib/report-service';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'ft@rsc.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ft@rsc123';
const ADMIN_NAME = 'Sustainability Office';

const VOLUNTEERS = [
  { email: 'seed.volunteer1@emu.edu.tr', name: 'Seed Volunteer 1' },
  { email: 'seed.volunteer2@emu.edu.tr', name: 'Seed Volunteer 2' },
];

/**
 * Starter bins spread inside the default campus polygon. Reports alternate
 * between the two volunteers; pairs within 25 m of the same slug place link
 * into one bin (and can reach verified status).
 */
const STARTER_BINS: Array<{
  lat: number;
  lng: number;
  category: string;
  name: string;
  note: string;
}> = [
  { lat: 35.14472, lng: 33.90788, category: 'plastic', name: 'Civil Engineering', note: 'Beside the main entrance' },
  { lat: 35.14477, lng: 33.90783, category: 'glass', name: 'Civil Engineering', note: 'Same spot as the plastic bin' },
  { lat: 35.14602, lng: 33.90928, category: 'paper', name: 'Faculty of Architecture', note: 'Studio entrance, by the stairs' },
  { lat: 35.14678, lng: 33.90654, category: 'plastic', name: 'Technical Works', note: 'Service yard' },
  { lat: 35.1409, lng: 33.909, category: 'general', name: 'Sports Complex', note: 'Track-side bins' },
  { lat: 35.14302, lng: 33.91248, category: 'battery', name: 'Mechanical Engineering', note: 'Lobby corner' },
  { lat: 35.1412, lng: 33.9098, category: 'metal', name: 'Özay Oral Library', note: 'Library forecourt' },
  { lat: 35.14531, lng: 33.90512, category: 'food_waste', name: 'North Campus', note: 'Compost point behind the cafeteria' },
  { lat: 35.14536, lng: 33.90517, category: 'paper', name: 'North Campus', note: 'Same composter pad' },
  { lat: 35.14721, lng: 33.90802, category: 'plastic', name: "Rector's Office", note: 'Rectorate fountain side' },
];

async function ensurePasswordAccount(email: string, password: string, name: string) {
  const existing = await db.select().from(user).where(like(user.email, email)).limit(1);
  if (existing[0]) return existing[0];

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
  } catch (err) {
    throw new Error(`Sign-up failed for ${email}: ${String(err)}`);
  }
  const created = await db.select().from(user).where(like(user.email, email)).limit(1);
  if (!created[0]) throw new Error(`User row missing after sign-up: ${email}`);
  return created[0];
}

async function main() {
  await ensureDefaultCategories();
  console.log('✓ categories ensured');

  const admin = await ensurePasswordAccount(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME);
  await db
    .update(user)
    .set({ role: 'admin' })
    .where(like(user.email, ADMIN_EMAIL));
  console.log(`✓ admin ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  const volunteers = [] as { id: string; email: string }[];
  for (const v of VOLUNTEERS) {
    const row = await ensurePasswordAccount(v.email, 'seedpass123', v.name);
    volunteers.push({ id: row.id, email: row.email });
  }

  // Starter bins are marked with an `area` that begins with "seed". Demo
  // rows are refreshed on every seed run so names, categories and positions
  // always match the current place catalogue. Real community bins are untouched.
  const existingSeedBins = await db
    .select({ id: bins.id, lat: bins.lat, lng: bins.lng })
    .from(bins)
    .where(like(bins.area, 'seed%'));
  if (existingSeedBins.length > 0) {
    const polygons = await getCampusPolygons();
    const stale = existingSeedBins.some((b) => !isInsideCampus(b.lat, b.lng, polygons));
    await db.delete(bins).where(like(bins.area, 'seed%'));
    console.log(
      `✓ removed ${existingSeedBins.length} ${stale ? 'stale ' : ''}seed bins for a refresh`,
    );
  }

  let i = 0;
  for (const b of STARTER_BINS) {
    const first = volunteers[i % volunteers.length];
    const second = volunteers[(i + 1) % volunteers.length];
    try {
      const created = await createReport({ id: first.id, email: first.email }, {
        lat: b.lat,
        lng: b.lng,
        category: b.category,
        name: b.name,
        note: b.note,
      });
      // A second, independent member confirms the bin so the starter map looks
      // like a living community map instead of a wall of "awaiting review".
      await createReport({ id: second.id, email: second.email }, {
        lat: b.lat + 0.00002,
        lng: b.lng + 0.00002,
        category: b.category,
        name: b.name,
        note: 'Confirmed on a later walk',
      });
      await db
        .update(bins)
        .set({ area: `seed ${b.note}`, status: 'verified' })
        .where(eq(bins.id, created.binId));
      i += 1;
    } catch (err) {
      console.warn(`! skipped a bin (${b.category} @ ${b.lat},${b.lng}):`, String(err));
    }
  }
  console.log(`✓ seeded ${i} starter bins (each verified by two members)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
