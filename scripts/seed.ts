/**
 * Idempotent seed: default categories, the ft@rsc.com admin account and a
 * starter set of bins across campus. Run with: npm run seed
 * Uses DATABASE_URL from .env — safe to re-run.
 */
import 'dotenv/config';
import { like, sql } from 'drizzle-orm';

import { auth } from '../src/lib/auth';
import { db } from '../src/lib/db';
import { bins, user } from '../src/lib/db/schema';
import { ensureDefaultCategories } from '../src/lib/categories';
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
const STARTER_BINS: Array<{ lat: number; lng: number; category: string; note: string }> = [
  { lat: 35.3816, lng: 33.9349, category: 'plastic', note: 'Beside the main cafeteria entrance' },
  { lat: 35.38165, lng: 33.9348, category: 'glass', note: 'Same spot as the plastic bin' },
  { lat: 35.3796, lng: 33.9452, category: 'paper', note: 'Library entrance, by the stairs' },
  { lat: 35.3752, lng: 33.9478, category: 'plastic', note: 'Business faculty garden' },
  { lat: 35.3712, lng: 33.9451, category: 'general', note: 'Dorm courtyard, near the gate' },
  { lat: 35.3695, lng: 33.9381, category: 'battery', note: 'Sports hall lobby corner' },
  { lat: 35.3738, lng: 33.9326, category: 'metal', note: 'Parking lot B, by the bins wall' },
  { lat: 35.3772, lng: 33.9411, category: 'food_waste', note: 'Behind the cafeteria, compost point' },
  { lat: 35.37725, lng: 33.9412, category: 'paper', note: 'Same composter pad' },
  { lat: 35.3802, lng: 33.9401, category: 'plastic', note: 'Rectorate fountain side' },
];

async function ensurePasswordAccount(email: string, password: string, name: string) {
  const existing = await db.select().from(user).where(like(user.email, email)).limit(1);
  if (existing[0]) return existing[0];

  try {
    await auth.api.signUpEmail({ body: { email, password, name } });
  } catch (err) {
    // A wrong-domain rejection means the hook ran before the DATABASE hook —
    // surface which step failed for operability.
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

  // Skip re-seeding if starter bins exist (marker: area field set to 'seed').
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bins)
    .where(like(bins.area, 'seed%'));
  if (Number(count) > 0) {
    console.log(`✓ seed bins already present (${count}) — nothing to do`);
    return;
  }

  let i = 0;
  for (const b of STARTER_BINS) {
    const volunteer = volunteers[i % volunteers.length];
    try {
      await createReport({ id: volunteer.id, email: volunteer.email }, {
        lat: b.lat,
        lng: b.lng,
        category: b.category,
        note: b.note,
      });
      await db
        .update(bins)
        .set({ area: `seed ${b.note}` })
        .where(sql`${bins.lat} = ${b.lat} and ${bins.lng} = ${b.lng}`);
      i += 1;
    } catch (err) {
      console.warn(`! skipped a bin (${b.category} @ ${b.lat},${b.lng}):`, String(err));
    }
  }
  console.log(`✓ seeded ${i} starter bins`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
