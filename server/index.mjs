/**
 * TheDevCV self-hosted server — one small Node process, no database.
 */
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import * as store from './store.mjs';
import * as access from './access.mjs';
import * as cv from './cv.mjs';
import * as auth from './auth.mjs';
import * as settings from './settings.mjs';
import { handleJobsProxy } from './jobs.mjs';
import { handleMcpRequest } from './mcp.mjs';

const PORT = Number(process.env.PORT || 8720);
const HOST = process.env.HOST || '0.0.0.0';
const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5';
const STATIC_DIR = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(import.meta.dirname, '..', 'frontend', 'dist');

// ── helpers ───────────────────────────────────────────────────────

function json(res, payload, status = 200, headers = {}) {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function parseJSONParam(value) {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

function isPublicPath(pathname, method) {
  if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname === '/api/rpc/get_shared_cv' && method === 'POST') return true;
  return false;
}

const authRateLimits = new Map();
function enforceAuthRateLimit(req, action) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const key = `${req.socket.remoteAddress ?? 'unknown'}:${action}`;
  const current = authRateLimits.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  entry.count += 1;
  authRateLimits.set(key, entry);
  if (entry.count > 25) {
    const err = new Error('too_many_attempts');
    err.status = 429;
    throw err;
  }
}

// ── SSE live-refresh ─────────────────────────────────────────────

const sseClients = new Set();
store.changes.on('change', ({ table }) => {
  const frame = `event: change\ndata: ${JSON.stringify({ table })}\n\n`;
  for (const client of sseClients) client.write(frame);
});

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
}

// ── RPCs ─────────────────────────────────────────────────────────

async function handleRpc(name, args, user) {
  switch (name) {
    case 'ensure_share_token':
      await access.assertCanMutateWhere('cv_profiles', user.id, { id: args?.p_profile_id });
      return cv.ensureShareToken(args?.p_profile_id);
    case 'get_shared_cv':
      return cv.getSharedCV(args?.p_token);
    case 'record_cv_event':
      await access.assertCanMutateWhere('cv_profiles', user.id, { id: args?.p_profile_id });
      await cv.recordEvent(args?.p_profile_id, args?.p_event_type, args?.p_metadata);
      return null;
    case 'get_cv_stats':
      await access.assertCanMutateWhere('cv_profiles', user.id, { id: args?.p_profile_id });
      return cv.getStats(args?.p_profile_id);
    default: {
      const err = new Error(`unknown rpc: ${name}`);
      err.status = 404;
      throw err;
    }
  }
}

// ── AI proxy ─────────────────────────────────────────────────────

async function handleAI(body, res, user) {
  const ai = await settings.getAnthropicClientForUser(user.id);
  if (!ai) {
    return json(res, {
      error: 'ai_not_configured',
      detail: 'Add your Anthropic API key in Settings, or set ANTHROPIC_API_KEY on the server.',
    }, 503);
  }
  if (!body?.prompt || typeof body.prompt !== 'string') {
    return json(res, { error: 'missing_prompt' }, 400);
  }
  try {
    const response = await ai.client.messages.create({
      model: ai.model || AI_MODEL,
      max_tokens: Math.min(Math.max(body.max_tokens ?? 2000, 1024), 16000),
      system: body.system,
      messages: [{ role: 'user', content: body.prompt }],
    });
    if (response.stop_reason === 'refusal') {
      return json(res, { error: 'ai_refusal', detail: 'The model declined this request.' }, 502);
    }
    const text = response.content.find((c) => c.type === 'text')?.text ?? '';
    return json(res, { text });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('[ai] anthropic error', err.status, err.message);
      return json(res, { error: 'ai_upstream_error', detail: err.message }, 502);
    }
    throw err;
  }
}

// ── static files ─────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

async function serveStatic(req, res, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(STATIC_DIR, safePath);
  if (!filePath.startsWith(STATIC_DIR)) return json(res, { error: 'not_found' }, 404);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const immutable = safePath.startsWith('/assets/') || safePath.startsWith('assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    json(res, { error: 'not_found', detail: 'Frontend build missing — run `npm run build` in frontend/.' }, 404);
  }
}

