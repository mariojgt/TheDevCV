/**
 * Thin client for the Supabase edge function `jobs-proxy`. Mirrors the
 * ai-client.ts pattern but without credit-check (discovery is free).
 *
 * Caches job-search responses per normalised filter-key in sessionStorage
 * with a 1-hour TTL. Cache is best-effort: any JSON parse error = cache miss.
 * Company-info lookups are cached separately under `company:{name}`.
 */
import { supabase } from '../../../lib/supabase';
import type { JobFilters, SearchResponse, CompanyInfo } from '../types';

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  at: number;
  payload: T;
}

function cacheKey(kind: string, ident: string): string {
  return `jobs:${kind}:${ident}`;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.at > TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.payload;
  } catch { return null; }
}

function writeCache<T>(key: string, payload: T): void {
  try {
    const entry: CacheEntry<T> = { at: Date.now(), payload };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch { /* quota exceeded or sessionStorage disabled — silently skip */ }
}

function filtersToKey(f: JobFilters): string {
  return [
    f.query.trim().toLowerCase(),
    f.field,
    [...f.tags].sort().join(','),
    [...f.exclude].sort().join(','),
    [...f.sources].sort().join(','),
    f.remoteOnly ? '1' : '0',
    f.hasSalary ? '1' : '0',
    String(f.maxAge),
    f.location.trim().toLowerCase(),
  ].join('|');
}

/** Drop all cached search results — called by the Refresh button. */
export function clearSearchCache(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('jobs:search:')) sessionStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export async function searchJobs(filters: JobFilters, opts: { force?: boolean } = {}): Promise<SearchResponse> {
  const key = cacheKey('search', filtersToKey(filters));
  if (!opts.force) {
    const hit = readCache<SearchResponse>(key);
    if (hit) return hit;
  }

  const { data, error } = await supabase.functions.invoke('jobs-proxy', {
    body: {
      action: 'search',
      query: filters.query,
      field: filters.field || undefined,
      tags: filters.tags,
      exclude: filters.exclude,
      sources: filters.sources,
      remote: filters.remoteOnly || undefined,
      has_salary: filters.hasSalary || undefined,
      max_age: filters.maxAge || undefined,
      location: filters.location || undefined,
    },
  });

  if (error) throw error;
  const payload = data as SearchResponse;
  writeCache(key, payload);
  return payload;
}

export async function fetchCompanyInfo(name: string, domain?: string): Promise<CompanyInfo> {
  const key = cacheKey('company', name.toLowerCase().trim());
  const hit = readCache<CompanyInfo>(key);
  if (hit) return hit;

  const { data, error } = await supabase.functions.invoke('jobs-proxy', {
    body: { action: 'company', name, domain },
  });
  if (error) throw error;
  const payload = data as CompanyInfo;
  writeCache(key, payload);
  return payload;
}
