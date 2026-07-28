/**
 * auth.js — password hashing, JWT session cookies, and request guards.
 *
 * Sessions are stateless HS256 JWTs stored in an httpOnly, SameSite=Lax
 * cookie. No session table to clean up; sign-out clears the cookie and the
 * token expires on its own.
 */

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { sql, ensureSchema, toISODate } from './db.js';

const COOKIE_NAME = 'ibm_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Set it in the Vercel project ' +
        'environment variables (48+ random bytes).'
    );
  }
  return new TextEncoder().encode(raw);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export async function createToken(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

/**
 * Resolve the signed-in user from the request cookie.
 * Returns the user row, or null when there is no valid session.
 */
export async function getUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  let userId;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    userId = payload.sub;
  } catch {
    return null;
  }
  if (!userId) return null;

  await ensureSchema();
  const rows = await sql`
    SELECT id, email, name, team, role, start_date, end_date, created_at
    FROM users WHERE id = ${userId}
  `;
  return rows[0] || null;
}

/**
 * Guard for protected routes. Sends 401 and returns null when unauthenticated,
 * so callers can `if (!user) return;`.
 */
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return null;
  }
  return user;
}

// ── Signup policy ───────────────────────────────────────────────────────────

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Returns an error string when the email is not allowed to sign up, else null. */
export function checkEmailPolicy(email) {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS;
  if (!raw || !raw.trim()) return null;
  const allowed = raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = normalizeEmail(email).split('@')[1] || '';
  if (!allowed.includes(domain)) {
    return `Sign-ups are limited to: ${allowed.map((d) => '@' + d).join(', ')}`;
  }
  return null;
}

/** Returns an error string when the invite code is required and wrong, else null. */
export function checkInviteCode(code) {
  const required = process.env.SIGNUP_INVITE_CODE;
  if (!required || !required.trim()) return null;
  if (String(code || '').trim() !== required.trim()) {
    return 'That invite code is not valid.';
  }
  return null;
}

export function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < 10) return 'Password must be at least 10 characters.';
  if (s.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

/** Shape a user row for the client. */
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name || '',
    team: u.team || '',
    role: u.role || '',
    start: toISODate(u.start_date),
    end: toISODate(u.end_date)
  };
}
