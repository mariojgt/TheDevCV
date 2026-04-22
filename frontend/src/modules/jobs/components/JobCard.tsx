import { MapPin, Clock, Globe2, Building2 } from 'lucide-react';
import type { NormalizedJob } from '../types';

/**
 * Compact list-item card for a single job. Used in the left pane of the
 * Discovery dashboard. Clicking selects the job (fires onSelect) — the right
 * pane then renders the full detail view. Does not open external URLs.
 */
export default function JobCard({
  job, active, onSelect,
}: {
  job: NormalizedJob;
  active: boolean;
  onSelect: () => void;
}) {
  const posted = job.postedAt ? formatPosted(job.postedAt) : null;
  const primaryTags = job.tags.slice(0, 4);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left border-[3px] rounded-md p-3 transition-all ${
        active
          ? 'border-brand bg-brand/10 shadow-md -translate-x-px -translate-y-px'
          : 'border-neo-border bg-surface hover:border-brand hover:shadow-md hover:-translate-x-px hover:-translate-y-px'
      }`}
    >
      <div className="flex gap-3 items-start">
        <CompanyAvatar name={job.company} logo={job.companyLogo} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-white truncate">{job.title || 'Untitled role'}</h3>
              <p className="text-xs font-bold uppercase tracking-wide text-muted mt-0.5 truncate">{job.company}</p>
            </div>
            {job.salary && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border-2 border-brand bg-brand/10 text-brand-light whitespace-nowrap">
                {job.salary}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-wider text-subtle">
            {job.remote ? (
              <span className="inline-flex items-center gap-1"><Globe2 className="w-3 h-3" /> Remote</span>
            ) : job.location ? (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location}</span>
            ) : null}
            {posted && (
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {posted}</span>
            )}
            <span className="inline-flex items-center gap-1 ml-auto font-mono text-[10px]">{job.source}</span>
          </div>

          {primaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {primaryTags.map((t) => (
                <span key={t} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border-2 border-neo-border bg-surface-light text-muted">
                  {t}
                </span>
              ))}
              {job.tags.length > primaryTags.length && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 text-subtle">
                  +{job.tags.length - primaryTags.length}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function CompanyAvatar({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        loading="lazy"
        className="w-10 h-10 rounded-md border-2 border-neo-border object-contain bg-white shrink-0"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-md bg-surface-light border-2 border-neo-border flex items-center justify-center shrink-0 text-muted">
      {initial ? <span className="text-sm font-extrabold">{initial}</span> : <Building2 className="w-4 h-4" />}
    </div>
  );
}

/** Human-friendly relative time: "2d ago", "3w ago". Silently falls back to the raw string on parse failure. */
function formatPosted(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const d = Math.floor(diff / 86_400_000);
  if (d < 1) return 'today';
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
