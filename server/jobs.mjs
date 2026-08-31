/**
 * Jobs proxy — Node port of the old `jobs-proxy` Supabase Edge Function.
 *
 * Aggregates free public job-board APIs (Remotive + RemoteOK + Arbeitnow) and
 * free company-intel sources (Wikipedia + Wikidata + Nominatim) so the browser
 * doesn't have to deal with CORS, rate-limits, or divergent schemas.
 */

const UA = process.env.JOBS_UA ?? 'TheDevCV/1.0 (self-hosted)';
const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

const FIELD_SYNONYMS = {
  'software-dev':     ['software engineer', 'developer', 'programmer', 'software', 'backend', 'frontend', 'full stack'],
  'design':           ['design', 'designer', 'ux', 'ui', 'product designer', 'graphic'],
  'marketing':        ['marketing', 'growth', 'seo', 'content', 'brand', 'demand gen'],
  'sales':            ['sales', 'account executive', 'business development', 'bd', 'account manager'],
  'product':          ['product manager', 'product owner', 'product'],
  'data':             ['data scientist', 'data analyst', 'data engineer', 'machine learning', 'ml', 'analytics'],
  'devops':           ['devops', 'sre', 'infrastructure', 'platform engineer', 'sysadmin', 'cloud engineer'],
  'customer-support': ['customer support', 'customer success', 'support', 'cs'],
  'finance-legal':    ['finance', 'accountant', 'legal', 'compliance', 'auditor', 'tax'],
  'hr':               ['hr', 'recruiter', 'people', 'talent'],
  'qa':               ['qa', 'quality assurance', 'test engineer', 'sdet'],
  'writing':          ['writer', 'editor', 'content writer', 'copywriter', 'technical writer'],
  'business':         ['operations', 'strategy', 'business analyst', 'program manager'],
};

function matchesField(job, field) {
  if (!field) return true;
  const synonyms = FIELD_SYNONYMS[field];
  if (!synonyms) return true;
  const hay = `${job.title} ${job.tags.join(' ')}`.toLowerCase();
  return synonyms.some((s) => hay.includes(s));
}

const ANYWHERE_LOCATIONS = /\b(worldwide|remote|anywhere|global|any location|everywhere)\b/i;

// ── job source adapters ──────────────────────────────────────────

async function fetchRemotive(query, field) {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  if (field) params.set('category', field);
  params.set('limit', '50');
  const res = await fetchWithTimeout(`https://remotive.com/api/remote-jobs?${params}`);
  if (!res.ok) return [];
  const data = await safeJson(res);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    id: `remotive-${j.id}`,
    source: 'remotive',
    title: String(j.title ?? ''),
    company: String(j.company_name ?? ''),
    companyLogo: j.company_logo ?? null,
    location: j.candidate_required_location ?? null,
    remote: true,
    description: String(j.description ?? ''),
    url: String(j.url ?? ''),
    postedAt: j.publication_date ?? null,
    tags: Array.isArray(j.tags) ? j.tags : [],
    salary: j.salary || null,
  }));
}

