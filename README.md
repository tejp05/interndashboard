# IBM Intern Productivity Dashboard — Server Edition

A multi-user web app where every intern tracks their own work privately, and the
whole cohort shares one pooled networking directory. Deploys to Vercel with a
Neon Postgres database.

> **v2 changed the architecture.** The dashboard used to be a static page that
> stored everything in `localStorage`, one browser at a time. It is now a real
> server application with accounts, a database, and a shared directory. See
> [Migrating from v1](#migrating-from-v1) if you have old backup files.

---

## What it does

**Private to each intern** — Daily Activity, Goals, Projects, Learning,
Weekly Reflection, and Tasks. Only you can read yours.

**Shared with the cohort** — the Networking tab. Everyone's contacts are pooled
into a **Directory** tab that answers the question the old version could not:
*who already knows the person I want to meet?*

The Directory shows:

| | |
|---|---|
| **Pooled contacts** | Every person anyone has logged, collapsed by name so duplicates merge |
| **Who knows whom** | Which interns have met each person, and at what stage |
| **Warm intro paths** | "Amara Osei already met Ada" — so you know who to ask |
| **Referral chains** | When a contact recommends someone, that shows up on the recommended person's card |
| **Leaderboard** | Who is building the widest network |
| **Team coverage** | Which parts of IBM the cohort has reached, and where the gaps are |
| **Add to my network** | One click copies a person onto your own radar |

### What stays private

Contact **notes** are personal impressions and are never exposed by the
directory API — the query that builds it does not select the column. Everything
outside the Networking tab is scoped to your user id and is not readable by
other accounts. Both properties are covered by tests.

---

## Quickstart (local)

No database or cloud account needed — the dev server runs Postgres in-process.

```bash
npm install
npm run dev            # → http://localhost:3000
```

Optionally load a demo cohort so the Directory has data to show:

```bash
node scripts/seed-demo.js
# creates 4 interns with overlapping networks
# sign in as jordan.smith@ibm.com / demopass1234
```

Local data lives in `.devdata/` (gitignored). Delete that folder for a clean slate.

```bash
npm test               # 24 API tests, no services required
```

---

## Deploying to Vercel

### 1. Create the database

In the Vercel dashboard: **Storage → Create Database → Neon → Connect to Project**.
This injects `DATABASE_URL` automatically. The schema is created on the first
request, so there is no migration step to run.

### 2. Set environment variables

**Settings → Environment Variables**:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Injected by the Neon integration |
| `AUTH_SECRET` | ✅ | Signs session cookies. Generate below. |
| `ALLOWED_EMAIL_DOMAINS` | — | e.g. `ibm.com` — restricts who can sign up |
| `SIGNUP_INVITE_CODE` | — | Shared code required at signup |
| `COHORT_NAME` | — | Label shown on the Directory, e.g. `Summer 2026 Interns` |

Generate `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Set `ALLOWED_EMAIL_DOMAINS` and/or `SIGNUP_INVITE_CODE` before sharing the
URL.** Without either, anyone who finds the link can create an account and read
the whole cohort's networking data.

### 3. Deploy

```bash
npx vercel --prod
```

> **Note on Git integration:** this repo's remote is `github.ibm.com`, which is
> GitHub Enterprise Server. Vercel's automatic Git deploys support github.com,
> GitLab and Bitbucket — **not** GHES. So either deploy with the CLI as above
> (works fine, and can be wired into a GHES Actions workflow), or mirror the
> repo to a github.com repository and connect that.

---

## Architecture

```
public/                 static frontend, served directly by Vercel
  index.html            markup for all 9 tabs
  store.js              synchronous S.get/S.set facade over the API  ← the seam
  directory.js          the shared cohort directory view
  app.js                the original dashboard logic, largely unchanged
  styles.css            IBM Carbon-inspired theme, light + dark

api/                    Vercel serverless functions
  _lib/db.js            Neon client, schema DDL, date coercion
  _lib/auth.js          bcrypt hashing, JWT cookies, signup policy
  auth/[action].js      signup · login · logout · me · profile · password
  data/[section].js     private sections + the contacts table
  directory.js          the cross-user aggregation

scripts/
  dev-server.js         local server running the real handlers on PGlite
  pglite-adapter.js     Neon-shaped client backed by in-process Postgres
  seed-demo.js          demo cohort
  migrate.js            optional eager schema creation

test/api.test.js        24 tests over auth, isolation, networking, privacy
```

### How the frontend kept working

`app.js` contained roughly 200 synchronous `S.get()` / `S.set()` calls against
`localStorage`. Rewriting them all as async would have been a large, risky
change. Instead `store.js` preserves that synchronous surface:

- **Reads** hit an in-memory cache, hydrated once from `/api/data/all` at sign-in.
- **Writes** update the cache immediately, then flush to the server on a 700 ms
  debounce (write-behind), with retry-on-failure, a flush on tab hide, and a
  `keepalive` flush on unload.

So the UI stays instant, the server stays authoritative, and `app.js` barely
changed. The header shows a live **Saved / Saving… / Not saved** indicator.

### Why networking is a table, not a JSON blob

The other six sections are stored as JSON documents keyed by user. Networking is
normalized into a `contacts` table because the Directory needs cross-user
queries — matching the same person across interns, counting who has connected,
and building intro paths. Contacts are keyed by a normalized name so
`"ada lovelace"` and `"Ada  Lovelace"` collapse to one person.

### Database schema

```
users      id, email, email_key (unique), password_hash, name, team, role,
           start_date, end_date, failed_attempts, locked_until, timestamps
sections   (user_id, name) → jsonb doc          -- private per-user data
contacts   user_id, name, name_key, team, role, status, met_date,
           referred_by, recommends[], projects[], notes, position
           UNIQUE (user_id, name_key)
```

---

## Security

- Passwords hashed with bcrypt (cost 10); minimum 10 characters with a letter
  and a digit.
- Sessions are HS256 JWTs in `httpOnly`, `SameSite=Lax`, `Secure` cookies.
- Login failures are throttled per account — 8 failures triggers a 15-minute
  lockout, tracked in the database so it holds across serverless instances.
- Login returns an identical error for unknown emails and wrong passwords, and
  does equivalent hashing work in both cases, so the endpoint does not enumerate
  accounts.
- CSP, `X-Frame-Options: DENY`, and `nosniff` are set in `vercel.json`.
- Signup can be gated by email domain, invite code, or both.

**Not implemented:** password reset (no email provider is configured), and
admin/moderation tooling. An intern who forgets their password currently needs
an operator to reset the row.

---

## Migrating from v1

v1 stored everything in one browser's `localStorage`. There is no automatic
migration, but the export format is unchanged:

1. Open the old dashboard in the browser that has your data.
2. **Export → Backup (JSON)**.
3. Create an account on the new deployment.
4. **Import**, choose the file. It uploads to your account, not just the browser.

Your contacts join the shared directory at that point. Everything else stays private.

---

## Legacy files

These predate v2 and are no longer part of the deployed app:

- `app.py`, `agent.py`, `config.yaml`, `_test_profiler.py` — the original
  Streamlit CSV-dashboard tool. Still runnable with `streamlit run app.py`.
- `intern-dashboard/` — the Python CUGA server and an older copy of the
  frontend. The AI assistant was removed entirely; the dashboard has no LLM
  dependency and needs no model credentials.

---

*© 2026 IBM Finance & Operations · DS&T · Internal use only.*
