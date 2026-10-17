import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.',
  );
}

/**
 * Shared Postgres pool. Used directly by Better Auth (Kysely adapter) and by
 * Drizzle for our own tables, so there is exactly one connection pool.
 */
export const pool = new Pool({
  connectionString,
  max: 5,
  // Neon requires TLS.
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
