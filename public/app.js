// ─────────────────────────────────────
// STORAGE
// ─────────────────────────────────────
// `S` (the synchronous get/set facade), `Store`, `Auth` and `API` all come
// from store.js, which must load before this file. Data lives on the server —
// each user sees their own private tabs, and every user's networking data is
// pooled into the shared Directory.
const TEMPLATE_DEFAULTS = {
  ibm_template_profile: null,
  ibm_template_activities: [],
  ibm_template_goals: [],
  ibm_template_projects: [],
  ibm_template_learning: [],
  ibm_template_network: [],
  ibm_template_reflections: [],
  ibm_template_tasks: []
};

// ─────────────────────────────────────
// EDIT MODAL ENGINE
// ─────────────────────────────────────
const EditModal = (function() {
  let _onSave = null;

  const modal  = document.getElementById('edit-modal');
  const title  = document.getElementById('em-title');
  const body   = document.getElementById('em-body');
  const saveBtn = document.getElementById('em-save');
  const cancelBtn = document.getElementById('em-cancel');

  function open(titleText, html, onSave) {
    title.textContent = titleText;
    body.innerHTML = html;
    _onSave = onSave;
    modal.classList.remove('hidden');
  }

  function close() {
    modal.classList.add('hidden');
    body.innerHTML = '';
    _onSave = null;
  }

  saveBtn.addEventListener('click', function() {
    if (_onSave) _onSave();
  });
  cancelBtn.addEventListener('click', close);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) close();
  });

  return { open, close };
})();

function nowISO() { return new Date().toISOString(); }
function fmtUpdated(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return 'Updated ' + d.toLocaleDateString() + ' at ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function mVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

// ─────────────────────────────────────
// TOAST
// ─────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + (msg || 'Saved');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ─────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────
function confetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = ['#0f62fe','#198038','#6929c4','#e0a208','#da1e28','#005d5d','#ff832b','#ffffff'];
  const pieces = Array.from({ length: 120 }, () => ({
    x:     Math.random() * canvas.width,
    y:     Math.random() * -canvas.height * 0.5,
    w:     6 + Math.random() * 8,
    h:     10 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot:   Math.random() * Math.PI * 2,
    vx:    (Math.random() - 0.5) * 4,
    vy:    3 + Math.random() * 4,
    vr:    (Math.random() - 0.5) * 0.2,
    opacity: 1
  }));

  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.12; // gravity
      p.rot += p.vr;
      if (p.y > canvas.height * 0.75) p.opacity = Math.max(0, p.opacity - 0.03);
      if (p.opacity > 0) alive = true;
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) { frame = requestAnimationFrame(draw); }
    else { cancelAnimationFrame(frame); canvas.remove(); }
  }
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, 4000);
}

// ─────────────────────────────────────
// HELPERS
// ─────────────────────────────────────
function emptyState(icon, msg, hint, tabIdx) {
  const btn = tabIdx != null
    ? `<button class="btn bs" onclick="document.querySelector('.form-toggle[data-tab-target=\\'${tabIdx}\\']')?.setAttribute('open','') || document.querySelector('#pg${tabIdx} details.form-toggle')?.setAttribute('open','')">+ Add your first entry</button>`
    : '';
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-msg">${msg}</div>
    <div class="empty-state-hint">${hint}</div>
    ${btn}
  </div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Count weekdays (Mon–Fri) remaining from today up to and including endISO
function countWeekdaysLeft(endISO) {
  const end = new Date(endISO + 'T00:00:00');
  let cur = new Date();
  cur.setHours(0, 0, 0, 0);
  if (cur > end) return 0;
  let count = 0;
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mo[parseInt(m) - 1] + ' ' + parseInt(d) + ', ' + y;
}
function val(id) { return document.getElementById(id).value.trim(); }
function clear(ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }
function today() { return new Date().toISOString().split('T')[0]; }

// ─────────────────────────────────────
// TAB NAVIGATION
// ─────────────────────────────────────
function activateTab(idx) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tabnav button').forEach(b => b.classList.remove('active'));
  document.getElementById('pg' + idx).classList.add('active');
  const tabBtn = document.querySelector('.tabnav button[data-tab="' + idx + '"]');
  if (tabBtn) tabBtn.classList.add('active');
  if (idx === '1') populateProjectDropdown();
  // The Directory is server-backed — fetch it lazily the first time it is
  // opened, and refresh it when it goes stale.
  if (String(idx) === '8') Directory.load();
}


document.querySelectorAll('.tabnav button').forEach(btn => {
  btn.addEventListener('click', function() {
    activateTab(this.dataset.tab);
  });
});

document.querySelectorAll('[data-tab-link]').forEach(link => {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    activateTab(this.dataset.tabLink);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ─────────────────────────────────────
// AUTH
// ─────────────────────────────────────

const AUTH_PANELS = ['auth-loading', 'auth-login', 'auth-signup', 'auth-settings'];

function showAuthPanel(which) {
  AUTH_PANELS.forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== which);
  });
  document.getElementById('setup-overlay').classList.remove('hidden', 'loading');
}

function hideAuthOverlay() {
  document.getElementById('setup-overlay').classList.add('hidden');
  document.getElementById('app-shell').classList.add('visible');
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthError(id) {
  document.getElementById(id).classList.add('hidden');
}

function busy(btn, isBusy, label) {
  if (!btn) return;
  btn.disabled = isBusy;
  if (isBusy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = label || 'Working…';
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
}

/** Pull the server profile into the local profile section and launch the app. */
async function enterDashboard(user) {
  await Store.hydrate();
  // The user row is the source of truth for identity; mirror it into the
  // profile section the rest of the UI reads from.
  S.set('ibm_template_profile', {
    name: user.name, team: user.team, role: user.role,
    start: user.start, end: user.end, email: user.email
  });
  hideAuthOverlay();
  initApp();
}

// ── Sign in ──
document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAuthError('login-error');
  const btn = document.getElementById('login-btn');
  busy(btn, true, 'Signing in…');
  try {
    const user = await Auth.login(val('li-email'), document.getElementById('li-password').value);
    document.getElementById('li-password').value = '';
    await enterDashboard(user);
  } catch (err) {
    showAuthError('login-error', err.message);
  } finally {
    busy(btn, false);
  }
});

// ── Sign up ──
document.getElementById('signup-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAuthError('signup-error');
  const start = val('s-start'), end = val('s-end');
  if (start && end && start >= end) {
    showAuthError('signup-error', 'End date must be after start date.');
    return;
  }
  const btn = document.getElementById('setup-btn');
  busy(btn, true, 'Creating account…');
  try {
    const user = await Auth.signup({
      name: val('s-name'),
      email: val('s-email'),
      password: document.getElementById('s-password').value,
      team: val('s-team'),
      role: val('s-role'),
      start, end,
      inviteCode: val('s-invite')
    });
    document.getElementById('s-password').value = '';
    await enterDashboard(user);
    toast('Welcome aboard, ' + user.name.split(' ')[0] + '!');
  } catch (err) {
    showAuthError('signup-error', err.message);
    // Surface the invite field only once the server says it is required.
    if (/invite code/i.test(err.message)) {
      document.getElementById('s-invite-wrap').classList.remove('hidden');
    }
  } finally {
    busy(btn, false);
  }
});

document.getElementById('go-signup-btn').addEventListener('click', () => showAuthPanel('auth-signup'));
document.getElementById('go-login-btn').addEventListener('click', () => showAuthPanel('auth-login'));

// ── Settings ──
document.getElementById('settings-btn').addEventListener('click', function() {
  const u = Auth.user || {};
  document.getElementById('settings-email').textContent = 'Signed in as ' + (u.email || '');
  document.getElementById('p-name').value  = u.name  || '';
  document.getElementById('p-team').value  = u.team  || '';
  document.getElementById('p-role').value  = u.role  || '';
  document.getElementById('p-start').value = u.start || '';
  document.getElementById('p-end').value   = u.end   || '';
  clearAuthError('profile-error');
  clearAuthError('password-error');
  showAuthPanel('auth-settings');
});

document.getElementById('close-settings-btn').addEventListener('click', hideAuthOverlay);

document.getElementById('profile-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAuthError('profile-error');
  const start = mVal('p-start'), end = mVal('p-end');
  if (start && end && start >= end) {
    showAuthError('profile-error', 'End date must be after start date.');
    return;
  }
  try {
    const user = await Auth.saveProfile({
      name: val('p-name'), team: val('p-team'), role: val('p-role'), start, end
    });
    S.set('ibm_template_profile', {
      name: user.name, team: user.team, role: user.role,
      start: user.start, end: user.end, email: user.email
    });
    hideAuthOverlay();
    initApp();
    toast('Profile updated');
  } catch (err) {
    showAuthError('profile-error', err.message);
  }
});

document.getElementById('password-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  clearAuthError('password-error');
  try {
    await Auth.changePassword(
      document.getElementById('pw-current').value,
      document.getElementById('pw-new').value
    );
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    toast('Password updated');
  } catch (err) {
    showAuthError('password-error', err.message);
  }
});

document.getElementById('signout-btn').addEventListener('click', async function() {
  await Store.flush();
  await Auth.logout();
  location.reload();
});

// Import link on the settings screen.
document.getElementById('setup-import-btn').addEventListener('click', function() {
  document.getElementById('import-file').click();
});

// ─────────────────────────────────────
// DARK MODE
// ─────────────────────────────────────
(function initDarkMode() {
  if (S.get('ibm_dark_mode', false)) {
    document.body.classList.add('dark');
    document.getElementById('darkmode-btn').textContent = '☀';
  }
})();

document.getElementById('darkmode-btn').addEventListener('click', function() {
  const isDark = document.body.classList.toggle('dark');
  this.textContent = isDark ? '☀' : '☾';
  S.set('ibm_dark_mode', isDark);
});


// ─────────────────────────────────────
// INIT
// ─────────────────────────────────────
function initApp() {
  const p = S.get('ibm_template_profile', {});
  document.getElementById('hdr-name').textContent = p.name || '';
  if (p.start && p.end) {
    document.getElementById('hdr-dates').textContent = fmtDate(p.start) + ' – ' + fmtDate(p.end);
    updateWeekBar(p.start, p.end);
    updateMilestones(p.start, p.end);
    document.getElementById('dash-sub').textContent =
      (p.role || 'Intern') + ' · ' + (p.team || 'IBM') + ' · ' + fmtDate(p.start) + ' – ' + fmtDate(p.end);

    // Countdown pill
    const cdEl = document.getElementById('hdr-countdown');
    const daysLeft = countWeekdaysLeft(p.end);
    cdEl.classList.remove('hidden', 'urgent', 'done');
    if (daysLeft === 0) {
      cdEl.textContent = '🎉 Internship complete!';
      cdEl.classList.add('done');
    } else if (daysLeft <= 10) {
      cdEl.textContent = daysLeft + ' workday' + (daysLeft === 1 ? '' : 's') + ' left';
      cdEl.classList.add('urgent');
    } else {
      cdEl.textContent = daysLeft + ' workdays left';
    }
  }
  const t = today();
  ['a-date','n-date','l-date','r-week'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = t;
  });
  populateProjectDropdown();

  // Populate multi-selects when "Add" forms are opened. Bound once — initApp
  // re-runs on profile save and on import, and re-binding would stack handlers.
  if (!initApp._bound) {
    initApp._bound = true;
    document.querySelector('#pg3 details.form-toggle').addEventListener('toggle', function() {
      if (this.open) {
        document.getElementById('pj-collaborators-wrap').innerHTML = buildContactMultiSelect('pj-collaborators', []);
      }
    });
    document.querySelector('#pg5 details.form-toggle').addEventListener('toggle', function() {
      if (this.open) {
        document.getElementById('n-projects-wrap').innerHTML = buildProjectMultiSelect('n-projects', []);
      }
    });
  }

  renderAll();
  // Pull the shared directory so the Overview's cohort snapshot has data.
  // Cached for 60s, so opening the Directory tab afterwards costs nothing.
  Directory.load();
}

function updateWeekBar(start, end) {
  const s = new Date(start), e = new Date(end), now = new Date();
  const totalMs = e - s, elapsed = now - s;
  const totalWeeks = Math.ceil(totalMs / (1000 * 60 * 60 * 24 * 7));
  const currentWeek = Math.max(1, Math.min(Math.ceil(elapsed / (1000 * 60 * 60 * 24 * 7)), totalWeeks));
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalMs) * 100)));
  document.getElementById('wb-lbl').textContent = 'Week ' + currentWeek + ' of ' + totalWeeks;
  document.getElementById('wb-fill').style.width = pct + '%';
  document.getElementById('wb-pct').textContent = pct + '% complete';
}

function updateMilestones(start, end) {
  const s = new Date(start), e = new Date(end), now = new Date();
  const pct = Math.max(0, Math.min(1, (now - s) / (e - s)));
  const thresholds = [0, 0.15, 0.33, 0.5, 0.75, 0.95];
  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById('ms' + i);
    dot.className = 'mdot';
    if (pct >= thresholds[i - 1] + 0.08) dot.classList.add('ms-done');
    else if (pct >= thresholds[i - 1] - 0.04) dot.classList.add('ms-curr');
    else dot.classList.add('ms-pend');
  }
}

// ─────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────
function renderAll() {
  renderActivities();
  renderGoals();
  renderProjects();
  renderLearning();
  renderNetworking();
  renderReflections();
  renderTasks();
  updateDashboard();
}

