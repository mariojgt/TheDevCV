/**
 * Per-user settings — encrypted Anthropic API keys and MCP access tokens.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import * as store from './store.mjs';
import { encrypt, decrypt } from './crypto.mjs';
import { getSessionSecret } from './auth.mjs';

const SETTINGS_FILE = 'user_settings.json';
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-opus-5';
let settingsWriteQueue = Promise.resolve();

function settingsPath() {
  return path.join(store.dataDir(), SETTINGS_FILE);
}

async function loadAll() {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function saveAll(rows) {
  await fs.mkdir(store.dataDir(), { recursive: true });
  const file = settingsPath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

function withSettingsWrite(work) {
  const run = settingsWriteQueue.then(work);
  settingsWriteQueue = run.catch(() => {});
  return run;
}

function newSettingsRow(userId) {
  return {
    user_id: userId,
    theme: 'dark',
    ai_provider: 'anthropic',
    ai_model: DEFAULT_MODEL,
    anthropic_api_key_encrypted: null,
    mcp_token: randomBytes(24).toString('base64url'),
    updated_at: new Date().toISOString(),
  };
}

async function encryptionSecret() {
  return process.env.SETTINGS_ENCRYPTION_KEY || getSessionSecret();
}

export async function getSettingsRecord(userId) {
  const rows = await loadAll();
  let row = rows.find((r) => r.user_id === userId);
  if (row) return row;
  return withSettingsWrite(async () => {
    const current = await loadAll();
    row = current.find((r) => r.user_id === userId);
    if (row) return row;
    row = newSettingsRow(userId);
    current.push(row);
    await saveAll(current);
    return row;
  });
}

export async function getPublicSettings(userId) {
  const row = await getSettingsRecord(userId);
  const envKey = process.env.ANTHROPIC_API_KEY;
  const hasUserKey = Boolean(row.anthropic_api_key_encrypted);
  let readableUserKey = false;
  let keyHint = null;
  if (hasUserKey) {
    try {
      const secret = await encryptionSecret();
      const key = decrypt(row.anthropic_api_key_encrypted, secret);
      keyHint = key.slice(-4);
      readableUserKey = true;
    } catch {
      keyHint = null;
    }
  }
  if (!readableUserKey && envKey) {
    keyHint = envKey.slice(-4);
  }
  const aiConfigured = readableUserKey || Boolean(envKey);
  const source = readableUserKey ? 'user' : envKey ? 'env' : 'none';
  return {
    user_id: userId,
    theme: row.theme ?? 'dark',
    ai_enabled: aiConfigured,
    ai_provider: row.ai_provider ?? 'anthropic',
    ai_model: row.ai_model ?? DEFAULT_MODEL,
    ai_configured: aiConfigured,
    ai_source: source,
    ai_key_hint: keyHint,
    mcp_token: row.mcp_token,
  };
}

export async function setAnthropicKey(userId, apiKey) {
  const key = String(apiKey ?? '').trim();
  if (!key.startsWith('sk-ant-') || key.length > 512) {
    const err = new Error('invalid_api_key');
    err.status = 400;
    throw err;
  }

  const client = new Anthropic({ apiKey: key });
  try {
    await client.models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      const e = new Error('invalid_api_key');
      e.status = 400;
      throw e;
    }
    const e = new Error('api_key_validation_failed');
    e.status = 502;
    throw e;
  }

  const secret = await encryptionSecret();
  await withSettingsWrite(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => r.user_id === userId);
    const existing = idx >= 0 ? rows[idx] : null;
    const next = {
      ...(existing ?? newSettingsRow(userId)),
      anthropic_api_key_encrypted: encrypt(key, secret),
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    await saveAll(rows);
  });
  return getPublicSettings(userId);
}

export async function clearAnthropicKey(userId) {
  await withSettingsWrite(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => r.user_id === userId);
    if (idx < 0) return;
    rows[idx] = {
      ...rows[idx],
      anthropic_api_key_encrypted: null,
      updated_at: new Date().toISOString(),
    };
    await saveAll(rows);
  });
  return getPublicSettings(userId);
}

export async function rotateMcpToken(userId) {
  await withSettingsWrite(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => r.user_id === userId);
    const next = {
      ...(idx >= 0 ? rows[idx] : newSettingsRow(userId)),
      mcp_token: randomBytes(24).toString('base64url'),
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    await saveAll(rows);
  });
  return getPublicSettings(userId);
}

export async function findUserIdByMcpToken(token) {
  if (typeof token !== 'string' || token.length < 24 || token.length > 256) return null;
  const received = Buffer.from(token);
  const rows = await loadAll();
  for (const row of rows) {
    if (typeof row.mcp_token !== 'string') continue;
    const expected = Buffer.from(row.mcp_token);
    if (received.length === expected.length && timingSafeEqual(received, expected)) return row.user_id;
  }
  return null;
}

export async function getAnthropicClientForUser(userId) {
  const row = await getSettingsRecord(userId);
  if (row.anthropic_api_key_encrypted) {
    try {
      const secret = await encryptionSecret();
      const apiKey = decrypt(row.anthropic_api_key_encrypted, secret);
      return { client: new Anthropic({ apiKey }), model: row.ai_model ?? DEFAULT_MODEL, source: 'user' };
    } catch (err) {
      console.error('[settings] failed to decrypt user API key:', err.message);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      client: new Anthropic(),
      model: row.ai_model ?? DEFAULT_MODEL,
      source: 'env',
    };
  }
  return null;
}
