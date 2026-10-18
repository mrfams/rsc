// One-off: remove test rows created during the verification runs.
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const users = await pool.query(
    // Keep only real sign-ups; drop the automated flow-test accounts.
    `delete from "user" where email like 'flow%' or email like 'photo%' or email like 'fix%' or email like 'test%'`,
  );
  console.log('deleted users:', users.rowCount);
  const reports = await pool.query('delete from reports');
  console.log('deleted reports:', reports.rowCount);
  const bins = await pool.query('delete from bins');
  console.log('deleted bins:', bins.rowCount);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
