/**
 * Local user accounts — email/password auth with signed HTTP-only session cookies.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import * as store from './store.mjs';

const USERS_FILE = 'users.json';
const BOOTSTRAP_FILE = '.bootstrap-token';
const COOKIE_NAME = 'thedevcv_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REGISTRATION_MODES = new Set(['open', 'first-user', 'disabled']);

let secretPromise;
let bootstrapPromise;
let usersWriteQueue = Promise.resolve();
const DUMMY_PASSWORD_HASH = hashPassword('not-a-real-password');

function usersPath() {
  return path.join(store.dataDir(), USERS_FILE);
}

async function loadUsers() {
  try {
    const raw = await fs.readFile(usersPath(), 'utf8');
    const users = JSON.parse(raw);
    return Array.isArray(users) ? users : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveUsers(users) {
  await fs.mkdir(store.dataDir(), { recursive: true });
  const file = usersPath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

function withUsersWrite(work) {
  const run = usersWriteQueue.then(work);
  usersWriteQueue = run.catch(() => {});
  return run;
}

export function getRegistrationMode() {
  const configured = String(process.env.REGISTRATION_MODE ?? 'open').toLowerCase();
  return REGISTRATION_MODES.has(configured) ? configured : 'open';
}

function safeStringEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getBootstrapToken() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      if (process.env.BOOTSTRAP_TOKEN) return process.env.BOOTSTRAP_TOKEN;
      const file = path.join(store.dataDir(), BOOTSTRAP_FILE);
      try {
        const existing = (await fs.readFile(file, 'utf8')).trim();
        if (existing) return existing;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      const generated = randomBytes(24).toString('base64url');
      await fs.mkdir(store.dataDir(), { recursive: true });
      await fs.writeFile(file, generated, { mode: 0o600 });
      return generated;
    })();
  }
  return bootstrapPromise;
}

async function consumeBootstrapToken() {
  bootstrapPromise = undefined;
  if (process.env.BOOTSTRAP_TOKEN) return;
  try { await fs.unlink(path.join(store.dataDir(), BOOTSTRAP_FILE)); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
}

export async function getAuthStatus() {
  const users = await loadUsers();
  const mode = getRegistrationMode();
  return {
    registration: mode,
    registration_open: mode === 'open' || (mode === 'first-user' && users.length === 0),
    setup_required: users.length === 0,
  };
}

export async function initializeAuth() {
  const users = await loadUsers();
  if (users.length > 0 || getRegistrationMode() === 'disabled') return null;
  const token = await getBootstrapToken();
  return { token, generated: !process.env.BOOTSTRAP_TOKEN };
}

export async function getSessionSecret() {
  if (!secretPromise) {
    secretPromise = (async () => {
      if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
      const secretFile = path.join(store.dataDir(), '.session-secret');
      try {
        return (await fs.readFile(secretFile, 'utf8')).trim();
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        const generated = randomBytes(32).toString('base64url');
        await fs.mkdir(store.dataDir(), { recursive: true });
        await fs.writeFile(secretFile, generated, { mode: 0o600 });
        return generated;
      }
    })();
  }
  return secretPromise;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function createSessionToken(userId) {
  const secret = await getSessionSecret();
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ userId, exp }), 'utf8').toString('base64url');
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const secret = await getSessionSecret();
  const expected = signPayload(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed?.userId || !parsed?.exp || parsed.exp < Date.now()) return null;
  const users = await loadUsers();
  const user = users.find((u) => u.id === parsed.userId);
  if (!user) return null;
  return { id: user.id, email: user.email };
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) continue;
    try { out[rawKey] = decodeURIComponent(rest.join('=')); }
    catch { /* ignore malformed cookies */ }
  }
  return out;
}

function secureCookieSuffix(req) {
  const configured = String(process.env.COOKIE_SECURE ?? 'auto').toLowerCase();
  const secure = configured === 'true'
    || (configured !== 'false' && (req?.socket?.encrypted || req?.headers?.['x-forwarded-proto'] === 'https'));
  return secure ? '; Secure' : '';
}

export function sessionCookie(token, req) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookieSuffix(req)}`;
}

export function clearSessionCookie(req) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix(req)}`;
}

export async function register(email, password, setupToken) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const err = new Error('invalid_email');
    err.status = 400;
    throw err;
  }
  if (typeof password !== 'string' || password.length < 8) {
    const err = new Error('password_too_short');
    err.status = 400;
    throw err;
  }
  if (password.length > 256) {
    const err = new Error('password_too_long');
    err.status = 400;
    throw err;
  }

  return withUsersWrite(async () => {
    const users = await loadUsers();
    const mode = getRegistrationMode();
    if (mode === 'disabled' || (mode === 'first-user' && users.length > 0)) {
      const err = new Error('registration_disabled');
      err.status = 403;
      throw err;
    }
    if (users.length === 0) {
      const expected = await getBootstrapToken();
      if (!safeStringEqual(setupToken, expected)) {
        const err = new Error('invalid_setup_token');
        err.status = 403;
        throw err;
      }
    }
    if (users.some((u) => u.email === normalized)) {
      const err = new Error('email_taken');
      err.status = 409;
      throw err;
    }

    const user = {
      id: randomUUID(),
      email: normalized,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };
    users.push(user);
    await saveUsers(users);
    if (users.length === 1) {
      await consumeBootstrapToken().catch((err) => {
        // The account already exists, so a cleanup failure must not turn a
        // successful registration into a misleading 500 response.
        console.error('[auth] failed to remove bootstrap token file:', err.message);
      });
    }

    // The first account claims every row from the pre-auth self-hosted build.
    if (users.length === 1) {
      await migrateLegacyData(user.id).catch((err) => {
        console.error('[auth] legacy data migration failed:', err.message);
      });
    }

    return { id: user.id, email: user.email };
  });
}

async function migrateLegacyData(userId) {
  for (const table of ['cv_profiles', 'job_applications']) {
    const rows = await store.list(table);
    for (const row of rows) {
      if (row.user_id !== userId) {
        await store.update(table, { id: row.id }, { user_id: userId });
      }
    }
  }
}

export async function login(email, password) {
  const normalized = String(email ?? '').trim().toLowerCase();
  const users = await loadUsers();
  const user = users.find((u) => u.email === normalized);
  const valid = typeof password === 'string'
    && password.length <= 256
    && verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    const err = new Error('invalid_credentials');
    err.status = 401;
    throw err;
  }
  return { id: user.id, email: user.email };
}

export async function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

export async function getUserByMcpToken(token) {
  if (!token) return null;
  const { findUserIdByMcpToken } = await import('./settings.mjs');
  const userId = await findUserIdByMcpToken(token);
  if (!userId) return null;
  const users = await loadUsers();
  const user = users.find((candidate) => candidate.id === userId);
  return user ? { id: user.id, email: user.email } : null;
}

export async function authenticateMcpRequest(req) {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    const user = await getUserByMcpToken(bearer);
    if (user) return user;
  }
  return getUserFromRequest(req);
}
