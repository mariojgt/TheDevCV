/**
 * Row-level access control — every authenticated user only sees their own data.
 */
import * as store from './store.mjs';

const USER_TABLES = new Set(['cv_profiles', 'job_applications']);
const PROFILE_CHILD_TABLES = new Set([
  'cv_experience',
  'cv_education',
  'cv_skills',
  'cv_certifications',
  'cv_projects',
  'cv_languages',
  'cv_events',
]);

function notFound() {
  const err = new Error('not_found');
  err.status = 404;
  return err;
}

function assertObject(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    const err = new Error('invalid_row');
    err.status = 400;
    throw err;
  }
}

async function ownedProfileIds(userId) {
  const profiles = await store.list('cv_profiles', { where: { user_id: userId } });
  return new Set(profiles.map((p) => p.id));
}

export async function userOwnsProfile(userId, profileId) {
  if (!profileId) return false;
  const profile = await store.getById('cv_profiles', profileId);
  return profile?.user_id === userId;
}

export async function filterRowsForUser(table, userId, rows) {
  if (USER_TABLES.has(table)) {
    return rows.filter((r) => r.user_id === userId);
  }
  if (PROFILE_CHILD_TABLES.has(table)) {
    const owned = await ownedProfileIds(userId);
    return rows.filter((r) => owned.has(r.profile_id));
  }
  return rows;
}

export async function listForUser(table, userId, opts = {}) {
  const rows = await store.list(table, { where: opts.where, order: opts.order });
  let filtered = await filterRowsForUser(table, userId, rows);
  if (typeof opts.limit === 'number') filtered = filtered.slice(0, Math.max(0, opts.limit));
  return filtered;
}

export async function assertCanReadRow(table, userId, row) {
  if (!row) {
    throw notFound();
  }
  if (USER_TABLES.has(table) && row.user_id !== userId) {
    throw notFound();
  }
  if (PROFILE_CHILD_TABLES.has(table) && !(await userOwnsProfile(userId, row.profile_id))) {
    throw notFound();
  }
}

async function assertOwnedJobProfile(userId, profileId) {
  if (profileId === null || profileId === undefined || profileId === '') return;
  if (!(await userOwnsProfile(userId, profileId))) throw notFound();
}

export async function assertCanWriteRows(table, userId, rows) {
  const input = Array.isArray(rows) ? rows : [rows];
  for (const row of input) {
    assertObject(row);
    if (USER_TABLES.has(table)) {
      if (row.user_id && row.user_id !== userId) {
        throw notFound();
      }
      row.user_id = userId;
      if (table === 'job_applications') await assertOwnedJobProfile(userId, row.cv_profile_id);
      continue;
    }
    if (PROFILE_CHILD_TABLES.has(table)) {
      if (!(await userOwnsProfile(userId, row.profile_id))) {
        throw notFound();
      }
    }
  }
}

export async function prepareUpdatePatch(table, userId, patch) {
  assertObject(patch);
  const safe = { ...patch };
  if (USER_TABLES.has(table) && 'user_id' in safe) {
    if (safe.user_id !== userId) throw notFound();
    delete safe.user_id;
  }
  if (PROFILE_CHILD_TABLES.has(table) && 'profile_id' in safe) {
    const err = new Error('immutable_field:profile_id');
    err.status = 400;
    throw err;
  }
  if (table === 'job_applications' && 'cv_profile_id' in safe) {
    await assertOwnedJobProfile(userId, safe.cv_profile_id);
  }
  return safe;
}

export async function assertCanMutateWhere(table, userId, where) {
  if (!where || typeof where !== 'object' || Array.isArray(where) || !Object.keys(where).length) {
    const err = new Error('mutation_requires_filter');
    err.status = 400;
    throw err;
  }
  const rows = await store.list(table, { where });
  for (const row of rows) {
    await assertCanReadRow(table, userId, row);
  }
  if (!rows.length) {
    throw notFound();
  }
}