// ─────────────────────────────────────
// PROJECT DROPDOWN (shared utility)
// ─────────────────────────────────────
function populateProjectDropdown() {
  const projects = S.get('ibm_template_projects', []);
  const sel = document.getElementById('a-proj');
  const current = sel.value;
  // Keep only the blank "no project" option, then rebuild
  while (sel.options.length > 1) sel.remove(1);
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.title;
    opt.textContent = p.title;
    sel.appendChild(opt);
  });
  // Restore previous selection if still valid
  if (current) sel.value = current;
}

// ─────────────────────────────────────
// PROJECT ↔ CONTACT SYNC HELPERS
// ─────────────────────────────────────

// Build a <select multiple> of all projects, pre-checking the supplied titles.
function buildProjectMultiSelect(id, selectedTitles) {
  const projects = S.get('ibm_template_projects', []);
  if (!projects.length) {
    return `<em style="font-size:13px;color:var(--tm)">No projects yet — add one in the Projects tab first.</em>`;
  }
  const opts = projects.map(p => {
    const sel = (selectedTitles || []).includes(p.title) ? ' selected' : '';
    return `<option value="${esc(p.title)}"${sel}>${esc(p.title)}</option>`;
  }).join('');
  return `<select id="${id}" multiple style="width:100%;min-height:80px;padding:6px;border:1px solid var(--g30);border-radius:var(--r-sm);font-size:13px;font-family:inherit">${opts}</select>
          <div style="font-size:11px;color:var(--tm);margin-top:3px">Hold Ctrl / Cmd to select multiple</div>`;
}

// Build a <select multiple> of all contacts, pre-checking the supplied names.
function buildContactMultiSelect(id, selectedNames) {
  const contacts = S.get('ibm_template_network', []);
  if (!contacts.length) {
    return `<em style="font-size:13px;color:var(--tm)">No contacts yet — add one in the Networking tab first.</em>`;
  }
  const opts = contacts.map(c => {
    const sel = (selectedNames || []).includes(c.name) ? ' selected' : '';
    return `<option value="${esc(c.name)}"${sel}>${esc(c.name)}${c.role ? ' — ' + esc(c.role) : ''}</option>`;
  }).join('');
  return `<select id="${id}" multiple style="width:100%;min-height:80px;padding:6px;border:1px solid var(--g30);border-radius:var(--r-sm);font-size:13px;font-family:inherit">${opts}</select>
          <div style="font-size:11px;color:var(--tm);margin-top:3px">Hold Ctrl / Cmd to select multiple</div>`;
}

// Get selected values from a multi-select by id (works inside modals too).
function getMultiSelectValues(id) {
  const el = document.getElementById(id);
  if (!el || el.tagName !== 'SELECT') return [];
  return Array.from(el.selectedOptions).map(o => o.value);
}

// Sync: after saving/editing a contact, update all project collaborators[] lists.
function syncProjectsForContact(contactName, newProjectTitles, oldProjectTitles) {
  const projects = S.get('ibm_template_projects', []);
  let changed = false;

  // Add contact to newly linked projects
  newProjectTitles.forEach(title => {
    const p = projects.find(x => x.title === title);
    if (p) {
      if (!Array.isArray(p.collaborators)) p.collaborators = [];
      if (!p.collaborators.includes(contactName)) {
        p.collaborators.push(contactName);
        changed = true;
      }
    }
  });

  // Remove contact from unlinked projects
  (oldProjectTitles || []).forEach(title => {
    if (!newProjectTitles.includes(title)) {
      const p = projects.find(x => x.title === title);
      if (p && Array.isArray(p.collaborators)) {
        const before = p.collaborators.length;
        p.collaborators = p.collaborators.filter(n => n !== contactName);
        if (p.collaborators.length !== before) changed = true;
      }
    }
  });

  if (changed) S.set('ibm_template_projects', projects);
}

// Sync: after saving/editing a project, update all contact projects[] lists.
function syncContactsForProject(projectTitle, newContactNames, oldContactNames) {
  const contacts = S.get('ibm_template_network', []);
  let changed = false;

  // Add project to newly linked contacts
  newContactNames.forEach(name => {
    const c = contacts.find(x => x.name === name);
    if (c) {
      if (!Array.isArray(c.projects)) c.projects = [];
      if (!c.projects.includes(projectTitle)) {
        c.projects.push(projectTitle);
        changed = true;
      }
    }
  });

  // Remove project from unlinked contacts
  (oldContactNames || []).forEach(name => {
    if (!newContactNames.includes(name)) {
      const c = contacts.find(x => x.name === name);
      if (c && Array.isArray(c.projects)) {
        const before = c.projects.length;
        c.projects = c.projects.filter(t => t !== projectTitle);
        if (c.projects.length !== before) changed = true;
      }
    }
  });

  if (changed) S.set('ibm_template_network', contacts);
}

// Cleanup: when a contact is deleted, remove them from all project collaborators[].
function removeContactFromAllProjects(contactName) {
  const projects = S.get('ibm_template_projects', []);
  let changed = false;
  projects.forEach(p => {
    if (Array.isArray(p.collaborators) && p.collaborators.includes(contactName)) {
      p.collaborators = p.collaborators.filter(n => n !== contactName);
      changed = true;
    }
  });
  if (changed) S.set('ibm_template_projects', projects);
}

// Cleanup: when a project is deleted, remove it from all contact projects[].
function removeProjectFromAllContacts(projectTitle) {
  const contacts = S.get('ibm_template_network', []);
  let changed = false;
  contacts.forEach(c => {
    if (Array.isArray(c.projects) && c.projects.includes(projectTitle)) {
      c.projects = c.projects.filter(t => t !== projectTitle);
      changed = true;
    }
  });
  if (changed) S.set('ibm_template_network', contacts);
}

// ─────────────────────────────────────
// ACTIVITIES
// ─────────────────────────────────────
document.getElementById('save-activity').addEventListener('click', function() {
  const desc = val('a-desc');
  if (!desc) { alert('Please enter a task description.'); return; }
  const list = S.get('ibm_template_activities', []);
  list.unshift({
    date: val('a-date'),
    proj: document.getElementById('a-proj').value,
    hrs:  val('a-hrs'),
    cat:  val('a-cat'),
    desc,
    notes: val('a-notes')
  });
  S.set('ibm_template_activities', list);
  clear(['a-hrs','a-desc','a-notes']);
  document.getElementById('a-date').value = today();
  document.getElementById('a-proj').value = '';
  document.getElementById('a-cat').value  = '';
  renderActivities(); updateDashboard(); toast('Activity saved');
});

document.getElementById('clear-activity').addEventListener('click', function() {
  clear(['a-hrs','a-desc','a-notes']);
  document.getElementById('a-proj').value = '';
  document.getElementById('a-cat').value  = '';
});

