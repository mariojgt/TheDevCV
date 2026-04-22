/**
 * POST /functions/v1/jobs-proxy
 *
 * Proxies free public job-board APIs + free company-intel sources so the
 * browser doesn't have to deal with CORS, rate-limits, or divergent schemas.
 * No credit cost — discovery is free. Auth still required so we can later
 * layer saved-search / alert features on top.
 *
 * Actions (dispatched via `body.action`):
 *   - 'search'  → aggregate job listings from Remotive + RemoteOK + Arbeitnow.
 *   - 'company' → look up company info via Wikipedia + Wikidata + Nominatim.
 *
 * All external sources used here are free and unauthenticated. Layoff history
 * (layoffs.fyi) is intentionally deferred: they don't expose a stable public
 * API, and hard-coding a Google-Sheet URL would be brittle. See V1.1 TODO.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY (for auth-check)
 *   JOBS_UA         (optional — User-Agent to present to third parties)
 */
import { handleCors, json } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

const UA = Deno.env.get('JOBS_UA') ?? 'TheDevCV/1.0 (+https://thedevcv.com)';
const FETCH_TIMEOUT_MS = 8_000;

type RawJob = Record<string, unknown>;

interface NormalizedJob {
  id: string;
  source: 'remotive' | 'remoteok' | 'arbeitnow';
  title: string;
  company: string;
  companyLogo: string | null;
  location: string | null;
  remote: boolean;
  description: string;
  url: string;
  postedAt: string | null; // ISO
  tags: string[];
  salary: string | null;
}

// ── helpers ───────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
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

async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try { return (await res.json()) as T; } catch { return null; }
}

/**
 * Canonical field/category slugs. Remotive accepts the slug as `?category=...`
 * (authoritative match). RemoteOK / Arbeitnow have no category endpoint — we
 * fold the slug's synonyms into their full-text query and post-filter to keep
 * results on-topic.
 *
 * Exported as a shape the frontend can derive its dropdown from if needed.
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
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

/** Return true if the job matches the selected field by title/tag heuristics.
 *  Used to keep RemoteOK / Arbeitnow results on-topic (Remotive handles this
 *  server-side via `?category=`). Unknown field -> always passes. */
function matchesField(job: NormalizedJob, field: string | undefined): boolean {
  if (!field) return true;
  const synonyms = FIELD_SYNONYMS[field];
  if (!synonyms) return true;
  const hay = `${job.title} ${job.tags.join(' ')}`.toLowerCase();
  return synonyms.some((s) => hay.includes(s));
}

/** Locations that represent "anywhere" — jobs tagged these should pass every
 *  city-level location filter, because a remote/worldwide role can be worked
 *  from the user's city. Fixes the "I typed London, got zero results" UX bug. */
const ANYWHERE_LOCATIONS = /\b(worldwide|remote|anywhere|global|any location|everywhere)\b/i;

// ── job source adapters ──────────────────────────────────────────

async function fetchRemotive(query: string, field?: string): Promise<NormalizedJob[]> {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  if (field) params.set('category', field); // Remotive's slug maps 1:1 to ours.
  params.set('limit', '50');
  const url = `https://remotive.com/api/remote-jobs?${params}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await safeJson<{ jobs?: RawJob[] }>(res);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j: RawJob): NormalizedJob => ({
    id: `remotive-${j.id}`,
    source: 'remotive',
    title: String(j.title ?? ''),
    company: String(j.company_name ?? ''),
    companyLogo: (j.company_logo as string | undefined) ?? null,
    location: (j.candidate_required_location as string | undefined) ?? null,
    remote: true,
    description: String(j.description ?? ''),
    url: String(j.url ?? ''),
    postedAt: (j.publication_date as string | undefined) ?? null,
    tags: Array.isArray(j.tags) ? (j.tags as string[]) : [],
    salary: (j.salary as string | undefined) || null,
  }));
}

async function fetchRemoteOK(query: string, field?: string): Promise<NormalizedJob[]> {
  // RemoteOK returns a mixed array — element [0] is a legal notice object.
  // They support ?tags=a,b but not full-text search — we apply query + field
  // filters client-side after fetching the feed.
  const url = 'https://remoteok.com/api';
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await safeJson<RawJob[]>(res);
  if (!Array.isArray(data)) return [];
  const jobs = data.slice(1); // drop legal notice
  const q = query.toLowerCase();
  const fieldSyns = field ? FIELD_SYNONYMS[field] ?? [] : [];
  return jobs
    .filter((j) => {
      const hay = `${j.position ?? ''} ${j.company ?? ''} ${j.description ?? ''} ${(Array.isArray(j.tags) ? j.tags.join(' ') : '')}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (fieldSyns.length && !fieldSyns.some((s) => hay.includes(s))) return false;
      return true;
    })
    .map((j: RawJob): NormalizedJob => {
      const salary = j.salary_min && j.salary_max
        ? `$${j.salary_min} – $${j.salary_max}`
        : null;
      return {
        id: `remoteok-${j.id ?? j.slug}`,
        source: 'remoteok',
        title: String(j.position ?? ''),
        company: String(j.company ?? ''),
        companyLogo: ((j.company_logo as string | undefined) || (j.logo as string | undefined)) ?? null,
        location: (j.location as string | undefined) || 'Remote',
        remote: true,
        description: String(j.description ?? ''),
        url: String(j.apply_url ?? j.url ?? ''),
        postedAt: (j.date as string | undefined) ?? null,
        tags: Array.isArray(j.tags) ? (j.tags as string[]) : [],
        salary,
      };
    });
}

