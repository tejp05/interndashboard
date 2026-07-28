/**
 * migrate.js — create the schema against the database in DATABASE_URL.
 *
 *   DATABASE_URL='postgres://...' npm run migrate
 *
 * Optional: the API creates the schema itself on first request, so this is
 * only needed if you want to provision the tables ahead of the first deploy.
 */

import { ensureSchema, sql } from '../api/_lib/db.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Export it and try again.');
  process.exit(1);
}

try {
  await ensureSchema();
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  console.log(`Schema is up to date. ${count} user${count === 1 ? '' : 's'} registered.`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