function renderActivities() {
  const list = S.get('ibm_template_activities', []);
  const tb = document.getElementById('act-tbody');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="8">${emptyState('🕐', 'No activities logged yet', 'Start tracking your day — log what you worked on, how long it took, and which project it belongs to.')}</td></tr>`;
    return;
  }
  tb.innerHTML = list.map((r, i) => {
    const noteId = `act-note-${i}`;
    return `<tr>
    <td style="white-space:nowrap">${fmtDate(r.date)}</td>
    <td>${r.proj ? `<span class="b bb">${esc(r.proj)}</span>` : '<span style="color:var(--tm);font-size:12px">—</span>'}</td>
    <td>${esc(r.desc)}</td>
    <td>${r.hrs || '—'}</td>
    <td>${esc(r.cat) || '—'}</td>
    <td>${r.notes ? `<div class="act-desc" id="${noteId}">${esc(r.notes)}</div><button class="nc-more" data-note="${noteId}">more</button>` : '—'}</td>
    <td><button class="del-btn" data-key="ibm_template_activities" data-idx="${i}" data-render="activities">&#10005;</button></td>
    <td><button class="edit-btn" data-type="activity" data-idx="${i}">&#9998; Edit</button></td>
  </tr>`;
  }).join('');
  tb.querySelectorAll('.nc-more[data-note]').forEach(btn => {
    const el = document.getElementById(btn.dataset.note);
    if (!el) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', () => {
      const expanded = el.classList.toggle('expanded');
      btn.textContent = expanded ? 'less' : 'more';
    });
  });
}

function editActivity(idx) {
  const list = S.get('ibm_template_activities', []);
  const r = list[idx];
  if (!r) return;
  const projects = S.get('ibm_template_projects', []);
  const projOpts = `<option value="">— No project —</option>` +
    projects.map(p => `<option value="${esc(p.title)}" ${r.proj === p.title ? 'selected' : ''}>${esc(p.title)}</option>`).join('');
  const catOpts = ['','Project Work','Meetings','Training','Learning','Mentoring','Administrative']
    .map(c => `<option value="${c}" ${r.cat === c ? 'selected' : ''}>${c || '-- Select --'}</option>`).join('');
  EditModal.open('Edit Activity', `
    <div class="fgrid">
      <div class="fg"><label>Date</label><input type="date" id="em-a-date" value="${r.date||''}"></div>
      <div class="fg"><label>Linked Project</label><select id="em-a-proj">${projOpts}</select></div>
      <div class="fg"><label>Hours Spent</label><input type="number" id="em-a-hrs" min="0.25" max="16" step="0.25" value="${r.hrs||''}"></div>
      <div class="fg"><label>Category</label><select id="em-a-cat">${catOpts}</select></div>
      <div class="fg full"><label>Task Description</label><input type="text" id="em-a-desc" value="${esc(r.desc)}"></div>
      <div class="fg full"><label>Notes</label><textarea id="em-a-notes">${esc(r.notes||'')}</textarea></div>
    </div>`, function() {
    const desc = mVal('em-a-desc');
    if (!desc) { alert('Task description is required.'); return; }
    list[idx] = Object.assign({}, r, {
      date:  mVal('em-a-date'),
      proj:  document.getElementById('em-a-proj').value,
      hrs:   mVal('em-a-hrs'),
      cat:   document.getElementById('em-a-cat').value,
      desc,
      notes: mVal('em-a-notes'),
      updatedAt: nowISO()
    });
    S.set('ibm_template_activities', list);
    renderActivities(); updateDashboard();
    EditModal.close(); toast('Activity updated');
  });
}

// ─────────────────────────────────────
// GOALS
// ─────────────────────────────────────

// Toggle goal type fields
document.getElementById('g-type').addEventListener('change', function() {
  const isMetric = this.value === 'metric';
  document.getElementById('g-manual-pct').classList.toggle('hidden', isMetric);
  document.getElementById('g-manual-target').classList.toggle('hidden', isMetric);
  document.getElementById('g-metric-source').classList.toggle('hidden', !isMetric);
  document.getElementById('g-metric-target-wrap').classList.toggle('hidden', !isMetric);
});

// Metric source registry — single source of truth for labels and live resolvers
const METRIC_SOURCES = {
  hours: {
    label:   'Total Hours Logged',
    resolve: () => Math.round(S.get('ibm_template_activities', []).reduce((s, a) => s + (parseFloat(a.hrs) || 0), 0) * 10) / 10
  },
  activities: {
    label:   'Activities Count',
    resolve: () => S.get('ibm_template_activities', []).length
  },
  courses: {
    label:   'Courses Completed',
    resolve: () => S.get('ibm_template_learning', []).filter(c => c.status === 'Complete').length
  },
  contacts: {
    label:   'Contacts Made',
    resolve: () => S.get('ibm_template_network', []).length
  },
  projects: {
    label:   'Projects Completed',
    resolve: () => S.get('ibm_template_projects', []).filter(p => p.status === 'Complete').length
  }
};

// Derive progress % from a goal object (works for both types)
function goalProgress(g) {
  if (g.type === 'metric') {
    const src     = METRIC_SOURCES[g.metricSource];
    const current = src ? src.resolve() : 0;
    const target  = parseFloat(g.metricTarget) || 1;
    return { pct: Math.min(100, Math.round((current / target) * 100)), current };
  }
  return { pct: g.pct || 0, current: g.pct || 0 };
}

// Auto-advance metric-based goals whose live progress has hit 100%
function autoAdvanceGoals() {
  const list = S.get('ibm_template_goals', []);
  let changed = false;
  let newlyAchieved = false;
  list.forEach(g => {
    if (g.type !== 'metric' || g.status === 'Achieved') return;
    const { pct } = goalProgress(g);
    if (pct >= 100) {
      g.status        = 'Achieved';
      g.completedDate = g.completedDate || today();
      g.updatedAt     = nowISO();
      changed = true;
      newlyAchieved = true;
    }
  });
  if (changed) S.set('ibm_template_goals', list);
  if (newlyAchieved) { toast('🎉 Goal achieved!'); confetti(); }
  return changed;
}

document.getElementById('save-goal').addEventListener('click', function() {
  const name = val('g-name');
  if (!name) { alert('Please enter a goal name.'); return; }
  const type = document.getElementById('g-type').value;
  const entry = {
    name,
    type,
    desc:   val('g-desc'),
    date:   val('g-date'),
    status: document.getElementById('g-status').value
  };
  if (type === 'metric') {
    entry.metricSource = document.getElementById('g-metric').value;
    const tv = val('g-metric-target');
    if (!tv) { alert('Please enter a target value for the metric.'); return; }
    entry.metricTarget = parseFloat(tv) || 0;
  } else {
    entry.pct    = Math.min(100, Math.max(0, parseInt(val('g-pct')) || 0));
    entry.target = val('g-target');
  }
  const list = S.get('ibm_template_goals', []);
  list.push(entry);
  S.set('ibm_template_goals', list);
  clear(['g-name','g-desc','g-date','g-pct','g-target','g-metric-target']);
  document.getElementById('g-status').value = 'Not Started';
  document.getElementById('g-type').value   = 'manual';
  document.getElementById('g-manual-pct').classList.remove('hidden');
  document.getElementById('g-manual-target').classList.remove('hidden');
  document.getElementById('g-metric-source').classList.add('hidden');
  document.getElementById('g-metric-target-wrap').classList.add('hidden');
  renderGoals(); updateDashboard(); toast('Goal saved');
});

const gColors = { 'Achieved':'var(--green)', 'In Progress':'var(--blue)', 'At Risk':'var(--yellow)', 'Not Started':'var(--g30)' };
const gBadge  = { 'Achieved':'bg', 'In Progress':'bb', 'At Risk':'by', 'Not Started':'bk' };
const gFill   = { 'Achieved':'pb-g', 'In Progress':'pb-b', 'At Risk':'pb-y', 'Not Started':'pb-b' };

function renderGoals() {
  const list = S.get('ibm_template_goals', []);
  const el = document.getElementById('goals-list');
  if (!list.length) { el.innerHTML = emptyState('🎯', 'No goals set yet', 'Goals keep you focused all summer. Add a goal above — track it by percentage or tie it to a live metric like hours logged or projects completed.'); return; }
  el.innerHTML = list.map((g, i) => {
    const { pct, current } = goalProgress(g);
    const isMetric  = g.type === 'metric';
    const srcEntry  = isMetric ? (METRIC_SOURCES[g.metricSource] || {}) : null;
    const srcLabel  = srcEntry ? srcEntry.label : g.metricSource;
    const targetDisplay = isMetric
      ? (g.metricTarget != null ? g.metricTarget + ' ' + srcLabel : '—')
      : (g.target || '—');
    const progressDisplay = isMetric
      ? current + (g.metricSource === 'hours' ? ' hrs' : '') + ' / ' + (g.metricTarget || '—') + ' (' + pct + '%)'
      : pct + '%';
    const completionDate = g.completedDate ? fmtDate(g.completedDate) : (g.status === 'Achieved' && g.date ? fmtDate(g.date) : '—');
    return `
    <div class="gc" style="border-left:4px solid ${gColors[g.status] || 'var(--g30)'}">
      <button class="del-btn" data-key="ibm_template_goals" data-idx="${i}" data-render="goals">&#10005;</button>
      <div class="gh">
        <div>
          <div class="gn">${esc(g.name)}</div>
          ${g.desc ? `<div class="gd2">${esc(g.desc)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="b ${isMetric ? 'bm' : 'bk'}">${isMetric ? 'Metric-Based' : 'Manual'}</span>
          <span class="b ${gBadge[g.status] || 'bk'}">${g.status}</span>
        </div>
      </div>
      <div class="g-cols">
        <div><div class="g-col-lbl">Goal Type</div><div class="g-col-val">${isMetric ? 'Metric-Based' : 'Manual'}</div></div>
        <div><div class="g-col-lbl">Target</div><div class="g-col-val">${esc(targetDisplay)}</div></div>
        <div><div class="g-col-lbl">Current Progress</div><div class="g-col-val">${esc(progressDisplay)}</div></div>
        <div><div class="g-col-lbl">Status</div><div class="g-col-val"><span class="b ${gBadge[g.status] || 'bk'}">${g.status}</span></div></div>
        <div><div class="g-col-lbl">Completion Date</div><div class="g-col-val">${completionDate}</div></div>
      </div>
      <div class="pbt"><div class="pbf ${gFill[g.status] || 'pb-b'}" style="width:${pct}%"></div></div>
      ${isMetric ? `<div style="font-size:11px;color:var(--tm);margin-top:4px">Auto-tracked from: ${esc(srcLabel)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--g10)">
        <span></span>
        <button class="edit-btn" data-type="goal" data-idx="${i}">&#9998; Edit</button>
      </div>
    </div>`;
  }).join('');
}

function editGoal(idx) {
  const list = S.get('ibm_template_goals', []);
  const g = list[idx];
  if (!g) return;
  const isMetric = g.type === 'metric';
  const statusOpts = ['Not Started','In Progress','Achieved','At Risk']
    .map(s => `<option value="${s}" ${g.status === s ? 'selected' : ''}>${s}</option>`).join('');
  const typeOpts = [['manual','Manual Goal'],['metric','Metric-Based Goal']]
    .map(([v,l]) => `<option value="${v}" ${(g.type||'manual') === v ? 'selected' : ''}>${l}</option>`).join('');
  const metricOpts = Object.entries(METRIC_SOURCES)
    .map(([v, s]) => `<option value="${v}" ${g.metricSource === v ? 'selected' : ''}>${s.label}</option>`).join('');
  EditModal.open('Edit Goal', `
    <div class="fgrid">
      <div class="fg"><label>Goal Name</label><input type="text" id="em-g-name" value="${esc(g.name)}"></div>
      <div class="fg"><label>Goal Type</label><select id="em-g-type" onchange="toggleEditGoalType()">${typeOpts}</select></div>
      <div class="fg"><label>Target Date</label><input type="date" id="em-g-date" value="${g.date||''}"></div>
      <div class="fg"><label>Status</label><select id="em-g-status">${statusOpts}</select></div>
      <div class="fg" id="em-g-pct-wrap" ${isMetric ? 'style="display:none"' : ''}><label>Current Progress % (0–100)</label><input type="number" id="em-g-pct" min="0" max="100" value="${g.pct||0}"></div>
      <div class="fg" id="em-g-target-wrap" ${isMetric ? 'style="display:none"' : ''}><label>Target (optional label)</label><input type="text" id="em-g-target" value="${esc(g.target||'')}"></div>
      <div class="fg" id="em-g-metric-wrap" ${!isMetric ? 'style="display:none"' : ''}><label>Metric Source</label><select id="em-g-metric">${metricOpts}</select></div>
      <div class="fg" id="em-g-mtarget-wrap" ${!isMetric ? 'style="display:none"' : ''}><label>Target Value</label><input type="number" id="em-g-mtarget" min="1" step="1" value="${g.metricTarget||''}"></div>
      <div class="fg full"><label>Description</label><textarea id="em-g-desc">${esc(g.desc||'')}</textarea></div>
    </div>`, function() {
    const name = mVal('em-g-name');
    if (!name) { alert('Goal name is required.'); return; }
    const newType = document.getElementById('em-g-type').value;
    const updated = Object.assign({}, g, {
      name,
      type:      newType,
      desc:      mVal('em-g-desc'),
      date:      mVal('em-g-date'),
      status:    document.getElementById('em-g-status').value,
      updatedAt: nowISO()
    });
    if (newType === 'metric') {
      const tv = document.getElementById('em-g-mtarget').value;
      if (!tv) { alert('Target value is required for metric goals.'); return; }
      updated.metricSource = document.getElementById('em-g-metric').value;
      updated.metricTarget = parseFloat(tv) || 0;
      delete updated.pct; delete updated.target;
    } else {
      updated.pct    = Math.min(100, Math.max(0, parseInt(document.getElementById('em-g-pct').value) || 0));
      updated.target = mVal('em-g-target');
      delete updated.metricSource; delete updated.metricTarget;
    }
    const wasAchieved = list[idx].status === 'Achieved';
    if (updated.status === 'Achieved' && !updated.completedDate) updated.completedDate = today();
    else if (updated.status !== 'Achieved') updated.completedDate = '';
    list[idx] = updated;
    S.set('ibm_template_goals', list);
    renderGoals(); updateDashboard();
    if (updated.status === 'Achieved' && !wasAchieved) { toast('🎉 Goal achieved!'); confetti(); }
    else { toast('Goal updated'); }
    EditModal.close();
  });
}

// Used inside the edit modal via inline onchange
function toggleEditGoalType() {
  const isMetric = document.getElementById('em-g-type').value === 'metric';
  document.getElementById('em-g-pct-wrap').style.display    = isMetric ? 'none' : '';
  document.getElementById('em-g-target-wrap').style.display = isMetric ? 'none' : '';
  document.getElementById('em-g-metric-wrap').style.display = isMetric ? '' : 'none';
  document.getElementById('em-g-mtarget-wrap').style.display = isMetric ? '' : 'none';
}

// ─────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────
const pjStatusBadge = { 'Not Started':'bk', 'In Progress':'bb', 'On Hold':'by', 'Complete':'bg' };
const pjStatusFill  = { 'Not Started':'pb-b', 'In Progress':'pb-b', 'On Hold':'pb-y', 'Complete':'pb-g' };
const pjStatusClass = { 'Not Started':'status-not-started', 'In Progress':'', 'On Hold':'status-on-hold', 'Complete':'status-complete' };

document.getElementById('save-project').addEventListener('click', function() {
  const title = val('pj-title');
  if (!title) { alert('Please enter a project title.'); return; }
  const collaborators = getMultiSelectValues('pj-collaborators');
  const list = S.get('ibm_template_projects', []);
  list.push({
    id: Date.now(),
    title,
    desc:        val('pj-desc'),
    cat:         document.getElementById('pj-cat').value,
    status:      document.getElementById('pj-status').value,
    pct:         Math.min(100, Math.max(0, parseInt(val('pj-pct')) || 0)),
    startDate:   val('pj-start'),
    endDate:     val('pj-end'),
    deliverables: val('pj-deliverables'),
    impact:      val('pj-impact'),
    collaborators,
    completedDate: document.getElementById('pj-status').value === 'Complete' ? today() : ''
  });
  S.set('ibm_template_projects', list);
  syncContactsForProject(title, collaborators, []);
  clear(['pj-title','pj-desc','pj-pct','pj-start','pj-end','pj-deliverables','pj-impact']);
  document.getElementById('pj-cat').value    = '';
  document.getElementById('pj-status').value = 'Not Started';
  document.getElementById('pj-collaborators-wrap').innerHTML = buildContactMultiSelect('pj-collaborators', []);
  populateProjectDropdown();
  renderProjects(); renderNetworking(); updateDashboard(); toast('Project saved');
});

document.getElementById('clear-project').addEventListener('click', function() {
  clear(['pj-title','pj-desc','pj-pct','pj-start','pj-end','pj-deliverables','pj-impact']);
  document.getElementById('pj-cat').value    = '';
  document.getElementById('pj-status').value = 'Not Started';
});

// Mark Complete handler (event delegation — button lives inside project cards)
document.body.addEventListener('click', function(e) {
  const mc = e.target.closest('.mark-complete-btn');
  if (!mc) return;
  const idx = parseInt(mc.dataset.idx);
  const list = S.get('ibm_template_projects', []);
  if (!list[idx]) return;
  if (!confirm('Mark "' + list[idx].title + '" as Complete?')) return;
  list[idx].status        = 'Complete';
  list[idx].pct           = 100;
  list[idx].completedDate = today();
  S.set('ibm_template_projects', list);
  populateProjectDropdown();
  renderProjects(); updateDashboard(); toast('🎉 Project marked complete!'); confetti();
});

function getProjectStats(projectTitle) {
  const acts = S.get('ibm_template_activities', []);
  const linked = acts.filter(a => a.proj === projectTitle);
  const totalHrs = linked.reduce((s, a) => s + (parseFloat(a.hrs) || 0), 0);
  const dates = linked.map(a => a.date).filter(Boolean).sort();
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  return { count: linked.length, totalHrs, lastDate };
}

function renderProjects() {
  const list = S.get('ibm_template_projects', []);
  const el = document.getElementById('proj-list');
  if (!list.length) {
    el.innerHTML = emptyState('📁', 'No projects yet', 'Add the projects you\'re working on this summer — track status, progress, and business impact all in one place.');
    return;
  }
  el.innerHTML = list.map((p, i) => {
    const stats = getProjectStats(p.title);
    const isComplete = p.status === 'Complete';
    const collabs = Array.isArray(p.collaborators) ? p.collaborators.filter(Boolean) : [];
    const collabChips = collabs.map(name => {
      const initials = name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
      const contacts = S.get('ibm_template_network', []);
      const ci = contacts.findIndex(c => c.name === name);
      const color = avColors[ci >= 0 ? ci % avColors.length : 0];
      return `<button class="collab-chip" data-jump="networking" title="${esc(name)} — click to view in Networking tab"><span class="collab-chip-av" style="background:${color}">${initials}</span>${esc(name)}</button>`;
    }).join('');
    return `
    <div class="pjc ${pjStatusClass[p.status] || ''}">
      <button class="del-btn" data-key="ibm_template_projects" data-idx="${i}" data-render="projects">&#10005;</button>
      <div class="pjc-head">
        <div>
          <div class="pjc-title">${esc(p.title)}</div>
          ${p.cat ? `<span class="b bpp" style="margin-top:2px">${esc(p.cat)}</span>` : ''}
        </div>
        <span class="b ${pjStatusBadge[p.status] || 'bk'}">${p.status}</span>
      </div>
      ${p.desc ? `<div class="pjc-desc">${esc(p.desc)}</div>` : ''}
      <div class="pjc-meta">
        ${p.startDate ? `<span>&#128197; Start: ${fmtDate(p.startDate)}</span>` : ''}
        ${p.endDate   ? `<span>&#127937; Target: ${fmtDate(p.endDate)}</span>` : ''}
        ${p.completedDate ? `<span style="color:var(--green)">&#10003; Completed: ${fmtDate(p.completedDate)}</span>` : ''}
      </div>
      <div class="pjc-prog">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--t2)">Progress</span><span style="font-weight:600">${p.pct}%</span>
        </div>
        <div class="pbt"><div class="pbf ${pjStatusFill[p.status] || 'pb-b'}" style="width:${p.pct}%"></div></div>
      </div>
      ${p.deliverables ? `<div style="font-size:12px;color:var(--t2);margin-bottom:6px"><strong>Key Deliverables:</strong> ${esc(p.deliverables)}</div>` : ''}
      ${p.impact ? `<div style="font-size:12px;color:var(--t2);margin-bottom:6px"><strong>Business Impact:</strong> ${esc(p.impact)}</div>` : ''}
      ${collabs.length ? `<div class="pjc-collabs"><span class="pjc-collabs-lbl">Collaborators</span><div class="pjc-collabs-chips">${collabChips}</div></div>` : ''}
      <div class="pjc-footer">
        <span class="pjc-linked">
          ${stats.count} linked activit${stats.count === 1 ? 'y' : 'ies'} &middot;
          ${stats.totalHrs % 1 === 0 ? stats.totalHrs : stats.totalHrs.toFixed(1)} hrs logged
          ${stats.lastDate ? ' &middot; Last activity: ' + fmtDate(stats.lastDate) : ''}
        </span>
        <div style="display:flex;gap:8px;align-items:center">
          ${!isComplete ? `<button class="btn bgr mark-complete-btn" style="padding:5px 13px;font-size:12px" data-idx="${i}">&#10003; Mark Complete</button>` : ''}
          <button class="edit-btn" data-type="project" data-idx="${i}">&#9998; Edit</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // Collaborator chip click → jump to networking tab
  el.querySelectorAll('.collab-chip[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.jump === 'networking' ? '5' : '3');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function editProject(idx) {
  const list = S.get('ibm_template_projects', []);
  const p = list[idx];
  if (!p) return;
  const catOpts = ['','Engineering','Data & Analytics','Design','Research','Operations','Strategy','Finance','HR','Other']
    .map(c => `<option value="${c}" ${p.cat === c ? 'selected' : ''}>${c || '-- Select --'}</option>`).join('');
  const statusOpts = ['Not Started','In Progress','On Hold','Complete']
    .map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('');
  const oldCollaborators = Array.isArray(p.collaborators) ? p.collaborators : [];
  EditModal.open('Edit Project', `
    <div class="fgrid">
      <div class="fg"><label>Project Title</label><input type="text" id="em-pj-title" value="${esc(p.title)}"></div>
      <div class="fg"><label>Project Category</label><select id="em-pj-cat">${catOpts}</select></div>
      <div class="fg"><label>Status</label><select id="em-pj-status">${statusOpts}</select></div>
      <div class="fg"><label>Progress % (0–100)</label><input type="number" id="em-pj-pct" min="0" max="100" value="${p.pct}"></div>
      <div class="fg"><label>Start Date</label><input type="date" id="em-pj-start" value="${p.startDate||''}"></div>
      <div class="fg"><label>Target Completion Date</label><input type="date" id="em-pj-end" value="${p.endDate||''}"></div>
      <div class="fg full"><label>Project Description</label><textarea id="em-pj-desc">${esc(p.desc||'')}</textarea></div>
      <div class="fg full"><label>Key Deliverables</label><textarea id="em-pj-deliverables">${esc(p.deliverables||'')}</textarea></div>
      <div class="fg full"><label>Business Impact / Notes</label><textarea id="em-pj-impact">${esc(p.impact||'')}</textarea></div>
      <div class="fg full"><label>Collaborators</label>${buildContactMultiSelect('em-pj-collaborators', oldCollaborators)}</div>
    </div>`, function() {
    const title = mVal('em-pj-title');
    if (!title) { alert('Project title is required.'); return; }
    const newStatus = document.getElementById('em-pj-status').value;
    const newCollaborators = getMultiSelectValues('em-pj-collaborators');
    const oldTitle = p.title;
    list[idx] = Object.assign({}, p, {
      title,
      cat:         document.getElementById('em-pj-cat').value,
      status:      newStatus,
      pct:         Math.min(100, Math.max(0, parseInt(document.getElementById('em-pj-pct').value) || 0)),
      startDate:   mVal('em-pj-start'),
      endDate:     mVal('em-pj-end'),
      desc:        mVal('em-pj-desc'),
      deliverables: mVal('em-pj-deliverables'),
      impact:      mVal('em-pj-impact'),
      collaborators: newCollaborators,
      completedDate: newStatus === 'Complete' ? (p.completedDate || today()) : p.completedDate,
      updatedAt:   nowISO()
    });
    const wasComplete = p.status === 'Complete';
    S.set('ibm_template_projects', list);
    if (newStatus === 'Complete' && !wasComplete) { toast('🎉 Project complete!'); confetti(); }
    else { toast('Project updated'); }
    // If title changed, update all contact project references
    if (title !== oldTitle) {
      const contacts = S.get('ibm_template_network', []);
      contacts.forEach(c => {
        if (Array.isArray(c.projects)) {
          const ti = c.projects.indexOf(oldTitle);
          if (ti !== -1) c.projects[ti] = title;
        }
      });
      S.set('ibm_template_network', contacts);
    }
    syncContactsForProject(title, newCollaborators, oldCollaborators);
    populateProjectDropdown();
    renderProjects(); renderNetworking(); updateDashboard();
    EditModal.close();
  });
}

// ─────────────────────────────────────
// LEARNING
// ─────────────────────────────────────
document.getElementById('save-course').addEventListener('click', function() {
  const name = val('l-name');
  if (!name) { alert('Please enter a course name.'); return; }
  const list = S.get('ibm_template_learning', []);
  list.unshift({
    name, prov: val('l-prov'), date: val('l-date'),
    hrs: parseFloat(val('l-hrs')) || 0,
    status: document.getElementById('l-status').value,
    skills: val('l-skills')
  });
  S.set('ibm_template_learning', list);
  clear(['l-name','l-prov','l-date','l-hrs','l-skills']);
  renderLearning(); toast('Course saved');
});

function renderLearning() {
  const list = S.get('ibm_template_learning', []);
  const sb = { 'Complete':'bg', 'In Progress':'by', 'Planned':'bk' };
  const tb = document.getElementById('learn-tbody');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="8">${emptyState('🎓', 'No courses or certifications logged yet', 'Track courses, certifications, and training — plus the skills you\'re picking up along the way.')}</td></tr>`;
  } else {
    tb.innerHTML = list.map((c, i) => `<tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.prov) || '—'}</td>
      <td style="white-space:nowrap">${fmtDate(c.date)}</td>
      <td>${c.hrs || '—'}</td>
      <td style="max-width:180px">${esc(c.skills) || '—'}</td>
      <td><span class="b ${sb[c.status] || 'bk'}">${c.status}</span></td>
      <td><button class="del-btn" data-key="ibm_template_learning" data-idx="${i}" data-render="learning">&#10005;</button></td>
      <td><button class="edit-btn" data-type="learning" data-idx="${i}">&#9998; Edit</button></td>
    </tr>`).join('');
  }
  const completed = list.filter(c => c.status === 'Complete').length;
  const totalHrs  = list.reduce((s, c) => s + (c.hrs || 0), 0);
  const allSkills = list.flatMap(c => c.skills ? c.skills.split(',').map(s => s.trim()).filter(Boolean) : []);
  document.getElementById('k-courses').textContent = completed;
  document.getElementById('k-lhrs').textContent    = totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1);
  document.getElementById('k-skills').textContent  = new Set(allSkills).size;
}

function editLearning(idx) {
  const list = S.get('ibm_template_learning', []);
  const c = list[idx];
  if (!c) return;
  const statusOpts = ['Complete','In Progress','Planned']
    .map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`).join('');
  EditModal.open('Edit Course / Certification', `
    <div class="fgrid">
      <div class="fg"><label>Course Name</label><input type="text" id="em-l-name" value="${esc(c.name)}"></div>
      <div class="fg"><label>Provider</label><input type="text" id="em-l-prov" value="${esc(c.prov||'')}"></div>
      <div class="fg"><label>Completion Date</label><input type="date" id="em-l-date" value="${c.date||''}"></div>
      <div class="fg"><label>Hours</label><input type="number" id="em-l-hrs" min="0.5" step="0.5" value="${c.hrs||''}"></div>
      <div class="fg"><label>Status</label><select id="em-l-status">${statusOpts}</select></div>
      <div class="fg full"><label>Skills Learned (comma-separated)</label><input type="text" id="em-l-skills" value="${esc(c.skills||'')}"></div>
    </div>`, function() {
    const name = mVal('em-l-name');
    if (!name) { alert('Course name is required.'); return; }
    list[idx] = Object.assign({}, c, {
      name,
      prov:   mVal('em-l-prov'),
      date:   mVal('em-l-date'),
      hrs:    parseFloat(document.getElementById('em-l-hrs').value) || 0,
      status: document.getElementById('em-l-status').value,
      skills: mVal('em-l-skills'),
      updatedAt: nowISO()
    });
    S.set('ibm_template_learning', list);
    renderLearning();
    EditModal.close(); toast('Course updated');
  });
}

