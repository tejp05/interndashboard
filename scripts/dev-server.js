/**
 * dev-server.js — run the whole app locally with no cloud dependencies.
 *
 *   node scripts/dev-server.js            → http://localhost:3000
 *   node scripts/dev-server.js --port 4000
 *
 * Serves public/ statically and dispatches /api/* to the very same handler
 * modules Vercel runs, backed by an in-process Postgres (PGlite). Data lives
 * in .devdata/ so it survives restarts. Delete that folder for a clean slate.
 *
 * This is a convenience for development and for verifying changes. Production
 * runs on Vercel against Neon — see README.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPgliteClient } from './pglite-adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');

// Pick up WATSONX_* and friends from .env if one exists, so Ask Bob works
// locally. Absent or malformed .env is fine — those features just stay off.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env — carry on */
}

const argPort = process.argv.indexOf('--port');
const PORT = argPort !== -1 ? Number(process.argv[argPort + 1]) : Number(process.env.PORT) || 3000;

process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'dev-only-secret-not-for-production-use-0123456789';
process.env.COHORT_NAME = process.env.COHORT_NAME || 'Summer 2026 Interns (local)';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// ── Route table: url path → handler module ──────────────────────────────────
const ROUTES = [
  { re: /^\/api\/auth\/([\w-]+)$/, mod: 'api/auth/[action].js', keys: ['action'] },
  { re: /^\/api\/data\/([\w-]+)$/, mod: 'api/data/[section].js', keys: ['section'] },
  { re: /^\/api\/directory$/, mod: 'api/directory.js', keys: [] },
  { re: /^\/api\/ask$/, mod: 'api/ask.js', keys: [] }
];

const handlerCache = new Map();
async function loadHandler(rel) {
  if (!handlerCache.has(rel)) {
    const mod = await import(pathToFileURL(path.join(ROOT, rel)).href);
    handlerCache.set(rel, mod.default);
  }
  return handlerCache.get(rel);
}

/** Minimal stand-in for the Vercel Node request/response objects. */
function shimResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // Reject traversal before touching the filesystem.
  const full = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    const body = await fs.readFile(full);
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('404 Not Found');
  }
}

async function main() {
  globalThis.__DB__ = await createPgliteClient(path.join(ROOT, '.devdata'));
  console.log('Local Postgres (PGlite) ready — data in .devdata/');

  const server = http.createServer(async (req, res) => {
    shimResponse(res);
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

    const route = ROUTES.find((r) => r.re.test(pathname));
    if (!route) return res.status(404).json({ error: 'No such API route.' });

    const match = pathname.match(route.re);
    req.query = Object.fromEntries(url.searchParams);
    route.keys.forEach((k, i) => {
      req.query[k] = decodeURIComponent(match[i + 1]);
    });

    try {
      req.body = await readBody(req);
      const handler = await loadHandler(route.mod);
      await handler(req, res);
    } catch (err) {
      console.error(`${req.method} ${pathname} →`, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  Intern Dashboard running at http://localhost:${PORT}\n`);
  });
}

main().catch((err) => {
  console.error('Dev server failed to start:', err);
  process.exit(1);
});
