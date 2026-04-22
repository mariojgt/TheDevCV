import { ExternalLink, MapPin, Clock, Globe2, Target, Loader2, Coins } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { NormalizedJob } from '../types';
import CompanyPanel from './CompanyPanel';

/**
 * Right-pane detail view for the selected job. Surfaces title / company /
 * location, the full HTML description (sanitised), an Apply CTA, and a nested
 * CompanyPanel with Wikipedia + Wikidata facts and an OSM map pin.
 */
export default function JobDetail({
  job, onTailor, tailoring, canTailor, tailorCost,
}: {
  job: NormalizedJob;
  onTailor: () => void;
  tailoring: boolean;
  canTailor: boolean;
  tailorCost: number;
}) {
  const cleanDescription = DOMPurify.sanitize(job.description, { USE_PROFILES: { html: true } });
  const posted = job.postedAt ? new Date(job.postedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-wide text-white leading-tight">{job.title}</h2>
            <p className="text-sm font-bold uppercase tracking-wide text-muted mt-1">{job.company}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {job.salary && (
              <span className="neo-tag neo-tag-brand">{job.salary}</span>
            )}
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-subtle">
              via {job.source}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">
          {job.remote ? (
            <span className="inline-flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" /> Remote</span>
          ) : job.location ? (
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
          ) : null}
          {job.remote && job.location && (
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
          )}
          {posted && (
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Posted {posted}</span>
          )}
        </div>

        {job.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {job.tags.slice(0, 12).map((t) => (
              <span key={t} className="neo-tag neo-tag-ghost text-[10px]">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-5">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="neo-btn neo-btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2"
          >
            Apply on {job.source} <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onTailor}
            disabled={tailoring || !canTailor}
            title={canTailor ? `Generate a tailored CV for this job · ${tailorCost} credits` : `Not enough credits (need ${tailorCost})`}
            className="neo-btn neo-btn-ghost px-5 py-2.5 text-sm inline-flex items-center gap-2"
          >
            {tailoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            {tailoring ? 'Tailoring…' : 'Tailor my CV'}
            <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light">
              <Coins className="w-3 h-3" />{tailorCost}
            </span>
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-subtle mb-2">Job description</div>
        <div
          className="prose prose-invert prose-sm max-w-none text-sm text-muted leading-relaxed job-description"
          dangerouslySetInnerHTML={{ __html: cleanDescription }}
        />
      </div>

      <div className="pt-5 border-t-[3px] border-neo-border">
        <div className="text-[10px] font-bold uppercase tracking-wider text-subtle mb-3">About the company</div>
        <CompanyPanel companyName={job.company} />
      </div>
    </div>
  );
}