// ─────────────────────────────────────
// NETWORKING
// ─────────────────────────────────────
const avColors = ['#1f70c1'];

// Sort state: false = newest first (default), true = oldest first
let netSortAsc = false;

document.getElementById('net-sort-btn').addEventListener('click', function() {
  netSortAsc = !netSortAsc;
  this.textContent = netSortAsc ? '↕ Oldest First' : '↕ Most Recent First';
  renderNetworking();
});

// Update date field label + visibility based on status selection in Add Contact form
document.getElementById('n-status').addEventListener('change', function() {
  const wrap = document.getElementById('n-date-wrap');
  const lbl  = document.getElementById('n-date-label');
  const inp  = document.getElementById('n-date');
  if (this.value === 'looking') {
    wrap.style.display = 'none';
    inp.value = '';
  } else {
    wrap.style.display = '';
    lbl.textContent = this.value === 'scheduled' ? 'Scheduled Date' : 'Date Met';
  }
});

// "Add another" recommendation row in the add-contact form
document.getElementById('n-add-rec-row').addEventListener('click', function() {
  const row = document.createElement('div');
  row.className = 'rec-input-row';
  row.innerHTML = '<input type="text" class="n-rec-input" placeholder="Name of person they suggested..."><button type="button" class="rec-remove-btn" title="Remove">&#10005;</button>';
  document.getElementById('n-recommends-list').appendChild(row);
  row.querySelector('.rec-remove-btn').addEventListener('click', () => row.remove());
});

document.getElementById('save-contact').addEventListener('click', function() {
  const name = val('n-name');
  if (!name) { alert('Please enter a contact name.'); return; }
  const status = document.getElementById('n-status').value;
  const recommends = Array.from(document.querySelectorAll('#n-recommends-list .n-rec-input'))
    .map(el => el.value.trim()).filter(Boolean);
  const projects = getMultiSelectValues('n-projects');
  const list = S.get('ibm_template_network', []);
  list.push({ name, team: val('n-team'), role: val('n-role'), status, date: status === 'looking' ? '' : val('n-date'), referredBy: val('n-referred-by'), recommends, notes: val('n-notes'), projects });
  S.set('ibm_template_network', list);
  syncProjectsForContact(name, projects, []);
  clear(['n-name','n-team','n-role','n-date','n-referred-by','n-notes']);
  // reset form state
  document.getElementById('n-recommends-list').innerHTML = '<div class="rec-input-row"><input type="text" class="n-rec-input" placeholder="Name of person they suggested..."></div>';
  document.getElementById('n-status').value = 'connected';
  const wrap = document.getElementById('n-date-wrap');
  document.getElementById('n-date-label').textContent = 'Date Met';
  wrap.style.display = '';
  document.getElementById('n-date').value = today();
  document.getElementById('n-projects-wrap').innerHTML = buildProjectMultiSelect('n-projects', []);
  renderNetworking(); renderProjects(); toast('Contact saved');
});

function addRecommendedContact(recommendedName, referrerName) {
  const list = S.get('ibm_template_network', []);
  const existing = list.find(c => c.name.toLowerCase() === recommendedName.toLowerCase());
  if (existing) {
    if (!existing.referredBy) {
      existing.referredBy = referrerName;
      existing.updatedAt = nowISO();
      S.set('ibm_template_network', list);
      renderNetworking();
      toast(`Updated "${recommendedName}" — referred by ${referrerName}`);
    }
  } else {
    list.push({ name: recommendedName, team: '', role: '', status: 'looking', date: '', referredBy: referrerName, recommends: [], notes: '' });
    S.set('ibm_template_network', list);
    renderNetworking();
    toast(`"${recommendedName}" added to your radar — recommended by ${referrerName}`);
  }
}

const NC_STATUS_BADGE  = { connected: 'bg', scheduled: 'by', looking: 'bk' };
const NC_STATUS_LABEL  = { connected: 'Connected', scheduled: 'Scheduled', looking: 'Looking to Connect' };
const NC_STATUS_DATE_LABEL = { connected: 'Met', scheduled: 'Chat Date', looking: '' };

