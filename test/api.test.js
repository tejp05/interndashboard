import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, call, cookieOf, makeUser } from './helpers.js';

let authHandler, dataHandler, dirHandler;

before(async () => {
  await freshDb();
  // Imported after __DB__ is set so the modules bind to the test database.
  authHandler = (await import('../api/auth/[action].js')).default;
  dataHandler = (await import('../api/data/[section].js')).default;
  dirHandler = (await import('../api/directory.js')).default;
});

beforeEach(async () => {
  await freshDb();
});

// ── Auth ────────────────────────────────────────────────────────────────────

describe('auth', () => {
  test('signs up, sets a session cookie, and returns the user', async () => {
    const res = await call(authHandler, {
      method: 'POST',
      query: { action: 'signup' },
      body: {
        name: 'Jordan Smith',
        email: 'Jordan.Smith@IBM.com',
        password: 'password1234',
        start: '2026-06-01',
        end: '2026-08-21'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.name, 'Jordan Smith');
    assert.match(res.cookie, /^ibm_session=.+HttpOnly/);
    // Dates must survive the driver round trip as YYYY-MM-DD, not "Sun May 31".
    assert.equal(res.body.user.start, '2026-06-01');
    assert.equal(res.body.user.end, '2026-08-21');
  });

  test('rejects a weak password', async () => {
    const res = await call(authHandler, {
      method: 'POST',
      query: { action: 'signup' },
      body: { name: 'A', email: 'a@ibm.com', password: 'short' }
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /at least 10 characters/i);
  });

  test('rejects a duplicate email regardless of case', async () => {
    await makeUser(authHandler, { email: 'dupe@ibm.com' });
    const res = await call(authHandler, {
      method: 'POST',
      query: { action: 'signup' },
      body: { name: 'B', email: 'DUPE@ibm.com', password: 'password1234' }
    });
    assert.equal(res.status, 409);
  });

  test('logs in with correct credentials and rejects wrong ones', async () => {
    await makeUser(authHandler, { email: 'login@ibm.com', password: 'password1234' });

    const ok = await call(authHandler, {
      method: 'POST',
      query: { action: 'login' },
      body: { email: 'login@ibm.com', password: 'password1234' }
    });
    assert.equal(ok.status, 200);
    assert.ok(cookieOf(ok));

    const bad = await call(authHandler, {
      method: 'POST',
      query: { action: 'login' },
      body: { email: 'login@ibm.com', password: 'wrongpassword' }
    });
    assert.equal(bad.status, 401);
    // Must not leak whether the account exists.
    assert.equal(bad.body.error, 'Incorrect email or password.');
  });

  test('gives the same error for an unknown email as for a wrong password', async () => {
    const res = await call(authHandler, {
      method: 'POST',
      query: { action: 'login' },
      body: { email: 'nobody@ibm.com', password: 'password1234' }
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Incorrect email or password.');
  });

  test('locks the account after repeated failures', async () => {
    await makeUser(authHandler, { email: 'lock@ibm.com', password: 'password1234' });
    let res;
    for (let i = 0; i < 8; i++) {
      res = await call(authHandler, {
        method: 'POST',
        query: { action: 'login' },
        body: { email: 'lock@ibm.com', password: 'nope12345678' }
      });
    }
    // The next attempt — even with the right password — is throttled.
    res = await call(authHandler, {
      method: 'POST',
      query: { action: 'login' },
      body: { email: 'lock@ibm.com', password: 'password1234' }
    });
    assert.equal(res.status, 429);
    assert.match(res.body.error, /Too many failed attempts/);
  });

  test('enforces the allowed email domain policy when configured', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'ibm.com';
    try {
      const res = await call(authHandler, {
        method: 'POST',
        query: { action: 'signup' },
        body: { name: 'C', email: 'someone@gmail.com', password: 'password1234' }
      });
      assert.equal(res.status, 403);
    } finally {
      delete process.env.ALLOWED_EMAIL_DOMAINS;
    }
  });

  test('me returns null without a cookie and the user with one', async () => {
    const { cookie } = await makeUser(authHandler);

    const anon = await call(authHandler, { query: { action: 'me' } });
    assert.equal(anon.body.user, null);

    const auth = await call(authHandler, { query: { action: 'me' }, cookie });
    assert.ok(auth.body.user.id);
  });

  test('rejects a forged session cookie', async () => {
    const res = await call(authHandler, {
      query: { action: 'me' },
      cookie: 'ibm_session=not.a.real.token'
    });
    assert.equal(res.body.user, null);
  });
});

// ── Private sections ────────────────────────────────────────────────────────

describe('data sections', () => {
  test('requires authentication', async () => {
    const res = await call(dataHandler, { query: { section: 'all' } });
    assert.equal(res.status, 401);
  });

  test('round-trips a section', async () => {
    const { cookie } = await makeUser(authHandler);
    const goals = [{ name: 'Ship the dashboard', status: 'In Progress' }];

    const put = await call(dataHandler, {
      method: 'PUT',
      query: { section: 'goals' },
      body: { doc: goals },
      cookie
    });
    assert.equal(put.status, 200);

    const get = await call(dataHandler, { query: { section: 'goals' }, cookie });
    assert.deepEqual(get.body.doc, goals);
  });

  test('all returns every section including network', async () => {
    const { cookie } = await makeUser(authHandler);
    const res = await call(dataHandler, { query: { section: 'all' }, cookie });
    assert.equal(res.status, 200);
    for (const k of ['profile', 'activities', 'goals', 'projects', 'learning', 'reflections', 'tasks', 'network']) {
      assert.ok(k in res.body.sections, `missing section ${k}`);
    }
  });

  test('one user cannot see another user\'s sections', async () => {
    const a = await makeUser(authHandler);
    const b = await makeUser(authHandler);

    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'reflections' },
      body: { doc: [{ week: '2026-07-03', acc: 'private thoughts' }] },
      cookie: a.cookie
    });

    const res = await call(dataHandler, { query: { section: 'reflections' }, cookie: b.cookie });
    assert.deepEqual(res.body.doc, []);
  });

  test('rejects an unknown section name', async () => {
    const { cookie } = await makeUser(authHandler);
    const res = await call(dataHandler, { query: { section: 'secrets' }, cookie });
    assert.equal(res.status, 404);
  });
});

// ── Networking ──────────────────────────────────────────────────────────────

describe('network', () => {
  const contacts = [
    {
      name: 'Ada Lovelace',
      team: 'Research',
      role: 'Distinguished Engineer',
      status: 'connected',
      date: '2026-06-15',
      notes: 'Very kind, offered to review my design doc.',
      recommends: ['Grace Hopper'],
      projects: ['Dashboard']
    },
    { name: 'Grace Hopper', team: 'Compilers', status: 'looking', date: '', notes: '' }
  ];

  test('round-trips contacts with dates and arrays intact', async () => {
    const { cookie } = await makeUser(authHandler);
    await call(dataHandler, { method: 'PUT', query: { section: 'network' }, body: { doc: contacts }, cookie });

    const res = await call(dataHandler, { query: { section: 'network' }, cookie });
    assert.equal(res.body.doc.length, 2);
    const ada = res.body.doc.find((c) => c.name === 'Ada Lovelace');
    assert.equal(ada.date, '2026-06-15');
    assert.deepEqual(ada.recommends, ['Grace Hopper']);
    assert.deepEqual(ada.projects, ['Dashboard']);
    assert.equal(ada.notes, 'Very kind, offered to review my design doc.');
  });

  test('clears the date for looking-status contacts', async () => {
    const { cookie } = await makeUser(authHandler);
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: 'X', status: 'looking', date: '2026-06-15' }] },
      cookie
    });
    const res = await call(dataHandler, { query: { section: 'network' }, cookie });
    assert.equal(res.body.doc[0].date, '');
  });

  test('deletes contacts removed from the array', async () => {
    const { cookie } = await makeUser(authHandler);
    await call(dataHandler, { method: 'PUT', query: { section: 'network' }, body: { doc: contacts }, cookie });
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [contacts[0]] },
      cookie
    });
    const res = await call(dataHandler, { query: { section: 'network' }, cookie });
    assert.equal(res.body.doc.length, 1);
    assert.equal(res.body.doc[0].name, 'Ada Lovelace');
  });

  test('collapses duplicate names instead of erroring on the unique index', async () => {
    const { cookie } = await makeUser(authHandler);
    const res = await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: 'Ada Lovelace' }, { name: '  ada   lovelace ' }] },
      cookie
    });
    assert.equal(res.status, 200);
    const get = await call(dataHandler, { query: { section: 'network' }, cookie });
    assert.equal(get.body.doc.length, 1);
  });

  test('ignores contacts with a blank name', async () => {
    const { cookie } = await makeUser(authHandler);
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: '   ' }, { name: 'Real Person' }] },
      cookie
    });
    const res = await call(dataHandler, { query: { section: 'network' }, cookie });
    assert.equal(res.body.doc.length, 1);
  });
});

