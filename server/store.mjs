/**
 * JSON-file data store — the entire "database" of the self-hosted build.
 *
 * One file per table under DATA_DIR (`cv_profiles.json`, …), loaded lazily
 * into memory and persisted with atomic tmp-file + rename writes. Writes are
 * serialized per table so concurrent MCP + UI edits can't interleave a save.
 *
 * Emits { table } change events consumed by the SSE endpoint so the frontend
 * can live-refresh when an MCP client edits a CV.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export const TABLES = new Set([
  'cv_profiles',
  'cv_experience',
  'cv_education',
  'cv_skills',
  'cv_certifications',
  'cv_projects',
  'cv_languages',
  'cv_events',
  'job_applications',
]);

/** Tables that carry an auto-maintained updated_at column in the old schema. */
const HAS_UPDATED_AT = new Set(['cv_profiles', 'job_applications']);

export const changes = new EventEmitter();
changes.setMaxListeners(100);

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(import.meta.dirname, '..', 'data');

const cache = new Map();      // table -> rows[]
const writeQueue = new Map(); // table -> Promise chain

export function dataDir() {
  return DATA_DIR;
}

function assertTable(table) {
  if (!TABLES.has(table)) {
    const err = new Error(`unknown table: ${table}`);
    err.status = 400;
    throw err;
  }
}

async function load(table) {
  assertTable(table);
  if (cache.has(table)) return cache.get(table);
  const file = path.join(DATA_DIR, `${table}.json`);
  let rows = [];
  try {
    rows = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  cache.set(table, rows);
  return rows;
}

function persist(table) {
  const prev = writeQueue.get(table) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${table}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(cache.get(table) ?? [], null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
  }).catch((err) => console.error(`[store] persist ${table} failed:`, err));
  writeQueue.set(table, next);
  return next;
}

function matches(row, where) {
  return Object.entries(where ?? {}).every(([k, v]) => row[k] === v);
}

function applyOrder(rows, order) {
  if (!order?.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, ascending = true } of order) {
      const av = a[column];
      const bv = b[column];
      if (av === bv) continue;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : 1;
      return ascending ? cmp : -cmp;
    }
    return 0;
  });
}

/** SELECT — where is {col: value}, order is [{column, ascending}]. */
export async function list(table, { where, order, limit } = {}) {
  const rows = (await load(table)).filter((r) => matches(r, where));
  const sorted = applyOrder(rows, order);
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}

export async function getById(table, id) {
  return (await load(table)).find((r) => r.id === id) ?? null;
}

export async function insert(table, rowOrRows) {
  const rows = await load(table);
  const now = new Date().toISOString();
  const input = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  const created = input.map((r) => {
    // IDs are always generated at the trust boundary. Accepting caller IDs lets
    // one account collide with another account's public CV/item IDs.
    const row = { ...r, id: randomUUID(), created_at: r.created_at ?? now };
    if (HAS_UPDATED_AT.has(table)) row.updated_at = now;
    return row;
  });
  rows.push(...created);
  await persist(table);
  changes.emit('change', { table });
  return created;
}

export async function update(table, where, patch) {
  if (!where || !Object.keys(where).length) {
    const err = new Error('update requires a filter');
    err.status = 400;
    throw err;
  }
  const rows = await load(table);
  const updated = [];
  for (let i = 0; i < rows.length; i++) {
    if (!matches(rows[i], where)) continue;
    const next = { ...rows[i], ...patch, id: rows[i].id, created_at: rows[i].created_at };
    if (HAS_UPDATED_AT.has(table)) next.updated_at = new Date().toISOString();
    rows[i] = next;
    updated.push(next);
  }
  if (updated.length) {
    await persist(table);
    changes.emit('change', { table });
  }
  return updated;
}

export async function remove(table, where) {
  if (!where || !Object.keys(where).length) {
    const err = new Error('delete requires a filter');
    err.status = 400;
    throw err;
  }
  const rows = await load(table);
  const kept = rows.filter((r) => !matches(r, where));
  const removed = rows.length - kept.length;
  if (removed) {
    cache.set(table, kept);
    // Deleting a CV cascades to its sections, mirroring the old FK behaviour.
    if (table === 'cv_profiles') {
      const ids = rows.filter((r) => matches(r, where)).map((r) => r.id);
      for (const child of ['cv_experience', 'cv_education', 'cv_skills', 'cv_certifications', 'cv_projects', 'cv_languages', 'cv_events']) {
        const childRows = await load(child);
        const keptChildren = childRows.filter((r) => !ids.includes(r.profile_id));
        if (keptChildren.length !== childRows.length) {
          cache.set(child, keptChildren);
          await persist(child);
          changes.emit('change', { table: child });
        }
      }
      const apps = await load('job_applications');
      let touched = false;
      for (const app of apps) {
        if (ids.includes(app.cv_profile_id)) { app.cv_profile_id = null; touched = true; }
      }
      if (touched) await persist('job_applications');
    }
    await persist(table);
    changes.emit('change', { table });
  }
  return { removed };
}

/** Full dump of every table — powers the backup/export button. */
export async function exportAll() {
  const dump = {};
  for (const table of TABLES) dump[table] = await list(table);
  return dump;
}