function buildNetCard(c, i, idx, names) {
  const status = c.status || 'connected';
  const initials = c.name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
  const noteId = `nc-note-${idx}`;
  const recs = Array.isArray(c.recommends) ? c.recommends : (c.recommends ? [c.recommends] : []);
  const pendingRecs = recs.filter(r => r && !names.has(r.toLowerCase()));
  const referralHTML = pendingRecs.map(r =>
    `<div class="nc-referral"><span class="nc-referral-label">&#128172; Recommends you talk to:</span><span class="nc-referral-name">${esc(r)}</span><button class="nc-add-recommended btn bp" data-recommends="${esc(r)}" data-referrer="${esc(c.name)}">&#43; Add as Contact</button></div>`
  ).join('');
  const projList = Array.isArray(c.projects) ? c.projects.filter(Boolean) : [];
  const projBadges = projList.map(t =>
    `<button class="nc-proj-badge" data-jump="projects" title="${esc(t)} — click to view in Projects tab">${esc(t)}</button>`
  ).join('');
  const dateLbl = NC_STATUS_DATE_LABEL[status];
  const dateHTML = c.date && dateLbl ? `<span class="b bk">${dateLbl}: ${fmtDate(c.date)}</span>` : '';
  // promote buttons
  const promoteHTML = status === 'scheduled'
    ? `<button class="nc-promote btn bgr" data-idx="${i}" data-to="connected" title="Mark as Connected">&#10003; Mark Connected</button>`
    : status === 'looking'
    ? `<button class="nc-promote btn nc-promote-sched" data-idx="${i}" data-to="scheduled" title="Schedule a chat">&#128197; Schedule Chat</button>`
    : '';
  return `<div class="nc">
    <button class="del-btn" data-key="ibm_template_network" data-idx="${i}" data-render="networking">&#10005;</button>
    <div class="nav-av" style="background:${avColors[i % avColors.length]}">${initials}</div>
    <div class="nc-name">${esc(c.name)}</div>
    <div class="nc-role">${esc(c.role) || '—'}${c.team ? ' &mdash; ' + esc(c.team) : ''}</div>
    <div class="nc-meta">
      ${dateHTML}
      <span class="b ${NC_STATUS_BADGE[status]}">${NC_STATUS_LABEL[status]}</span>
      ${c.referredBy ? `<span class="b bb" title="Referred by ${esc(c.referredBy)}">via ${esc(c.referredBy)}</span>` : ''}
    </div>
    ${projList.length ? `<div class="nc-proj-row">${projBadges}</div>` : ''}
    ${referralHTML}
    ${c.notes ? `<div class="nc-notes" id="${noteId}">${esc(c.notes)}</div><button class="nc-more" data-note="${noteId}">more</button>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--g10)">
      ${promoteHTML}
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <button class="edit-btn" data-type="contact" data-idx="${i}">&#9998; Edit</button>
      </span>
    </div>
  </div>`;
}

function wireNetGrid(el, names) {
  el.querySelectorAll('.nc-proj-badge[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.jump === 'projects' ? '3' : '5');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  el.querySelectorAll('.nc-more').forEach(btn => {
    const noteEl = document.getElementById(btn.dataset.note);
    if (!noteEl) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', () => {
      const expanded = noteEl.classList.toggle('expanded');
      btn.textContent = expanded ? 'less' : 'more';
    });
  });
  el.querySelectorAll('.nc-add-recommended').forEach(btn => {
    btn.addEventListener('click', () => addRecommendedContact(btn.dataset.recommends, btn.dataset.referrer));
  });
  el.querySelectorAll('.nc-promote').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = S.get('ibm_template_network', []);
      const idx = parseInt(btn.dataset.idx, 10);
      const toStatus = btn.dataset.to;
      if (!list[idx]) return;
      list[idx].status = toStatus;
      if (toStatus === 'connected') {
        list[idx].date = today();
      } else if (toStatus === 'scheduled') {
        // open a small date prompt to schedule
        const d = prompt('Enter the scheduled chat date (YYYY-MM-DD):', today());
        if (d) list[idx].date = d;
      }
      list[idx].updatedAt = nowISO();
      S.set('ibm_template_network', list);
      renderNetworking();
      toast(toStatus === 'connected' ? 'Marked as Connected 🎉' : 'Chat scheduled!');
    });
  });
}

function renderNetworking() {
  const list = S.get('ibm_template_network', []);
  const names = new Set(list.map(c => c.name.toLowerCase()));
  document.getElementById('net-ct').textContent = list.length;
  document.getElementById('net-sched').textContent = list.filter(c => (c.status || 'connected') === 'scheduled').length;
  document.getElementById('net-radar').textContent = list.filter(c => (c.status || 'connected') === 'looking').length;
  document.getElementById('net-fu').textContent = list.filter(c => {
    const recs = Array.isArray(c.recommends) ? c.recommends : (c.recommends ? [c.recommends] : []);
    return recs.some(r => !names.has(r.toLowerCase()));
  }).length;

  const connectedEl  = document.getElementById('net-grid-connected');
  const scheduledEl  = document.getElementById('net-grid-scheduled');
  const lookingEl    = document.getElementById('net-grid-looking');

  if (!list.length) {
    connectedEl.innerHTML = emptyState('🤝', 'No contacts logged yet', 'Networking is one of the most valuable parts of your internship. Log every coffee chat, intro call, or hallway conversation.');
    scheduledEl.innerHTML = '';
    lookingEl.innerHTML = '';
    return;
  }

  const sortFn = (a, b) => {
    const da = a.c.date || '';
    const db = b.c.date || '';
    return netSortAsc ? da.localeCompare(db) : db.localeCompare(da);
  };

  const byStatus = { connected: [], scheduled: [], looking: [] };
  list.forEach((c, i) => {
    const s = c.status || 'connected';
    byStatus[s] = byStatus[s] || [];
    byStatus[s].push({ c, i });
  });

  function renderSection(el, items, sectionLabel, emptyMsg) {
    if (!items.length) { el.innerHTML = ''; return; }
    const sorted = [...items].sort(sortFn);
    let cardIdx = 0;
    el.innerHTML = `
      <div class="net-section-hdr">${sectionLabel} <span class="net-section-count">${items.length}</span></div>
      <div class="ngrid net-section-grid">${sorted.map(({ c, i }) => buildNetCard(c, i, cardIdx++, names)).join('')}</div>`;
    wireNetGrid(el, names);
  }

  renderSection(connectedEl,  byStatus.connected  || [], 'Connected',          '');
  renderSection(scheduledEl,  byStatus.scheduled  || [], 'Chats Scheduled',    '');
  renderSection(lookingEl,    byStatus.looking    || [], 'On Your Radar',       '');
}

function editContact(idx) {
  const list = S.get('ibm_template_network', []);
  const c = list[idx];
  if (!c) return;
  const recs = Array.isArray(c.recommends) ? c.recommends : (c.recommends ? [c.recommends] : []);
  const recsHTML = recs.length
    ? recs.map((r, ri) => `<div class="rec-input-row"><input type="text" class="em-rec-input" value="${esc(r)}" placeholder="Name..."><button type="button" class="rec-remove-btn" data-ri="${ri}" title="Remove">&#10005;</button></div>`).join('')
    : `<div class="rec-input-row"><input type="text" class="em-rec-input" placeholder="Name of person they suggested..."></div>`;
  const oldProjects = Array.isArray(c.projects) ? c.projects : [];
  const cStatus = c.status || 'connected';
  const emDateLabel = cStatus === 'scheduled' ? 'Scheduled Date' : 'Date Met';
  const emDateStyle = cStatus === 'looking' ? 'display:none' : '';
  EditModal.open('Edit Contact', `
    <div class="fgrid">
      <div class="fg"><label>Contact Name</label><input type="text" id="em-n-name" value="${esc(c.name)}"></div>
      <div class="fg"><label>Team / Division</label><input type="text" id="em-n-team" value="${esc(c.team||'')}"></div>
      <div class="fg"><label>Role / Title</label><input type="text" id="em-n-role" value="${esc(c.role||'')}"></div>
      <div class="fg">
        <label>Connection Status</label>
        <select id="em-n-status">
          <option value="looking"${cStatus==='looking'?' selected':''}>Looking to Connect</option>
          <option value="scheduled"${cStatus==='scheduled'?' selected':''}>Scheduled</option>
          <option value="connected"${cStatus==='connected'?' selected':''}>Connected</option>
        </select>
      </div>
      <div class="fg" id="em-n-date-wrap" style="${emDateStyle}"><label id="em-n-date-label">${emDateLabel}</label><input type="date" id="em-n-date" value="${c.date||''}"></div>
      <div class="fg"><label>Referred to you by</label><input type="text" id="em-n-referred-by" value="${esc(c.referredBy||'')}"></div>
      <div class="fg full"><label>They recommend you talk to</label>
        <div id="em-recommends-list">${recsHTML}</div>
        <button type="button" class="nc-more" id="em-add-rec-row" style="margin-top:4px">&#43; Add another</button>
      </div>
      <div class="fg full"><label>Notes</label><textarea id="em-n-notes">${esc(c.notes||'')}</textarea></div>
      <div class="fg full"><label>Linked Projects</label>${buildProjectMultiSelect('em-n-projects', oldProjects)}</div>
    </div>`, function() {
    const name = mVal('em-n-name');
    if (!name) { alert('Contact name is required.'); return; }
    const newStatus = document.getElementById('em-n-status').value;
    const recommends = Array.from(document.querySelectorAll('#em-recommends-list .em-rec-input'))
      .map(el => el.value.trim()).filter(Boolean);
    const newProjects = getMultiSelectValues('em-n-projects');
    const oldName = c.name;
    list[idx] = Object.assign({}, c, {
      name,
      team:        mVal('em-n-team'),
      role:        mVal('em-n-role'),
      status:      newStatus,
      date:        newStatus === 'looking' ? '' : mVal('em-n-date'),
      referredBy:  mVal('em-n-referred-by'),
      recommends,
      notes:       mVal('em-n-notes'),
      projects:    newProjects,
      updatedAt:   nowISO()
    });
    S.set('ibm_template_network', list);
    // If name changed, update all project collaborator references
    if (name !== oldName) {
      const projects = S.get('ibm_template_projects', []);
      projects.forEach(p => {
        if (Array.isArray(p.collaborators)) {
          const ci = p.collaborators.indexOf(oldName);
          if (ci !== -1) p.collaborators[ci] = name;
        }
      });
      S.set('ibm_template_projects', projects);
    }
    syncProjectsForContact(name, newProjects, oldProjects);
    renderNetworking(); renderProjects();
    EditModal.close(); toast('Contact updated');
  });
  // wire up add/remove buttons inside the modal (modal is in DOM immediately after open)
  setTimeout(() => {
    // wire status → date field in edit modal
    const emStatus = document.getElementById('em-n-status');
    const emDateWrap = document.getElementById('em-n-date-wrap');
    const emDateLbl  = document.getElementById('em-n-date-label');
    if (emStatus) {
      emStatus.addEventListener('change', function() {
        if (this.value === 'looking') {
          emDateWrap.style.display = 'none';
        } else {
          emDateWrap.style.display = '';
          emDateLbl.textContent = this.value === 'scheduled' ? 'Scheduled Date' : 'Date Met';
        }
      });
    }
    const addBtn = document.getElementById('em-add-rec-row');
    if (addBtn) addBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'rec-input-row';
      row.innerHTML = '<input type="text" class="em-rec-input" placeholder="Name of person they suggested..."><button type="button" class="rec-remove-btn" title="Remove">&#10005;</button>';
      document.getElementById('em-recommends-list').appendChild(row);
      row.querySelector('.rec-remove-btn').addEventListener('click', () => row.remove());
    });
    document.querySelectorAll('#em-recommends-list .rec-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.rec-input-row').remove());
    });
  }, 0);
}

// ─────────────────────────────────────
// REFLECTIONS
// ─────────────────────────────────────
document.getElementById('save-reflect').addEventListener('click', function() {
  const week = val('r-week');
  if (!week) { alert('Please select a week ending date.'); return; }
  const list = S.get('ibm_template_reflections', []);
  list.unshift({
    week, rating: document.getElementById('r-rating').value,
    acc: val('r-acc'), chal: val('r-chal'), learn: val('r-learn'), next: val('r-next')
  });
  S.set('ibm_template_reflections', list);
  clear(['r-week','r-acc','r-chal','r-learn','r-next']);
  document.getElementById('r-week').value = today();
  renderReflections(); toast('Reflection saved');
});

