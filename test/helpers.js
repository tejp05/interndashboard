/**
 * helpers.js — invoke the real API handlers against an in-memory Postgres.
 */

import { createPgliteClient } from '../scripts/pglite-adapter.js';

process.env.AUTH_SECRET = 'test-secret-long-enough-for-hs256-signing-0123456789';
process.env.COHORT_NAME = 'Test Cohort';
delete process.env.DATABASE_URL;

export async function freshDb() {
  globalThis.__DB__ = await createPgliteClient(); // ephemeral
  return globalThis.__DB__;
}

/** Build a Vercel-shaped (req, res) pair and run a handler against it. */
export async function call(handler, { method = 'GET', query = {}, body, cookie } = {}) {
  const req = { method, query, body, headers: cookie ? { cookie } : {} };

  const result = { status: 200, body: null, headers: {} };
  const res = {
    statusCode: 200,
    setHeader(k, v) {
      result.headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return result.headers[k.toLowerCase()];
    },
    hasHeader(k) {
      return k.toLowerCase() in result.headers;
    },
    status(code) {
      result.status = code;
      res.statusCode = code;
      return res;
    },
    json(obj) {
      result.body = obj;
      return res;
    },
    end() {
      return res;
    }
  };

  await handler(req, res);
  result.cookie = result.headers['set-cookie'];
  return result;
}

/** Extract just the `name=value` portion of a Set-Cookie header. */
export function cookieOf(result) {
  const raw = result.cookie;
  return raw ? raw.split(';')[0] : '';
}

/** Sign up a user and return their session cookie plus the user object. */
export async function makeUser(authHandler, overrides = {}) {
  const res = await call(authHandler, {
    method: 'POST',
    query: { action: 'signup' },
    body: {
      name: 'Test User',
      email: `user${Math.random().toString(36).slice(2, 8)}@ibm.com`,
      password: 'password1234',
      team: 'IBM Technology Group',
      role: 'Intern',
      start: '2026-06-01',
      end: '2026-08-21',
      ...overrides
    }
  });
  if (res.status !== 201) {
    throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  }
  return { user: res.body.user, cookie: cookieOf(res) };
}
