import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, RefreshCw, Globe2, MapPin, Filter, X, Compass, Briefcase } from 'lucide-react';
import { searchJobs, clearSearchCache } from '../lib/jobsClient';
import { useCV } from '../../cv/hooks/useCV';
import { useApp } from '../../../contexts/AppContext';
import { useToast } from '../../../components/ui/Toast';
import { PageHeader } from '../../../components/ui';
import JobCard from '../components/JobCard';
import JobDetail from '../components/JobDetail';
import { FIELD_OPTIONS, type JobFilters, type NormalizedJob } from '../types';

const DEFAULT_FILTERS: JobFilters = {
  query: '',
  field: '',
  tags: [],
  remoteOnly: false,
  location: '',
};

/** Jobs Discovery dashboard — free aggregated listings from Remotive,
 *  RemoteOK, and Arbeitnow, with live Wikipedia/Wikidata company intel and
 *  an OpenStreetMap pin for the HQ. No credits required. */
export default function JobsDiscovery() {
  const navigate = useNavigate();
  const { costOf, hasCredits } = useApp();
  const { toast } = useToast();
  const { profiles, fetchProfiles } = useCV();

  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<JobFilters>(DEFAULT_FILTERS);
  const [jobs, setJobs] = useState<NormalizedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<string[]>([]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const runSearch = useCallback(async (f: JobFilters, force = false) => {
    setLoading(true);
    setFetchError(null);
    setSourceErrors([]);
    try {
      const res = await searchJobs(f, { force });
      setJobs(res.jobs);
      if (res.errors?.length) setSourceErrors(res.errors);
      // Keep a stable selection if the previous job is still present; otherwise pick first.
      setSelectedId((prev) => {
        if (prev && res.jobs.some((j) => j.id === prev)) return prev;
        return res.jobs[0]?.id ?? null;
      });
    } catch (err) {
      console.error('Jobs search failed:', err);
      setFetchError(err instanceof Error ? err.message : 'Search failed');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + re-run whenever filters commit.
  useEffect(() => { runSearch(filters); }, [filters, runSearch]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const submitFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters(draft);
  };

  const clearFilters = () => {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
  };

  const refresh = () => {
    clearSearchCache();
    runSearch(filters, true);
  };

  /** Tailor-my-CV handoff to the CV editor. Stores the pending job context in
   *  sessionStorage and navigates to the user's default CV (or the CV list if
   *  they don't have one yet). The editor picks up pendingTailor on mount. */
  const handleTailor = () => {
    if (!selectedJob) return;
    if (!hasCredits('ai_tailor')) {
      toast(`Tailoring costs ${costOf('ai_tailor')} credits — top up to continue.`, 'error');
      return;
    }
    try {
      sessionStorage.setItem('pendingTailor', JSON.stringify({
        company: selectedJob.company,
        title: selectedJob.title,
        url: selectedJob.url,
        description: selectedJob.description,
      }));
    } catch { /* storage quota / disabled */ }

    const defaultCv = profiles.find((p) => p.is_default) ?? profiles[0];
    if (defaultCv) {
      toast('Opening your CV — Tailor tab will auto-load this job.', 'success');
      navigate(`/cv/${defaultCv.id}`);
    } else {
      toast('Create a CV first, then this job description will be ready to tailor.', 'info');
      navigate('/cv');
    }
  };

  const sourceBadges = (jobs.length
    ? Array.from(new Set(jobs.map((j) => j.source)))
    : []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discover jobs"
        description="Live roles from Remotive, RemoteOK, and Arbeitnow. Click a job for full details, company intel, and a map of the HQ."
        actions={
          <button
            onClick={refresh}
            disabled={loading}
            className="neo-btn neo-btn-ghost px-4 py-2 text-xs inline-flex items-center gap-2"
            title="Re-fetch from all sources"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        }
      />

      {/* Filter bar */}
      <form onSubmit={submitFilters} className="neo-filter-card p-4 space-y-3">
        {/* Row 1: search + field dropdown + submit */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none z-10" />
            <input
              type="text"
              value={draft.query}
              onChange={(e) => setDraft((d) => ({ ...d, query: e.target.value }))}
              placeholder="Title, tech, or keyword (e.g. React, Rust, product manager)"
              className="neo-input pl-10 pr-3 py-2.5"
            />
          </div>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none z-10" />
            <select
              value={draft.field}
              onChange={(e) => setDraft((d) => ({ ...d, field: e.target.value as JobFilters['field'] }))}
              className="neo-select pl-10 pr-3 py-2.5 appearance-none cursor-pointer"
            >
              <option value="">All fields</option>
              {FIELD_OPTIONS.map((f) => (
                <option key={f.slug} value={f.slug}>{f.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="neo-btn neo-btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
            <Filter className="w-4 h-4" /> Search
          </button>
        </div>

        {/* Row 2: location + remote toggle */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none z-10" />
            <input
              type="text"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
              placeholder="City or country (remote jobs are always included)"
              className="neo-input pl-10 pr-3 py-2.5"
            />
          </div>
          <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md border-[3px] text-xs font-bold uppercase tracking-wide cursor-pointer transition-colors whitespace-nowrap ${
            draft.remoteOnly
              ? 'bg-brand/10 border-brand text-brand-light'
              : 'bg-surface border-neo-border text-muted hover:border-brand'
          }`}>
            <input
              type="checkbox"
              checked={draft.remoteOnly}
              onChange={(e) => setDraft((d) => ({ ...d, remoteOnly: e.target.checked }))}
              className="sr-only"
            />
            <Globe2 className="w-4 h-4" /> Remote only
          </label>
        </div>

        {/* Tag chips */}
        <TagInput tags={draft.tags} onChange={(tags) => setDraft((d) => ({ ...d, tags }))} />

        {(draft.query || draft.field || draft.tags.length || draft.remoteOnly || draft.location) ? (
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-muted hover:text-brand-light transition-colors">
              <X className="w-3 h-3" /> Clear filters
            </button>
            {sourceBadges.length > 0 && (
              <span className="text-subtle ml-auto">
                {jobs.length} result{jobs.length === 1 ? '' : 's'} · from {sourceBadges.join(', ')}
              </span>
            )}
          </div>
        ) : null}
      </form>

      {sourceErrors.length > 0 && (
        <div className="border-2 border-accent bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-md">
          Some sources returned partial data: {sourceErrors.join('; ')}
        </div>
      )}

      {/* Split pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
        {/* Left: list */}
        <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
          {loading && jobs.length === 0 && (
            <div className="p-8 text-center text-xs font-bold uppercase tracking-wider text-muted flex flex-col items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-brand-light" />
              Searching jobs…
            </div>
          )}
          {!loading && fetchError && (
            <div className="p-4 rounded-md border-[3px] border-red-500 bg-red-500/5 text-sm text-red-400">
              {fetchError}
            </div>
          )}
          {!loading && !fetchError && jobs.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--color-text-secondary)] flex flex-col items-center gap-2">
              <Compass className="w-6 h-6 text-[var(--color-text-muted)]" />
              No jobs matched your filters. Try broadening the query or clearing tags.
            </div>
          )}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              active={job.id === selectedId}
              onSelect={() => setSelectedId(job.id)}
            />
          ))}
        </div>

        {/* Right: detail */}
        <div className="neo-card p-5 max-h-[calc(100vh-260px)] overflow-y-auto">
          {selectedJob ? (
            <JobDetail
              job={selectedJob}
              onTailor={handleTailor}
              tailoring={false}
              canTailor={hasCredits('ai_tailor')}
              tailorCost={costOf('ai_tailor')}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <div className="w-14 h-14 rounded-md border-[3px] border-neo-border bg-surface-light shadow flex items-center justify-center mb-4">
                <Compass className="w-6 h-6 text-subtle" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted max-w-xs">
                Select a job from the left to see the full description, company details, and map.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small tag-chip editor — Enter adds, backspace-on-empty removes the last. */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t || tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  };

  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 rounded-md border-[3px] border-neo-border bg-surface">
      {tags.map((t) => (
        <span key={t} className="neo-tag neo-tag-brand">
          {t}
          <button type="button" onClick={() => remove(t)} className="ml-1 hover:text-white" aria-label={`Remove ${t}`}>
            <X className="w-2.5 h-2.5 inline" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(input); }
          else if (e.key === 'Backspace' && !input && tags.length) { remove(tags[tags.length - 1]); }
          else if (e.key === ',' || e.key === ';') { e.preventDefault(); add(input); }
        }}
        onBlur={() => { if (input) add(input); }}
        placeholder={tags.length ? '' : 'Filter by tags (Enter to add)…'}
        className="flex-1 min-w-[120px] bg-transparent text-xs outline-none text-white placeholder:text-subtle"
      />
    </div>
  );
}