// ── router ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      enforceAuthRateLimit(req, 'register');
      const body = await readBody(req);
      const user = await auth.register(body?.email, body?.password, body?.setup_token);
      const token = await auth.createSessionToken(user.id);
      return json(res, { user }, 201, { 'Set-Cookie': auth.sessionCookie(token, req) });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      enforceAuthRateLimit(req, 'login');
      const body = await readBody(req);
      const user = await auth.login(body?.email, body?.password);
      const token = await auth.createSessionToken(user.id);
      return json(res, { user }, 200, { 'Set-Cookie': auth.sessionCookie(token, req) });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      return json(res, { ok: true }, 200, { 'Set-Cookie': auth.clearSessionCookie(req) });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await auth.getUserFromRequest(req);
      if (!user) return json(res, { error: 'unauthorized' }, 401);
      return json(res, { user });
    }

    if (pathname === '/api/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      const authStatus = await auth.getAuthStatus();
      return json(res, {
        ok: true,
        auth: true,
        ...authStatus,
        version: '1.1.0',
      });
    }

    if (pathname === '/mcp') {
      const user = await auth.authenticateMcpRequest(req);
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      await handleMcpRequest(req, res, body, user);
      return;
    }

    const user = pathname.startsWith('/api/') ? await auth.getUserFromRequest(req) : null;
    if (pathname.startsWith('/api/') && !isPublicPath(pathname, req.method) && !user) {
      return json(res, { error: 'unauthorized' }, 401);
    }

    if (pathname === '/api/events') return handleEvents(req, res);

    if (pathname === '/api/settings' && req.method === 'GET') {
      return json(res, await settings.getPublicSettings(user.id));
    }

    if (pathname === '/api/settings/anthropic-key' && req.method === 'PUT') {
      const body = await readBody(req);
      return json(res, await settings.setAnthropicKey(user.id, body?.api_key));
    }

    if (pathname === '/api/settings/anthropic-key' && req.method === 'DELETE') {
      return json(res, await settings.clearAnthropicKey(user.id));
    }

    if (pathname === '/api/settings/mcp-token' && req.method === 'POST') {
      return json(res, await settings.rotateMcpToken(user.id));
    }

    if (pathname === '/api/export' && req.method === 'GET') {
      const dump = await store.exportAll();
      const scoped = {};
      for (const table of store.TABLES) {
        scoped[table] = await access.filterRowsForUser(table, user.id, dump[table] ?? []);
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="thedevcv-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      });
      return res.end(JSON.stringify(scoped, null, 2));
    }

    const dbMatch = pathname.match(/^\/api\/db\/([a-z_]+)$/);
    if (dbMatch) {
      const table = dbMatch[1];
      if (req.method === 'GET') {
        const rows = await access.listForUser(table, user.id, {
          where: parseJSONParam(url.searchParams.get('where')),
          order: parseJSONParam(url.searchParams.get('order')),
          limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
        });
        return json(res, rows);
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const rows = Array.isArray(body?.rows ?? body) ? (body?.rows ?? body) : [body?.rows ?? body];
        await access.assertCanWriteRows(table, user.id, rows);
        return json(res, await store.insert(table, rows), 201);
      }
      if (req.method === 'PATCH') {
        const body = await readBody(req);
        await access.assertCanMutateWhere(table, user.id, body?.where);
        const patch = await access.prepareUpdatePatch(table, user.id, body?.patch);
        return json(res, await store.update(table, body?.where, patch));
      }
      if (req.method === 'DELETE') {
        const where = parseJSONParam(url.searchParams.get('where'));
        await access.assertCanMutateWhere(table, user.id, where);
        return json(res, await store.remove(table, where));
      }
      return json(res, { error: 'method_not_allowed' }, 405);
    }

    const rpcMatch = pathname.match(/^\/api\/rpc\/([a-z_]+)$/);
    if (rpcMatch && req.method === 'POST') {
      const args = await readBody(req);
      const rpcName = rpcMatch[1];
      if (rpcName === 'get_shared_cv') {
        return json(res, await handleRpc(rpcName, args ?? {}, user));
      }
      if (!user) return json(res, { error: 'unauthorized' }, 401);
      return json(res, await handleRpc(rpcName, args ?? {}, user));
    }

    if (pathname === '/api/fn/ai' && req.method === 'POST') {
      return handleAI(await readBody(req), res, user);
    }

    if (pathname === '/api/fn/jobs-proxy' && req.method === 'POST') {
      const { status, payload } = await handleJobsProxy((await readBody(req)) ?? {});
      return json(res, payload, status);
    }

    if (pathname.startsWith('/api/')) return json(res, { error: 'not_found' }, 404);

    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'method_not_allowed' }, 405);
    return serveStatic(req, res, pathname);
  } catch (err) {
    if ((err.status ?? 500) >= 500) console.error(`[server] ${req.method} ${pathname}:`, err);
    if (!res.headersSent) json(res, { error: err.message ?? 'internal_error' }, err.status ?? 500);
    else res.end();
  }
});

const setup = await auth.initializeAuth();
server.listen(PORT, HOST, () => {
  console.log(`TheDevCV self-hosted`);
  console.log(`  app     http://localhost:${PORT}`);
  console.log(`  mcp     http://localhost:${PORT}/mcp`);
  console.log(`  data    ${store.dataDir()}`);
  console.log(`  ai      per-user keys in Settings; server env fallback ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled'}`);
  if (setup?.generated) {
    console.log(`  setup   first-account token: ${setup.token}`);
  } else if (setup) {
    console.log('  setup   first-account token configured with BOOTSTRAP_TOKEN');
  }
});
