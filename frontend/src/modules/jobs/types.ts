/**
 * Shared types for the Jobs Discovery module. Schemas here match the edge
 * function's normalized output (supabase/functions/jobs-proxy/index.ts) —
 * keep in sync.
 */

export type JobSource = 'remotive' | 'remoteok' | 'arbeitnow';

export interface NormalizedJob {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  companyLogo: string | null;
  location: string | null;
  remote: boolean;
  /** HTML description (may contain markup). Caller should sanitize before rendering. */
  description: string;
  url: string;
  postedAt: string | null; // ISO date
  tags: string[];
  salary: string | null;
}

/** Canonical field slugs mirroring Remotive's `?category=` values. The UI
 *  maps these to human labels; the edge function applies authoritative
 *  filtering for Remotive and keyword-matching for RemoteOK / Arbeitnow. */
export type FieldSlug =
  | 'software-dev'
  | 'design'
  | 'marketing'
  | 'sales'
  | 'product'
  | 'data'
  | 'devops'
  | 'customer-support'
  | 'finance-legal'
  | 'hr'
  | 'qa'
  | 'writing'
  | 'business';

export const FIELD_OPTIONS: { slug: FieldSlug; label: string }[] = [
  { slug: 'software-dev',     label: 'Software Development' },
  { slug: 'design',           label: 'Design' },
  { slug: 'product',          label: 'Product' },
  { slug: 'data',             label: 'Data & ML' },
  { slug: 'devops',           label: 'DevOps / SRE' },
  { slug: 'marketing',        label: 'Marketing' },
  { slug: 'sales',            label: 'Sales' },
  { slug: 'customer-support', label: 'Customer Support' },
  { slug: 'finance-legal',    label: 'Finance & Legal' },
  { slug: 'hr',               label: 'HR & People' },
  { slug: 'qa',               label: 'QA' },
  { slug: 'writing',          label: 'Writing' },
  { slug: 'business',         label: 'Business & Ops' },
];

export interface JobFilters {
  query: string;
  /** Optional field slug — maps to Remotive category + keyword match on other sources. */
  field: FieldSlug | '';
  /** AND-filtered after the source returns — each tag must appear in title/description/tags. */
  tags: string[];
  remoteOnly: boolean;
  /** Substring match against the job's location field — remote/worldwide jobs
   *  always pass this filter, so typing a city narrows rather than excludes. */
  location: string;
}

export interface SearchResponse {
  jobs: NormalizedJob[];
  count: number;
  sources: string[];
  /** Non-fatal per-source fetch errors, if any. */
  errors?: string[];
}

export interface CompanyInfo {
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
  /** V1.1: layoffs.fyi sync — always null today. */
  layoffs: Array<{ date: string; count: number; note?: string }> | null;
}