async function fetchRemoteOK(query, field) {
  const res = await fetchWithTimeout('https://remoteok.com/api');
  if (!res.ok) return [];
  const data = await safeJson(res);
  if (!Array.isArray(data)) return [];
  const jobs = data.slice(1); // element [0] is a legal notice
  const q = query.toLowerCase();
  const fieldSyns = field ? FIELD_SYNONYMS[field] ?? [] : [];
  return jobs
    .filter((j) => {
      const hay = `${j.position ?? ''} ${j.company ?? ''} ${j.description ?? ''} ${(Array.isArray(j.tags) ? j.tags.join(' ') : '')}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (fieldSyns.length && !fieldSyns.some((s) => hay.includes(s))) return false;
      return true;
    })
    .map((j) => ({
      id: `remoteok-${j.id ?? j.slug}`,
      source: 'remoteok',
      title: String(j.position ?? ''),
      company: String(j.company ?? ''),
      companyLogo: (j.company_logo || j.logo) ?? null,
      location: j.location || 'Remote',
      remote: true,
      description: String(j.description ?? ''),
      url: String(j.apply_url ?? j.url ?? ''),
      postedAt: j.date ?? null,
      tags: Array.isArray(j.tags) ? j.tags : [],
      salary: j.salary_min && j.salary_max ? `$${j.salary_min} – $${j.salary_max}` : null,
    }));
}

async function fetchArbeitnow(query, field) {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  const res = await fetchWithTimeout(`https://www.arbeitnow.com/api/job-board-api?${params}`);
  if (!res.ok) return [];
  const data = await safeJson(res);
  const jobs = Array.isArray(data?.data) ? data.data : [];
  const fieldSyns = field ? FIELD_SYNONYMS[field] ?? [] : [];
  const filtered = fieldSyns.length
    ? jobs.filter((j) => {
        const hay = `${j.title ?? ''} ${(Array.isArray(j.tags) ? j.tags.join(' ') : '')}`.toLowerCase();
        return fieldSyns.some((s) => hay.includes(s));
      })
    : jobs;
  return filtered.map((j) => ({
    id: `arbeitnow-${j.slug ?? ''}`,
    source: 'arbeitnow',
    title: String(j.title ?? ''),
    company: String(j.company_name ?? ''),
    companyLogo: null,
    location: j.location ?? null,
    remote: Boolean(j.remote),
    description: String(j.description ?? ''),
    url: String(j.url ?? ''),
    postedAt: typeof j.created_at === 'number' ? new Date(j.created_at * 1000).toISOString() : null,
    tags: Array.isArray(j.tags) ? j.tags : [],
    salary: null,
  }));
}

function dedupe(jobs) {
  const seen = new Map();
  const rank = { remotive: 3, remoteok: 2, arbeitnow: 1 };
  for (const j of jobs) {
    const key = `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing || rank[j.source] > rank[existing.source]) seen.set(key, j);
  }
  return [...seen.values()];
}

// ── company intel ─────────────────────────────────────────────────

function canonicaliseCompanyName(raw) {
  return raw
    .replace(/\b(inc\.?|llc|corporation|corp\.?|ltd\.?|plc|gmbh|ag|s\.?a\.?|oy|bv|kft)\b/gi, '')
    .replace(/\s*,\s*/g, ' ')
    .trim();
}

async function fetchWikipediaSummary(name) {
  const res = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
  if (!res.ok) return { extract: null, extractHtml: null, logo: null, wikidataId: null, pageUrl: null };
  const data = await safeJson(res);
  if (!data || data.type === 'disambiguation') {
    return { extract: null, extractHtml: null, logo: null, wikidataId: null, pageUrl: null };
  }
  return {
    extract: data.extract ?? null,
    extractHtml: data.extract_html ?? null,
    logo: data.originalimage?.source ?? data.thumbnail?.source ?? null,
    wikidataId: data.wikibase_item ?? null,
    pageUrl: data.content_urls?.desktop?.page ?? null,
  };
}

function firstClaim(entity, prop) {
  const c = entity?.claims?.[prop];
  if (!Array.isArray(c) || c.length === 0) return null;
  return c[0]?.mainsnak?.datavalue?.value ?? null;
}

async function fetchWikidataStructured(wikidataId) {
  const entityRes = await fetchWithTimeout(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
  if (!entityRes.ok) return {};
  const data = await safeJson(entityRes);
  const entity = data?.entities?.[wikidataId];
  if (!entity) return {};

  const foundedRaw = firstClaim(entity, 'P571');
  const hqRaw = firstClaim(entity, 'P159');
  const ceoRaw = firstClaim(entity, 'P169');
  const industryRaw = firstClaim(entity, 'P452');
  const employeesRaw = firstClaim(entity, 'P1128');
  const revenueRaw = firstClaim(entity, 'P2139');

  const refIds = [hqRaw?.id, ceoRaw?.id, industryRaw?.id].filter(Boolean);
  const labels = refIds.length ? await fetchWikidataLabels(refIds) : {};

  let founded = null;
  if (foundedRaw?.time) {
    const m = String(foundedRaw.time).match(/([+-]?\d{4})-/);
    if (m) founded = m[1].replace(/^\+/, '');
  }

  let coordinates = null;
  let headquarters = null;
  if (hqRaw?.id) {
    headquarters = labels[hqRaw.id] ?? null;
    const hqEntity = await fetchWikidataEntity(hqRaw.id);
    const coord = firstClaim(hqEntity, 'P625');
    if (coord?.latitude != null && coord?.longitude != null) {
      coordinates = { lat: coord.latitude, lng: coord.longitude };
    }
  }

  const employees = typeof employeesRaw?.amount === 'string'
    ? parseInt(employeesRaw.amount.replace(/^\+/, ''), 10)
    : null;

  return {
    founded,
    headquarters,
    coordinates,
    ceo: ceoRaw?.id ? (labels[ceoRaw.id] ?? null) : null,
    industry: industryRaw?.id ? (labels[industryRaw.id] ?? null) : null,
    employees: Number.isFinite(employees) ? employees : null,
    revenue: revenueRaw?.amount ? formatRevenue(String(revenueRaw.amount).replace(/^\+/, '')) : null,
  };
}

async function fetchWikidataLabels(ids) {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return {};
  const data = await safeJson(res);
  const out = {};
  for (const id of ids) {
    const lbl = data?.entities?.[id]?.labels?.en?.value;
    if (lbl) out[id] = lbl;
  }
  return out;
}

async function fetchWikidataEntity(id) {
  const res = await fetchWithTimeout(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  if (!res.ok) return null;
  const data = await safeJson(res);
  return data?.entities?.[id] ?? null;
}

function formatRevenue(amount) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  const abs = Math.abs(n);
  let short;
  if (abs >= 1e9) short = `${(n / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) short = `${(n / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) short = `${(n / 1e3).toFixed(1)}K`;
  else short = `${n}`;
  return `$${short}`;
}

async function geocodeLocation(location) {
  if (!location) return null;
  const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`);
  if (!res.ok) return null;
  const data = await safeJson(res);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function guessDomain(name) {
  return canonicaliseCompanyName(name).toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

async function lookupCompany(name, hintDomain) {
  const canonical = canonicaliseCompanyName(name);
  const base = {
    name,
    extract: null,
    extractHtml: null,
    logo: `https://logo.clearbit.com/${hintDomain || guessDomain(name)}`,
    wikipediaUrl: null,
    wikidataId: null,
    founded: null,
    industry: null,
    ceo: null,
    employees: null,
    revenue: null,
    headquarters: null,
    coordinates: null,
    layoffs: null,
  };

  const wiki = await fetchWikipediaSummary(canonical);
  base.extract = wiki.extract;
  base.extractHtml = wiki.extractHtml;
  base.wikipediaUrl = wiki.pageUrl;
  base.wikidataId = wiki.wikidataId;
  if (wiki.logo) base.logo = wiki.logo;

  if (wiki.wikidataId) {
    Object.assign(base, await fetchWikidataStructured(wiki.wikidataId));
  }
  if (!base.coordinates && base.headquarters) {
    base.coordinates = await geocodeLocation(base.headquarters);
  }
  return base;
}

// ── handler ──────────────────────────────────────────────────────

/** Dispatch a jobs-proxy request body → { status, payload }. */
export async function handleJobsProxy(body) {
  if (body.action === 'search') {
    const query = (body.query ?? '').trim();
    const field = (body.field ?? '').trim() || undefined;
    const sources = body.source ? [body.source] : ['remotive', 'remoteok', 'arbeitnow'];

    const results = await Promise.allSettled([
      sources.includes('remotive')  ? fetchRemotive(query, field)  : Promise.resolve([]),
      sources.includes('remoteok')  ? fetchRemoteOK(query, field)  : Promise.resolve([]),
      sources.includes('arbeitnow') ? fetchArbeitnow(query, field) : Promise.resolve([]),
    ]);

    const all = [];
    const errors = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else errors.push(`${sources[i]}: ${r.reason?.message ?? 'fetch failed'}`);
    });

    let filtered = dedupe(all).filter((j) => matchesField(j, field));

    if (body.tags?.length) {
      const wanted = body.tags.map((t) => t.toLowerCase());
      filtered = filtered.filter((j) => {
        const hay = [j.title, j.description, ...j.tags].join(' ').toLowerCase();
        return wanted.every((w) => hay.includes(w));
      });
    }
    if (body.remote === true) filtered = filtered.filter((j) => j.remote);

    if (body.location) {
      const loc = body.location.toLowerCase();
      filtered = filtered.filter((j) => {
        const jloc = (j.location || '').toLowerCase();
        if (jloc.includes(loc)) return true;
        if (j.remote || ANYWHERE_LOCATIONS.test(jloc) || jloc === '') return true;
        return false;
      });
    }

    filtered.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));

    return { status: 200, payload: { jobs: filtered, count: filtered.length, sources, errors: errors.length ? errors : undefined } };
  }

  if (body.action === 'company') {
    const name = (body.name ?? '').trim();
    if (!name) return { status: 400, payload: { error: 'missing_name' } };
    return { status: 200, payload: await lookupCompany(name, body.domain) };
  }

  return { status: 400, payload: { error: 'unknown_action' } };
}
