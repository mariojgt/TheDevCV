import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Plus, FileUser, Briefcase, Target, Award, TrendingUp, Upload, Sparkles, Trash2, Copy, Loader2, Pencil, Eye, Download, Send, Reply, ArrowRight, Linkedin, Github, Coins, X, Wand2 } from 'lucide-react';
import { useCV } from '../hooks/useCV';
import { useJobs } from '../hooks/useJobs';
import { useApp } from '../../../contexts/AppContext';
import { useToast } from '../../../components/ui/Toast';
import { supabase } from '../../../lib/supabase';
import { JOB_STATUSES, type CVProfile } from '../types';
import { draftSummaryFromCV } from '../lib/ai';
import { getCVStats, type CVStats } from '../lib/analytics';
import StatCard from '../../../components/ui/StatCard';

/**
 * Preset role-variant labels for the Duplicate dialog. Biased toward tech
 * engineering titles because that's the primary audience; a free-text
 * "Custom role" input covers anything outside these (e.g. game-dev titles,
 * product, design). Keep the list short — long preset grids slow the choice.
 */
const DUPLICATE_ROLE_PRESETS = [
  'Senior Software Engineer',
  'Staff Engineer',
  'Principal Engineer',
  'Tech Lead',
  'Engineering Manager',
  'Director of Engineering',
  'VP of Engineering',
  'CTO',
] as const;

/**
 * Modal dialog for duplicating a CV with an optional target-role variant.
 * Portaled to <body> so it escapes any scrolling / overflow parents on the
 * dashboard. Keyboard-friendly: Esc cancels, click-outside cancels.
 */
