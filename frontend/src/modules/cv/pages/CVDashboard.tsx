import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileUser, Briefcase, Target, Award, TrendingUp, Upload, Sparkles, Trash2, Copy, Loader2, Pencil, Eye, Download, Send, Reply, ArrowRight, Linkedin, Github } from 'lucide-react';
import { useCV } from '../hooks/useCV';
import { useJobs } from '../hooks/useJobs';
import { supabase } from '../../../lib/supabase';
import { JOB_STATUSES } from '../types';
import { getCVStats, type CVStats } from '../lib/analytics';
import StatCard from '../../../components/ui/StatCard';

export default function CVDashboard() {
  const { profiles, loading: cvLoading, fetchProfiles, duplicateProfile } = useCV();
  const { jobs, loading: jobsLoading, fetchJobs, stats } = useJobs();
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [cvStats, setCvStats] = useState<Record<string, CVStats | null>>({});

  useEffect(() => { fetchProfiles(); fetchJobs(); }, [fetchProfiles, fetchJobs]);

  useEffect(() => {
    if (profiles.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        profiles.map(async (p) => [p.id, await getCVStats(p.id)] as const),
      );
      if (!cancelled) setCvStats(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [profiles]);

  if (cvLoading || jobsLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <div className="w-6 h-6 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Loading…</span>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="neo-hero rounded-md py-16 px-8 text-center mb-8">
          <div className="relative z-10">
            <div className="w-20 h-20 rounded-md border-[3px] border-black bg-brand flex items-center justify-center mx-auto mb-5 shadow-md">
              <FileUser className="w-9 h-9 text-white" />
            </div>
            <span className="neo-tag neo-tag-accent neo-tag-rotate mb-4 inline-block">Get started</span>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-wide text-white mb-3">
              CV Builder<br />&amp; Job Tracker
            </h1>
            <p className="text-sm text-muted max-w-lg mx-auto mb-8">
              Build an ATS-compliant CV, tailor it to each job with AI, and track your whole pipeline in one place.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/cv/new" className="neo-btn neo-btn-primary px-6 py-3 text-sm inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create from scratch <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/cv/import?source=linkedin" className="neo-btn neo-btn-ghost px-5 py-3 text-sm inline-flex items-center gap-2">
                <Linkedin className="w-4 h-4" /> Import from LinkedIn
              </Link>
              <Link to="/cv/import?source=github" className="neo-btn neo-btn-ghost px-5 py-3 text-sm inline-flex items-center gap-2">
                <Github className="w-4 h-4" /> Import from GitHub
              </Link>
              <Link to="/cv/import?source=file" className="neo-btn neo-btn-ghost px-5 py-3 text-sm inline-flex items-center gap-2">
                <Upload className="w-4 h-4" /> Upload file
              </Link>
            </div>
          </div>
        </div>

        {/* Feature hints */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: FileUser, title: 'ATS-ready CVs',    copy: 'Single-column PDF that every ATS can parse.' },
            { icon: Sparkles,  title: 'AI tailoring',     copy: 'Match your CV to any job description in seconds.' },
            { icon: Briefcase, title: 'Job pipeline',     copy: 'Track every application from applied to offer.' },
          ].map(({ icon: Icon, title, copy }) => (
            <div key={title} className="neo-card p-5 animate-fade-in-up">
              <div className="w-10 h-10 rounded-md border-[3px] border-black bg-brand flex items-center justify-center mb-3 shadow">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-white mb-1">{title}</h3>
              <p className="text-[11px] text-muted">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Pipeline counts
  const pipeline = JOB_STATUSES.map(s => ({
    ...s,
    count: jobs.filter(j => j.status === s.value).length,
  })).filter(s => s.count > 0 || ['applied', 'interview', 'offer'].includes(s.value));

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="flex items-center gap-3 font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-wide text-white">
          <span className="inline-block w-2 h-7 bg-brand rounded-sm" />
          CV &amp; Jobs
        </h1>
        <div className="flex gap-2">
          <Link to="/cv/import?source=linkedin" className="neo-btn neo-btn-ghost px-3 py-2.5 text-xs" title="Import from LinkedIn PDF">
            <Linkedin className="w-4 h-4" />
          </Link>
          <Link to="/cv/import?source=github" className="neo-btn neo-btn-ghost px-3 py-2.5 text-xs" title="Import from GitHub">
            <Github className="w-4 h-4" />
          </Link>
          <Link to="/cv/import?source=file" className="neo-btn neo-btn-ghost px-3 py-2.5 text-xs" title="Import CV from file">
            <Upload className="w-4 h-4" />
          </Link>
          <Link to="/cv/match" className="neo-btn neo-btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Tailor to Job
          </Link>
          <Link to="/cv/jobs/new" className="neo-btn neo-btn-ghost px-4 py-2.5 text-xs inline-flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Track Job
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Applications" value={stats.total}   icon={<Send className="w-6 h-6" />}  accent="emerald" />
        <StatCard label="Active"       value={stats.active}  icon={<TrendingUp className="w-6 h-6" />} accent="amber" />
        <StatCard label="Interviews"   value={stats.interviews} icon={<Target className="w-6 h-6" />} accent="emerald" />
        <StatCard label="Offers"       value={stats.offers}  icon={<Award className="w-6 h-6" />}  accent="amber" />
      </div>

      {/* ── Pipeline ── */}
      {jobs.length > 0 && (
        <div className="neo-card overflow-hidden">
          <div className="neo-header-bar">
            <span>Application Pipeline</span>
            <Link to="/cv/jobs" className="neo-tag neo-tag-ghost text-[10px]">View all →</Link>
          </div>
          <div className="p-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pipeline.map(s => (
                <div key={s.value} className={`flex-1 min-w-20 p-3 rounded-md border-2 text-center ${s.color}`}>
                  <div className="font-display text-2xl font-extrabold">{s.count}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column grid: CVs + Recent Applications ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* My CVs */}
        <div className="neo-card overflow-hidden">
          <div className="neo-header-bar">
            <span>My CVs</span>
            <Link to="/cv/new" className="neo-tag neo-tag-accent text-[10px]">+ New version</Link>
          </div>
          <div className="p-4 space-y-2">
            {profiles.map(p => {
              const s = cvStats[p.id];
              const hasStats = s && (s.views + s.downloads + s.applications + s.responses) > 0;
              return (
                <div key={p.id} className="flex items-start gap-2">
                  <Link to={`/cv/${p.id}`}
                    className="flex-1 flex flex-col p-3 rounded-md border-[3px] border-neo-border bg-surface-light hover:border-brand hover:-translate-x-px hover:-translate-y-px hover:shadow transition-all min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-sm border-2 border-black bg-brand/20 flex items-center justify-center shrink-0">
                          <FileUser className="w-4 h-4 text-brand-light" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{p.version_name}</div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                            {p.job_title || p.target_role || 'No target role'}
                            {p.is_default && <span className="ml-2 text-brand-light">· Default</span>}
                            {p.is_shared && <span className="ml-2 text-brand-light">· Public</span>}
                          </div>
                        </div>
                      </div>
                      {p.ats_score != null && (
                        <span className={`font-display text-lg font-extrabold shrink-0 ${p.ats_score >= 80 ? 'text-brand-light' : p.ats_score >= 60 ? 'text-accent' : 'text-red-400'}`}>
                          {p.ats_score}%
                        </span>
                      )}
                    </div>
                    {hasStats && (
                      <div className="flex items-center gap-3 mt-2 pl-10.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
                        <span className="inline-flex items-center gap-1" title="Public CV views"><Eye className="w-3 h-3" />{s.views}</span>
                        <span className="inline-flex items-center gap-1" title="PDF downloads"><Download className="w-3 h-3" />{s.downloads}</span>
                        <span className="inline-flex items-center gap-1" title="Applications sent"><Send className="w-3 h-3" />{s.applications}</span>
                        <span className="inline-flex items-center gap-1" title="Responses"><Reply className="w-3 h-3" />{s.responses}</span>
                        {s.applications > 0 && (
                          <span className={`ml-auto ${s.response_rate >= 25 ? 'text-brand-light' : s.response_rate >= 10 ? 'text-accent' : 'text-subtle'}`}>
                            {s.response_rate}% response
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                  {/* Action buttons */}
                  <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                    <button onClick={async () => {
                      const newName = prompt('Rename CV:', p.version_name);
                      if (!newName || newName === p.version_name) return;
                      await supabase.from('cv_profiles').update({ version_name: newName }).eq('id', p.id);
                      fetchProfiles();
                    }} className="neo-btn neo-btn-ghost p-1.5" title="Rename CV">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={async () => {
                      setDuplicating(p.id);
                      await duplicateProfile(p.id);
                      setDuplicating(null);
                    }} disabled={duplicating === p.id}
                      className="neo-btn neo-btn-ghost p-1.5 text-brand-light disabled:opacity-50" title="Duplicate CV">
                      {duplicating === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`Delete "${p.version_name}"? This cannot be undone.`)) return;
                      await supabase.from('cv_profiles').delete().eq('id', p.id);
                      fetchProfiles();
                    }} className="neo-btn neo-btn-ghost p-1.5 text-red-400 hover:bg-red-500/10 hover:border-red-500" title="Delete CV">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Applications */}
        <div className="neo-card overflow-hidden">
          <div className="neo-header-bar">
            <span>Recent Applications</span>
            <Link to="/cv/jobs" className="neo-tag neo-tag-ghost text-[10px]">View all →</Link>
          </div>
          <div className="p-4">
            {jobs.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-md border-[3px] border-neo-border bg-surface flex items-center justify-center mx-auto mb-3 shadow">
                  <Briefcase className="w-5 h-5 text-muted" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted mb-3">No applications yet</p>
                <Link to="/cv/jobs/new" className="neo-btn neo-btn-primary px-4 py-2 text-xs inline-flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" /> Track first job
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 6).map(j => {
                  const statusDef = JOB_STATUSES.find(s => s.value === j.status);
                  return (
                    <Link key={j.id} to={`/cv/jobs/${j.id}`}
                      className="flex items-center justify-between p-3 rounded-md border-[3px] border-neo-border bg-surface-light hover:border-brand hover:-translate-x-px hover:-translate-y-px hover:shadow transition-all">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{j.position}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted truncate">
                          {j.company}{j.location ? ` · ${j.location}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {j.ats_match_score != null && (
                          <span className="text-[10px] font-mono font-bold text-subtle">{j.ats_match_score}%</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-sm border-2 text-[10px] font-bold uppercase tracking-wider ${statusDef?.color || 'border-neo-border text-muted'}`}>
                          {statusDef?.label || j.status}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

