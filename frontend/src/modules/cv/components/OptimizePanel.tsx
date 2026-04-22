import { useState } from 'react';
import { Check, X, Brain, Loader2, Sparkles, AlertTriangle, ArrowUp, ArrowRight, Plus, Trash2, RefreshCw, Zap } from 'lucide-react';
import type { CVSuggestion } from '../lib/ai';

const priorityColors = {
  high: 'border-red-500 bg-red-500/5',
  medium: 'border-[var(--color-accent)] bg-[var(--color-accent)]/5',
  low: 'border-[var(--color-neo-border)] bg-[var(--color-surface)]',
};

const priorityBadge = {
  high: 'bg-red-500/10 text-red-400',
  medium: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  low: 'bg-[var(--color-surface-light)] text-muted',
};

const actionIcons = {
  replace: RefreshCw,
  add: Plus,
  remove: Trash2,
  rewrite: Sparkles,
};

export default function OptimizePanel({
  suggestions,
  loading,
  onGenerate,
  onAccept,
  onReject,
  onAcceptAll,
}: {
  suggestions: CVSuggestion[];
  loading: boolean;
  onGenerate: () => void;
  onAccept: (suggestion: CVSuggestion) => void;
  onReject: (id: string) => void;
  onAcceptAll: () => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const visible = suggestions.filter(s => !dismissed.has(s.id) && !accepted.has(s.id));
  const highCount = visible.filter(s => s.priority === 'high').length;
  const medCount = visible.filter(s => s.priority === 'medium').length;

  const handleAccept = (s: CVSuggestion) => {
    onAccept(s);
    setAccepted(prev => new Set([...prev, s.id]));
  };

  const handleReject = (id: string) => {
    onReject(id);
    setDismissed(prev => new Set([...prev, id]));
  };

  if (suggestions.length === 0 && !loading) {
    return (
      <div className="neo-card p-4">
        <button onClick={onGenerate} disabled={loading}
          className="neo-btn neo-btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm">
          <Brain className="w-4 h-4" /> Optimize with AI
        </button>
        <p className="text-xs text-muted text-center mt-2">
          AI will analyze your CV and suggest specific improvements
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="neo-card p-6 text-center">
        <div className="relative inline-block mb-3">
          <Brain className="w-8 h-8 text-brand-light" />
          <div className="absolute inset-0 w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        </div>
        <p className="text-sm font-extrabold uppercase tracking-wide text-white">Analyzing your CV…</p>
        <p className="text-xs text-muted mt-1">Finding improvements, checking ATS compatibility</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="neo-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-light" />
            <span className="text-xs font-extrabold uppercase tracking-wide text-white">{visible.length} Suggestions</span>
          </div>
          <div className="flex gap-2">
            {visible.length > 1 && (
              <button onClick={() => {
                visible.forEach(s => handleAccept(s));
                onAcceptAll();
              }}
                className="neo-btn neo-btn-primary text-[10px] px-2 py-1">
                Accept All
              </button>
            )}
            <button onClick={onGenerate}
              className="neo-btn neo-btn-ghost text-[10px] px-2 py-1">
              Re-analyze
            </button>
          </div>
        </div>
        <div className="flex gap-2 text-[10px]">
          {highCount > 0 && <span className={`px-1.5 py-0.5 rounded ${priorityBadge.high}`}>{highCount} high priority</span>}
          {medCount > 0 && <span className={`px-1.5 py-0.5 rounded ${priorityBadge.medium}`}>{medCount} medium</span>}
          {accepted.size > 0 && <span className={`px-1.5 py-0.5 rounded-sm ${priorityBadge.low}`}>{accepted.size} applied</span>}
        </div>
      </div>

      {/* Suggestion cards */}
      {visible.map(s => {
        const ActionIcon = actionIcons[s.action] || Sparkles;
        return (
          <div key={s.id} className={`rounded-md border-2 p-3 ${priorityColors[s.priority]}`}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <ActionIcon className="w-3.5 h-3.5 text-brand-light shrink-0" />
                <span className="text-xs font-extrabold uppercase tracking-wide truncate">{s.title}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${priorityBadge[s.priority]}`}>
                {s.priority}
              </span>
            </div>

            <p className="text-[11px] text-muted mb-1.5">{s.description}</p>

            {/* ATS Impact */}
            {s.ats_impact && (
              <div className="flex items-center gap-1 mb-2">
                <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-400">{s.ats_impact}</span>
              </div>
            )}

            {/* Current → Suggested diff */}
            {s.current && s.suggested && (
              <div className="space-y-1.5 mb-2">
                <div className="text-[10px] p-2 rounded-sm border-2 border-red-500 bg-red-500/5">
                  <span className="text-red-400 font-bold">Current: </span>
                  <span className="text-muted line-through">{s.current.slice(0, 200)}</span>
                </div>
                <div className="text-[10px] p-2 rounded-sm border-2 border-brand bg-brand/5">
                  <span className="text-brand-light font-bold">Suggested: </span>
                  <span className="text-muted">{s.suggested.slice(0, 200)}</span>
                </div>
              </div>
            )}

            {s.suggested && !s.current && (
              <div className="text-[10px] p-2 rounded-sm border-2 border-brand bg-brand/5 mb-2">
                <span className="text-brand-light font-bold">{s.action === 'add' ? 'Add: ' : 'Suggested: '}</span>
                <span className="text-muted">{s.suggested.slice(0, 200)}</span>
              </div>
            )}

            <div className="text-[9px] text-muted mb-2">{s.section}</div>

            {/* Accept / Reject */}
            <div className="flex gap-1.5">
              <button onClick={() => handleAccept(s)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-sm border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase hover:bg-brand/20 transition-colors">
                <Check className="w-3 h-3" /> Apply
              </button>
              <button onClick={() => handleReject(s.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-sm border-2 border-neo-border bg-surface text-muted text-[10px] font-bold uppercase hover:text-white transition-colors">
                <X className="w-3 h-3" /> Dismiss
              </button>
            </div>
          </div>
        );
      })}

      {visible.length === 0 && accepted.size > 0 && (
      <div className="neo-card-brand p-4 text-center">
        <Check className="w-6 h-6 text-brand-light mx-auto mb-2" />
        <p className="text-sm font-extrabold uppercase tracking-wide text-white">All suggestions applied!</p>
        <p className="text-xs text-muted mt-1">Don't forget to save your changes.</p>
        </div>
      )}
    </div>
  );
}
