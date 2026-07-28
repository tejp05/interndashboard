/**
 * /api/auth/:action — signup, login, logout, me, profile, password.
 *
 * Bundled into one dynamic route so the whole auth surface costs a single
 * serverless function.
 */

import { sql, ensureSchema, SECTION_NAMES, defaultSection } from '../_lib/db.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  setSessionCookie,
  clearSessionCookie,
  getUser,
  requireUser,
  normalizeEmail,
  checkEmailPolicy,
  checkInviteCode,
  validatePassword,
  isEmail,
  publicUser
} from '../_lib/auth.js';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

export default async function handler(req, res) {
  const { action } = req.query;
  try {
    await ensureSchema();
    switch (action) {
      case 'signup':
        return await signup(req, res);
      case 'login':
        return await login(req, res);
      case 'logout':
        return await logout(req, res);
      case 'me':
        return await me(req, res);
      case 'profile':
        return await updateProfile(req, res);
      case 'password':
        return await changePassword(req, res);
      default:
        return res.status(404).json({ error: 'Unknown auth action.' });
    }
  } catch (err) {
    console.error(`auth/${action} failed:`, err);
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
}

function requirePost(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return false;
  }
  return true;
}

/** Seed empty section documents so the client always gets a full payload. */
async function seedSections(userId) {
  for (const name of SECTION_NAMES) {
    await sql`
      INSERT INTO sections (user_id, name, doc)
      VALUES (${userId}, ${name}, ${JSON.stringify(defaultSection(name))}::jsonb)
      ON CONFLICT (user_id, name) DO NOTHING
    `;
  }
}

async function signup(req, res) {
  if (!requirePost(req, res)) return;
  const { email, password, name, team, role, start, end, inviteCode } = req.body || {};

  const cleanEmail = normalizeEmail(email);
  if (!isEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const inviteErr = checkInviteCode(inviteCode);
  if (inviteErr) return res.status(403).json({ error: inviteErr });

  const domainErr = checkEmailPolicy(cleanEmail);
  if (domainErr) return res.status(403).json({ error: domainErr });

  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Enter your full name.' });

  if (start && end && start >= end) {
    return res.status(400).json({ error: 'End date must be after start date.' });
  }

  const existing = await sql`SELECT id FROM users WHERE email_key = ${cleanEmail}`;
  if (existing.length) {
    return res
      .status(409)
      .json({ error: 'An account with that email already exists. Try signing in.' });
  }

  const hash = await hashPassword(password);
  const rows = await sql`
    INSERT INTO users (email, email_key, password_hash, name, team, role, start_date, end_date)
    VALUES (
      ${String(email).trim()}, ${cleanEmail}, ${hash}, ${cleanName},
      ${String(team || '').trim()}, ${String(role || '').trim()},
      ${start || null}, ${end || null}
    )
    RETURNING id, email, name, team, role, start_date, end_date
  `;
  const user = rows[0];
  await seedSections(user.id);

  setSessionCookie(res, await createToken(user.id));
  return res.status(201).json({ user: publicUser(user) });
}

async function login(req, res) {
  if (!requirePost(req, res)) return;
  const { email, password } = req.body || {};
  const cleanEmail = normalizeEmail(email);

  const rows = await sql`
    SELECT id, email, password_hash, name, team, role, start_date, end_date,
           failed_attempts, locked_until
    FROM users WHERE email_key = ${cleanEmail}
  `;
  const user = rows[0];

  // Same message either way so the endpoint does not reveal which emails exist.
  const invalid = () =>
    res.status(401).json({ error: 'Incorrect email or password.' });

  if (!user) {
    // Constant-ish work to blunt timing-based user enumeration.
    await hashPassword(String(password || 'x'));
    return invalid();
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
    });
  }

  const ok = await verifyPassword(String(password || ''), user.password_hash);
  if (!ok) {
    const attempts = (user.failed_attempts || 0) + 1;
    const lock =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString()
        : null;
    await sql`
      UPDATE users
      SET failed_attempts = ${lock ? 0 : attempts}, locked_until = ${lock}
      WHERE id = ${user.id}
    `;
    return invalid();
  }

  await sql`
    UPDATE users
    SET failed_attempts = 0, locked_until = NULL, last_seen_at = now()
    WHERE id = ${user.id}
  `;
  await seedSections(user.id);

  setSessionCookie(res, await createToken(user.id));
  return res.status(200).json({ user: publicUser(user) });
}

async function logout(req, res) {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}

async function me(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(200).json({ user: null });
  return res.status(200).json({ user: publicUser(user) });
}

async function updateProfile(req, res) {
  if (!requirePost(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;

  const { name, team, role, start, end } = req.body || {};
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Name cannot be empty.' });
  if (start && end && start >= end) {
    return res.status(400).json({ error: 'End date must be after start date.' });
  }

  const rows = await sql`
    UPDATE users SET
      name = ${cleanName},
      team = ${String(team || '').trim()},
      role = ${String(role || '').trim()},
      start_date = ${start || null},
      end_date = ${end || null},
      updated_at = now()
    WHERE id = ${user.id}
    RETURNING id, email, name, team, role, start_date, end_date
  `;
  return res.status(200).json({ user: publicUser(rows[0]) });
}

async function changePassword(req, res) {
  if (!requirePost(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;

  const { currentPassword, newPassword } = req.body || {};
  const pwErr = validatePassword(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
  const ok = await verifyPassword(String(currentPassword || ''), rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  await sql`
    UPDATE users SET password_hash = ${await hashPassword(newPassword)}, updated_at = now()
    WHERE id = ${user.id}
  `;
  return res.status(200).json({ ok: true });
}
