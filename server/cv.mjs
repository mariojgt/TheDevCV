/**
 * CV domain operations — Node ports of the old Postgres RPCs
 * (ensure_share_token / get_shared_cv / record_cv_event / get_cv_stats)
 * plus helpers shared between the REST API and the MCP tools.
 */
import { randomBytes } from 'node:crypto';
import * as store from './store.mjs';

export const SECTION_TABLES = {
  experience: 'cv_experience',
  education: 'cv_education',
  skills: 'cv_skills',
  certifications: 'cv_certifications',
  projects: 'cv_projects',
  languages: 'cv_languages',
};

const sortOrder = [{ column: 'sort_order', ascending: true }];

/** Profile row + every section, shaped exactly like the old get_shared_cv payload. */
export async function getFullCV(profileId) {
  const profile = await store.getById('cv_profiles', profileId);
  if (!profile) return null;
  const sections = {};
  for (const [key, table] of Object.entries(SECTION_TABLES)) {
    sections[key] = await store.list(table, { where: { profile_id: profileId }, order: sortOrder });
  }
  const { user_id: _user, ...publicProfile } = profile;
  return { profile: publicProfile, ...sections };
}

export async function ensureShareToken(profileId) {
  const profile = await store.getById('cv_profiles', profileId);
  if (!profile) return null;
  const token = profile.share_token ?? randomBytes(16).toString('hex');
  await store.update('cv_profiles', { id: profileId }, {
    share_token: token,
    is_shared: true,
    shared_at: profile.shared_at ?? new Date().toISOString(),
  });
  return token;
}

export async function getSharedCV(token) {
  if (!token || String(token).length < 16) return null;
  const [profile] = await store.list('cv_profiles', { where: { share_token: token, is_shared: true }, limit: 1 });
  if (!profile) return null;
  // Fire-and-forget view event, mirroring the old SQL function.
  store.insert('cv_events', { profile_id: profile.id, event_type: 'view', metadata: {} }).catch(() => {});
  return getFullCV(profile.id);
}

export async function recordEvent(profileId, eventType, metadata = {}) {
  if (!profileId || !['view', 'download'].includes(eventType)) return;
  const profile = await store.getById('cv_profiles', profileId);
  if (!profile) return;
  await store.insert('cv_events', { profile_id: profileId, event_type: eventType, metadata: metadata ?? {} });
}

export async function getStats(profileId) {
  const profile = await store.getById('cv_profiles', profileId);
  if (!profile) return null;

  const events = await store.list('cv_events', { where: { profile_id: profileId } });
  const views = events.filter((e) => e.event_type === 'view');
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const apps = (await store.list('job_applications', { where: { cv_profile_id: profileId } }));

  const applications = apps.filter((a) => a.status !== 'saved').length;
  const responses = apps.filter((a) => !['saved', 'applied', 'ghosted'].includes(a.status)).length;
  const interviews = apps.filter((a) => ['interview', 'technical', 'final_round', 'offer', 'accepted'].includes(a.status)).length;
  const offers = apps.filter((a) => ['offer', 'accepted'].includes(a.status)).length;

  return {
    views: views.length,
    views_30d: views.filter((e) => Date.parse(e.created_at) > cutoff).length,
    downloads: events.filter((e) => e.event_type === 'download').length,
    applications,
    responses,
    interviews,
    offers,
    response_rate: applications > 0 ? Math.round((100 * responses) / applications) : 0,
    last_view: views.map((e) => e.created_at).sort().at(-1) ?? null,
  };
}

/** Copy a CV + all sections, optionally retargeting it at a new role. */
export async function duplicateCV(profileId, { targetRole, versionName } = {}) {
  const src = await store.getById('cv_profiles', profileId);
  if (!src) return null;
  const { id: _id, created_at: _c, updated_at: _u, share_token: _t, is_shared: _s, shared_at: _sa, ...fields } = src;
  const role = targetRole?.trim();
  const autoName = role ? `${src.version_name} — ${role}` : `${src.version_name} (Copy)`;
  const [copy] = await store.insert('cv_profiles', {
    ...fields,
    version_name: versionName?.trim() || autoName,
    target_role: role || src.target_role,
    is_default: false,
  });
  for (const table of Object.values(SECTION_TABLES)) {
    const rows = await store.list(table, { where: { profile_id: profileId }, order: sortOrder });
    if (!rows.length) continue;
    await store.insert(table, rows.map(({ id: _rid, created_at: _rc, ...rest }) => ({ ...rest, profile_id: copy.id })));
  }
  return copy;
}
