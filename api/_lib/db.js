/**
 * db.js — Neon Postgres access + zero-config schema migration.
 *
 * The schema is created on first query of a cold start (CREATE ... IF NOT
 * EXISTS), so a fresh Vercel deploy pointed at an empty Neon database works
 * with no manual migration step. `npm run migrate` does the same thing
 * eagerly if you prefer to run it yourself.
 */

import { neon } from '@neondatabase/serverless';

/**
 * Connection string env vars, in priority order.
 *
 * Which one exists depends on how the database was attached: the Neon
 * integration sets DATABASE_URL, while Vercel Postgres sets POSTGRES_URL.
 * Accept both rather than making the deploy depend on getting the name right.
 * Pooled URLs come first — serverless functions open many short connections.
 */
const URL_VARS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PRISMA_URL'
];

/** True when a database connection string is configured. */
export function hasConnection() {
  return connectionString() !== null;
}

function connectionString() {
  for (const name of URL_VARS) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

// Built lazily rather than at module load: env vars are present by the time a
// request runs, and a cold start that raced initialization used to leave this
// permanently null, surfacing as "(...) is not a function" on every call.
let neonClient = null;

function client() {
  if (globalThis.__DB__) return globalThis.__DB__;
  if (!neonClient) {
    const url = connectionString();
    if (!url) {
      throw new Error(
        'No database connection string found. Set DATABASE_URL (or POSTGRES_URL) ' +
          'in the Vercel project environment variables — Storage → Create Database ' +
          '→ Neon → Connect to Project sets it automatically — then redeploy.'
      );
    }
    neonClient = neon(url);
  }
  return neonClient;
}

/**
 * Tagged-template SQL client.
 *
 * Delegates to `globalThis.__DB__` when present so the local dev server and
 * the test suite can run these exact handlers against an in-process Postgres
 * (PGlite) instead of a network database. In production `__DB__` is never set
 * and this is a thin pass-through to the Neon driver.
 */
export const sql = (...args) => client()(...args);
sql.transaction = (...args) => client().transaction(...args);

/** Private per-user sections, stored as JSON documents. */
export const SECTION_NAMES = [
  'profile',
  'activities',
  'goals',
  'projects',
  'learning',
  'reflections',
  'tasks',
  'prefs'
];

/** Sections that default to an object rather than an array. */
const OBJECT_SECTIONS = new Set(['profile', 'prefs']);

export function defaultSection(name) {
  return OBJECT_SECTIONS.has(name) ? {} : [];
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
     id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     email         text NOT NULL,
     email_key     text NOT NULL UNIQUE,
     password_hash text NOT NULL,
     name          text NOT NULL DEFAULT '',
     team          text NOT NULL DEFAULT '',
     role          text NOT NULL DEFAULT '',
     start_date    date,
     end_date      date,
     created_at    timestamptz NOT NULL DEFAULT now(),
     updated_at    timestamptz NOT NULL DEFAULT now(),
     last_seen_at  timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS sections (
     user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name       text NOT NULL,
     doc        jsonb NOT NULL DEFAULT '[]'::jsonb,
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, name)
   )`,

  // Networking lives in its own table (not a JSON blob) because the shared
  // directory needs cross-user queries: who else met this person, who can
  // make a warm intro, which teams are already covered.
  `CREATE TABLE IF NOT EXISTS contacts (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name        text NOT NULL,
     name_key    text NOT NULL,
     team        text NOT NULL DEFAULT '',
     role        text NOT NULL DEFAULT '',
     status      text NOT NULL DEFAULT 'connected',
     met_date    date,
     referred_by text NOT NULL DEFAULT '',
     recommends  jsonb NOT NULL DEFAULT '[]'::jsonb,
     projects    jsonb NOT NULL DEFAULT '[]'::jsonb,
     notes       text NOT NULL DEFAULT '',
     position    integer NOT NULL DEFAULT 0,
     created_at  timestamptz NOT NULL DEFAULT now(),
     updated_at  timestamptz NOT NULL DEFAULT now(),
     UNIQUE (user_id, name_key)
   )`,

  // Brute-force throttling state, kept on the user row so it is shared across
  // serverless instances (an in-memory counter would reset on every cold start).
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz`,

  `CREATE INDEX IF NOT EXISTS contacts_name_key_idx ON contacts (name_key)`,
  `CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts (user_id)`,
  `CREATE INDEX IF NOT EXISTS sections_user_idx ON sections (user_id)`
];

let migration = null;

/**
 * Run the schema DDL once per database client. Safe to call on every request.
 *
 * Keyed on the client rather than a bare boolean so that swapping `__DB__`
 * (which the test suite does between cases) re-migrates the new database
 * instead of assuming the previous one's tables are still there.
 */
export function ensureSchema() {
  // client() resolves (and caches) the driver, so the key is stable across
  // requests; it throws a readable error when no connection string is set.
  const active = client();
  if (!migration || migration.client !== active) {
    migration = {
      client: active,
      promise: (async () => {
        for (const stmt of DDL) await sql(stmt);
      })().catch((err) => {
        migration = null; // let the next request retry
        throw err;
      })
    };
  }
  return migration.promise;
}

/**
 * Coerce a Postgres DATE/TIMESTAMP value to a 'YYYY-MM-DD' string.
 *
 * Drivers disagree here: node-postgres and PGlite hand back a JS Date, while
 * Neon's HTTP driver hands back a string. `String(dateObject).slice(0, 10)`
 * silently yields "Sun May 31" — so always funnel dates through this.
 */
export function toISODate(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Coerce a Postgres TIMESTAMP value to a full ISO-8601 string. */
export function toISOStamp(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/** Normalized key for case/whitespace-insensitive people matching. */
export function nameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