async function fetchArbeitnow(query: string, field?: string): Promise<NormalizedJob[]> {
  const params = new URLSearchParams();
  if (query) params.set('search', query);
  const url = `https://www.arbeitnow.com/api/job-board-api?${params}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await safeJson<{ data?: RawJob[] }>(res);
  const jobs = Array.isArray(data?.data) ? data.data : [];
  const fieldSyns = field ? FIELD_SYNONYMS[field] ?? [] : [];
  const filtered = fieldSyns.length
    ? jobs.filter((j) => {
        const hay = `${j.title ?? ''} ${(Array.isArray(j.tags) ? j.tags.join(' ') : '')}`.toLowerCase();
        return fieldSyns.some((s) => hay.includes(s));
      })
    : jobs;
  return filtered.map((j: RawJob): NormalizedJob => ({
    id: `arbeitnow-${j.slug ?? ''}`,
    source: 'arbeitnow',
    title: String(j.title ?? ''),
    company: String(j.company_name ?? ''),
    companyLogo: null, // Arbeitnow doesn't provide logos
    location: (j.location as string | undefined) ?? null,
    remote: Boolean(j.remote),
    description: String(j.description ?? ''),
    url: String(j.url ?? ''),
    postedAt: typeof j.created_at === 'number' ? new Date((j.created_at as number) * 1000).toISOString() : null,
    tags: Array.isArray(j.tags) ? (j.tags as string[]) : [],
    salary: null,
  }));
}

/** Remove duplicate postings (same company + title). Prefer sources with richer data. */
function dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();
  // priority: remotive > remoteok > arbeitnow (richer metadata generally)
  const rank: Record<NormalizedJob['source'], number> = { remotive: 3, remoteok: 2, arbeitnow: 1 };
  for (const j of jobs) {
    const key = `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing || rank[j.source] > rank[existing.source]) seen.set(key, j);
  }
  return [...seen.values()];
}

// ── company intel ─────────────────────────────────────────────────

interface CompanyInfo {
  name: string;
  extract: string | null;
  extractHtml: string | null;
  logo: string | null;
  wikipediaUrl: string | null;
  wikidataId: string | null;
  founded: string | null;
  industry: string | null;
  ceo: string | null;
  employees: number | null;
  revenue: string | null;
  headquarters: string | null;
  coordinates: { lat: number; lng: number } | null;
  layoffs: Array<{ date: string; count: number; note?: string }> | null; // V1.1 — always null for now
}

/** Strip "Inc", "LLC", "Corp", "plc", "Ltd" suffixes so Wikipedia lookup hits Google rather than "Google LLC". */
function canonicaliseCompanyName(raw: string): string {
  return raw
    .replace(/\b(inc\.?|llc|corporation|corp\.?|ltd\.?|plc|gmbh|ag|s\.?a\.?|oy|bv|kft)\b/gi, '')
    .replace(/\s*,\s*/g, ' ')
    .trim();
}