// ── Shared directory ────────────────────────────────────────────────────────

describe('directory', () => {
  test('requires authentication', async () => {
    const res = await call(dirHandler, {});
    assert.equal(res.status, 401);
  });

  test('pools contacts across users and marks who knows whom', async () => {
    const a = await makeUser(authHandler, { name: 'Alice Intern' });
    const b = await makeUser(authHandler, { name: 'Bob Intern' });

    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: 'Ada Lovelace', team: 'Research', status: 'connected', date: '2026-06-15' }] },
      cookie: a.cookie
    });
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: 'ada lovelace', status: 'looking' }, { name: 'Alan Turing', status: 'connected' }] },
      cookie: b.cookie
    });

    const res = await call(dirHandler, { cookie: b.cookie });
    assert.equal(res.status, 200);

    const ada = res.body.contacts.find((c) => c.key === 'ada lovelace');
    assert.equal(ada.knownBy.length, 2, 'both interns should appear');
    // The fuller record wins for team, even though B left it blank.
    assert.equal(ada.team, 'Research');
    // Best status across the cohort is "connected" because Alice met her.
    assert.equal(ada.bestStatus, 'connected');

    const mine = ada.knownBy.find((k) => k.isMe);
    assert.equal(mine.userName, 'Bob Intern');

    assert.equal(res.body.stats.interns, 2);
    assert.equal(res.body.stats.sharedPeople, 1);
  });

  test('never exposes private contact notes', async () => {
    const a = await makeUser(authHandler);
    const b = await makeUser(authHandler);

    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: { doc: [{ name: 'Ada Lovelace', notes: 'SECRET-IMPRESSION-DO-NOT-SHARE' }] },
      cookie: a.cookie
    });

    const res = await call(dirHandler, { cookie: b.cookie });
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('SECRET-IMPRESSION'), 'notes leaked into the directory');
    assert.ok(!('notes' in res.body.contacts[0]), 'notes key present on directory contact');
  });

  test('surfaces recommendations as intro leads', async () => {
    const a = await makeUser(authHandler);
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: {
        doc: [
          { name: 'Ada Lovelace', status: 'connected', recommends: ['Grace Hopper'] },
          { name: 'Grace Hopper', status: 'looking' }
        ]
      },
      cookie: a.cookie
    });

    const res = await call(dirHandler, { cookie: a.cookie });
    const grace = res.body.contacts.find((c) => c.key === 'grace hopper');
    assert.deepEqual(grace.recommendedBy, ['Ada Lovelace']);
  });

  test('counts per-intern connection stats', async () => {
    const a = await makeUser(authHandler, { name: 'Alice Intern' });
    await call(dataHandler, {
      method: 'PUT',
      query: { section: 'network' },
      body: {
        doc: [
          { name: 'P1', status: 'connected' },
          { name: 'P2', status: 'connected' },
          { name: 'P3', status: 'scheduled' },
          { name: 'P4', status: 'looking' }
        ]
      },
      cookie: a.cookie
    });

    const res = await call(dirHandler, { cookie: a.cookie });
    const alice = res.body.interns.find((u) => u.name === 'Alice Intern');
    assert.equal(alice.contactCount, 4);
    assert.equal(alice.connectedCount, 2);
    assert.equal(alice.scheduledCount, 1);
    assert.equal(alice.lookingCount, 1);
  });
});
