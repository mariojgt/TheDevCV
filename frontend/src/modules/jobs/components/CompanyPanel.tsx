import { useEffect, useState } from 'react';
import { Building2, Calendar, Users, DollarSign, ExternalLink, Loader2, User2, Factory, MapPin, BookOpen } from 'lucide-react';
import { fetchCompanyInfo } from '../lib/jobsClient';
import type { CompanyInfo } from '../types';
import JobMap from './JobMap';

/**
 * Company intel panel — surfaces public data from Wikipedia, Wikidata,
 * and OpenStreetMap / Nominatim. All sources are free; missing fields are
 * omitted rather than shown as placeholder noise.
 */
export default function CompanyPanel({ companyName }: { companyName: string }) {
  const [info, setInfo] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    fetchCompanyInfo(companyName)
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((err) => { if (!cancelled) setError(err?.message ?? 'Lookup failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyName]);

  if (loading) {
    return (
      <div className="neo-card p-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Looking up {companyName}…
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="neo-card p-4 text-[11px] font-bold uppercase tracking-wider text-subtle">
        Couldn't load company details for {companyName}.
      </div>
    );
  }

  const hasAnyStructured = info.founded || info.industry || info.ceo || info.employees != null || info.revenue || info.headquarters;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {info.logo && (
          <img
            src={info.logo}
            alt={info.name}
            className="w-14 h-14 rounded-md border-[3px] border-neo-border object-contain bg-white shadow"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-display text-lg font-extrabold uppercase tracking-wide text-white truncate">{info.name}</h3>
            {info.wikipediaUrl && (
              <a
                href={info.wikipediaUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold uppercase tracking-wider text-brand-light hover:text-brand inline-flex items-center gap-0.5 transition-colors"
              >
                Wikipedia <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          {info.industry && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mt-1 inline-flex items-center gap-1">
              <Factory className="w-3 h-3" />{info.industry}
            </div>
          )}
        </div>
      </div>

      {info.extract && (
        <div className="neo-card p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle mb-1.5">
            <BookOpen className="w-3 h-3" /> About
          </div>
          <p className="text-xs text-muted leading-relaxed">{info.extract}</p>
        </div>
      )}

      {hasAnyStructured && (
        <div className="grid grid-cols-2 gap-2">
          {info.founded && <Fact icon={Calendar} label="Founded" value={info.founded} />}
          {info.headquarters && <Fact icon={MapPin} label="HQ" value={info.headquarters} />}
          {info.ceo && <Fact icon={User2} label="CEO" value={info.ceo} />}
          {info.employees != null && <Fact icon={Users} label="Employees" value={formatNumber(info.employees)} />}
          {info.revenue && <Fact icon={DollarSign} label="Revenue" value={info.revenue} />}
          {info.industry && <Fact icon={Building2} label="Industry" value={info.industry} />}
        </div>
      )}

      {info.coordinates && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
            <MapPin className="w-3 h-3" /> Headquarters
          </div>
          <div className="border-[3px] border-neo-border rounded-md overflow-hidden shadow-md">
            <JobMap lat={info.coordinates.lat} lng={info.coordinates.lng} label={`${info.name} — ${info.headquarters ?? ''}`} />
          </div>
        </div>
      )}

      {info.layoffs && info.layoffs.length > 0 && (
        <div className="neo-card p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-subtle mb-2">Recent layoffs</div>
          <ul className="space-y-1">
            {info.layoffs.slice(0, 3).map((l, i) => (
              <li key={i} className="text-xs text-muted flex justify-between">
                <span>{l.date}</span>
                <span className="font-mono font-bold text-white">{l.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="border-2 border-neo-border bg-surface rounded-md p-2.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-subtle mb-0.5">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className="text-sm font-semibold text-white truncate" title={value}>{value}</div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString();
}