async function fetchWikipediaSummary(name: string): Promise<{
  extract: string | null;
  extractHtml: string | null;
  logo: string | null;
  wikidataId: string | null;
  pageUrl: string | null;
}> {
  const title = encodeURIComponent(name);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return { extract: null, extractHtml: null, logo: null, wikidataId: null, pageUrl: null };
  const data = await safeJson<{
    extract?: string;
    extract_html?: string;
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
    wikibase_item?: string;
    content_urls?: { desktop?: { page?: string } };
    type?: string;
  }>(res);
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

/** Pull a claim value or the first referenced entity id from a Wikidata claim array. */
function firstClaim(entity: any, prop: string): any {
  const c = entity?.claims?.[prop];
  if (!Array.isArray(c) || c.length === 0) return null;
  return c[0]?.mainsnak?.datavalue?.value ?? null;
}

async function fetchWikidataStructured(wikidataId: string): Promise<Partial<CompanyInfo>> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return {};
  const data = await safeJson<{ entities?: Record<string, any> }>(res);
  const entity = data?.entities?.[wikidataId];
  if (!entity) return {};

  const foundedRaw = firstClaim(entity, 'P571'); // inception
  const hqRaw = firstClaim(entity, 'P159');      // headquarters location (entity ref)
  const ceoRaw = firstClaim(entity, 'P169');     // CEO
  const industryRaw = firstClaim(entity, 'P452'); // industry
  const employeesRaw = firstClaim(entity, 'P1128'); // employees
  const revenueRaw = firstClaim(entity, 'P2139'); // total revenue

  // Collect all referenced entity IDs so we can batch-fetch their labels in one hit.
  const refIds: string[] = [hqRaw?.id, ceoRaw?.id, industryRaw?.id].filter(Boolean);
  const labels = refIds.length ? await fetchWikidataLabels(refIds) : {};

  // Parse founded — comes as {time: "+2004-09-04T00:00:00Z", ...}
  let founded: string | null = null;
  if (foundedRaw?.time) {
    const m = String(foundedRaw.time).match(/([+-]?\d{4})-/);
    if (m) founded = m[1].replace(/^\+/, '');
  }

  // HQ needs a second-pass fetch for its P625 (coordinates).
  let coordinates: { lat: number; lng: number } | null = null;
  let headquarters: string | null = null;
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

  const revenue = revenueRaw?.amount
    ? formatRevenue(String(revenueRaw.amount).replace(/^\+/, ''), revenueRaw.unit ?? '')
    : null;

  return {
    founded,
    headquarters,
    coordinates,
    ceo: ceoRaw?.id ? (labels[ceoRaw.id] ?? null) : null,
    industry: industryRaw?.id ? (labels[industryRaw.id] ?? null) : null,
    employees: Number.isFinite(employees) ? (employees as number) : null,
    revenue,
  };
}

