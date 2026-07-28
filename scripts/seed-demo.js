/**
 * seed-demo.js — populate a running instance with a demo cohort.
 *
 *   node scripts/seed-demo.js                       # against localhost:3000
 *   node scripts/seed-demo.js https://your.vercel.app
 *
 * Creates several intern accounts with overlapping networks so the Directory
 * has something to show. Accounts that already exist are skipped.
 *
 * Every demo account uses the same password: demopass1234
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const PASSWORD = 'demopass1234';

const COHORT = [
  {
    name: 'Jordan Smith', email: 'jordan.smith@ibm.com',
    team: 'IBM Technology Group', role: 'Software Engineering Intern',
    contacts: [
      { name: 'Ada Lovelace', team: 'IBM Research', role: 'Distinguished Engineer', status: 'connected', date: '2026-06-12', notes: 'Offered to review my design doc.', recommends: ['Grace Hopper'] },
      { name: 'Grace Hopper', team: 'Compiler Technology', role: 'Senior Technical Staff', status: 'scheduled', date: '2026-08-05', referredBy: 'Ada Lovelace' },
      { name: 'Priya Raman', team: 'watsonx Platform', role: 'Product Manager', status: 'connected', date: '2026-06-28' },
      { name: 'Marcus Webb', team: 'IBM Consulting', role: 'Managing Consultant', status: 'looking' }
    ]
  },
  {
    name: 'Amara Osei', email: 'amara.osei@ibm.com',
    team: 'IBM Research', role: 'Research Intern',
    contacts: [
      { name: 'Ada Lovelace', team: 'IBM Research', role: 'Distinguished Engineer', status: 'connected', date: '2026-06-03', notes: 'My skip-level. Great mentor.' },
      { name: 'Kenji Tanaka', team: 'Quantum', role: 'Research Scientist', status: 'connected', date: '2026-07-01', recommends: ['Sofia Marino'] },
      { name: 'Sofia Marino', team: 'Quantum', role: 'Principal RSM', status: 'looking', referredBy: 'Kenji Tanaka' },
      { name: 'Priya Raman', team: 'watsonx Platform', role: 'Product Manager', status: 'scheduled', date: '2026-08-11' }
    ]
  },
  {
    name: 'Diego Alvarez', email: 'diego.alvarez@ibm.com',
    team: 'IBM Consulting', role: 'Strategy Intern',
    contacts: [
      { name: 'Marcus Webb', team: 'IBM Consulting', role: 'Managing Consultant', status: 'connected', date: '2026-06-09', notes: 'Runs the Thursday office hours.' },
      { name: 'Priya Raman', team: 'watsonx Platform', role: 'Product Manager', status: 'connected', date: '2026-07-15' },
      { name: 'Lena Fischer', team: 'IBM Finance', role: 'Director', status: 'looking' }
    ]
  },
  {
    name: 'Wei Chen', email: 'wei.chen@ibm.com',
    team: 'watsonx Platform', role: 'Data Science Intern',
    contacts: [
      { name: 'Priya Raman', team: 'watsonx Platform', role: 'Product Manager', status: 'connected', date: '2026-06-05', notes: 'My manager.' },
      { name: 'Kenji Tanaka', team: 'Quantum', role: 'Research Scientist', status: 'scheduled', date: '2026-08-14' },
      { name: 'Ada Lovelace', team: 'IBM Research', status: 'looking' }
    ]
  }
];

const GOALS = [
  { name: 'Meet 15 people across 5 orgs', status: 'In Progress', type: 'metric', metric: 'contacts', target: 15 },
  { name: 'Ship one production feature', status: 'In Progress' }
];

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, body: json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

async function seedOne(person) {
  let session = await api('/api/auth/signup', {
    method: 'POST',
    body: {
      name: person.name, email: person.email, password: PASSWORD,
      team: person.team, role: person.role,
      start: '2026-06-01', end: '2026-08-21'
    }
  });

  if (session.status === 409) {
    session = await api('/api/auth/login', {
      method: 'POST',
      body: { email: person.email, password: PASSWORD }
    });
    if (session.status !== 200) {
      console.log(`  ! ${person.name}: account exists with a different password — skipped`);
      return;
    }
    console.log(`  · ${person.name} already existed — refreshing their data`);
  } else if (session.status !== 201) {
    console.log(`  ! ${person.name}: ${session.body && session.body.error}`);
    return;
  } else {
    console.log(`  + ${person.name}`);
  }

  const cookie = session.cookie;
  await api('/api/data/network', { method: 'PUT', body: { doc: person.contacts }, cookie });
  await api('/api/data/goals', { method: 'PUT', body: { doc: GOALS }, cookie });
}

console.log(`Seeding demo cohort into ${BASE}\n`);
for (const person of COHORT) await seedOne(person);

console.log(`\nDone. Sign in with any of:`);
COHORT.forEach((p) => console.log(`  ${p.email}  /  ${PASSWORD}`));
console.log('\nThese are demo accounts with a shared weak password — do not seed a');
console.log('production deployment you intend to keep.');