function renderReflections() {
  const list = S.get('ibm_template_reflections', []);
  const tb = document.getElementById('ref-tbody');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="6">${emptyState('📝', 'No weekly reflections yet', 'Take 5 minutes at the end of each week to log your biggest win, a challenge, and what you learned. You\'ll thank yourself at review time.')}</td></tr>`;
    return;
  }
  const rb = { 'Excellent week':'bg', 'Good week':'bb', 'Challenging week':'by', 'Difficult week':'br' };
  tb.innerHTML = list.map((r, i) => `<tr>
    <td style="white-space:nowrap">${fmtDate(r.week)}</td>
    <td><span class="b ${rb[r.rating] || 'bk'}">${r.rating}</span></td>
    <td style="max-width:200px">${esc(r.acc) || '—'}</td>
    <td style="max-width:200px">${esc(r.learn) || '—'}</td>
    <td><button class="del-btn" data-key="ibm_template_reflections" data-idx="${i}" data-render="reflections">&#10005;</button></td>
    <td><button class="edit-btn" data-type="reflection" data-idx="${i}">&#9998; Edit</button></td>
  </tr>`).join('');
}

function editReflection(idx) {
  const list = S.get('ibm_template_reflections', []);
  const r = list[idx];
  if (!r) return;
  const ratingOpts = ['Excellent week','Good week','Challenging week','Difficult week']
    .map(v => `<option value="${v}" ${r.rating === v ? 'selected' : ''}>${v}</option>`).join('');
  EditModal.open('Edit Weekly Reflection', `
    <div class="fgrid">
      <div class="fg"><label>Week Ending</label><input type="date" id="em-r-week" value="${r.week||''}"></div>
      <div class="fg"><label>Overall Rating</label><select id="em-r-rating">${ratingOpts}</select></div>
      <div class="fg full"><label>Biggest Accomplishment</label><textarea id="em-r-acc">${esc(r.acc||'')}</textarea></div>
      <div class="fg full"><label>Biggest Challenge</label><textarea id="em-r-chal">${esc(r.chal||'')}</textarea></div>
      <div class="fg full"><label>Key Learning</label><textarea id="em-r-learn">${esc(r.learn||'')}</textarea></div>
      <div class="fg full"><label>Next Week Priorities</label><textarea id="em-r-next">${esc(r.next||'')}</textarea></div>
    </div>`, function() {
    const week = mVal('em-r-week');
    if (!week) { alert('Week ending date is required.'); return; }
    list[idx] = Object.assign({}, r, {
      week,
      rating: document.getElementById('em-r-rating').value,
      acc:    mVal('em-r-acc'),
      chal:   mVal('em-r-chal'),
      learn:  mVal('em-r-learn'),
      next:   mVal('em-r-next'),
      updatedAt: nowISO()
    });
    S.set('ibm_template_reflections', list);
    renderReflections();
    EditModal.close(); toast('Reflection updated');
  });
}

// ─────────────────────────────────────
// DASHBOARD UPDATE
// ─────────────────────────────────────
const BAR_COLORS = ['#0f62fe','#1f70c1','#005d5d','#e0a208','#da1e28','#198038','#00539a','#0043ce'];

function makeBarChart(items, colorOverride) {
  if (!items.length) return '<p class="empty-msg">No data yet.</p>';
  const max = Math.max(...items.map(i => i.value), 1);
  return '<div class="chart-wrap">' + items.map((item, idx) => {
    const pct = Math.round((item.value / max) * 100);
    const color = colorOverride || BAR_COLORS[idx % BAR_COLORS.length];
    const display = item.value % 1 === 0 ? item.value : item.value.toFixed(1);
    return `<div class="chart-row">
      <div class="chart-lbl" title="${esc(item.label)}">${esc(item.label)}</div>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="chart-val">${display}</div>
    </div>`;
  }).join('') + '</div>';
}

function updateDashboard() {
  if (autoAdvanceGoals()) renderGoals();

  const acts     = S.get('ibm_template_activities', []);
  const goals    = S.get('ibm_template_goals', []);
  const projects = S.get('ibm_template_projects', []);

  // ── KPIs ──
  const totalHrs = acts.reduce((s, a) => s + (parseFloat(a.hrs) || 0), 0);
  document.getElementById('k-hrs').textContent = totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1);

  const activeProjs    = projects.filter(p => p.status === 'In Progress' || p.status === 'Not Started').length;
  const completedProjs = projects.filter(p => p.status === 'Complete').length;
  document.getElementById('k-active-proj').textContent = activeProjs;
  document.getElementById('k-done-proj').textContent   = completedProjs;

  const achieved = goals.filter(g => g.status === 'Achieved').length;
  document.getElementById('k-goals').textContent = goals.length ? achieved + '/' + goals.length : '0';

  // ── Project Status Summary ──
  document.getElementById('ps-notstarted').textContent = projects.filter(p => p.status === 'Not Started').length;
  document.getElementById('ps-inprogress').textContent = projects.filter(p => p.status === 'In Progress').length;
  document.getElementById('ps-onhold').textContent     = projects.filter(p => p.status === 'On Hold').length;
  document.getElementById('ps-complete').textContent   = completedProjs;

  // ── Hours by Project ──
  const hbpEl = document.getElementById('dash-hrs-by-proj');
  const projHrsMap = {};
  acts.forEach(a => {
    if (a.proj) projHrsMap[a.proj] = (projHrsMap[a.proj] || 0) + (parseFloat(a.hrs) || 0);
  });
  const projHrsItems = Object.entries(projHrsMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  hbpEl.innerHTML = projHrsItems.length
    ? makeBarChart(projHrsItems, '#0f62fe')
    : '<p class="empty-msg">No project-linked activities yet.</p>';

  // ── Activity Breakdown by Category ──
  const catEl = document.getElementById('dash-cat-breakdown');
  const catMap = {};
  acts.forEach(a => { if (a.cat) catMap[a.cat] = (catMap[a.cat] || 0) + 1; });
  const catItems = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
  catEl.innerHTML = catItems.length
    ? makeBarChart(catItems)
    : '<p class="empty-msg">No activities logged yet.</p>';

  // ── Goal Progress ──
  const dg = document.getElementById('dash-goals');
  if (!goals.length) {
    dg.innerHTML = '<p class="empty-msg">No goals yet — add some in the Goals tab.</p>';
  } else {
    dg.innerHTML = goals.slice(0, 6).map(g => {
      const { pct } = goalProgress(g);
      return `<div class="pb">
        <div class="pbr"><span class="pbl">${esc(g.name)}</span><span class="pbp">${pct}%</span></div>
        <div class="pbt"><div class="pbf ${gFill[g.status] || 'pb-b'}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  // ── Active vs Completed Projects visualization ──
  const pcEl = document.getElementById('dash-proj-chart');
  if (!projects.length) {
    pcEl.innerHTML = '<p class="empty-msg">No projects yet — add some in the Projects tab.</p>';
  } else {
    const buckets = [
      { label: 'In Progress',  value: projects.filter(p => p.status === 'In Progress').length,  color: '#0f62fe' },
      { label: 'Not Started',  value: projects.filter(p => p.status === 'Not Started').length,  color: '#8d8d8d' },
      { label: 'On Hold',      value: projects.filter(p => p.status === 'On Hold').length,      color: '#e0a208' },
      { label: 'Complete',     value: projects.filter(p => p.status === 'Complete').length,     color: '#198038' },
    ].filter(b => b.value > 0);
    pcEl.innerHTML = '<div class="chart-wrap">' + buckets.map(b => {
      const max = Math.max(...buckets.map(x => x.value), 1);
      const pct = Math.round((b.value / max) * 100);
      return `<div class="chart-row">
        <div class="chart-lbl">${b.label}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${b.color}"></div></div>
        <div class="chart-val">${b.value}</div>
      </div>`;
    }).join('') + '</div>';
  }
  // ── Activity Heatmap ──
  renderHeatmap(acts);
}

// ─────────────────────────────────────
// HEATMAP
// ─────────────────────────────────────
function renderHeatmap(acts) {
  const el = document.getElementById('dash-heatmap');
  const p  = S.get('ibm_template_profile', {});

  // Build date→hours map from activities
  const dayMap = {};
  acts.forEach(a => {
    if (a.date) dayMap[a.date] = (dayMap[a.date] || 0) + (parseFloat(a.hrs) || 0);
  });

  if (!Object.keys(dayMap).length && !(p.start && p.end)) {
    el.innerHTML = '<p class="empty-msg">Log some activities to see your heatmap.</p>';
    return;
  }

  // Determine range: use profile dates if set, else earliest→latest activity date
  let rangeStart, rangeEnd;
  if (p.start && p.end) {
    rangeStart = new Date(p.start + 'T00:00:00');
    rangeEnd   = new Date(p.end   + 'T00:00:00');
  } else {
    const dates = Object.keys(dayMap).sort();
    rangeStart = new Date(dates[0] + 'T00:00:00');
    rangeEnd   = new Date(dates[dates.length - 1] + 'T00:00:00');
  }

  const todayStr = today();

  // Intensity thresholds (hours → level class)
  function levelClass(hrs) {
    if (!hrs) return '';
    if (hrs < 2)  return 'l1';
    if (hrs < 4)  return 'l2';
    if (hrs < 6)  return 'l3';
    return 'l4';
  }

  // Advance rangeStart back to the nearest Sunday so columns line up Mon-Sun
  const startDay = rangeStart.getDay(); // 0=Sun
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - startDay);

  // Build columns (each column = one week, Sun→Sat)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_LABELS = ['','M','','W','','F','']; // only show M/W/F to avoid crowding

  let columns = [];     // array of 7-cell arrays
  let monthLabels = []; // { colIdx, label }
  let cur = new Date(gridStart);
  let colIdx = 0;

  while (cur <= rangeEnd) {
    let col = [];
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().split('T')[0];
      const dow = cur.getDay(); // 0=Sun, 6=Sat
      const isWeekend  = dow === 0 || dow === 6;
      const isFuture   = iso > todayStr;
      const isInRange  = cur >= rangeStart && cur <= rangeEnd;
      const hrs        = dayMap[iso] || 0;
      col.push({ iso, dow, isWeekend, isFuture, isInRange, hrs });
      // Track month label at first day of month that falls in range
      if (cur.getDate() === 1 && isInRange) {
        monthLabels.push({ colIdx, label: MONTHS[cur.getMonth()] });
      }
      cur.setDate(cur.getDate() + 1);
    }
    columns.push(col);
    colIdx++;
  }

  // Build month label row
  let monthRowHTML = '';
  for (let i = 0; i < columns.length; i++) {
    const ml = monthLabels.find(m => m.colIdx === i);
    monthRowHTML += `<div class="heatmap-month-lbl" style="width:13px;min-width:13px">${ml ? ml.label : ''}</div>`;
  }

  // Build cell grid
  const colsHTML = columns.map(col => {
    const cells = col.map(c => {
      if (!c.isInRange) return `<div class="heatmap-cell future" title=""></div>`;
      const cls = c.isWeekend ? 'weekend' : (c.isFuture ? 'future' : levelClass(c.hrs));
      const tip = c.isWeekend
        ? `${c.iso} (weekend)`
        : c.isFuture
          ? c.iso
          : `${c.iso} — ${c.hrs ? c.hrs.toFixed(1) + ' hrs' : 'no activity'}`;
      return `<div class="heatmap-cell${cls ? ' ' + cls : ''}" title="${tip}"></div>`;
    }).join('');
    return `<div class="heatmap-col">${cells}</div>`;
  }).join('');

  // Day-of-week labels (left side)
  const dayLabelsHTML = DAY_LABELS.map(l =>
    `<div class="heatmap-day-lbl">${l}</div>`
  ).join('');

  el.innerHTML = `
    <div class="heatmap-wrap">
      <div style="display:flex;gap:3px;margin-bottom:4px;padding-left:28px">
        ${monthRowHTML}
      </div>
      <div style="display:flex">
        <div class="heatmap-day-labels">${dayLabelsHTML}</div>
        <div class="heatmap-grid">${colsHTML}</div>
      </div>
      <div class="heatmap-legend">
        Less
        <div class="heatmap-legend-cell" style="background:var(--g10)"></div>
        <div class="heatmap-legend-cell" style="background:#c5e0ff"></div>
        <div class="heatmap-legend-cell" style="background:#6baed6"></div>
        <div class="heatmap-legend-cell" style="background:#2171b5"></div>
        <div class="heatmap-legend-cell" style="background:#084594"></div>
        More
      </div>
    </div>`;
}

// ─────────────────────────────────────
// TASKS
// ─────────────────────────────────────
const TK_LISTS = ['todo', 'watch', 'later', 'done'];
const TK_PRIORITY_BADGE = { high: 'br', normal: 'bb', low: 'bk' };
const TK_PRIORITY_LABEL = { high: 'High', normal: 'Normal', low: 'Low' };

document.getElementById('save-task').addEventListener('click', function() {
  const title = val('tk-title');
  if (!title) { alert('Please enter a task title.'); return; }
  const tasks = S.get('ibm_template_tasks', []);
  tasks.unshift({
    id:       Date.now(),
    title,
    list:     document.getElementById('tk-list').value,
    priority: document.getElementById('tk-priority').value,
    due:      val('tk-due'),
    notes:    val('tk-notes'),
    created:  nowISO(),
    completedAt: null
  });
  S.set('ibm_template_tasks', tasks);
  clear(['tk-title', 'tk-due', 'tk-notes']);
  document.getElementById('tk-list').value     = 'todo';
  document.getElementById('tk-priority').value = 'normal';
  renderTasks();
  toast('Task added!');
});

function renderTasks() {
  const tasks  = S.get('ibm_template_tasks', []);
  const buckets = { todo: [], watch: [], later: [], done: [] };
  tasks.forEach((t, i) => { if (buckets[t.list]) buckets[t.list].push({ t, i }); });

  TK_LISTS.forEach(list => {
    const el    = document.getElementById('tk-list-' + list);
    const count = document.getElementById('tk-count-' + list);
    count.textContent = buckets[list].length;

    if (!buckets[list].length) {
      el.innerHTML = '<p class="empty-msg" style="padding:12px 8px;text-align:center;font-size:12px;color:var(--tm)">Nothing here yet</p>';
      return;
    }

    el.innerHTML = buckets[list].map(({ t, i }) => {
      const isDone  = list === 'done';
      const dueHtml = t.due
        ? `<span class="tk-due ${isPastDue(t.due) && !isDone ? 'tk-overdue' : ''}">${fmtDate(t.due)}</span>`
        : '';
      const moveBtns = TK_LISTS.filter(l => l !== list).map(l =>
        `<button class="tk-move-btn" data-idx="${i}" data-to="${l}" title="Move to ${l}">${tkListLabel(l)}</button>`
      ).join('');
      return `
        <div class="tk-card ${isDone ? 'tk-card-done' : ''}" data-idx="${i}">
          <div class="tk-card-top">
            <span class="b ${TK_PRIORITY_BADGE[t.priority] || 'bb'}">${TK_PRIORITY_LABEL[t.priority] || t.priority}</span>
            ${dueHtml}
            <div class="tk-card-actions">
              <button class="edit-btn" data-type="task" data-idx="${i}" title="Edit">Edit</button>
              <button class="del-btn" data-key="ibm_template_tasks" data-idx="${i}" data-render="tasks" title="Delete">Delete</button>
            </div>
          </div>
          <div class="tk-card-title ${isDone ? 'tk-strikethrough' : ''}">${esc(t.title)}</div>
          ${t.notes ? `<div class="tk-card-notes">${esc(t.notes)}</div>` : ''}
          <div class="tk-move-row">${moveBtns}</div>
        </div>`;
    }).join('');
  });
}

