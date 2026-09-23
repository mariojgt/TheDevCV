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
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
let settingsWriteQueue = Promise.resolve();

const DEFAULT_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

export function availableModels() {
  if (process.env.AI_MODELS) {
    return process.env.AI_MODELS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => ({ id, label: id }));
  }
  return DEFAULT_MODELS;
}

function anthropicClientOptions(apiKey, workspaceId) {
  const opts = { apiKey };
  if (workspaceId) opts.defaultHeaders = { 'anthropic-workspace-id': workspaceId };
  return opts;
}

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
    anthropic_workspace_id: null,
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
    ai_models: availableModels(),
    ai_configured: aiConfigured,
    ai_source: source,
    ai_key_hint: keyHint,
    mcp_token: row.mcp_token,
  };
}

export async function setAnthropicKey(userId, apiKey, workspaceId) {
  const key = String(apiKey ?? '').trim();
  if (!key.startsWith('sk-ant-') || key.length > 512) {
    const err = new Error('invalid_api_key');
    err.status = 400;
    throw err;
  }
  const ws = String(workspaceId ?? '').trim();

  const client = new Anthropic(anthropicClientOptions(key, ws));
  try {
    await client.models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      const e = new Error('invalid_api_key');
      e.status = 400;
      e.detail = ws
        ? 'Anthropic rejected this key. Check the key and workspace ID, then retry.'
        : 'Anthropic rejected this key. Workspace-scoped keys (sk-ant-api03…) also need their workspace ID (wrk_…) saved below.';
      throw e;
    }
    if (err instanceof Anthropic.APIError && err.message.includes('anthropic-workspace-id')) {
      const e = new Error('anthropic_workspace_id_required');
      e.status = 400;
      e.detail = 'This key is scoped to an Anthropic workspace. Add its workspace ID (wrk_…) and try again, or use a standard API key.';
      throw e;
    }
    console.error('[settings] key validation failed:', err instanceof Error ? err.message : err);
    const e = new Error('api_key_validation_failed');
    e.status = 502;
    e.detail = err instanceof Error ? err.message : String(err);
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
      anthropic_workspace_id: ws || null,
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) rows[idx] = next;
    else rows.push(next);
    await saveAll(rows);
  });
  return getPublicSettings(userId);
}

export async function setAiModel(userId, modelId) {
  const id = String(modelId ?? '').trim();
  const list = availableModels();
  if (!id || (list.length && !list.some((model) => model.id === id))) {
    const err = new Error('invalid_model');
    err.status = 400;
    err.detail = 'Choose a valid model from the list, or set AI_MODELS on the server to offer other options.';
    throw err;
  }
  await withSettingsWrite(async () => {
    const rows = await loadAll();
    const idx = rows.findIndex((r) => r.user_id === userId);
    const next = {
      ...(idx >= 0 ? rows[idx] : newSettingsRow(userId)),
      ai_model: id,
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
      return {
        client: new Anthropic(anthropicClientOptions(apiKey, row.anthropic_workspace_id)),
        model: row.ai_model ?? DEFAULT_MODEL,
        source: 'user',
      };
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