function DuplicateDialog({
  sourceName,
  creating,
  duplicateCost,
  aiCost,
  credits,
  aiAvailable,
  onCancel,
  onConfirm,
}: {
  sourceName: string;
  creating: boolean;
  duplicateCost: number;
  aiCost: number;
  credits: number;
  /** True when we have `settings` wired and can run the AI summary refresh.
   *  When false the AI checkbox is hidden entirely. */
  aiAvailable: boolean;
  onCancel: () => void;
  onConfirm: (opts: { targetRole: string; versionName: string; reviewWithAI: boolean }) => void;
}) {
  const [targetRole, setTargetRole] = useState('');
  const [reviewWithAI, setReviewWithAI] = useState(false);
  const autoName = useMemo(
    () => (targetRole.trim() ? `${sourceName} — ${targetRole.trim()}` : `${sourceName} (Copy)`),
    [sourceName, targetRole],
  );
  const [versionName, setVersionName] = useState(autoName);
  const [versionTouched, setVersionTouched] = useState(false);

  // AI review can only fire on a new target role — without one there's
  // nothing new to tailor the summary against. Flip the flag off whenever
  // the user clears the role so the cost display stays honest.
  useEffect(() => {
    if (!targetRole.trim() && reviewWithAI) setReviewWithAI(false);
  }, [targetRole, reviewWithAI]);

  const totalCost = duplicateCost + (reviewWithAI ? aiCost : 0);
  const enoughForTotal = credits >= totalCost;

  // Auto-sync version name to the role unless the user has edited it.
  useEffect(() => {
    if (!versionTouched) setVersionName(autoName);
  }, [autoName, versionTouched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-lg rounded-md border-[3px] border-neo-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-neo-border">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-brand-light" />
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-white">Duplicate CV</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-xs text-muted">
            Duplicating <span className="text-white font-medium">{sourceName}</span>. Pick a target role to tag
            the copy for a specific role variant (feeds the Tailor pipeline and AI summary drafter).
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1.5">
              Target role <span className="text-subtle font-normal normal-case">(optional — leave blank to keep the original)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DUPLICATE_ROLE_PRESETS.map(preset => {
                const active = targetRole === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTargetRole(active ? '' : preset)}
                    className={`px-2.5 py-1 rounded-full border-2 text-[11px] font-medium transition ${
                      active
                        ? 'border-brand bg-brand/20 text-brand-light'
                        : 'border-neo-border bg-surface-light/40 text-muted hover:text-white hover:border-brand-light/60'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
              placeholder="Or type any role (e.g. Senior Gameplay Programmer)"
              className="w-full neo-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1.5">
              Version name
            </label>
            <input
              type="text"
              value={versionName}
              onChange={e => { setVersionName(e.target.value); setVersionTouched(true); }}
              placeholder={autoName}
              className="w-full neo-input px-3 py-2 text-sm"
            />
            <p className="text-[10px] text-subtle mt-1">Auto-fills from the role. Edit freely.</p>
          </div>

          {/* AI review — only offered when there's a new target role to
              tailor against. Fires `draftSummaryFromCV` on the new copy
              using the new target_role, so the summary actually says "CTO"
              instead of whatever the source said. Opt-in + priced, so users
              never get a silent extra charge. */}
          {aiAvailable && (
            <label
              className={`flex items-start gap-2 p-2 rounded-sm border-2 text-xs cursor-pointer transition ${
                reviewWithAI
                  ? 'border-brand bg-brand/10'
                  : 'border-neo-border/60 bg-surface-light/30 hover:border-brand-light/50'
              } ${!targetRole.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={reviewWithAI}
                onChange={e => setReviewWithAI(e.target.checked)}
                disabled={!targetRole.trim()}
                className="w-3.5 h-3.5 accent-brand cursor-pointer mt-0.5"
              />
              <span>
                <span className="inline-flex items-center gap-1 text-white font-medium">
                  <Wand2 className="w-3 h-3 text-brand-light" />
                  Also refresh summary with AI for this role
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                    <Coins className="w-3 h-3" />+{aiCost}
                  </span>
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  {targetRole.trim()
                    ? `After duplicating, rewrites the summary to weave "${targetRole.trim()}" in verbatim. Pulls from your existing Experience + Skills.`
                    : 'Pick a target role above to enable this option.'}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t-2 border-neo-border bg-surface-light/20">
          <span className="text-[10px] text-muted inline-flex items-center gap-1">
            <Coins className="w-3 h-3 text-brand-light" />
            {reviewWithAI
              ? `Total: ${totalCost} credits (duplicate + AI review)`
              : `Duplicating charges ${duplicateCost} credit`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={creating}
              className="neo-btn neo-btn-ghost px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm({ targetRole: targetRole.trim(), versionName: versionName.trim(), reviewWithAI })}
              disabled={creating || !enoughForTotal}
              title={!enoughForTotal ? `Not enough credits (need ${totalCost})` : 'Create duplicate'}
              className="neo-btn neo-btn-primary px-4 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Duplicate
              <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80">
                <Coins className="w-3 h-3" />{totalCost}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CVDashboard() {
  const { profiles, loading: cvLoading, fetchProfiles, duplicateProfile, fetchExperience, fetchSkills } = useCV();
  const { jobs, loading: jobsLoading, fetchJobs, stats } = useJobs();
  const { credits, hasCredits, costOf, refreshCredits, settings } = useApp();
  const { toast } = useToast();
  const [duplicating, setDuplicating] = useState<string | null>(null);
  // `duplicateTarget` holds the CV selected for duplication while the modal
  // is open. When null the modal is closed. We stash the whole { id, name }
  // so the modal can show the source name in its body without a lookup.
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: string; name: string } | null>(null);
  const [cvStats, setCvStats] = useState<Record<string, CVStats | null>>({});
  const createCost = costOf('create_cv');

  /**
   * Confirm handler for the Duplicate dialog. Two optional extras on top of
   * the base duplicate:
   *
   *   • `opts.targetRole`   — writes to `target_role` on the new CV, feeding
   *     every downstream tailor/optimizer path.
   *   • `opts.reviewWithAI` — after the duplicate lands, calls
   *     `draftSummaryFromCV` on the new row using the new target role as
   *     context so the summary actually mentions the new title. Charges a
   *     second `ai_improve` credit. Fails soft: if the AI pass errors out
   *     we still keep the successful duplicate so users don't lose work.
   *
   * Create credit charge is enforced server-side by the trigger on
   * cv_profiles. This handler translates DB errors to toasts and runs the
   * optional AI step last.
   */
  const handleDuplicateConfirm = async (opts: { targetRole: string; versionName: string; reviewWithAI: boolean }) => {
    if (!duplicateTarget) return;
    const aiCost = costOf('ai_improve');
    const totalCost = createCost + (opts.reviewWithAI ? aiCost : 0);
    if (credits < totalCost) {
      toast(`Not enough credits — this needs ${totalCost} (balance: ${credits}).`, 'error');
      return;
    }
    setDuplicating(duplicateTarget.id);
    try {
      const { data: newCv, error } = await duplicateProfile(duplicateTarget.id, {
        targetRole: opts.targetRole,
        versionName: opts.versionName,
      });
      if (error || !newCv) {
        if (error?.toLowerCase().includes('insufficient_credits')) {
          toast('Not enough credits to duplicate.', 'error');
        } else {
          toast(`Could not duplicate "${duplicateTarget.name}".`, 'error');
        }
        return;
      }
      refreshCredits();

      // Optional AI pass — runs only when the user opted in AND a target
      // role exists (the dialog enforces that, but we re-check for safety).
      let aiApplied = false;
      if (opts.reviewWithAI && opts.targetRole && settings) {
        try {
          const [exp, skills] = await Promise.all([
            fetchExperience(newCv.id),
            fetchSkills(newCv.id),
          ]);
          const rewritten = await draftSummaryFromCV(
            { ...(newCv as CVProfile), target_role: opts.targetRole },
            exp,
            skills,
            settings,
          );
          if (rewritten?.trim()) {
            const { error: updErr } = await supabase
              .from('cv_profiles')
              .update({ summary: rewritten.trim() })
              .eq('id', newCv.id);
            if (!updErr) aiApplied = true;
          }
          refreshCredits();
        } catch (aiErr) {
          console.error('AI review after duplicate failed:', aiErr);
          toast('Duplicate created, but the AI summary refresh failed.', 'error');
        }
      }

      const tag = opts.targetRole ? ` tagged "${opts.targetRole}"` : '';
      const aiSuffix = aiApplied ? ' · summary refreshed with AI' : '';
      toast(`Duplicated "${duplicateTarget.name}"${tag}${aiSuffix}.`, 'success');
      setDuplicateTarget(null);
      fetchProfiles();
    } finally {
      setDuplicating(null);
    }
  };

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
              <Link
                to="/cv/new"
                title={`Each new CV costs ${createCost} credit (charged when you save). Balance: ${credits}.`}
                className="neo-btn neo-btn-primary px-6 py-3 text-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create from scratch <ArrowRight className="w-4 h-4" />
                <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80">
                  <Coins className="w-3 h-3" />{createCost}
                </span>
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
            <p className="text-[11px] text-subtle mt-3">
              New CVs and duplicates cost {createCost} credit each when saved. Current balance: <span className="text-brand-light font-medium">{credits}</span>.
            </p>
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

      {/* Duplicate dialog — rendered here so it portals above all siblings. */}
      {duplicateTarget && (
        <DuplicateDialog
          sourceName={duplicateTarget.name}
          creating={duplicating === duplicateTarget.id}
          duplicateCost={createCost}
          aiCost={costOf('ai_improve')}
          credits={credits}
          aiAvailable={!!settings}
          onCancel={() => { if (duplicating !== duplicateTarget.id) setDuplicateTarget(null); }}
          onConfirm={handleDuplicateConfirm}
        />
      )}

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
            <Link
              to="/cv/new"
              title={`New CV · ${createCost} credit (charged on save)`}
              className="neo-tag neo-tag-accent text-[10px]"
            >
              + New version · {createCost}¢
            </Link>
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
                    <button
                      onClick={() => setDuplicateTarget({ id: p.id, name: p.version_name })}
                      disabled={duplicating === p.id || !hasCredits('create_cv')}
                      title={
                        !hasCredits('create_cv')
                          ? `Not enough credits (need ${createCost})`
                          : `Duplicate CV as a role variant · ${createCost} credit`
                      }
                      className="neo-btn neo-btn-ghost p-1.5 text-brand-light disabled:opacity-50"
                    >
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

