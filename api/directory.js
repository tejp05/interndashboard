/**
 * /api/directory — the shared, org-wide networking view.
 *
 * Returns every intern and the union of everyone's contacts, collapsed by
 * person so the UI can answer "who already knows this person, and who can
 * make the intro?".
 *
 * PRIVACY: contact `notes` are personal impressions and are never selected
 * here. Activities, goals, projects, learning and reflections are private to
 * each user and are not exposed by this route at all.
 */

import { sql, ensureSchema, toISODate, toISOStamp } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    await ensureSchema();
    const me = await requireUser(req, res);
    if (!me) return;

    const [interns, rows] = await Promise.all([
      sql`
        SELECT u.id, u.name, u.team, u.role, u.email,
               u.start_date, u.end_date, u.last_seen_at,
               COUNT(c.id)                                        AS contact_count,
               COUNT(c.id) FILTER (WHERE c.status = 'connected')   AS connected_count,
               COUNT(c.id) FILTER (WHERE c.status = 'scheduled')   AS scheduled_count,
               COUNT(c.id) FILTER (WHERE c.status = 'looking')     AS looking_count
        FROM users u
        LEFT JOIN contacts c ON c.user_id = u.id
        GROUP BY u.id
        ORDER BY connected_count DESC, u.name ASC
      `,
      // notes is deliberately absent from this SELECT.
      sql`
        SELECT c.name, c.name_key, c.team, c.role, c.status, c.met_date,
               c.referred_by, c.recommends, c.projects, c.updated_at,
               u.id AS user_id, u.name AS user_name, u.team AS user_team
        FROM contacts c
        JOIN users u ON u.id = c.user_id
        ORDER BY c.name_key ASC, c.updated_at DESC
      `
    ]);

    // ── Collapse contact rows by person ──────────────────────────────────────
    const byKey = new Map();
    const STATUS_RANK = { connected: 3, scheduled: 2, looking: 1 };

    for (const r of rows) {
      let entry = byKey.get(r.name_key);
      if (!entry) {
        entry = {
          key: r.name_key,
          name: r.name,
          team: '',
          role: '',
          knownBy: [],
          projects: new Set(),
          recommendedBy: new Set(),
          bestStatus: 'looking',
          connectedCount: 0
        };
        byKey.set(r.name_key, entry);
      }

      // Prefer the most complete team/role anyone recorded.
      if (r.team && r.team.length > entry.team.length) entry.team = r.team;
      if (r.role && r.role.length > entry.role.length) entry.role = r.role;

      entry.knownBy.push({
        userId: r.user_id,
        userName: r.user_name,
        userTeam: r.user_team || '',
        status: r.status,
        date: toISODate(r.met_date),
        referredBy: r.referred_by || '',
        isMe: r.user_id === me.id
      });

      if (r.status === 'connected') entry.connectedCount += 1;
      if ((STATUS_RANK[r.status] || 0) > (STATUS_RANK[entry.bestStatus] || 0)) {
        entry.bestStatus = r.status;
      }
      for (const p of Array.isArray(r.projects) ? r.projects : []) entry.projects.add(p);
    }

    // "X recommends you talk to Y" — turn recommendations into intro leads.
    for (const r of rows) {
      for (const rec of Array.isArray(r.recommends) ? r.recommends : []) {
        const key = String(rec || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!key) continue;
        const entry = byKey.get(key);
        if (entry) entry.recommendedBy.add(r.name);
      }
    }

    const contacts = [...byKey.values()]
      .map((e) => ({
        key: e.key,
        name: e.name,
        team: e.team,
        role: e.role,
        bestStatus: e.bestStatus,
        connectedCount: e.connectedCount,
        knownBy: e.knownBy.sort(
          (a, b) => (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0)
        ),
        projects: [...e.projects],
        recommendedBy: [...e.recommendedBy]
      }))
      .sort((a, b) => b.knownBy.length - a.knownBy.length || a.name.localeCompare(b.name));

    const teams = new Set(contacts.map((c) => c.team).filter(Boolean));

    return res.status(200).json({
      cohort: process.env.COHORT_NAME || 'Interns',
      meId: me.id,
      interns: interns.map((u) => ({
        id: u.id,
        name: u.name,
        team: u.team || '',
        role: u.role || '',
        email: u.email,
        start: toISODate(u.start_date),
        end: toISODate(u.end_date),
        lastSeen: toISOStamp(u.last_seen_at),
        contactCount: Number(u.contact_count),
        connectedCount: Number(u.connected_count),
        scheduledCount: Number(u.scheduled_count),
        lookingCount: Number(u.looking_count),
        isMe: u.id === me.id
      })),
      contacts,
      stats: {
        interns: interns.length,
        uniquePeople: contacts.length,
        totalConnections: rows.filter((r) => r.status === 'connected').length,
        teamsCovered: teams.size,
        sharedPeople: contacts.filter((c) => c.knownBy.length > 1).length
      }
    });
  } catch (err) {
    console.error('directory failed:', err);
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
}
