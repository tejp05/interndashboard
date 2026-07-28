/**
 * /api/ask — the "Ask Bob" assistant, backed directly by watsonx.ai.
 *
 * Replaces the old Python CUGA agent, which needed a local venv and could not
 * run on Vercel. This route exchanges the IBM Cloud API key for an IAM token
 * (cached in module scope for the life of the instance) and calls the
 * watsonx.ai text generation endpoint.
 *
 * The assistant is advisory only — it reads a compact summary of the caller's
 * own dashboard and answers questions about it. It never writes data back.
 */

import { requireUser } from './_lib/auth.js';

const IAM_URL = 'https://iam.cloud.ibm.com/identity/token';
const WATSONX_VERSION = '2023-05-29';
const DEFAULT_MODEL = 'ibm/granite-3-8b-instruct';
// The chat endpoint takes role-tagged messages and is what modern instruct and
// chat models on watsonx expect (granite-*-instruct, openai/gpt-oss-*, llama-*).
// The legacy /text/generation endpoint does not serve several of them.
const CHAT_PATH = '/ml/v1/text/chat';

// Per-instance IAM token cache. IAM tokens last ~60 min; refresh a bit early.
let tokenCache = { token: null, expiresAt: 0 };

// Crude per-user throttle, per instance. Enough to stop an accidental loop.
const lastCall = new Map();
const MIN_INTERVAL_MS = 1500;

async function getIamToken(apiKey) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const res = await fetch(IAM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: apiKey
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`IBM Cloud IAM rejected the API key (${res.status}). ${detail.slice(0, 200)}`);
  }

  const body = await res.json();
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(60, (body.expires_in || 3600) - 300) * 1000
  };
  return tokenCache.token;
}

/**
 * Compress the dashboard into a small, token-cheap summary. Sending the raw
 * payload would blow the context window once someone has a full summer of data.
 */
function summarize(data) {
  const d = data && typeof data === 'object' ? data : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const clip = (s, n = 160) => String(s || '').slice(0, n);

  const activities = arr(d.activities);
  const totalHours = activities.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

  return {
    profile: {
      name: clip(d.profile && d.profile.name, 80),
      role: clip(d.profile && d.profile.role, 80),
      team: clip(d.profile && d.profile.team, 80),
      start: (d.profile && d.profile.start) || '',
      end: (d.profile && d.profile.end) || ''
    },
    totals: {
      hoursLogged: Math.round(totalHours * 10) / 10,
      activities: activities.length,
      goals: arr(d.goals).length,
      projects: arr(d.projects).length,
      courses: arr(d.learning).length,
      contacts: arr(d.networking).length,
      reflections: arr(d.reflections).length,
      openTasks: arr(d.tasks).filter((t) => t && t.list !== 'done').length
    },
    recentActivities: activities.slice(0, 12).map((a) => ({
      date: a.date || '',
      hours: Number(a.hours) || 0,
      project: clip(a.project, 60),
      desc: clip(a.desc)
    })),
    goals: arr(d.goals).map((g) => ({
      name: clip(g.name, 90),
      status: g.status || '',
      target: g.target,
      current: g.current
    })),
    projects: arr(d.projects).map((p) => ({
      title: clip(p.title, 90),
      status: p.status || '',
      progress: p.progress,
      due: p.due || ''
    })),
    networking: arr(d.networking).map((c) => ({
      name: clip(c.name, 60),
      team: clip(c.team, 60),
      status: c.status || '',
      date: c.date || ''
    })),
    tasks: arr(d.tasks)
      .filter((t) => t && t.list !== 'done')
      .slice(0, 25)
      .map((t) => ({
        title: clip(t.title, 90),
        list: t.list || '',
        priority: t.priority || '',
        due: t.due || ''
      })),
    reflections: arr(d.reflections).slice(0, 4).map((r) => ({
      week: r.week || '',
      rating: r.rating || '',
      acc: clip(r.acc, 200),
      chal: clip(r.chal, 200)
    }))
  };
}

const SYSTEM_PROMPT = `You are Bob, an assistant inside an IBM intern productivity dashboard.
You answer questions about the intern's own logged data: activities, hours, goals, projects, learning, networking contacts, tasks and weekly reflections. The data is supplied as JSON in the user message.

Rules:
- Base every answer strictly on the JSON dashboard data provided. Never invent entries, names, numbers or dates.
- If the data does not contain the answer, say so plainly and suggest what the intern should log to get it.
- Be concise and specific. Prefer short paragraphs or tight bullet lists. Cite real numbers from the data.
- When asked for a status update or summary, write it in a tone suitable for sending to a manager.
- You cannot modify the dashboard. If asked to add or change something, explain which tab to use instead.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const apiKey = process.env.WATSONX_API_KEY;
    const projectId = process.env.WATSONX_PROJECT_ID;
    const baseUrl = (process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com').replace(/\/+$/, '');
    const modelId = process.env.MODEL_NAME || DEFAULT_MODEL;

    if (!apiKey || !projectId) {
      return res.status(503).json({
        answer:
          'The assistant is not configured yet. Add WATSONX_API_KEY and ' +
          'WATSONX_PROJECT_ID to the project environment variables in Vercel, ' +
          'then redeploy.'
      });
    }

    const prev = lastCall.get(user.id) || 0;
    if (Date.now() - prev < MIN_INTERVAL_MS) {
      return res.status(429).json({ answer: 'One moment — still working on the last question.' });
    }
    lastCall.set(user.id, Date.now());

    const question = String((req.body && req.body.question) || '').trim().slice(0, 1000);
    if (!question) return res.status(400).json({ error: 'Ask a question first.' });

    const summary = summarize(req.body && req.body.data);
    const token = await getIamToken(apiKey);

    const wxRes = await fetch(`${baseUrl}${CHAT_PATH}?version=${WATSONX_VERSION}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model_id: modelId,
        project_id: projectId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `Today's date: ${new Date().toISOString().slice(0, 10)}\n\n` +
              `My dashboard data (JSON):\n${JSON.stringify(summary)}\n\n` +
              `My question: ${question}`
          }
        ],
        max_tokens: 600,
        temperature: 0.2
      })
    });

    if (!wxRes.ok) {
      const detail = await wxRes.text().catch(() => '');
      console.error('watsonx error', wxRes.status, detail.slice(0, 500));
      if (wxRes.status === 401 || wxRes.status === 403) {
        tokenCache = { token: null, expiresAt: 0 }; // force refresh next time
      }
      return res.status(502).json({
        answer:
          `watsonx returned ${wxRes.status}. Check WATSONX_URL, WATSONX_PROJECT_ID ` +
          `and that MODEL_NAME ("${modelId}") is available in that project.`
      });
    }

    const body = await wxRes.json();
    const answer = (
      (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || ''
    ).trim();

    return res.status(200).json({ answer: answer || 'No response from the model.' });
  } catch (err) {
    console.error('ask failed:', err);
    return res.status(500).json({ answer: `Assistant error: ${err.message}` });
  }
}
