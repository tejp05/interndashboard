/* ═══════════════════════════════════════════════════════════════════════════
   directory.js — the shared, cohort-wide networking view.

   Everything here is read-only and comes from /api/directory. The one write
   action is "Add to my network", which appends to the signed-in user's own
   contact list through the normal S.set() path.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  let data = null;
  let loading = false;
  let loadedAt = 0;
  const STALE_MS = 60000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    return String(name || '')
      .split(' ')
      .map(function (w) { return w[0] || ''; })
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const STATUS_LABEL = { connected: 'Connected', scheduled: 'Scheduled', looking: 'Wants to meet' };
  const STATUS_BADGE = { connected: 'bg', scheduled: 'by', looking: 'bk' };

  // ── Loading ───────────────────────────────────────────────────────────────

  async function load(force) {
    if (loading) return;
    if (!force && data && Date.now() - loadedAt < STALE_MS) return;
    loading = true;
    renderLoading();
    try {
      data = await API.get('/api/directory');
      loadedAt = Date.now();
      render();
    } catch (err) {
      renderError(err.message);
    } finally {
      loading = false;
    }
  }

  function renderLoading() {
    const el = document.getElementById('dir-results');
    if (el && !data) {
      el.innerHTML = '<div class="dir-empty"><div class="auth-spinner"></div><p>Loading the cohort directory…</p></div>';
    }
  }

  function renderError(msg) {
    const el = document.getElementById('dir-results');
    if (el) {
      el.innerHTML =
        '<div class="dir-empty"><h3>Could not load the directory</h3><p>' +
        esc(msg) +
        '</p></div>';
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    if (!data) return;
    renderStats();
    renderResults();
    renderInterns();
    renderTeams();
    renderCohortSnapshot();
    const sub = document.getElementById('dir-sub');
    if (sub) {
      sub.textContent =
        data.cohort +
        ' · everyone\'s network pooled. Find who already knows the person you want to meet.';
    }
  }

  function renderStats() {
    const s = data.stats;
    setText('d-k-interns', s.interns);
    setText('d-k-people', s.uniquePeople);
    setText('d-k-conn', s.totalConnections);
    setText('d-k-teams', s.teamsCovered);
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  /** Names already in my own network, for the "Add to my network" affordance. */
  function myContactKeys() {
    const mine = S.get('ibm_template_network', []) || [];
    return new Set(mine.map(function (c) { return String(c.name || '').trim().toLowerCase().replace(/\s+/g, ' '); }));
  }

  function renderResults() {
    const el = document.getElementById('dir-results');
    if (!el) return;

    const q = (document.getElementById('dir-search').value || '').trim().toLowerCase();
    const filter = document.getElementById('dir-filter').value;
    const sort = document.getElementById('dir-sort').value;
    const mine = myContactKeys();

    let list = data.contacts.slice();

    if (q) {
      list = list.filter(function (c) {
        return (
          c.name.toLowerCase().includes(q) ||
          (c.team || '').toLowerCase().includes(q) ||
          (c.role || '').toLowerCase().includes(q) ||
          c.knownBy.some(function (k) { return k.userName.toLowerCase().includes(q); })
        );
      });
    }

    if (filter === 'shared') list = list.filter(function (c) { return c.knownBy.length > 1; });
    else if (filter === 'connected') list = list.filter(function (c) { return c.connectedCount > 0; });
    else if (filter === 'looking') list = list.filter(function (c) { return c.bestStatus === 'looking'; });
    else if (filter === 'new') list = list.filter(function (c) { return !mine.has(c.key); });

    if (sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (sort === 'reach') list.sort(function (a, b) { return b.knownBy.length - a.knownBy.length || a.name.localeCompare(b.name); });

    if (!list.length) {
      el.innerHTML =
        '<div class="dir-empty"><h3>No matches</h3><p>' +
        (data.contacts.length
          ? 'Try a different search or filter.'
          : 'No one in the cohort has logged a contact yet. Add one on the Networking tab and it will show up here.') +
        '</p></div>';
      return;
    }

    el.innerHTML = list.map(function (c) { return card(c, mine); }).join('');
    wire(el);
  }

  function card(c, mine) {
    const inMine = mine.has(c.key);
    // Interns who have actually met this person can make a warm intro.
    const connectors = c.knownBy.filter(function (k) { return k.status === 'connected' && !k.isMe; });

    const knownChips = c.knownBy
      .map(function (k) {
        return (
          '<span class="dir-chip ' + (k.isMe ? 'dir-chip-me' : '') + '" title="' +
          esc(k.userName + ' — ' + (STATUS_LABEL[k.status] || k.status) + (k.date ? ' on ' + k.date : '')) +
          '"><span class="dir-dot dir-dot-' + esc(k.status) + '"></span>' +
          esc(k.isMe ? 'You' : k.userName) + '</span>'
        );
      })
      .join('');

    const introLine = connectors.length
      ? '<div class="dir-intro"><strong>Warm intro available:</strong> ' +
        esc(connectors.map(function (k) { return k.userName; }).slice(0, 3).join(', ')) +
        (connectors.length > 3 ? ' and ' + (connectors.length - 3) + ' more' : '') +
        ' already met ' + esc(c.name.split(' ')[0]) + '.</div>'
      : '';

    const recLine = c.recommendedBy.length
      ? '<div class="dir-rec">&#128172; Recommended by ' + esc(c.recommendedBy.join(', ')) + '</div>'
      : '';

    const projLine = c.projects.length
      ? '<div class="dir-projects">' +
        c.projects.map(function (p) { return '<span class="dir-proj">' + esc(p) + '</span>'; }).join('') +
        '</div>'
      : '';

    return (
      '<div class="dir-card">' +
        '<div class="dir-avatar">' + esc(initials(c.name)) + '</div>' +
        '<div class="dir-body">' +
          '<div class="dir-head">' +
            '<span class="dir-name">' + esc(c.name) + '</span>' +
            '<span class="badge ' + (STATUS_BADGE[c.bestStatus] || 'bk') + '">' +
              esc(STATUS_LABEL[c.bestStatus] || c.bestStatus) + '</span>' +
            (c.knownBy.length > 1
              ? '<span class="dir-reach">' + c.knownBy.length + ' interns</span>'
              : '') +
          '</div>' +
          '<div class="dir-meta">' +
            esc([c.role, c.team].filter(Boolean).join(' · ') || 'No team recorded') +
          '</div>' +
          '<div class="dir-known"><span class="dir-known-lbl">Known by</span>' + knownChips + '</div>' +
          introLine + recLine + projLine +
        '</div>' +
        '<div class="dir-actions">' +
          (inMine
            ? '<span class="dir-in-net">&#10003; In your network</span>'
            : '<button class="btn bp dir-add" data-name="' + esc(c.name) +
              '" data-team="' + esc(c.team) + '" data-role="' + esc(c.role) + '">&#43; Add to my network</button>') +
        '</div>' +
      '</div>'
    );
  }

  function wire(el) {
    el.querySelectorAll('.dir-add').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const name = btn.getAttribute('data-name');
        const list = S.get('ibm_template_network', []) || [];
        const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
        if (list.some(function (c) { return String(c.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === key; })) {
          return;
        }
        list.push({
          name: name,
          team: btn.getAttribute('data-team') || '',
          role: btn.getAttribute('data-role') || '',
          status: 'looking',
          date: '',
          referredBy: '',
          recommends: [],
          notes: '',
          projects: []
        });
        S.set('ibm_template_network', list);
        if (typeof renderNetworking === 'function') renderNetworking();
        if (typeof toast === 'function') toast('"' + name + '" added to your radar');
        renderResults();
      });
    });
  }

  function renderInterns() {
    const el = document.getElementById('dir-interns');
    if (!el) return;
    const max = Math.max.apply(null, data.interns.map(function (i) { return i.contactCount; }).concat([1]));

    el.innerHTML = data.interns
      .map(function (u, i) {
        const pct = Math.round((u.contactCount / max) * 100);
        return (
          '<div class="dir-intern ' + (u.isMe ? 'dir-intern-me' : '') + '">' +
            '<span class="dir-rank">' + (i + 1) + '</span>' +
            '<div class="dir-avatar sm">' + esc(initials(u.name)) + '</div>' +
            '<div class="dir-intern-body">' +
              '<div class="dir-intern-name">' + esc(u.name) + (u.isMe ? ' <span class="dir-you">you</span>' : '') + '</div>' +
              '<div class="dir-intern-meta">' + esc([u.role, u.team].filter(Boolean).join(' · ') || '—') + '</div>' +
              '<div class="dir-bar"><div class="dir-bar-fill" style="width:' + pct + '%"></div></div>' +
            '</div>' +
            '<div class="dir-intern-stats">' +
              '<span class="dir-stat"><b>' + u.connectedCount + '</b> met</span>' +
              '<span class="dir-stat"><b>' + u.scheduledCount + '</b> scheduled</span>' +
              '<span class="dir-stat"><b>' + u.lookingCount + '</b> radar</span>' +
            '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderTeams() {
    const el = document.getElementById('dir-teams');
    if (!el) return;

    const counts = new Map();
    data.contacts.forEach(function (c) {
      const team = (c.team || '').trim();
      if (!team) return;
      const cur = counts.get(team) || { people: 0, connected: 0 };
      cur.people += 1;
      if (c.connectedCount > 0) cur.connected += 1;
      counts.set(team, cur);
    });

    const teams = [...counts.entries()].sort(function (a, b) { return b[1].people - a[1].people; });
    if (!teams.length) {
      el.innerHTML = '<div class="dir-empty"><p>No teams recorded yet. Add a team when logging a contact and coverage will appear here.</p></div>';
      return;
    }

    const max = teams[0][1].people;
    el.innerHTML = teams
      .map(function (entry) {
        const name = entry[0];
        const v = entry[1];
        const pct = Math.round((v.people / max) * 100);
        return (
          '<div class="dir-team">' +
            '<div class="dir-team-name">' + esc(name) + '</div>' +
            '<div class="dir-bar"><div class="dir-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="dir-team-count">' + v.people + ' <span>' + (v.people === 1 ? 'person' : 'people') + '</span></div>' +
          '</div>'
        );
      })
      .join('');
  }

  /**
   * Compact cohort summary on the Overview tab: how far the cohort's combined
   * network reaches, and the people worth asking for an introduction to.
   */
  function renderCohortSnapshot() {
    const el = document.getElementById('dash-cohort');
    if (!el || !data) return;

    const mine = myContactKeys();
    // Best leads: people others have actually met that I have not logged.
    const leads = data.contacts
      .filter(function (c) { return !mine.has(c.key) && c.connectedCount > 0; })
      .slice(0, 5);

    const s = data.stats;
    const statsHTML =
      '<div class="cn-stats">' +
        '<div class="cn-stat"><b>' + s.interns + '</b><span>interns</span></div>' +
        '<div class="cn-stat"><b>' + s.uniquePeople + '</b><span>people reached</span></div>' +
        '<div class="cn-stat"><b>' + s.totalConnections + '</b><span>connections</span></div>' +
        '<div class="cn-stat"><b>' + s.teamsCovered + '</b><span>teams</span></div>' +
      '</div>';

    const leadsHTML = leads.length
      ? '<div class="cn-leads-lbl">People your cohort knows that you haven\'t met</div>' +
        leads.map(function (c) {
          const who = c.knownBy
            .filter(function (k) { return k.status === 'connected'; })
            .map(function (k) { return k.userName; });
          return (
            '<div class="cn-lead">' +
              '<div class="dir-avatar sm">' + esc(initials(c.name)) + '</div>' +
              '<div class="cn-lead-body">' +
                '<div class="cn-lead-name">' + esc(c.name) + '</div>' +
                '<div class="cn-lead-meta">' +
                  esc([c.role, c.team].filter(Boolean).join(' · ') || 'No team recorded') +
                '</div>' +
              '</div>' +
              '<div class="cn-lead-via">via ' + esc(who.slice(0, 2).join(', ')) +
                (who.length > 2 ? ' +' + (who.length - 2) : '') + '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="cn-lead-empty">You have logged everyone your cohort has connected with. Nice.</div>';

    el.innerHTML =
      statsHTML + leadsHTML +
      '<button class="btn bp cn-open" data-tab-link="8" style="margin-top:12px">Open the full Directory &rarr;</button>';

    const open = el.querySelector('.cn-open');
    if (open) {
      open.addEventListener('click', function () {
        if (typeof activateTab === 'function') activateTab('8');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  function init() {
    ['dir-search', 'dir-filter', 'dir-sort'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(id === 'dir-search' ? 'input' : 'change', function () {
        if (data) renderResults();
      });
    });
    const refresh = document.getElementById('dir-refresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        load(true);
        if (typeof toast === 'function') toast('Directory refreshed');
      });
    }
  }

  global.Directory = { load: load, init: init, render: render };
})(window);
