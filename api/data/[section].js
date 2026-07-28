/**
 * /api/data/:section — read and write the signed-in user's own data.
 *
 *   GET  /api/data/all         → every section at once (initial hydrate)
 *   GET  /api/data/goals       → one section
 *   PUT  /api/data/goals       → replace one section  { doc: [...] }
 *   PUT  /api/data/all         → replace many         { sections: { goals: [...] } }
 *
 * `network` is special: it is persisted to the normalized `contacts` table so
 * the org-wide directory can query across users. Every other section is a
 * private JSON document.
 */

import {
  sql, ensureSchema, SECTION_NAMES, defaultSection, nameKey, toISODate, toISOStamp
} from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const VALID_STATUS = new Set(['looking', 'scheduled', 'connected']);

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const user = await requireUser(req, res);
    if (!user) return;

    const section = String(req.query.section || '');

    if (req.method === 'GET') {
      if (section === 'all') {
        return res.status(200).json({ sections: await readAll(user.id) });
      }
      if (section === 'network') {
        return res.status(200).json({ doc: await readNetwork(user.id) });
      }
      if (!SECTION_NAMES.includes(section)) {
        return res.status(404).json({ error: `Unknown section "${section}".` });
      }
      return res.status(200).json({ doc: await readSection(user.id, section) });
    }

    if (req.method === 'PUT') {
      const size = Buffer.byteLength(JSON.stringify(req.body || {}));
      if (size > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'Payload too large.' });
      }

      if (section === 'all') {
        const incoming = (req.body && req.body.sections) || {};
        for (const [name, doc] of Object.entries(incoming)) {
          await writeSection(user.id, name, doc);
        }
        return res.status(200).json({ ok: true, saved: Object.keys(incoming) });
      }

      await writeSection(user.id, section, req.body ? req.body.doc : undefined);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('data route failed:', err);
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

async function readAll(userId) {
  const rows = await sql`SELECT name, doc FROM sections WHERE user_id = ${userId}`;
  const out = {};
  for (const name of SECTION_NAMES) out[name] = defaultSection(name);
  for (const r of rows) {
    if (SECTION_NAMES.includes(r.name)) out[r.name] = r.doc;
  }
  out.network = await readNetwork(userId);
  return out;
}

async function readSection(userId, name) {
  const rows = await sql`
    SELECT doc FROM sections WHERE user_id = ${userId} AND name = ${name}
  `;
  return rows.length ? rows[0].doc : defaultSection(name);
}

async function readNetwork(userId) {
  const rows = await sql`
    SELECT name, team, role, status, met_date, referred_by, recommends,
           projects, notes, updated_at
    FROM contacts
    WHERE user_id = ${userId}
    ORDER BY position ASC, created_at ASC
  `;
  return rows.map(toClientContact);
}

/** DB row → the object shape the existing frontend already expects. */
function toClientContact(r) {
  return {
    name: r.name,
    team: r.team || '',
    role: r.role || '',
    status: r.status || 'connected',
    date: toISODate(r.met_date),
    referredBy: r.referred_by || '',
    recommends: Array.isArray(r.recommends) ? r.recommends : [],
    projects: Array.isArray(r.projects) ? r.projects : [],
    notes: r.notes || '',
    updatedAt: toISOStamp(r.updated_at) || undefined
  };
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function writeSection(userId, name, doc) {
  if (name === 'network') return writeNetwork(userId, doc);

  if (!SECTION_NAMES.includes(name)) {
    throw new Error(`Unknown section "${name}".`);
  }
  const value = doc === undefined || doc === null ? defaultSection(name) : doc;
  await sql`
    INSERT INTO sections (user_id, name, doc, updated_at)
    VALUES (${userId}, ${name}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (user_id, name)
    DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()
  `;
}

/**
 * Replace the user's contact list wholesale. The frontend always hands us the
 * complete array, so we upsert everything present and delete what vanished.
 * Rows are keyed by normalized name, which is also what lets the directory
 * recognize that two interns met the same person.
 */
async function writeNetwork(userId, list) {
  const contacts = Array.isArray(list) ? list : [];
  const seen = new Set();
  const clean = [];

  contacts.forEach((c, i) => {
    const name = String((c && c.name) || '').trim();
    if (!name) return;
    const key = nameKey(name);
    if (seen.has(key)) return; // last-write-wins would violate the unique index
    seen.add(key);

    const status = VALID_STATUS.has(c.status) ? c.status : 'connected';
    clean.push({
      name,
      key,
      team: String(c.team || '').trim(),
      role: String(c.role || '').trim(),
      status,
      date: status === 'looking' ? null : validDate(c.date),
      referredBy: String(c.referredBy || '').trim(),
      recommends: JSON.stringify(
        (Array.isArray(c.recommends) ? c.recommends : [])
          .map((r) => String(r || '').trim())
          .filter(Boolean)
      ),
      projects: JSON.stringify(
        (Array.isArray(c.projects) ? c.projects : [])
          .map((p) => String(p || '').trim())
          .filter(Boolean)
      ),
      notes: String(c.notes || ''),
      position: i
    });
  });

  const keys = clean.map((c) => c.key);
  const statements = [
    keys.length
      ? sql`DELETE FROM contacts WHERE user_id = ${userId} AND NOT (name_key = ANY(${keys}))`
      : sql`DELETE FROM contacts WHERE user_id = ${userId}`
  ];

  for (const c of clean) {
    statements.push(sql`
      INSERT INTO contacts (user_id, name, name_key, team, role, status, met_date,
                            referred_by, recommends, projects, notes, position, updated_at)
      VALUES (${userId}, ${c.name}, ${c.key}, ${c.team}, ${c.role}, ${c.status}, ${c.date},
              ${c.referredBy}, ${c.recommends}::jsonb, ${c.projects}::jsonb, ${c.notes},
              ${c.position}, now())
      ON CONFLICT (user_id, name_key) DO UPDATE SET
        name = EXCLUDED.name, team = EXCLUDED.team, role = EXCLUDED.role,
        status = EXCLUDED.status, met_date = EXCLUDED.met_date,
        referred_by = EXCLUDED.referred_by, recommends = EXCLUDED.recommends,
        projects = EXCLUDED.projects, notes = EXCLUDED.notes,
        position = EXCLUDED.position, updated_at = now()
    `);
  }

  await sql.transaction(statements);
}

function validDate(s) {
  const v = String(s || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
