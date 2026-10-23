/**
 * Additive migration for the moderation + leaderboard defaults release.
 *
 * Safe to run more than once. It only adds a nullable column and changes the
 * default for new accounts, then backfills the old default so existing members
 * are visible on the leaderboard as the product now expects. Nobody had an
 * explicit "hide me" preference before this release (the old default was
 * false for everyone), and anyone who prefers privacy can hide from the
 * first-point notice or Stats.
 *
 * Run: npm run db:migrate
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const STATEMENTS = [
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS disabled_at timestamptz`,
  `ALTER TABLE "user" ALTER COLUMN leaderboard_opt_in SET DEFAULT true`,
  `UPDATE "user" SET leaderboard_opt_in = true WHERE leaderboard_opt_in = false`,
];

async function main() {
  const client = await pool.connect();
  try {
    for (const statement of STATEMENTS) {
      await client.query(statement);
      console.log('✓', statement);
    }
    const { rows } = await client.query(
      `select count(*)::int as total, count(*) filter (where leaderboard_opt_in)::int as visible, count(disabled_at)::int as disabled from "user"`,
    );
    console.log('✓ members:', rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
