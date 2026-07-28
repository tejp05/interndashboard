/* ═══════════════════════════════════════════════════════════════════════════
   store.js — server-backed data layer.

   The dashboard was originally written against localStorage with ~200
   synchronous S.get()/S.set() calls scattered through app.js. Rather than
   rewrite all of them as async, this module keeps that synchronous surface
   intact: reads hit an in-memory cache hydrated once at sign-in, and writes
   update the cache immediately then flush to the server on a short debounce
   (write-behind). The UI stays instant, the server stays authoritative.
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ── HTTP ──────────────────────────────────────────────────────────────────

  async function request(method, url, body) {
    const opts = {
      method,
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw new Error('Network unavailable. Check your connection and try again.');
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch (e) {
      /* empty or non-JSON body */
    }

    if (!res.ok) {
      const err = new Error((payload && payload.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload || {};
  }

  const API = {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body)
  };

  // ── Auth ──────────────────────────────────────────────────────────────────

  const Auth = {
    user: null,

    async current() {
      const { user } = await API.get('/api/auth/me');
      Auth.user = user;
      return user;
    },
    async login(email, password) {
      const { user } = await API.post('/api/auth/login', { email, password });
      Auth.user = user;
      return user;
    },
    async signup(fields) {
      const { user } = await API.post('/api/auth/signup', fields);
      Auth.user = user;
      return user;
    },
    async saveProfile(fields) {
      const { user } = await API.post('/api/auth/profile', fields);
      Auth.user = user;
      return user;
    },
    async changePassword(currentPassword, newPassword) {
      return API.post('/api/auth/password', { currentPassword, newPassword });
    },
    async logout() {
      await API.post('/api/auth/logout', {});
      Auth.user = null;
      Store.reset();
    }
  };

  // ── Section cache ─────────────────────────────────────────────────────────

  // Legacy localStorage key → server section name.
  const KEY_TO_SECTION = {
    ibm_template_profile: 'profile',
    ibm_template_activities: 'activities',
    ibm_template_goals: 'goals',
    ibm_template_projects: 'projects',
    ibm_template_learning: 'learning',
    ibm_template_network: 'network',
    ibm_template_reflections: 'reflections',
    ibm_template_tasks: 'tasks'
  };

  const OBJECT_SECTIONS = { profile: 1, prefs: 1 };

  function blank(section) {
    return OBJECT_SECTIONS[section] ? {} : [];
  }

  const SAVE_DEBOUNCE_MS = 700;

  const Store = {
    cache: {},
    hydrated: false,
    dirty: new Set(),
    timer: null,
    inFlight: false,
    lastError: null,

    /** Pull every section from the server. Call once after sign-in. */
    async hydrate() {
      const { sections } = await API.get('/api/data/all');
      Store.cache = sections || {};
      Store.hydrated = true;
      Store.dirty.clear();
      setStatus('saved');
      return Store.cache;
    },

    reset() {
      Store.cache = {};
      Store.hydrated = false;
      Store.dirty.clear();
      clearTimeout(Store.timer);
      Store.timer = null;
    },

    read(section, fallback) {
      const v = Store.cache[section];
      if (v === undefined || v === null) {
        return fallback !== undefined ? fallback : blank(section);
      }
      return v;
    },

    write(section, value) {
      Store.cache[section] = value;
      Store.dirty.add(section);
      setStatus('saving');
      clearTimeout(Store.timer);
      Store.timer = setTimeout(Store.flush, SAVE_DEBOUNCE_MS);
    },

    /** Push all dirty sections. Safe to call at any time. */
    async flush() {
      clearTimeout(Store.timer);
      Store.timer = null;
      if (Store.inFlight || !Store.dirty.size || !Store.hydrated) return;

      const names = [...Store.dirty];
      Store.dirty.clear();
      Store.inFlight = true;

      const payload = {};
      for (const n of names) payload[n] = Store.cache[n];

      try {
        await API.put('/api/data/all', { sections: payload });
        Store.lastError = null;
        setStatus(Store.dirty.size ? 'saving' : 'saved');
      } catch (err) {
        // Re-queue so the next flush retries rather than dropping edits.
        for (const n of names) Store.dirty.add(n);
        Store.lastError = err;
        setStatus('error', err.message);
        if (err.status === 401) {
          setStatus('error', 'Session expired — sign in again to keep saving.');
        }
      } finally {
        Store.inFlight = false;
        if (Store.dirty.size && !Store.timer) {
          Store.timer = setTimeout(Store.flush, 3000); // retry backoff
        }
      }
    },

    /** Best-effort synchronous flush for page unload. */
    flushBeacon() {
      if (!Store.dirty.size || !navigator.sendBeacon) return;
      const payload = {};
      for (const n of Store.dirty) payload[n] = Store.cache[n];
      // sendBeacon cannot set a JSON content-type reliably across browsers,
      // so use a keepalive fetch instead — it survives navigation.
      fetch('/api/data/all', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sections: payload }),
        keepalive: true
      }).catch(() => {});
    }
  };

  // ── Sync status indicator ─────────────────────────────────────────────────

  let statusEl = null;
  function setStatus(state, detail) {
    if (!statusEl) statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
    statusEl.classList.remove('sync-saving', 'sync-saved', 'sync-error');
    if (state === 'saving') {
      statusEl.classList.add('sync-saving');
      statusEl.textContent = 'Saving…';
      statusEl.title = 'Syncing your changes to the server';
    } else if (state === 'saved') {
      statusEl.classList.add('sync-saved');
      statusEl.textContent = 'Saved';
      statusEl.title = 'All changes saved to the server';
    } else {
      statusEl.classList.add('sync-error');
      statusEl.textContent = 'Not saved';
      statusEl.title = detail || 'Could not reach the server — will retry';
    }
  }

  // ── The synchronous facade app.js already uses ────────────────────────────

  const S = {
    get(k, d) {
      const section = KEY_TO_SECTION[k];
      if (section) return Store.read(section, d);
      // Device-local preferences (dark mode) stay in localStorage so they
      // apply before the first network round-trip.
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },

    set(k, v) {
      const section = KEY_TO_SECTION[k];
      if (section) {
        Store.write(section, v);
        return;
      }
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* quota or private mode — non-critical for prefs */
      }
    }
  };

  // Flush pending edits before the tab goes away.
  window.addEventListener('beforeunload', Store.flushBeacon);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') Store.flush();
  });
  // Periodic safety net for long sessions left open.
  setInterval(function () {
    if (Store.dirty.size) Store.flush();
  }, 30000);

  global.API = API;
  global.Auth = Auth;
  global.Store = Store;
  global.S = S;
  global.SECTION_KEYS = KEY_TO_SECTION;
})(window);
