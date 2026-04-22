import { useState } from 'react';
import { Target, Loader2, Check, AlertTriangle, X, ChevronDown, Sparkles, Plus, RefreshCw } from 'lucide-react';
import type { ATSGapAnalysis } from '../lib/ai';

const severityColors = {
  critical: 'border-red-500 bg-red-500/5 text-red-400',
  important: 'border-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[var(--color-accent)]',
  nice_to_have: 'border-[var(--color-neo-border)] bg-[var(--color-surface)] text-muted',
};

const severityLabels = { critical: 'Critical', important: 'Important', nice_to_have: 'Nice to Have' };

export default function ATSAnalysis({
  analysis,
  loading,
  jobText,
  onJobTextChange,
  onAnalyze,
  onApplySummary,
  onApplyAchievement,
  onAddSkills,
  onApplyAll,
}: {
  analysis: ATSGapAnalysis | null;
  loading: boolean;
  jobText: string;
  onJobTextChange: (text: string) => void;
  onAnalyze: () => void;
  onApplySummary: (summary: string) => void;
  onApplyAchievement: (expId: string, current: string, suggested: string) => void;
  onAddSkills: (skills: string[]) => void;
  onApplyAll: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const markApplied = (key: string) => setApplied(prev => new Set([...prev, key]));

  return (
    <div className="neo-card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-4 hover:bg-surface-light transition-colors">
        <Target className="w-5 h-5 text-brand-light shrink-0" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-white flex-1 text-left">ATS Gap Analysis</span>
        {analysis && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-sm mr-2 ${analysis.score >= 80 ? 'bg-brand/10 text-brand-light' : analysis.score >= 60 ? 'bg-accent/10 text-accent' : 'bg-red-500/10 text-red-400'}`}>
            {analysis.score}%
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t-[3px] border-neo-border pt-4 space-y-3">
          {/* Job description input */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted mb-1 block">Paste job description or URL</label>
            <textarea value={jobText} onChange={e => onJobTextChange(e.target.value)}
              rows={4} placeholder="Paste the full job description here to get a detailed ATS gap analysis with a path to 100% match…"
              className="neo-input px-3 py-2 text-xs resize-none" />
          </div>

          <button onClick={onAnalyze} disabled={loading || !jobText.trim()}
            className="neo-btn neo-btn-primary w-full py-2.5 text-sm inline-flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            {loading ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze ATS Match'}
          </button>

          {/* Results */}
          {analysis && !loading && (
            <div className="space-y-3 pt-2">
              {/* Score + Keywords */}
              <div className="flex items-center gap-3">
                <div className={`font-display text-3xl font-extrabold ${analysis.score >= 80 ? 'text-brand-light' : analysis.score >= 60 ? 'text-accent' : 'text-red-400'}`}>
                  {analysis.score}%
                </div>
                <div className="flex-1">
                  <div className="h-2.5 rounded-sm bg-surface-light border border-neo-border overflow-hidden">
                    <div className={`h-full transition-all ${analysis.score >= 80 ? 'bg-brand' : analysis.score >= 60 ? 'bg-accent' : 'bg-red-500'}`}
                      style={{ width: `${analysis.score}%` }} />
                  </div>
                  <div className="text-[10px] text-muted mt-1">
                    {analysis.matched_keywords.length} matched · {analysis.missing_keywords.length} missing keywords
                  </div>
                </div>
              </div>

              {/* Matched keywords */}
              {analysis.matched_keywords.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand-light mb-1">Matched Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.matched_keywords.map((k, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm border border-brand bg-brand/10 text-brand-light">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing keywords */}
              {analysis.missing_keywords.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Missing Keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.missing_keywords.map((k, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm border border-red-500 bg-red-500/10 text-red-400">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Gaps */}
              {analysis.gaps.length > 0 && (
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wide text-white mb-2">Gaps to Close</div>
                  {analysis.gaps.map((g, i) => (
                    <div key={i} className={`mb-2 p-2.5 rounded-md border-2 text-xs ${severityColors[g.severity]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold uppercase tracking-wide text-xs">{g.area}</span>
                        <span className="text-[9px] font-bold uppercase opacity-75">{severityLabels[g.severity]}</span>
                      </div>
                      <p className="text-[11px] opacity-80 mb-1">{g.description}</p>
                      <div className="text-[10px] p-1.5 rounded-sm border-2 border-brand bg-brand/5 text-brand-light">
                        Fix: {g.fix}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="space-y-2 pt-1">
                {/* Apply summary */}
                {analysis.summary_rewrite && !applied.has('summary') && (
                  <div className="p-2.5 rounded-md border-2 border-brand bg-brand/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-brand-light">Optimized Summary</span>
                      <button onClick={() => { onApplySummary(analysis.summary_rewrite); markApplied('summary'); }}
                        className="neo-btn neo-btn-primary text-[10px] px-2 py-0.5">Apply</button>
                    </div>
                    <p className="text-[10px] text-muted leading-relaxed">{analysis.summary_rewrite}</p>
                  </div>
                )}
                {applied.has('summary') && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400"><Check className="w-3 h-3" /> Summary applied</div>
                )}

                {/* Add missing skills */}
                {analysis.skills_to_add.length > 0 && !applied.has('skills') && (
                  <div className="p-2.5 rounded-md border-2 border-neo-border bg-surface-light">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold uppercase tracking-wide text-white">Add {analysis.skills_to_add.length} Missing Skills</span>
                      <button onClick={() => { onAddSkills(analysis.skills_to_add); markApplied('skills'); }}
                        className="neo-btn neo-btn-primary text-[10px] px-2 py-0.5">Add All</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.skills_to_add.map((s, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm border border-neo-border bg-surface text-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enhanced achievements */}
                {analysis.achievements_to_enhance.length > 0 && (
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wide text-white mb-1">Enhanced Achievements</div>
                    {analysis.achievements_to_enhance.map((a, i) => {
                      const key = `ach_${i}`;
                      if (applied.has(key)) return (
                        <div key={i} className="flex items-center gap-1 text-[10px] text-emerald-400 mb-1"><Check className="w-3 h-3" /> Applied</div>
                      );
                      return (
                        <div key={i} className="mb-2 p-2 rounded-md border-2 border-neo-border bg-surface-light">
                          <div className="text-[9px] text-red-400 line-through mb-1">{a.current?.slice(0, 120)}</div>
                          <div className="text-[9px] text-brand-light mb-1">{a.suggested?.slice(0, 120)}</div>
                          <button onClick={() => { onApplyAchievement(a.experience_id, a.current, a.suggested); markApplied(key); }}
                            className="neo-btn neo-btn-primary text-[9px] px-2 py-0.5">Apply</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Apply all */}
                {applied.size < 3 && (
                  <button onClick={() => {
                    if (analysis.summary_rewrite && !applied.has('summary')) { onApplySummary(analysis.summary_rewrite); markApplied('summary'); }
                    if (analysis.skills_to_add.length > 0 && !applied.has('skills')) { onAddSkills(analysis.skills_to_add); markApplied('skills'); }
                    analysis.achievements_to_enhance.forEach((a, i) => {
                      if (!applied.has(`ach_${i}`)) { onApplyAchievement(a.experience_id, a.current, a.suggested); markApplied(`ach_${i}`); }
                    });
                    onApplyAll();
                  }}
                    className="neo-btn neo-btn-ghost w-full py-2 text-xs inline-flex items-center justify-center gap-1 text-brand-light">
                    <Sparkles className="w-3 h-3" /> Apply All Fixes → Target 100%
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