function isPastDue(dateStr) {
  return dateStr && new Date(dateStr) < new Date(today());
}

function tkListLabel(l) {
  return { todo: '→ To-Do', watch: '→ Watch', later: '→ Later', done: '✓ Done' }[l] || l;
}

// Move task between lists
document.body.addEventListener('click', function(e) {
  const btn = e.target.closest('.tk-move-btn');
  if (!btn) return;
  const idx   = parseInt(btn.dataset.idx);
  const toList = btn.dataset.to;
  const tasks = S.get('ibm_template_tasks', []);
  if (!tasks[idx]) return;
  tasks[idx].list = toList;
  tasks[idx].completedAt = toList === 'done' ? nowISO() : null;
  S.set('ibm_template_tasks', tasks);
  renderTasks();
  toast('Moved to ' + tkListLabel(toList).replace('→ ', '').replace('✓ ', ''));
});

// Edit task
function editTask(idx) {
  const tasks = S.get('ibm_template_tasks', []);
  const t = tasks[idx];
  if (!t) return;
  EditModal.open('Edit Task', `
    <div class="fgrid">
      <div class="fg full"><label>Task Title</label><input type="text" id="et-title" value="${esc(t.title)}"></div>
      <div class="fg"><label>List</label>
        <select id="et-list">
          ${TK_LISTS.map(l => `<option value="${l}" ${t.list===l?'selected':''}>${tkListLabel(l).replace('→ ','').replace('✓ ','')}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Priority</label>
        <select id="et-priority">
          <option value="high"   ${t.priority==='high'  ?'selected':''}>High</option>
          <option value="normal" ${t.priority==='normal'?'selected':''}>Normal</option>
          <option value="low"    ${t.priority==='low'   ?'selected':''}>Low</option>
        </select>
      </div>
      <div class="fg"><label>Due Date</label><input type="date" id="et-due" value="${t.due||''}"></div>
      <div class="fg full"><label>Notes</label><textarea id="et-notes">${esc(t.notes||'')}</textarea></div>
    </div>`, function() {
    tasks[idx].title    = mVal('et-title')  || t.title;
    tasks[idx].list     = mVal('et-list')   || t.list;
    tasks[idx].priority = mVal('et-priority') || t.priority;
    tasks[idx].due      = mVal('et-due');
    tasks[idx].notes    = mVal('et-notes');
    tasks[idx].completedAt = tasks[idx].list === 'done' ? (t.completedAt || nowISO()) : null;
    S.set('ibm_template_tasks', tasks);
    renderTasks();
  });
}

// ─────────────────────────────────────
// DELETE (event delegation)
// ─────────────────────────────────────
const renderMap = {
  activities: () => { renderActivities(); updateDashboard(); },
  goals:      () => { renderGoals(); updateDashboard(); },
  projects:   () => { renderProjects(); populateProjectDropdown(); updateDashboard(); },
  learning:   renderLearning,
  networking: renderNetworking,
  reflections: renderReflections,
  tasks:      renderTasks
};

document.body.addEventListener('click', function(e) {
  const btn = e.target.closest('.del-btn');
  if (!btn) return;
  if (!confirm('Delete this entry?')) return;
  const key    = btn.dataset.key;
  const idx    = parseInt(btn.dataset.idx);
  const render = btn.dataset.render;
  const list   = S.get(key, []);
  const deleted = list[idx];
  // Clean up cross-links before splicing
  if (key === 'ibm_template_network' && deleted) {
    removeContactFromAllProjects(deleted.name);
  } else if (key === 'ibm_template_projects' && deleted) {
    removeProjectFromAllContacts(deleted.title);
  }
  list.splice(idx, 1);
  S.set(key, list);
  // Re-render both sides if a linked entity was deleted
  if (key === 'ibm_template_network') {
    renderProjects();
  } else if (key === 'ibm_template_projects') {
    renderNetworking();
    populateProjectDropdown();
  }
  if (renderMap[render]) renderMap[render]();
  toast('Deleted');
});

// ─────────────────────────────────────
// EDIT (event delegation)
// ─────────────────────────────────────
document.body.addEventListener('click', function(e) {
  const btn = e.target.closest('.edit-btn');
  if (!btn) return;
  const type = btn.dataset.type;
  const idx  = parseInt(btn.dataset.idx);
  if (type === 'activity')   editActivity(idx);
  else if (type === 'goal')       editGoal(idx);
  else if (type === 'project')    editProject(idx);
  else if (type === 'learning')   editLearning(idx);
  else if (type === 'contact')    editContact(idx);
  else if (type === 'reflection') editReflection(idx);
  else if (type === 'task')       editTask(idx);
});

// ─────────────────────────────────────
// AI GENERATION
// ─────────────────────────────────────
function showAI(elId, text) {
  const el = document.getElementById(elId);
  el.textContent = text;
  el.classList.add('show');
}

// ─────────────────────────────────────
// EXPORT
// ─────────────────────────────────────
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportHTML(data, sections) {
  const inc  = sections || ['summary','goals','projects','activities','learning','networking','reflections','tasks'];
  const has  = k => inc.includes(k);

  const p    = data.profile     || {};
  const acts = data.activities  || [];
  const gols = data.goals       || [];
  const proj = data.projects    || [];
  const lrn  = data.learning    || [];
  const net  = data.networking  || [];
  const refs = data.reflections || [];
  const tsks = data.tasks       || [];
  const now  = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  const totalHrs = acts.reduce((s, a) => s + (parseFloat(a.hrs) || 0), 0);
  const achieved = gols.filter(g => g.status === 'Achieved').length;
  const donePrj  = proj.filter(j => j.status === 'Complete').length;
  const lrnDone  = lrn.filter(l => l.status === 'Complete').length;
  const allSkills = [...new Set(lrn.flatMap(l => (l.skills||'').split(',').map(s=>s.trim()).filter(Boolean)))];

  // ── helpers ──────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // status → { bg, fg, bar } using dashboard palette
  function statusTheme(s) {
    return {
      'Complete':      { bg:'#defbe6', fg:'#0e6027', bar:'#198038' },
      'Achieved':      { bg:'#defbe6', fg:'#0e6027', bar:'#198038' },
      'In Progress':   { bg:'#e8f0fe', fg:'#0043ce', bar:'#0f62fe' },
      'Not Started':   { bg:'#f4f4f4', fg:'#525252', bar:'#8d8d8d' },
      'On Hold':       { bg:'#fdf6dd', fg:'#7a5900', bar:'#e0a208' },
      'At Risk':       { bg:'#fff1f1', fg:'#da1e28', bar:'#da1e28' },
      'Planned':       { bg:'#f4f4f4', fg:'#525252', bar:'#8d8d8d' },
    }[s] || { bg:'#f4f4f4', fg:'#525252', bar:'#8d8d8d' };
  }
  function badge(txt) {
    const t = statusTheme(txt);
    return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${t.bg};color:${t.fg}">${esc(txt)}</span>`;
  }
  function hrow(...cells) { return '<tr>' + cells.map(c=>`<th>${esc(c)}</th>`).join('') + '</tr>'; }
  function row(...cells)  { return '<tr>' + cells.map(c=>`<td>${typeof c === 'string' && c.startsWith('<') ? c : esc(c)}</td>`).join('') + '</tr>'; }

  const section = (title, content) => `
    <div class="rpt-section">
      <div class="rpt-sh"><h2>${esc(title)}</h2></div>
      ${content}
    </div>`;

  const table = (headers, bodyRows, emptyMsg) => bodyRows.length === 0
    ? `<p class="rpt-empty">${emptyMsg}</p>`
    : `<div class="rpt-tw"><table><thead>${hrow(...headers)}</thead><tbody>${bodyRows.join('')}</tbody></table></div>`;

  const kpiTile = (label, value, accent) =>
    `<div class="rpt-kpi" style="border-top-color:${accent}">
       <div class="rpt-kv">${esc(String(value))}</div>
       <div class="rpt-kl">${esc(label)}</div>
     </div>`;

  // ── summary cover ──────────────────────────────────────
  const summaryHTML = has('summary') ? `
    <div class="rpt-cover">
      <div class="rpt-cover-brand">
        <span class="rpt-ibm">IBM</span>
        <span class="rpt-cover-sub">Internship Report</span>
      </div>
      <h1 class="rpt-cover-name">${esc(p.name || '—')}</h1>
      <div class="rpt-cover-meta">${esc(p.role||'')}${p.role&&p.team?' · ':''}${esc(p.team||'')}</div>
      <div class="rpt-cover-dates">${p.start&&p.end ? fmtDate(p.start)+' – '+fmtDate(p.end) : ''}</div>
      <div class="rpt-kgrid">
        ${kpiTile('Hours Logged',      totalHrs % 1 === 0 ? totalHrs : totalHrs.toFixed(1), '#0f62fe')}
        ${kpiTile('Goals Achieved',    achieved + ' / ' + gols.length,  '#198038')}
        ${kpiTile('Projects Complete', donePrj  + ' / ' + proj.length,  '#1f70c1')}
        ${kpiTile('Courses Complete',  lrnDone  + ' / ' + lrn.length,   '#005d5d')}
        ${kpiTile('Contacts Made',     net.length,                       '#ff832b')}
      </div>
    </div>` : '';

  // ── goals ──────────────────────────────────────────────
  const goalsHTML = has('goals') ? section('Goals & Objectives', table(
    ['Goal','Type','Status','Progress','Target Date'],
    gols.map(g => row(
      g.name,
      g.type === 'metric' ? 'Metric' : 'Manual',
      badge(g.status),
      g.type === 'metric' ? (g.metricCurrent||0)+' / '+(g.metricTarget||'?') : (g.pct||0)+'%',
      g.date ? fmtDate(g.date) : '—'
    )),
    'No goals recorded yet.'
  )) : '';

  // ── projects ───────────────────────────────────────────
  const projectsHTML = has('projects') ? section('Projects', (() => {
    if (!proj.length) return '<p class="rpt-empty">No projects recorded yet.</p>';
    return proj.map(j => {
      const t = statusTheme(j.status);
      const pct = Math.min(100, parseInt(j.pct) || 0);
      return `<div class="rpt-pjc" style="border-left-color:${t.bar}">
        <div class="rpt-pjc-head">
          <strong class="rpt-pjc-title">${esc(j.title)}</strong>
          ${badge(j.status)}
        </div>
        ${j.cat ? `<div class="rpt-pjc-cat">${esc(j.cat)}</div>` : ''}
        <div class="rpt-pb-track"><div class="rpt-pb-fill" style="width:${pct}%;background:${t.bar}"></div></div>
        ${j.desc   ? `<div class="rpt-pjc-desc">${esc(j.desc)}</div>` : ''}
        ${j.impact ? `<div class="rpt-pjc-impact"><em>Impact:</em> ${esc(j.impact)}</div>` : ''}
      </div>`;
    }).join('');
  })()) : '';

  // ── activities ─────────────────────────────────────────
  const activitiesHTML = has('activities') ? section('Daily Activity Log', table(
    ['Date','Description','Project','Hrs','Category','Notes'],
    acts.map(a => row(
      a.date ? fmtDate(a.date) : '—',
      a.desc, a.proj||'—', a.hrs||'—', a.cat||'—', a.notes||'—'
    )),
    'No activities logged yet.'
  )) : '';

  // ── learning ───────────────────────────────────────────
  const learningHTML = has('learning') ? section('Learning & Certifications', (() => {
    const tbl = table(
      ['Course','Provider','Date','Hrs','Status','Skills'],
      lrn.map(l => row(l.name, l.prov||'—', l.date?fmtDate(l.date):'—', l.hrs||'—', badge(l.status), l.skills||'—')),
      'No courses recorded yet.'
    );
    const skillsHTML = allSkills.length
      ? `<div class="rpt-skills-wrap"><div class="rpt-skills-lbl">Skills Gained</div>
          <div class="rpt-skills">${allSkills.map(s=>`<span class="rpt-skill">${esc(s)}</span>`).join('')}</div>
         </div>` : '';
    return tbl + skillsHTML;
  })()) : '';

  // ── networking ─────────────────────────────────────────
  const networkingHTML = has('networking') ? section('Networking', table(
    ['Name','Role','Team','Status','Date','Follow-up','Notes'],
    net.map(n => {
      const statusMap = { connected: 'Connected', scheduled: 'Scheduled', looking: 'Looking to Connect' };
      const statusVal = statusMap[n.status || 'connected'] || 'Connected';
      return row(
      n.name, n.role||'—', n.team||'—', statusVal,
      n.date ? fmtDate(n.date) : '—',
      n.fu === 'Yes'
        ? '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#fff1f1;color:#da1e28">Follow-up needed</span>'
        : '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:#defbe6;color:#0e6027">Done</span>',
      n.notes||'—'
    )}),
    'No contacts recorded yet.'
  )) : '';

  // ── reflections ────────────────────────────────────────
  const reflectionsHTML = has('reflections') ? section('Weekly Reflections', (() => {
    if (!refs.length) return '<p class="rpt-empty">No reflections recorded yet.</p>';
    const ratingTheme = r => {
      if (r === 'Excellent week' || r === 'Good week') return statusTheme('Achieved');
      if (r === 'Difficult week') return statusTheme('At Risk');
      return statusTheme('In Progress');
    };
    return refs.map(r => {
      const t = ratingTheme(r.rating||'');
      return `<div class="rpt-ref">
        <div class="rpt-ref-head">
          <strong>Week ending ${r.week ? fmtDate(r.week) : '—'}</strong>
          ${r.rating ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:600;background:${t.bg};color:${t.fg}">${esc(r.rating)}</span>` : ''}
        </div>
        <div class="rpt-ref-grid">
          ${r.acc   ? `<div class="rpt-ref-item"><div class="rpt-ref-lbl">Biggest Win</div><div>${esc(r.acc)}</div></div>`   : ''}
          ${r.chal  ? `<div class="rpt-ref-item"><div class="rpt-ref-lbl">Challenge</div><div>${esc(r.chal)}</div></div>`    : ''}
          ${r.learn ? `<div class="rpt-ref-item"><div class="rpt-ref-lbl">Key Learning</div><div>${esc(r.learn)}</div></div>` : ''}
          ${r.next  ? `<div class="rpt-ref-item"><div class="rpt-ref-lbl">Next Week</div><div>${esc(r.next)}</div></div>`    : ''}
        </div>
      </div>`;
    }).join('');
  })()) : '';

  // ── tasks ──────────────────────────────────────────────
  const tasksHTML = has('tasks') ? section('Tasks', (() => {
    if (!tsks.length) return '<p class="rpt-empty">No tasks recorded yet.</p>';
    const buckets = { todo: [], watch: [], later: [], done: [] };
    tsks.forEach(t => { if (buckets[t.list]) buckets[t.list].push(t); });
    const bucketLabel = { todo:'To Do', watch:'Watch', later:'Later', done:'Done' };
    const bucketTheme = { todo:'#0f62fe', watch:'#005d5d', later:'#e0a208', done:'#198038' };
    return Object.entries(buckets).filter(([,v])=>v.length).map(([key, items]) => `
      <div class="rpt-task-group">
        <div class="rpt-task-hdr" style="color:${bucketTheme[key]}">${bucketLabel[key]} (${items.length})</div>
        ${items.map(t => `<div class="rpt-task-row">
          <span class="rpt-task-title ${key==='done'?'rpt-done':''}">${esc(t.title)}</span>
          ${t.priority && t.priority !== 'normal' ? `<span class="rpt-task-pri">${esc(t.priority)}</span>` : ''}
          ${t.due ? `<span class="rpt-task-due">${fmtDate(t.due)}</span>` : ''}
        </div>`).join('')}
      </div>`).join('');
  })()) : '';

  // ── assemble ───────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IBM Internship Report — ${esc(p.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;background:#f4f2ee;color:#191919;font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}

  /* cover */
  .rpt-cover{background:#fff;border-radius:12px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 2px 6px rgba(0,0,0,.05);padding:36px 40px 32px;margin:28px auto 0;max-width:860px}
  .rpt-cover-brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}
  .rpt-ibm{background:#0f62fe;color:#fff;font-size:16px;font-weight:800;padding:2px 9px;border-radius:3px;letter-spacing:-1px}
  .rpt-cover-sub{font-size:13px;font-weight:500;color:#5b5b5b}
  .rpt-cover-name{font-size:28px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px}
  .rpt-cover-meta{font-size:14px;color:#5b5b5b;margin-bottom:2px}
  .rpt-cover-dates{font-size:12px;color:#8d8d8d;margin-bottom:24px;font-family:'IBM Plex Mono',monospace}
  .rpt-kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
  .rpt-kpi{background:#f4f2ee;border-radius:10px;padding:16px 14px;text-align:center;border-top:4px solid #0f62fe}
  .rpt-kv{font-size:28px;font-weight:300;line-height:1;letter-spacing:-.02em;margin-bottom:5px}
  .rpt-kl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#5b5b5b;font-family:'IBM Plex Mono',monospace}

  /* body wrapper */
  .rpt-body{max-width:860px;margin:0 auto;padding:24px 0 60px}
  .rpt-generated{text-align:right;font-size:11px;color:#8d8d8d;margin:16px 0 8px;font-family:'IBM Plex Mono',monospace}

  /* sections */
  .rpt-section{background:#fff;border-radius:12px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 2px 6px rgba(0,0,0,.05);padding:24px 28px;margin-bottom:16px}
  .rpt-sh{border-bottom:1px solid #e2e0dc;padding-bottom:12px;margin-bottom:16px}
  .rpt-sh h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#5b5b5b;font-family:'IBM Plex Mono',monospace}
  .rpt-empty{color:#8d8d8d;font-style:italic;font-size:13px}

  /* tables */
  .rpt-tw{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{color:#8d8d8d;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:9px 12px;text-align:left;border-bottom:1px solid #e2e0dc;white-space:nowrap;font-family:'IBM Plex Mono',monospace}
  td{padding:11px 12px;border-bottom:1px solid #f4f4f4;vertical-align:top}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#faf9f7}

  /* project cards */
  .rpt-pjc{background:#faf9f7;border-radius:10px;border-left:4px solid #0f62fe;padding:16px 18px;margin-bottom:12px}
  .rpt-pjc-head{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:5px}
  .rpt-pjc-title{font-size:15px;font-weight:600}
  .rpt-pjc-cat{font-size:12px;color:#5b5b5b;margin-bottom:8px}
  .rpt-pb-track{height:6px;background:#e0e0e0;border-radius:99px;overflow:hidden;margin-bottom:8px}
  .rpt-pb-fill{height:100%;border-radius:99px}
  .rpt-pjc-desc{font-size:13px;color:#5b5b5b;margin-bottom:5px}
  .rpt-pjc-impact{font-size:12px;color:#8d8d8d}

  /* skills */
  .rpt-skills-wrap{margin-top:16px;padding-top:14px;border-top:1px solid #e2e0dc}
  .rpt-skills-lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#5b5b5b;margin-bottom:8px;font-family:'IBM Plex Mono',monospace}
  .rpt-skills{display:flex;flex-wrap:wrap;gap:7px}
  .rpt-skill{background:#e8f0fe;color:#0043ce;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:500}

  /* reflections */
  .rpt-ref{background:#faf9f7;border-radius:10px;padding:16px 18px;margin-bottom:12px}
  .rpt-ref-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-weight:600;font-size:14px}
  .rpt-ref-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
  .rpt-ref-item{font-size:13px}
  .rpt-ref-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8d8d8d;margin-bottom:2px;font-family:'IBM Plex Mono',monospace}

  /* tasks */
  .rpt-task-group{margin-bottom:18px}
  .rpt-task-hdr{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-family:'IBM Plex Mono',monospace}
  .rpt-task-row{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#faf9f7;border-radius:6px;margin-bottom:5px;font-size:13px}
  .rpt-task-title{flex:1;font-weight:500}
  .rpt-done{text-decoration:line-through;color:#8d8d8d}
  .rpt-task-pri{font-size:11px;font-weight:600;background:#fff1f1;color:#da1e28;padding:2px 8px;border-radius:999px}
  .rpt-task-due{font-size:11px;color:#5b5b5b;background:#f4f4f4;padding:2px 8px;border-radius:999px;font-family:'IBM Plex Mono',monospace}

  /* footer */
  .rpt-footer{text-align:center;font-size:11px;color:#8d8d8d;margin-top:32px;padding-top:16px;border-top:1px solid #e2e0dc;font-family:'IBM Plex Mono',monospace}

  /* print */
  @media print{
    body{background:#fff}
    .rpt-cover,.rpt-section{box-shadow:none;border:1px solid #e2e0dc;break-inside:avoid;page-break-inside:avoid}
    .rpt-pjc,.rpt-ref,.rpt-task-group{break-inside:avoid;page-break-inside:avoid}
    .rpt-sh{break-after:avoid;page-break-after:avoid}
    tr{break-inside:avoid;page-break-inside:avoid}
    thead{display:table-header-group}
    table{break-inside:auto;page-break-inside:auto}
    .rpt-kgrid{break-inside:avoid;page-break-inside:avoid}
  }
</style>
</head>
<body>

${summaryHTML}

<div class="rpt-body">
  <div class="rpt-generated">Generated ${now}</div>
  ${goalsHTML}
  ${projectsHTML}
  ${activitiesHTML}
  ${learningHTML}
  ${networkingHTML}
  ${reflectionsHTML}
  ${tasksHTML}
  <div class="rpt-footer">IBM Intern Productivity Dashboard · ${esc(p.name)} · ${now}</div>
</div>

</body></html>`;
}

// Toggle export dropdown
document.getElementById('export-btn').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('export-menu').classList.toggle('open');
});

// Close dropdown when clicking outside
document.addEventListener('click', function() {
  document.getElementById('export-menu').classList.remove('open');
});

function buildExportData() {
  const p = S.get('ibm_template_profile', {});
  return {
    profile:     p,
    activities:  S.get('ibm_template_activities',  []),
    goals:       S.get('ibm_template_goals',       []),
    projects:    S.get('ibm_template_projects',    []),
    learning:    S.get('ibm_template_learning',    []),
    networking:  S.get('ibm_template_network',     []),
    reflections: S.get('ibm_template_reflections', []),
    tasks:       S.get('ibm_template_tasks',        []),
    exported:    new Date().toISOString()
  };
}

// Report → open section picker modal
document.getElementById('export-report').addEventListener('click', function() {
  document.getElementById('export-menu').classList.remove('open');
  // reset all checkboxes to checked
  document.querySelectorAll('#report-section-list input[type=checkbox]').forEach(cb => { cb.checked = true; });
  document.getElementById('report-modal').classList.remove('hidden');
});

document.getElementById('report-cancel-btn').addEventListener('click', function() {
  document.getElementById('report-modal').classList.add('hidden');
});

// close modal on backdrop click
document.getElementById('report-modal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.add('hidden');
});

document.getElementById('report-generate-btn').addEventListener('click', function() {
  const selected = Array.from(
    document.querySelectorAll('#report-section-list input[type=checkbox]:checked')
  ).map(cb => cb.value);
  if (!selected.length) { toast('Select at least one section'); return; }
  document.getElementById('report-modal').classList.add('hidden');
  const data = buildExportData();
  const html = buildExportHTML(data, selected);
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }
  toast('Print dialog opened — save as PDF');
});