/** Batch Wikidata label lookup — cheaper than hitting each entity page individually. */
async function fetchWikidataLabels(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json&origin=*`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return {};
  const data = await safeJson<{ entities?: Record<string, { labels?: { en?: { value?: string } } }> }>(res);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const lbl = data?.entities?.[id]?.labels?.en?.value;
    if (lbl) out[id] = lbl;
  }
  return out;
}

async function fetchWikidataEntity(id: string): Promise<any | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await safeJson<{ entities?: Record<string, any> }>(res);
  return data?.entities?.[id] ?? null;
}

/** Format a raw revenue amount using a rough currency unit hint. */
function formatRevenue(amount: string, unitUrl: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  // Pretty-print: 123456789012 -> "$123.5B"
  const abs = Math.abs(n);
  let short: string;
  if (abs >= 1e9) short = `${(n / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) short = `${(n / 1e6).toFixed(1)}M`;
  else if (abs >= 1e3) short = `${(n / 1e3).toFixed(1)}K`;
  else short = `${n}`;
  // The unit URL is a Wikidata entity URL for the currency — we don't resolve it here;
  // $ is the most common assumption for revenue figures of FAANG-ish companies.
  // The unitUrl is kept in the signature so the caller can upgrade later if needed.
  void unitUrl;
  return `$${short}`;
}

/** Fallback geocoder — only used when Wikidata didn't provide HQ coordinates. */
async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  if (!location) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await safeJson<Array<{ lat?: string; lon?: string }>>(res);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Guess a likely domain from the company name for Clearbit logos.
 *  Clearbit redirects on failure — callers should treat 404 as "no logo". */
function guessDomain(name: string): string {
  return canonicaliseCompanyName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') + '.com';
}

async function lookupCompany(name: string, hintDomain?: string): Promise<CompanyInfo> {
  const canonical = canonicaliseCompanyName(name);
  const base: CompanyInfo = {
    name,
    extract: null,
    extractHtml: null,
    logo: hintDomain ? `https://logo.clearbit.com/${hintDomain}` : `https://logo.clearbit.com/${guessDomain(name)}`,
    wikipediaUrl: null,
    wikidataId: null,
    founded: null,
    industry: null,
    ceo: null,
    employees: null,
    revenue: null,
    headquarters: null,
    coordinates: null,
    layoffs: null, // V1.1: layoffs.fyi sync
  };

  const wiki = await fetchWikipediaSummary(canonical);
  base.extract = wiki.extract;
  base.extractHtml = wiki.extractHtml;
  base.wikipediaUrl = wiki.pageUrl;
  base.wikidataId = wiki.wikidataId;
  if (wiki.logo) base.logo = wiki.logo;

  if (wiki.wikidataId) {
    const structured = await fetchWikidataStructured(wiki.wikidataId);
    Object.assign(base, structured);
  }

  // If Wikidata didn't give us coords, try Nominatim with the HQ label.
  if (!base.coordinates && base.headquarters) {
    base.coordinates = await geocodeLocation(base.headquarters);
  }

  return base;
}

// ── handler ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json() as {
      action?: string;
      query?: string;
      field?: string;
      tags?: string[];
      remote?: boolean;
      location?: string;
      source?: string;
      name?: string;
      domain?: string;
    };

    if (body.action === 'search') {
      const query = (body.query ?? '').trim();
      const field = (body.field ?? '').trim() || undefined;
      const sources = body.source
        ? [body.source]
        : ['remotive', 'remoteok', 'arbeitnow'];

      const results = await Promise.allSettled([
        sources.includes('remotive')  ? fetchRemotive(query, field)  : Promise.resolve([] as NormalizedJob[]),
        sources.includes('remoteok')  ? fetchRemoteOK(query, field)  : Promise.resolve([] as NormalizedJob[]),
        sources.includes('arbeitnow') ? fetchArbeitnow(query, field) : Promise.resolve([] as NormalizedJob[]),
      ]);

      const all: NormalizedJob[] = [];
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') all.push(...r.value);
        else errors.push(`${sources[i]}: ${r.reason?.message ?? 'fetch failed'}`);
      });

      // Post-filter: ensure field is respected even for aggregated results
      // (defence-in-depth — each fetcher already applied it, but a buggy source
      // could leak unmatched jobs through).
      let filtered = dedupe(all).filter((j) => matchesField(j, field));

      if (body.tags?.length) {
        const wanted = body.tags.map((t) => t.toLowerCase());
        filtered = filtered.filter((j) => {
          const hay = [j.title, j.description, ...j.tags].join(' ').toLowerCase();
          return wanted.every((w) => hay.includes(w));
        });
      }
      if (body.remote === true) filtered = filtered.filter((j) => j.remote);

      // Location filter: a remote / worldwide job can be worked from anywhere,
      // so those ALWAYS pass a city-level location filter. Otherwise require
      // a substring match against the job's advertised location.
      if (body.location) {
        const loc = body.location.toLowerCase();
        filtered = filtered.filter((j) => {
          const jloc = (j.location || '').toLowerCase();
          if (jloc.includes(loc)) return true;
          if (j.remote || ANYWHERE_LOCATIONS.test(jloc) || jloc === '') return true;
          return false;
        });
      }

      // Sort newest first when we have dates.
      filtered.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));

      return json({
        jobs: filtered,
        count: filtered.length,
        sources,
        errors: errors.length ? errors : undefined,
      });
    }

    if (body.action === 'company') {
      const name = (body.name ?? '').trim();
      if (!name) return json({ error: 'missing_name' }, 400);
      const info = await lookupCompany(name, body.domain);
      return json(info);
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('jobs-proxy error:', err);
    return json({ error: 'internal_error', detail: String(err) }, 500);
  }
});
