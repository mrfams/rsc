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
  // Serverless-friendly: fail fast instead of hanging a request forever, and
  // release idle sockets so Neon can reclaim them.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

/**
 * An idle client can emit an error (network blip, Neon maintenance). Without a
 * listener Node treats it as unhandled and kills the whole process, which took
 * the dev server and admin API down. Surface it and let the next request
 * reconnect.
 */
pool.on('error', (error) => {
  console.error('[db] idle client error:', error.message);
});

export const db = drizzle(pool, { schema });