// Backup → download JSON
document.getElementById('export-backup').addEventListener('click', function() {
  document.getElementById('export-menu').classList.remove('open');
  const data = buildExportData();
  const p = data.profile;
  downloadJson((p.name || 'intern').replace(/\s+/g, '_') + '_ibm_dashboard_backup.json', data);
  toast('Backup downloaded!');
});

// ─────────────────────────────────────
// IMPORT
// ─────────────────────────────────────
document.getElementById('import-btn').addEventListener('click', function() {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    let data;
    try {
      data = JSON.parse(ev.target.result);
    } catch (_) {
      alert('Could not read the file. Make sure it is a valid dashboard backup (.json).');
      return;
    }
    // Validate it looks like a dashboard backup
    if (!data.profile || !data.profile.name) {
      alert('This file does not appear to be a valid dashboard backup. No profile found.');
      return;
    }
    if (!confirm(
      'Import backup for "' + data.profile.name + '"?\n\n' +
      'This will REPLACE all current data in the dashboard with the backup.\n\n' +
      'Press OK to continue.'
    )) return;

    // Restore every section. These writes sync to the server like any other,
    // so the import lands on the account, not just this browser.
    S.set('ibm_template_profile',     data.profile     || {});
    S.set('ibm_template_activities',  data.activities  || []);
    S.set('ibm_template_goals',       data.goals       || []);
    S.set('ibm_template_projects',    data.projects    || []);
    S.set('ibm_template_learning',    data.learning    || []);
    S.set('ibm_template_network',     data.networking  || []);
    S.set('ibm_template_reflections', data.reflections || []);
    S.set('ibm_template_tasks',       data.tasks       || []);
    Store.flush();

    hideAuthOverlay();
    initApp();
    toast('Backup imported and synced to your account');

    // Reset the file input so the same file can be re-imported if needed
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ─────────────────────────────────────
// BOOT
// ─────────────────────────────────────
(async function boot() {
  Directory.init();
  try {
    const user = await Auth.current();
    if (user) {
      await enterDashboard(user);
    } else {
      showAuthPanel('auth-login');
    }
  } catch (err) {
    // Server unreachable or misconfigured — show sign-in with the reason.
    showAuthPanel('auth-login');
    showAuthError('login-error', err.message);
  }
})();

// ─────────────────────────────────────
// AUTO-CLOSE FORM TOGGLES ON SAVE
// ─────────────────────────────────────
(function() {
  const saveCloseMap = {
    'save-activity': 'a-desc',
    'save-goal':     'g-name',
    'save-project':  'pj-title',
    'save-course':   'l-name',
    'save-contact':  'n-name',
    'save-reflect':  'r-week',
    'save-task':     'tk-title',
  };
  Object.entries(saveCloseMap).forEach(([btnId, requiredFieldId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function() {
      // Only close if the required field has a value (i.e. save was valid)
      const field = document.getElementById(requiredFieldId);
      const hasValue = field && field.value.trim();
      if (hasValue) {
        const toggle = btn.closest('details.form-toggle');
        if (toggle) toggle.removeAttribute('open');
      }
    }, { capture: true }); // capture so we run before the save handler clears the field
  });
})();
