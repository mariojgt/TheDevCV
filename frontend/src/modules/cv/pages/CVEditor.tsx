import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Plus, Trash2, Eye, Download, Brain, ChevronDown, Palette, Coins, Sparkles, FileText, Wand2, Target, Layers, CheckCircle2, GripVertical, RefreshCw, Braces, MessageSquare, Copy, ClipboardList, TrendingUp, AlertCircle, Globe, Info } from 'lucide-react';
import { useCV } from '../hooks/useCV';
import { useApp } from '../../../contexts/AppContext';
import { useToast } from '../../../components/ui/Toast';
import { InsufficientCreditsError } from '../../../lib/ai-client';
import { atsScore, optimizeCV, improveSection, draftEntryFromText, draftProjectFromUrl, draftSummaryFromCV, beautifyText, generateCoverLetter, generateInterviewQuestions, type CVSuggestion, type ATSGapAnalysis, type DraftedExperience, type DraftedProject, type InterviewQuestion } from '../lib/ai';
import { generateClassicPDF, generateModernPDF, generateMinimalPDF, generateProfessionalPDF, generateExecutivePDF, generateCorporatePDF, generateNeoPDF, generateNeoDarkPDF } from '../lib/pdf';
import OptimizePanel from '../components/OptimizePanel';
import ImportFromCV from '../components/ImportFromCV';
import ATSAnalysis from '../components/ATSAnalysis';
import QualityChecks from '../components/QualityChecks';
import SharePanel from '../components/SharePanel';
import PortfolioBuilder from '../components/PortfolioBuilder';
import { toJSONResume, downloadJSONResume } from '../lib/jsonResume';
import { toPlainText, downloadPlainText } from '../lib/plainText';
import PlanBadge from '../../../components/PlanBadge';
import { recordCVEvent } from '../lib/analytics';
import CVTemplateClassic from '../components/CVTemplate';
import RichTextEditor from '../components/RichTextEditor';
import TagsInput from '../components/TagsInput';
import CVTemplateModern from '../components/CVTemplateModern';
import CVTemplateMinimal from '../components/CVTemplateMinimal';
import CVTemplateProfessional from '../components/CVTemplateProfessional';
import CVTemplateExecutive from '../components/CVTemplateExecutive';
import CVTemplateCorporate from '../components/CVTemplateCorporate';
import CVTemplateNeo from '../components/CVTemplateNeo';
import CVTemplateNeoDark from '../components/CVTemplateNeoDark';
import { supabase } from '../../../lib/supabase';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage, CVGapReason } from '../types';
import { SKILL_CATEGORIES, PROFICIENCY_LEVELS, LANGUAGE_LEVELS, CAREER_STAGES, INDUSTRIES, GAP_PRESETS } from '../types';
import { detectGaps, detectShortTenurePattern, layoffNote, formatMonths, formatMonthYear } from '../lib/gapAnalysis';

type TemplateName = 'classic' | 'modern' | 'minimal' | 'professional' | 'executive' | 'corporate' | 'neo' | 'neo-dark';

const TEMPLATES: { id: TemplateName; label: string; desc: string }[] = [
  { id: 'classic', label: 'Classic', desc: 'Single column, ATS-optimized' },
  { id: 'modern', label: 'Modern', desc: 'Two-column with skills sidebar' },
  { id: 'minimal', label: 'Minimal', desc: 'Elegant serif typography' },
  { id: 'professional', label: 'Professional', desc: 'Labeled sections, recruiter-friendly' },
  { id: 'executive', label: 'Executive', desc: 'Navy serif with accent bar — senior roles' },
  { id: 'corporate', label: 'Corporate', desc: 'Blue double-rule sections — business-formal' },
  { id: 'neo',      label: 'Neo',      desc: 'Bold brand style — matches thedevcv.com' },
  { id: 'neo-dark', label: 'Neo Dark', desc: 'Deep navy + brand green — dark mode' },
];

type EditorTab = 'edit' | 'design' | 'ai-review' | 'tailor' | 'portfolio';

const TABS: { id: EditorTab; label: string; icon: typeof FileText }[] = [
  { id: 'edit',      label: 'Edit',      icon: FileText },
  { id: 'design',    label: 'Design',    icon: Palette },
  { id: 'ai-review', label: 'AI Review', icon: Wand2 },
  { id: 'tailor',    label: 'Tailor',    icon: Target },
  { id: 'portfolio', label: 'Portfolio', icon: Globe },
];

const AI_STEPS = [
  'Reading your experience…',
  'Mapping keywords to role…',
  'Analysing bullet impact…',
  'Checking ATS compatibility…',
  'Drafting improvements…',
  'Polishing language…',
  'Finalising suggestions…',
];

/** Initial profile shape used for new CVs and as the baseline for dirty-tracking. */
const DEFAULT_PROFILE: Partial<CVProfile> = {
  version_name: 'Main CV', full_name: '', job_title: '', email: '', phone: '', location: '',
  website: '', linkedin: '', github: '', portfolio: '', summary: '', target_role: '', keywords: [], is_default: true,
  career_stage: null, industry: null, relevant_coursework: null, capstone_project: null,
};

/** Debounce window between the last edit and the autosave firing. */
const AUTOSAVE_DEBOUNCE_MS = 2000;

/** Compact relative timestamp used in the save-status chip. */
function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/**
 * Full-screen overlay shown while the AI writer is running.
 * Cycles through status messages, pulses a scanning bar, and
 * keeps the neo-brutalist brand aesthetic.
 */
function AIWritingOverlay({ visible }: { visible: boolean }) {
  const [step, setStep] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!visible) { setStep(0); setDots(''); return; }
    const stepTimer = setInterval(() => setStep(s => (s + 1) % AI_STEPS.length), 1800);
    const dotTimer  = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => { clearInterval(stepTimer); clearInterval(dotTimer); };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/95 backdrop-blur-sm animate-fade-in-up">
      {/* Stripe pattern accent strip */}
      <div className="absolute inset-x-0 top-0 h-1.5 neo-stripe-pattern opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-1.5 neo-stripe-pattern opacity-60" />

      <div className="w-full max-w-md px-6 text-center">
        {/* Animated icon box */}
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-md border-[3px] border-brand bg-brand/10 shadow-md" />
          {/* Rotating outer ring */}
          <div className="absolute -inset-1.5 rounded-md border-[3px] border-dashed border-brand/40 animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-brand-light" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>

        {/* Heading */}
        <div className="neo-tag neo-tag-brand mb-4 inline-block">AI Writer</div>
        <h2 className="font-display text-3xl font-extrabold uppercase tracking-wide text-white mb-2">
          Writing your CV
        </h2>
        <p className="text-xs text-muted mb-8">
          Analysing your experience and crafting ATS-optimised suggestions
        </p>

        {/* Scanning progress bar */}
        <div className="relative h-2 w-full rounded-sm border-2 border-neo-border bg-surface overflow-hidden mb-6">
          <div
            className="absolute top-0 left-0 h-full bg-brand rounded-sm"
            style={{
              animation: 'ai-scan 2s ease-in-out infinite',
            }}
          />
        </div>

        {/* Cycling status message */}
        <div className="h-6 flex items-center justify-center">
          <p key={step} className="text-xs font-bold uppercase tracking-wider text-brand-light animate-fade-in-up">
            {AI_STEPS[step]}{dots}
          </p>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 mt-6">
          {AI_STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-sm transition-all duration-300 ${
                i === step
                  ? 'w-4 h-1.5 bg-brand'
                  : i < step
                  ? 'w-1.5 h-1.5 bg-brand/40'
                  : 'w-1.5 h-1.5 bg-neo-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


/**
 * Collapsible entry card used for multi-field items (Experience, Education,
 * Projects). Shows a compact title + subtitle row when closed and expands the
 * form fields on click. Supports drag-to-reorder (native HTML5 DnD) and a
 * hover-revealed delete button.
 *
 * Design inspired by resume.io's editor — the "wall of fields" problem
 * disappears when each entry collapses to a single row.
 */
function EntryCard({
  title, subtitle, open, onToggle, onDelete, onReorder, index, children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  /** Called when this entry is dropped from position `from` onto index `to`. */
  onReorder: (from: number, to: number) => void;
  /** Position in the section — used as the drag payload. */
  index: number;
  children: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/entry-index', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/entry-index')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const raw = e.dataTransfer.getData('text/entry-index');
        if (!raw) return;
        const from = parseInt(raw, 10);
        if (Number.isNaN(from) || from === index) return;
        onReorder(from, index);
      }}
      className={`group relative rounded-md border-[3px] transition-all ${
        dragOver
          ? 'border-brand bg-brand/5'
          : 'border-neo-border bg-surface hover:border-brand/60'
      }`}
    >
      {/* Collapsed header row */}
      <div className="flex items-center gap-1">
        <div
          className="shrink-0 pl-2 pr-1 py-3 text-subtle cursor-grab active:cursor-grabbing hover:text-muted"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left py-3 pr-2 min-w-0"
        >
          <div className="text-sm font-bold truncate">{title || <span className="text-subtle italic">Untitled</span>}</div>
          {subtitle && <div className="text-xs text-muted mt-0.5 truncate">{subtitle}</div>}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete entry"
          className="shrink-0 p-2 mr-1 rounded-sm text-subtle opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 p-2 mr-2 text-subtle hover:text-muted"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-neo-border space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Bullet Impact Scorer ─────────────────────────────────────────────────────
// Pure heuristic: no AI required. Scores a single achievement bullet 0–4 on
// four axes: strong verb, has number, shows outcome, concise length.

const STRONG_VERBS_RE = /^(led|spearheaded|architected|engineered|orchestrated|delivered|shipped|launched|built|developed|implemented|designed|negotiated|secured|generated|accelerated|reduced|increased|scaled|streamlined|overhauled|pioneered|transformed|championed|consolidated|modernised|modernized|catalysed|catalyzed|owned|drove|founded|created|managed|directed|wrote|refactored|migrated|deployed|automated|optimised|optimized|resolved|improved|established|authored|introduced|upgraded|trained|mentored|collaborated|coordinated|produced|revamped)/i;
const WEAK_VERBS_RE = /^(responsible for|duties include|helped to|worked on|involved in|participated in|assisted|tasked with)/i;
const NUMBER_RE = /\d+/;
const OUTCOME_RE = /\b(reduc|increas|improv|achiev|deliver|launch|grew|growing|save|saved|speed|sped|cut|boost|driv|generat|result|impact|by \d|within \d|across \d|over \d|from \d|to \d)\w*/i;

interface BulletScore { score: number; label: 'Strong' | 'Good' | 'Weak' | 'Poor'; tips: string[] }

function scoreBullet(raw: string): BulletScore {
  const text = raw.replace(/^[\-•*\s]+/, '').trim();
  if (!text) return { score: 0, label: 'Poor', tips: [] };

  const tips: string[] = [];
  let score = 0;

  if (STRONG_VERBS_RE.test(text)) {
    score++;
  } else {
    const msg = WEAK_VERBS_RE.test(text)
      ? 'Swap passive opener for a power verb (Led, Built, Delivered…)'
      : 'Begin with a power verb (Led, Delivered, Engineered…)';
    tips.push(msg);
  }

  if (NUMBER_RE.test(text)) {
    score++;
  } else {
    tips.push('Add a metric (%, $, count, time) — 60 %+ of bullets need one');
  }

  if (OUTCOME_RE.test(text)) {
    score++;
  } else {
    tips.push('Show the result or impact, not just the task');
  }

  const len = text.length;
  if (len > 0 && len <= 150) {
    score++;
  } else if (len > 150) {
    tips.push('Too long – trim to ≤150 chars');
  }

  const label: BulletScore['label'] = score >= 4 ? 'Strong' : score >= 3 ? 'Good' : score >= 2 ? 'Weak' : 'Poor';
  return { score, label, tips };
}

/**
 * Compact quality panel shown under each Experience entry's achievements.
 * Replaces the old row of hover-only impact dots with an action-first card:
 *
 *   • A one-line summary bar showing strong-vs-total ratio.
 *   • An expandable list of the weak bullets only — each with its own tips
 *     and a "Fix with AI" button that rewrites that single bullet via the
 *     existing `improveSection('achievements', …)` endpoint.
 *   • Strong bullets are counted but not listed, so the card stays short
 *     on polished CVs.
 *
 * The card auto-expands when any bullet is weak so problems aren't hidden
 * behind a click; users can collapse it once they're satisfied.
 */
function BulletHealth({
  bullets,
  onFix,
  fixingIndex,
  fixCost,
  fixDisabled,
}: {
  bullets: string[];
  onFix: (bulletIndex: number, original: string) => void;
  fixingIndex: number | null;
  fixCost: number;
  fixDisabled: boolean;
}) {
  const graded = bullets
    .map((text, index) => ({ text, index, ...scoreBullet(text) }))
    .filter(b => b.text.trim());

  const weak = graded.filter(b => b.score <= 2);
  const strongCount = graded.length - weak.length;
  const [expanded, setExpanded] = useState(weak.length > 0);

  if (graded.length === 0) return null;

  const allStrong = weak.length === 0;
  const hasPoor = weak.some(b => b.score <= 1);
  const barColor = allStrong ? 'bg-brand' : hasPoor ? 'bg-red-400' : 'bg-amber-400';
  const scorePct = Math.round((strongCount / graded.length) * 100);

  return (
    <div className="rounded-md border-2 border-neo-border/60 bg-surface/40">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-surface/60 rounded-md transition-colors"
      >
        <span className="font-bold uppercase tracking-wide text-muted">Bullet health</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="relative flex-1 max-w-[90px] h-1 rounded-full bg-neo-border/50 overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
              style={{ width: `${scorePct}%` }}
            />
          </div>
          <span className="text-white font-medium whitespace-nowrap">
            {strongCount} of {graded.length} strong
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-neo-border/40 px-3 py-2 space-y-2">
          {allStrong ? (
            <div className="text-[11px] text-brand-light flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> All bullets look strong — nicely done.
            </div>
          ) : (
            <>
              {weak.map((b) => {
                const isFixing = fixingIndex === b.index;
                const labelColor = b.score <= 1 ? 'text-red-400' : 'text-amber-400';
                return (
                  <div
                    key={b.index}
                    className="rounded-sm border border-neo-border/40 bg-surface-light/30 p-2"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-[10px] font-extrabold uppercase tracking-wide ${labelColor}`}>
                        {b.label}
                      </span>
                      <span className="text-[10px] text-subtle">#{b.index + 1}</span>
                    </div>
                    <div className="text-[11px] text-white/90 leading-snug mb-1.5 line-clamp-2">
                      "{b.text}"
                    </div>
                    <ul className="text-[10px] text-muted space-y-0.5 mb-2">
                      {b.tips.map((t, ti) => <li key={ti}>· {t}</li>)}
                    </ul>
                    <button
                      type="button"
                      onClick={() => onFix(b.index, b.text)}
                      disabled={isFixing || fixDisabled}
                      title={fixDisabled ? `Not enough credits (need ${fixCost})` : 'Rewrite this bullet with AI'}
                      className="neo-btn neo-btn-ghost px-2.5 py-1 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {isFixing ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Rewriting…</>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-brand-light" /> Fix with AI
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                            <Coins className="w-3 h-3" />{fixCost}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
              {strongCount > 0 && (
                <div className="text-[10px] text-muted pt-0.5">
                  {strongCount} strong bullet{strongCount === 1 ? '' : 's'} hidden
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Reorder a list immutably: move `from` -> `to`.
 */
function reorderArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Research-backed inline hint rendered below form fields. Every source cited
 * traces to the CV-research deliverable (Bock/Google, Jobscan, Ladders eye-
 * tracking, uppl.ai). Keep the copy short — users read these in <3 seconds.
 */
function FieldTip({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] text-subtle flex items-start gap-1.5 leading-snug">
      <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-brand-light/70" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Section accepts either (a) controlled `open` + `onToggle` props — used by
 * CVEditor for the single-section-at-a-time accordion — or (b) falls back to
 * internal `defaultOpen` state when those are omitted. Keeping the
 * uncontrolled form means callers outside the editor don't need to track
 * state just to render a collapsible card.
 *
 * `overflow-hidden` is intentionally NOT on the outer card: chip popovers
 * inside Skills / Languages / Certifications are portaled and need the card
 * not to establish a clipping ancestor. The header button gets `rounded-t-md`
 * so its hover background still clips against the card's top corners.
 */
function Section({
  id, title, count, defaultOpen = true, open, onToggle, children,
}: {
  id?: string;
  title: string;
  count?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen(v => !v));
  return (
    <div id={id} className="neo-card scroll-mt-3">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 rounded-t-md hover:bg-surface/50 transition-colors"
      >
        <span className="text-xs font-extrabold uppercase tracking-wide text-white">{title} {count != null && <span className="text-muted font-normal normal-case">({count})</span>}</span>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 border-t border-neo-border pt-4">{children}</div>}
    </div>
  );
}

/**
 * Compact inline JD-match strip rendered in the Edit tab. Reuses the
 * ATSGapAnalysis state produced in the Tailor tab so editing + tailoring
 * stay connected — user sees missing keywords and can one-click add them
 * as skills without leaving the Edit tab.
 *
 * Renders nothing when no analysis has been run yet (avoid empty-state noise).
 */
function InlineJDDelta({
  analysis, skills, onAddSkill, onAddAllSkills, onOpenTailor,
}: {
  analysis: ATSGapAnalysis | null;
  skills: CVSkill[];
  onAddSkill: (name: string) => void;
  onAddAllSkills: () => void;
  onOpenTailor: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (!analysis) return null;
  const existing = new Set(skills.map(s => s.name.toLowerCase()));
  const missingSkills = (analysis.skills_to_add || []).filter(s => !existing.has(s.toLowerCase()));
  const missingKw = (analysis.missing_keywords || []).slice(0, 12);
  const scoreColor =
    analysis.score >= 80 ? 'text-brand-light border border-brand bg-brand/10' :
    analysis.score >= 60 ? 'text-accent border border-accent bg-accent/10' :
                           'text-red-400 border border-red-500 bg-red-500/10';
  return (
    <div className="neo-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface/50 transition-colors"
      >
        <Target className="w-4 h-4 text-brand-light shrink-0" />
        <span className="text-xs font-semibold">JD match</span>
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>{analysis.score}%</span>
        <span className="text-[11px] text-muted">
          · {analysis.matched_keywords.length} matched · {analysis.missing_keywords.length} missing
        </span>
        <span className="flex-1" />
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-neo-border space-y-2">
          {missingKw.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-subtle">Missing keywords</div>
              <div className="flex flex-wrap gap-1">
                {missingKw.map((k, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onAddSkill(k)}
                    title={`Add "${k}" as a skill`}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-sm border border-red-500 bg-red-500/10 text-red-400 hover:bg-brand/10 hover:text-brand-light hover:border-brand transition-colors"
                  >
                    {k} <Plus className="w-2.5 h-2.5" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-brand-light inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> No missing keywords — solid match.
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            {missingSkills.length > 0 ? (
              <button
                type="button"
                onClick={onAddAllSkills}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add {missingSkills.length} missing as skills
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={onOpenTailor}
              className="text-[11px] text-muted hover:text-brand-light transition-colors"
            >
              Full analysis in Tailor →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline empty-state for Experience / Projects sections. Users type a rough
 * description ("Backend engineer at Acme 2021-now, shipped payments…") and AI
 * drafts a structured entry. Keeps the "blank intimidation" away — a strong
 * first bullet matters more than a perfect one.
 */
function EmptyDraftPrompt({
  kind, placeholder, loading, onDraft, onManual,
}: {
  kind: 'experience' | 'project';
  placeholder: string;
  loading: boolean;
  onDraft: (text: string) => void;
  onManual: () => void;
}) {
  const [text, setText] = useState('');
  const label = kind === 'experience' ? 'role' : 'project';
  return (
    <div className="rounded-md border-[3px] border-dashed border-neo-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles className="w-4 h-4 text-brand-light" />
        <span className="text-sm font-bold text-white">No {label}s yet — draft one with AI</span>
      </div>
      <p className="text-[11px] text-muted mb-2 leading-snug">
        Describe the {label} in your own words (dates, tools, what you shipped). I'll turn it into ATS-ready bullets. Never invents details.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        disabled={loading}
        placeholder={placeholder}
        className="neo-input px-2.5 py-2 text-sm resize-none"
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        <button
          type="button"
          onClick={onManual}
          className="text-xs text-muted hover:text-white transition-colors"
        >
          or add manually →
        </button>
        <button
          type="button"
          disabled={!text.trim() || loading}
          onClick={() => onDraft(text)}
          className="neo-btn neo-btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {loading ? 'Drafting…' : 'Draft with AI'}
        </button>
      </div>
    </div>
  );
}

/**
 * Surfaces employment gaps detected between consecutive roles and offers a
 * one-click "Insert leave entry" with a preset label chosen from a dropdown.
 * The panel disappears automatically once every gap is accounted for because
 * `detectGaps` skips rows where `gap_reason` is set.
 *
 * Guidance is from the "Next Job Now — resume gap" episode: a clearly labeled
 * leave reframes silence; it's up to the candidate to own the period
 * instead of leaving recruiters to guess the worst.
 */
function GapAnalysisPanel({
  gaps, experience, onInsert,
}: {
  gaps: import('../lib/gapAnalysis').DetectedGap[];
  experience: CVExperience[];
  onInsert: (reason: CVGapReason, from: Date, to: Date) => void;
}) {
  // One chosen preset per gap (keyed by the pair of flanking role indexes)
  // so the user's dropdown selection survives between re-renders as they
  // edit adjacent fields.
  const [presets, setPresets] = useState<Record<string, CVGapReason>>({});
  const keyFor = (g: import('../lib/gapAnalysis').DetectedGap) => `${g.afterIndex}-${g.from.getTime()}-${g.to.getTime()}`;
  const rolesRef = experience; // just a readability alias
  return (
    <div className="rounded-md border-2 border-amber-500/50 bg-amber-500/10 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-300" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-amber-200">
          {gaps.length} employment gap{gaps.length === 1 ? '' : 's'} detected
        </span>
      </div>
      <p className="text-[11px] text-amber-100/80 leading-snug">
        Label each gap so recruiters see the period is accounted for. A specific leave
        reads far better than a silent date hole — they can't politely ask about it anyway.
      </p>
      <div className="space-y-2">
        {gaps.map(g => {
          const key = keyFor(g);
          const chosen = presets[key] ?? 'family_care';
          const older = rolesRef[g.afterIndex + 0]; // newer role (what comes after the gap)
          const bridge = older?.role || 'next role';
          return (
            <div key={key} className="rounded-sm bg-surface/60 border border-neo-border/60 p-2">
              <div className="text-[11px] text-white mb-1.5">
                <strong>{formatMonths(g.months)}</strong>{' '}
                <span className="text-muted">before</span>{' '}
                <em className="text-amber-200">{bridge}</em>{' '}
                <span className="text-muted">({formatMonthYear(g.from)} → {formatMonthYear(g.to)})</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={chosen}
                  onChange={e => setPresets(p => ({ ...p, [key]: e.target.value as CVGapReason }))}
                  className="neo-input px-2 py-1 text-xs"
                >
                  {GAP_PRESETS.map(p => (
                    <option key={p.reason} value={p.reason}>{p.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onInsert(chosen, g.from, g.to)}
                  className="neo-btn neo-btn-ghost px-3 py-1 text-[11px] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> Insert leave entry
                </button>
                <span className="text-[10px] text-subtle">
                  {GAP_PRESETS.find(p => p.reason === chosen)?.hint}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal pill rail that sits at the top of the editor column. Each pill
 * jumps to the matching section and shows a status dot: emerald (filled),
 * amber (partial), rose (empty). Sticky within the scrollable editor panel.
 */
function SectionNav({ items }: { items: { id: string; label: string; state: 'empty' | 'partial' | 'full' }[] }) {
  const dotColor = (s: 'empty' | 'partial' | 'full') =>
    s === 'full' ? 'bg-brand' : s === 'partial' ? 'bg-accent' : 'bg-red-400/60';
  return (
    <div className="sticky top-0 z-20 -mx-0.5 px-0.5 py-2 bg-surface/95 border-b border-neo-border mb-1">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            onClick={() => {
              const el = document.getElementById(it.id);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            title={`Jump to ${it.label}`}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-surface border-2 border-neo-border text-muted hover:text-white hover:border-brand transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor(it.state)}`} />
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Skills chip editor ───────────────────────────────────────────────────
// Per-category palette. Keeps the chip list scannable at a glance and gives
// each group a cheap visual identity without a heavy legend. Falls back to
// `Other` for any category string we don't recognise (e.g. user imports from
// LinkedIn with a custom category).
const SKILL_CATEGORY_STYLES: Record<string, { dot: string; border: string; bg: string; text: string }> = {
  'Technical':   { dot: 'bg-brand',        border: 'border-brand/40',        bg: 'bg-brand/10',        text: 'text-brand-light' },
  'Frameworks':  { dot: 'bg-blue-400',     border: 'border-blue-400/40',     bg: 'bg-blue-400/10',     text: 'text-blue-300' },
  'Languages':   { dot: 'bg-purple-400',   border: 'border-purple-400/40',   bg: 'bg-purple-400/10',   text: 'text-purple-300' },
  'Databases':   { dot: 'bg-orange-400',   border: 'border-orange-400/40',   bg: 'bg-orange-400/10',   text: 'text-orange-300' },
  'Cloud':       { dot: 'bg-cyan-400',     border: 'border-cyan-400/40',     bg: 'bg-cyan-400/10',     text: 'text-cyan-300' },
  'Tools':       { dot: 'bg-amber-400',    border: 'border-amber-400/40',    bg: 'bg-amber-400/10',    text: 'text-amber-300' },
  'Soft Skills': { dot: 'bg-pink-400',     border: 'border-pink-400/40',     bg: 'bg-pink-400/10',     text: 'text-pink-300' },
  'Other':       { dot: 'bg-slate-400',    border: 'border-slate-400/40',    bg: 'bg-slate-400/10',    text: 'text-slate-300' },
};
const styleFor = (cat: string) => SKILL_CATEGORY_STYLES[cat] ?? SKILL_CATEGORY_STYLES.Other;

const PROFICIENCY_FILL: Record<CVSkill['proficiency'], number> = {
  beginner: 1, intermediate: 2, advanced: 3, expert: 4,
};

/**
 * Track an anchor element's screen-space rect so we can position a popover
 * via `position: fixed` outside the chip's stacking context and overflow
 * parents. Updates on scroll (capture phase — catches inner scrollers too)
 * and resize. The popover is then portaled to `document.body`, which is what
 * finally lets it escape the editor column's `md:overflow-y-auto`.
 */
function usePopoverAnchor(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  popoverWidth: number,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Clamp so a chip near the right edge keeps its popover on-screen.
      const maxLeft = window.innerWidth - popoverWidth - 12;
      const left = Math.max(8, Math.min(r.left, maxLeft));
      setPos({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, popoverWidth]);
  return pos;
}

function ProficiencyDots({ level, dotClass }: { level: CVSkill['proficiency']; dotClass: string }) {
  const filled = PROFICIENCY_FILL[level];
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${level} proficiency`}>
      {[1, 2, 3, 4].map(i => (
        <span key={i} className={`w-1 h-1 rounded-full ${i <= filled ? dotClass : 'bg-neo-border'}`} />
      ))}
    </span>
  );
}

/**
 * A single skill rendered as a coloured pill. Click to open an inline popover
 * with name/category/level/years. Empty-name chips auto-open and auto-delete
 * on close, so "Add Skill" without typing is a no-op rather than a ghost row.
 */
function SkillChip({
  skill, onChange, onDelete, autoOpen = false,
}: {
  skill: CVSkill;
  onChange: (patch: Partial<CVSkill>) => void;
  onDelete: () => void;
  autoOpen?: boolean;
}) {
  const [editing, setEditing] = useState(autoOpen || !skill.name);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverAnchor(editing, anchorRef, 256);
  const styles = styleFor(skill.category);

  // Close popover, dropping empty-name chips so we don't leave dead rows.
  const close = () => {
    if (!skill.name.trim()) { onDelete(); return; }
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, skill.name]);

  const popover = editing && pos && createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
      className="w-64 rounded-md border-2 border-neo-border bg-surface shadow-xl p-2.5 space-y-2"
    >
      <input
        autoFocus
        type="text"
        value={skill.name}
        onChange={e => onChange({ name: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); close(); } }}
        placeholder="Skill name"
        className="w-full neo-input px-2.5 py-1.5 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Category</span>
          <select
            value={skill.category}
            onChange={e => onChange({ category: e.target.value })}
            className="neo-input px-2 py-1 text-xs"
          >
            {SKILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Level</span>
          <select
            value={skill.proficiency}
            onChange={e => onChange({ proficiency: e.target.value as CVSkill['proficiency'] })}
            className="neo-input px-2 py-1 text-xs"
          >
            {PROFICIENCY_LEVELS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Years (optional)</span>
        <input
          type="number"
          min={0}
          max={50}
          value={skill.years ?? ''}
          onChange={e => onChange({ years: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="e.g. 3"
          className="neo-input px-2 py-1 text-xs"
        />
      </label>
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onDelete} className="text-[11px] text-red-400 hover:text-red-300 inline-flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
        <button type="button" onClick={close} className="text-[11px] text-muted hover:text-white">
          Done
        </button>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setEditing(v => !v)}
        className={`group inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full border-2 text-xs font-medium transition ${styles.border} ${styles.bg} ${styles.text} hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <span className="truncate max-w-[10rem]">{skill.name || 'New skill'}</span>
        <ProficiencyDots level={skill.proficiency} dotClass={styles.dot} />
      </button>
      {popover}
    </>
  );
}

/**
 * Skills section rendered as category-grouped chip clusters with a bulk-paste
 * entry at the top ("React, Python, Docker" → 3 chips). Replaces the stacked
 * card-per-skill CRUD layout. Category for newly-added chips defaults to
 * Technical; users can retag from the chip popover.
 */
function SkillsEditor({
  skills, setSkills,
}: {
  skills: CVSkill[];
  setSkills: React.Dispatch<React.SetStateAction<CVSkill[]>>;
}) {
  const [bulkInput, setBulkInput] = useState('');
  // `autoOpenId` triggers the popover to open for the most recently added
  // chip — either a manually-added blank or the last of a bulk paste.
  const [autoOpenId, setAutoOpenId] = useState<number | null>(null);

  const updateAt = (i: number, patch: Partial<CVSkill>) =>
    setSkills(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const removeAt = (i: number) =>
    setSkills(prev => prev.filter((_, j) => j !== i));

  const addOne = () => {
    setSkills(prev => {
      const next = [...prev, { id: '', profile_id: '', name: '', category: 'Technical', proficiency: 'intermediate' as const, years: null, sort_order: prev.length }];
      setAutoOpenId(next.length - 1);
      return next;
    });
  };

  const addMany = (names: string[]) => {
    const unique = names.map(n => n.trim()).filter(Boolean);
    if (unique.length === 0) return;
    setSkills(prev => [
      ...prev,
      ...unique.map((name, idx) => ({
        id: '', profile_id: '', name,
        category: 'Technical',
        proficiency: 'intermediate' as const,
        years: null,
        sort_order: prev.length + idx,
      })),
    ]);
  };

  const commitBulk = () => {
    const names = bulkInput.split(/[,\n]+/);
    addMany(names);
    setBulkInput('');
  };

  // Attach original index so chip handlers update the right row after
  // grouping has reshuffled visual order.
  const indexed = skills.map((skill, index) => ({ skill, index }));
  const known = SKILL_CATEGORIES as readonly string[];
  const grouped: { cat: string; items: { skill: CVSkill; index: number }[] }[] = [];
  for (const cat of SKILL_CATEGORIES) {
    const items = indexed.filter(x => x.skill.category === cat);
    if (items.length) grouped.push({ cat, items });
  }
  // Preserve skills whose category isn't in the preset list (legacy rows,
  // user-imported tags, etc.) rather than silently hiding them.
  const leftover = indexed.filter(x => !known.includes(x.skill.category));
  if (leftover.length) grouped.push({ cat: 'Other', items: leftover });

  return (
    <div className="space-y-3">
      {/* Bulk paste + add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={bulkInput}
          onChange={e => setBulkInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && bulkInput.trim()) { e.preventDefault(); commitBulk(); } }}
          placeholder="Paste a list: React, Python, Docker, Kubernetes…"
          className="flex-1 min-w-0 neo-input px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => { if (bulkInput.trim()) commitBulk(); else addOne(); }}
          className="shrink-0 neo-btn neo-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5"
          title={bulkInput.trim() ? 'Add pasted skills' : 'Add a single skill'}
        >
          <Plus className="w-4 h-4" /> {bulkInput.trim() ? 'Add all' : 'Add'}
        </button>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-neo-border/70 p-4 text-center text-xs text-muted">
          No skills yet — paste a comma-separated list above, or click <strong className="text-white">Add</strong> for a blank chip.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ cat, items }) => {
            const styles = styleFor(cat);
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{cat}</span>
                  <span className="text-[10px] text-subtle">{items.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(({ skill, index }) => (
                    <SkillChip
                      key={index}
                      skill={skill}
                      autoOpen={autoOpenId === index}
                      onChange={patch => updateAt(index, patch)}
                      onDelete={() => {
                        removeAt(index);
                        if (autoOpenId === index) setAutoOpenId(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Language chip editor ─────────────────────────────────────────────────
// Per-level palette: native carries the full brand accent (strongest signal),
// stepping down through blue/teal/amber to slate for basic. Visual weight
// follows self-reported proficiency so recruiters scan the list at a glance.
const LANGUAGE_LEVEL_STYLES: Record<CVLanguage['proficiency'], { dot: string; border: string; bg: string; text: string; label: string }> = {
  native:       { dot: 'bg-brand',       border: 'border-brand/40',       bg: 'bg-brand/10',       text: 'text-brand-light', label: 'Native' },
  fluent:       { dot: 'bg-teal-400',    border: 'border-teal-400/40',    bg: 'bg-teal-400/10',    text: 'text-teal-300',    label: 'Fluent' },
  professional: { dot: 'bg-blue-400',    border: 'border-blue-400/40',    bg: 'bg-blue-400/10',    text: 'text-blue-300',    label: 'Professional' },
  intermediate: { dot: 'bg-amber-400',   border: 'border-amber-400/40',   bg: 'bg-amber-400/10',   text: 'text-amber-300',   label: 'Intermediate' },
  basic:        { dot: 'bg-slate-400',   border: 'border-slate-400/40',   bg: 'bg-slate-400/10',   text: 'text-slate-300',   label: 'Basic' },
};

const LANGUAGE_FILL: Record<CVLanguage['proficiency'], number> = {
  basic: 1, intermediate: 2, professional: 3, fluent: 4, native: 5,
};

function LanguageDots({ level, dotClass }: { level: CVLanguage['proficiency']; dotClass: string }) {
  const filled = LANGUAGE_FILL[level];
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${level} proficiency`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`w-1 h-1 rounded-full ${i <= filled ? dotClass : 'bg-neo-border'}`} />
      ))}
    </span>
  );
}

function LanguageChip({
  lang, onChange, onDelete, autoOpen = false,
}: {
  lang: CVLanguage;
  onChange: (patch: Partial<CVLanguage>) => void;
  onDelete: () => void;
  autoOpen?: boolean;
}) {
  const [editing, setEditing] = useState(autoOpen || !lang.language);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverAnchor(editing, anchorRef, 256);
  const styles = LANGUAGE_LEVEL_STYLES[lang.proficiency];

  const close = () => {
    if (!lang.language.trim()) { onDelete(); return; }
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, lang.language]);

  const popover = editing && pos && createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
      className="w-64 rounded-md border-2 border-neo-border bg-surface shadow-xl p-2.5 space-y-2"
    >
      <input
        autoFocus
        type="text"
        value={lang.language}
        onChange={e => onChange({ language: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); close(); } }}
        placeholder="Language (e.g. Spanish)"
        className="w-full neo-input px-2.5 py-1.5 text-sm"
      />
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Proficiency</span>
        <select
          value={lang.proficiency}
          onChange={e => onChange({ proficiency: e.target.value as CVLanguage['proficiency'] })}
          className="neo-input px-2 py-1 text-xs"
        >
          {LANGUAGE_LEVELS.map(l => (
            <option key={l} value={l}>{LANGUAGE_LEVEL_STYLES[l].label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onDelete} className="text-[11px] text-red-400 hover:text-red-300 inline-flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
        <button type="button" onClick={close} className="text-[11px] text-muted hover:text-white">Done</button>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setEditing(v => !v)}
        className={`group inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full border-2 text-xs font-medium transition ${styles.border} ${styles.bg} ${styles.text} hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <span className="truncate max-w-[10rem]">{lang.language || 'New language'}</span>
        <LanguageDots level={lang.proficiency} dotClass={styles.dot} />
      </button>
      {popover}
    </>
  );
}

function LanguagesEditor({
  languages, setLanguages,
}: {
  languages: CVLanguage[];
  setLanguages: React.Dispatch<React.SetStateAction<CVLanguage[]>>;
}) {
  const [bulkInput, setBulkInput] = useState('');
  const [autoOpenId, setAutoOpenId] = useState<number | null>(null);

  const updateAt = (i: number, patch: Partial<CVLanguage>) =>
    setLanguages(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeAt = (i: number) =>
    setLanguages(prev => prev.filter((_, j) => j !== i));

  const addOne = () => {
    setLanguages(prev => {
      const next = [...prev, { id: '', profile_id: '', language: '', proficiency: 'professional' as const, sort_order: prev.length }];
      setAutoOpenId(next.length - 1);
      return next;
    });
  };
  const commitBulk = () => {
    const names = bulkInput.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    if (!names.length) return;
    setLanguages(prev => [
      ...prev,
      ...names.map((language, idx) => ({
        id: '', profile_id: '', language,
        proficiency: 'professional' as const,
        sort_order: prev.length + idx,
      })),
    ]);
    setBulkInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={bulkInput}
          onChange={e => setBulkInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && bulkInput.trim()) { e.preventDefault(); commitBulk(); } }}
          placeholder="Paste a list: English, Spanish, French…"
          className="flex-1 min-w-0 neo-input px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => { if (bulkInput.trim()) commitBulk(); else addOne(); }}
          className="shrink-0 neo-btn neo-btn-ghost px-3 py-2 text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {bulkInput.trim() ? 'Add all' : 'Add'}
        </button>
      </div>

      {languages.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-neo-border/70 p-4 text-center text-xs text-muted">
          No languages yet — paste a list above, or click <strong className="text-white">Add</strong>.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {languages.map((lang, index) => (
            <LanguageChip
              key={index}
              lang={lang}
              autoOpen={autoOpenId === index}
              onChange={patch => updateAt(index, patch)}
              onDelete={() => {
                removeAt(index);
                if (autoOpenId === index) setAutoOpenId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Certification chip editor ────────────────────────────────────────────
// Common issuers get their own accent so a list of mixed certs reads like a
// legend ("AWS orange, Google blue, Microsoft cyan…"). Case-insensitive
// substring match — falls back to a neutral teal for anything unrecognised.
const ISSUER_STYLES: { match: RegExp; dot: string; border: string; bg: string; text: string }[] = [
  { match: /\b(aws|amazon)\b/i,        dot: 'bg-orange-400', border: 'border-orange-400/40', bg: 'bg-orange-400/10', text: 'text-orange-300' },
  { match: /\bgoogle\b/i,              dot: 'bg-blue-400',   border: 'border-blue-400/40',   bg: 'bg-blue-400/10',   text: 'text-blue-300' },
  { match: /\b(microsoft|azure)\b/i,   dot: 'bg-cyan-400',   border: 'border-cyan-400/40',   bg: 'bg-cyan-400/10',   text: 'text-cyan-300' },
  { match: /\b(meta|facebook)\b/i,     dot: 'bg-indigo-400', border: 'border-indigo-400/40', bg: 'bg-indigo-400/10', text: 'text-indigo-300' },
  { match: /\boracle\b/i,              dot: 'bg-red-400',    border: 'border-red-400/40',    bg: 'bg-red-400/10',    text: 'text-red-300' },
  { match: /\b(cisco|hashicorp)\b/i,   dot: 'bg-purple-400', border: 'border-purple-400/40', bg: 'bg-purple-400/10', text: 'text-purple-300' },
  { match: /\b(kubernetes|cncf)\b/i,   dot: 'bg-sky-400',    border: 'border-sky-400/40',    bg: 'bg-sky-400/10',    text: 'text-sky-300' },
];
const CERT_DEFAULT_STYLE = { dot: 'bg-teal-400', border: 'border-teal-400/40', bg: 'bg-teal-400/10', text: 'text-teal-300' };
const styleForCert = (cert: CVCertification) => {
  const haystack = `${cert.issuer || ''} ${cert.name || ''}`.toLowerCase();
  return ISSUER_STYLES.find(s => s.match.test(haystack)) ?? CERT_DEFAULT_STYLE;
};

function CertificationChip({
  cert, onChange, onDelete, autoOpen = false,
}: {
  cert: CVCertification;
  onChange: (patch: Partial<CVCertification>) => void;
  onDelete: () => void;
  autoOpen?: boolean;
}) {
  const [editing, setEditing] = useState(autoOpen || !cert.name);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pos = usePopoverAnchor(editing, anchorRef, 288);
  const styles = styleForCert(cert);

  const close = () => {
    if (!cert.name.trim()) { onDelete(); return; }
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, cert.name]);

  // Pull the year out of any ISO-ish / free-text date so the chip stays tight.
  const yearMatch = (cert.date_obtained || '').match(/\d{4}/);

  const popover = editing && pos && createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
      className="w-72 rounded-md border-2 border-neo-border bg-surface shadow-xl p-2.5 space-y-2"
    >
      <input
        autoFocus
        type="text"
        value={cert.name}
        onChange={e => onChange({ name: e.target.value })}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); close(); } }}
        placeholder="Certification name"
        className="w-full neo-input px-2.5 py-1.5 text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Issuer</span>
          <input type="text" value={cert.issuer || ''} onChange={e => onChange({ issuer: e.target.value })} placeholder="AWS, Google…" className="neo-input px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Date obtained</span>
          <input type="text" value={cert.date_obtained || ''} onChange={e => onChange({ date_obtained: e.target.value })} placeholder="2024-03" className="neo-input px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Expires</span>
          <input type="text" value={cert.expiry_date || ''} onChange={e => onChange({ expiry_date: e.target.value })} placeholder="Optional" className="neo-input px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Credential ID</span>
          <input type="text" value={cert.credential_id || ''} onChange={e => onChange({ credential_id: e.target.value })} placeholder="Optional" className="neo-input px-2 py-1 text-xs" />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Verify URL</span>
        <input type="url" value={cert.url || ''} onChange={e => onChange({ url: e.target.value })} placeholder="https://…" className="neo-input px-2 py-1 text-xs" />
      </label>
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onDelete} className="text-[11px] text-red-400 hover:text-red-300 inline-flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Delete
        </button>
        <button type="button" onClick={close} className="text-[11px] text-muted hover:text-white">Done</button>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setEditing(v => !v)}
        className={`group inline-flex items-center gap-2 pl-2.5 pr-2.5 py-1 rounded-full border-2 text-xs font-medium transition ${styles.border} ${styles.bg} ${styles.text} hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
        <span className="truncate max-w-[14rem]">{cert.name || 'New certification'}</span>
        {cert.issuer && <span className="opacity-70 truncate max-w-[6rem]">· {cert.issuer}</span>}
        {yearMatch && <span className="opacity-70">· {yearMatch[0]}</span>}
      </button>
      {popover}
    </>
  );
}

function CertificationsEditor({
  certifications, setCertifications,
}: {
  certifications: CVCertification[];
  setCertifications: React.Dispatch<React.SetStateAction<CVCertification[]>>;
}) {
  const [autoOpenId, setAutoOpenId] = useState<number | null>(null);

  const updateAt = (i: number, patch: Partial<CVCertification>) =>
    setCertifications(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeAt = (i: number) =>
    setCertifications(prev => prev.filter((_, j) => j !== i));
  const addOne = () => {
    setCertifications(prev => {
      const next = [...prev, { id: '', profile_id: '', name: '', issuer: '', date_obtained: '', expiry_date: '', credential_id: '', url: '', sort_order: prev.length }];
      setAutoOpenId(next.length - 1);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={addOne}
          className="neo-btn neo-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add certification
        </button>
      </div>
      {certifications.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-neo-border/70 p-4 text-center text-xs text-muted">
          No certifications yet — click <strong className="text-white">Add certification</strong> to log one.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {certifications.map((cert, index) => (
            <CertificationChip
              key={index}
              cert={cert}
              autoOpen={autoOpenId === index}
              onChange={patch => updateAt(index, patch)}
              onDelete={() => {
                removeAt(index);
                if (autoOpenId === index) setAutoOpenId(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CVEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings, credits, hasCredits, costOf, refreshCredits } = useApp();
  const { toast } = useToast();
  const cv = useCV();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [template, setTemplate] = useState<TemplateName>('modern');
  const [scoring, setScoring] = useState(false);
  const [suggestions, setSuggestions] = useState<CVSuggestion[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [atsAnalysis, setAtsAnalysis] = useState<ATSGapAnalysis | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsJobText, setAtsJobText] = useState('');
  const [drafting, setDrafting] = useState<'experience' | 'project' | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('edit');

  // Accordion: only one Section is expanded at a time so the editor feels
  // like a focused single-step flow instead of a wall of fields. `null` means
  // every section is collapsed. The helper below is spread into each Section
  // so we don't duplicate the `open`/`onToggle` wiring seven times.
  const [activeSection, setActiveSection] = useState<string | null>('sec-personal');
  const sectionProps = (sectionId: string) => ({
    open: activeSection === sectionId,
    onToggle: () => setActiveSection(prev => (prev === sectionId ? null : sectionId)),
  });

  // ── Cover Letter feature ──────────────────────────────────────────────────
  const [coverLetterCompany, setCoverLetterCompany] = useState('');
  const [coverLetterPosition, setCoverLetterPosition] = useState('');
  const [coverLetterText, setCoverLetterText] = useState<string | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);

  // ── Interview Prep feature ────────────────────────────────────────────────
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[] | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  /** Per-section sets of which entry indices are currently expanded. New entries
   *  auto-expand; existing entries start collapsed so the editor stays scannable. */
  const [openExp, setOpenExp] = useState<Set<number>>(new Set());
  const [openEdu, setOpenEdu] = useState<Set<number>>(new Set());
  const [openProj, setOpenProj] = useState<Set<number>>(new Set());

  // Profile form
  const [profile, setProfile] = useState<Partial<CVProfile>>(DEFAULT_PROFILE);

  // ── Autosave / dirty tracking ─────────────────────────────────────────────
  // `lastSavedSigRef` holds the JSON signature of the state that currently
  // matches DB. We compare it to a live `currentSig` memo to decide whether
  // the editor is dirty. `lastSavedAt` drives the "Saved · Xs ago" chip, and
  // `saveError` surfaces a red "Save failed" state when autosave errors out.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedSigRef = useRef<string | null>(null);
  const performSaveRef = useRef<(isAutosave: boolean) => Promise<void>>(async () => {});
  // `tick` exists solely to rerender the status chip so the relative
  // "Saved · Xs ago" label stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(i);
  }, []);

  // Sections
  const [experience, setExperience] = useState<CVExperience[]>([]);
  const [education, setEducation] = useState<CVEducation[]>([]);
  const [skills, setSkills] = useState<CVSkill[]>([]);
  const [certifications, setCertifications] = useState<CVCertification[]>([]);
  const [projects, setProjects] = useState<CVProject[]>([]);
  const [languages, setLanguages] = useState<CVLanguage[]>([]);

  // Serialised snapshot of everything that gets persisted to the DB. Used as
  // the source-of-truth for dirty detection vs. `lastSavedSigRef` and as the
  // dependency for the autosave debounce.
  const currentSig = useMemo(() => JSON.stringify({
    profile, experience, education, skills, certifications, projects, languages,
  }), [profile, experience, education, skills, certifications, projects, languages]);

  const isNewCV = !id || id === 'new';
  // Before the initial load sets the baseline we treat the editor as clean;
  // otherwise the first render would flash "Unsaved" before we've even fetched.
  const isDirty = lastSavedSigRef.current !== null && currentSig !== lastSavedSigRef.current;

  // Per-destination project filters. Undefined flags (legacy rows loaded
  // before the 00011 migration deployed) are treated as "visible" so the
  // feature is backwards-compatible on first load.
  const cvProjects        = useMemo(() => projects.filter(p => p.show_on_cv        !== false), [projects]);
  const portfolioProjects = useMemo(() => projects.filter(p => p.show_on_portfolio !== false), [projects]);

  // Employment-gap analysis. Both memos watch the whole experience array so
  // editing dates or inserting a leave entry re-runs detection immediately.
  const detectedGaps = useMemo(() => detectGaps(experience), [experience]);
  const layoffFlagged = useMemo(() => detectShortTenurePattern(experience), [experience]);

  // Rendering-only projection of `experience` that pre-appends the polite
  // layoff note to the role line when `departure_reason === 'layoff'`. Fed
  // to every renderer (PDF / preview / JSON / plain-text) so each one stays
  // a straight pass-through — no template ever has to know about the flag.
  // AI calls keep the raw `experience` array: the note is a presentation
  // concern, not signal the model should reason over.
  const renderedExperience = useMemo(
    () => experience.map(e => {
      const note = layoffNote(e);
      return note ? { ...e, role: `${e.role}${note}` } : e;
    }),
    [experience],
  );

  // CV completeness: weighted checklist of the fields that matter for a strong
  // CV. The % doubles as a gentle motivator and as a diagnostic the user can
  // scan at a glance (which sections still need attention).
  const completeness = useMemo(() => {
    const checks: { ok: boolean; weight: number; label: string }[] = [
      { ok: !!profile.full_name?.trim(),                           weight: 10, label: 'Full name' },
      { ok: !!profile.email?.trim(),                               weight: 10, label: 'Email' },
      { ok: !!profile.job_title?.trim(),                           weight: 5,  label: 'Job title' },
      { ok: !!profile.phone?.trim(),                               weight: 5,  label: 'Phone' },
      { ok: !!profile.location?.trim(),                            weight: 5,  label: 'Location' },
      { ok: !!(profile.linkedin || profile.github || profile.website), weight: 5, label: 'Online link' },
      { ok: (profile.summary || '').trim().length >= 100,          weight: 15, label: 'Summary (100+ chars)' },
      { ok: !!profile.target_role?.trim(),                         weight: 5,  label: 'Target role' },
      { ok: experience.length >= 1,                                weight: 20, label: 'At least 1 role' },
      { ok: education.length >= 1,                                 weight: 10, label: 'Education entry' },
      { ok: skills.length >= 5,                                    weight: 10, label: '5+ skills' },
    ];
    const total = checks.reduce((acc, c) => acc + c.weight, 0);
    const earned = checks.reduce((acc, c) => acc + (c.ok ? c.weight : 0), 0);
    return {
      pct: Math.round((earned / total) * 100),
      missing: checks.filter((c) => !c.ok).map((c) => c.label),
    };
  }, [profile, experience, education, skills]);

  useEffect(() => {
    const load = async () => {
      if (!id || id === 'new') {
        // New CV: baseline is the empty default so the first keystroke flips
        // the editor to "Unsaved". Autosave stays off until the user clicks
        // Save (which spends a credit).
        lastSavedSigRef.current = JSON.stringify({
          profile: DEFAULT_PROFILE, experience: [], education: [], skills: [],
          certifications: [], projects: [], languages: [],
        });
        setLoading(false);
        return;
      }
      const { data: p } = await supabase.from('cv_profiles').select('*').eq('id', id).single();
      if (p) {
        const [exp, edu, sk, cert, proj, lang] = await Promise.all([
          cv.fetchExperience(id), cv.fetchEducation(id), cv.fetchSkills(id),
          cv.fetchCertifications(id), cv.fetchProjects(id), cv.fetchLanguages(id),
        ]);
        setProfile(p);
        setExperience(exp); setEducation(edu); setSkills(sk);
        setCertifications(cert); setProjects(proj); setLanguages(lang);
        // Signature is computed from the just-fetched values (not from state,
        // which won't have flushed yet on this tick).
        lastSavedSigRef.current = JSON.stringify({
          profile: p, experience: exp, education: edu, skills: sk,
          certifications: cert, projects: proj, languages: lang,
        });
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // Pick up a pending tailor job from the Discover page: pre-fill the Tailor
  // tab's JD box + switch to that tab so the user lands ready to analyse.
  // Runs once per mount; the storage key is cleared after consumption.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pendingTailor');
      if (!raw) return;
      const pending = JSON.parse(raw) as { title?: string; company?: string; url?: string; description?: string };
      const text = [
        pending.title && pending.company ? `${pending.title} at ${pending.company}` : '',
        pending.url || '',
        '',
        pending.description || '',
      ].filter(Boolean).join('\n').trim();
      if (text) {
        setAtsJobText(text);
        setActiveTab('tailor');
      }
      sessionStorage.removeItem('pendingTailor');
    } catch { /* ignore malformed storage */ }
  }, []);

  /**
   * Persist the full CV (profile + all sections) to Supabase.
   *
   * - Manual save (isAutosave=false): charges a credit on new-CV creation,
   *   toasts errors, and navigates to the canonical /cv/:id URL afterwards.
   * - Autosave (isAutosave=true): skipped entirely for new CVs so we never
   *   silently charge a credit. Errors surface through the save-status chip
   *   rather than a toast.
   *
   * On success we update `lastSavedSigRef` to the signature captured at save
   * *start* — so edits the user made during the round-trip stay marked dirty
   * and trigger another autosave.
   */
  const performSave = async (isAutosave: boolean) => {
    if (!profile.full_name?.trim()) return;
    if (saving) return;
    const isNew = !id || id === 'new';
    if (isNew && isAutosave) return; // never autosave a new CV — would charge a credit
    if (isNew && !hasCredits('create_cv')) {
      toast(`Creating a CV costs ${costOf('create_cv')} credit — top up to continue.`, 'error');
      return;
    }

    const sigAtStart = currentSig;
    setSaving(true);
    setSaveError(null);

    const { data: saved, error: saveErr } = await cv.saveProfile(isNew ? profile : { ...profile, id });
    if (saveErr || !saved) {
      setSaving(false);
      setSaveError(saveErr || 'Save failed');
      if (!isAutosave) {
        if (saveErr?.toLowerCase().includes('insufficient_credits')) {
          toast('Not enough credits to create a new CV.', 'error');
        } else if (saveErr) {
          toast(saveErr, 'error');
        }
      }
      return;
    }
    if (isNew) refreshCredits();
    const pid = saved.id;

    // Delete removed sections: compare DB state with current local state
    if (id && id !== 'new') {
      const [dbExp, dbEdu, dbSk, dbCert, dbProj, dbLang] = await Promise.all([
        cv.fetchExperience(pid), cv.fetchEducation(pid), cv.fetchSkills(pid),
        cv.fetchCertifications(pid), cv.fetchProjects(pid), cv.fetchLanguages(pid),
      ]);
      const localIds = (items: { id: string }[]) => new Set(items.filter(i => i.id).map(i => i.id));
      const expIds = localIds(experience);
      const eduIds = localIds(education);
      const skIds = localIds(skills);
      const certIds = localIds(certifications);
      const projIds = localIds(projects);
      const langIds = localIds(languages);

      await Promise.all([
        ...dbExp.filter(e => !expIds.has(e.id)).map(e => cv.deleteExperience(e.id)),
        ...dbEdu.filter(e => !eduIds.has(e.id)).map(e => cv.deleteEducation(e.id)),
        ...dbSk.filter(e => !skIds.has(e.id)).map(e => cv.deleteSkill(e.id)),
        ...dbCert.filter(e => !certIds.has(e.id)).map(e => cv.deleteCertification(e.id)),
        ...dbProj.filter(e => !projIds.has(e.id)).map(e => cv.deleteProject(e.id)),
        ...dbLang.filter(e => !langIds.has(e.id)).map(e => cv.deleteLanguage(e.id)),
      ]);
    }

    // Save all current sections
    for (const exp of experience) await cv.saveExperience(exp, pid);
    for (const edu of education) await cv.saveEducation(edu, pid);
    for (const sk of skills) await cv.saveSkill(sk, pid);
    for (const cert of certifications) await cv.saveCertification(cert, pid);
    for (const proj of projects) await cv.saveProject(proj, pid);
    for (const lang of languages) await cv.saveLanguage(lang, pid);

    lastSavedSigRef.current = sigAtStart;
    setLastSavedAt(Date.now());
    setSaveError(null);
    setSaving(false);

    // Only redirect on the very first save of a new CV; autosaves on an
    // existing CV must not nuke scroll position or in-flight form focus.
    if (isNew && !isAutosave) navigate(`/cv/${pid}`);
  };

  // Keep a ref of the latest performSave so window-level listeners (Cmd+S,
  // debounce timer) always see the freshest closure without needing to
  // re-bind on every render.
  performSaveRef.current = performSave;

  const handleSave = () => performSave(false);

  // ── Autosave: debounced, fires only when dirty and not a new CV. ─────────
  useEffect(() => {
    if (isNewCV) return;
    if (loading) return;
    if (!isDirty) return;
    if (saving) return;
    if (!profile.full_name?.trim()) return;
    const timer = setTimeout(() => { performSaveRef.current(true); }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [currentSig, isDirty, saving, isNewCV, loading, profile.full_name]);

  // ── Cmd+S / Ctrl+S: manual save shortcut. ────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        performSaveRef.current(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── beforeunload: warn on tab close/reload while dirty or mid-save. ──────
  useEffect(() => {
    if (!isDirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, saving]);

  const handleAIError = (err: unknown, label: string) => {
    if (err instanceof InsufficientCreditsError) {
      toast(`${label} needs ${err.cost} credits. Top up to continue.`, 'error');
    } else {
      console.error(`${label} failed:`, err);
      toast(`${label} failed`, 'error');
    }
  };

  const handleATSScore = async () => {
    if (!settings || !profile.target_role) return;
    if (!hasCredits('ats_score')) {
      toast(`ATS score costs ${costOf('ats_score')} credits — buy more to run it.`, 'error');
      return;
    }
    setScoring(true);
    try {
      const result = await atsScore(profile as CVProfile, experience, education, skills, profile.target_role, settings);
      setProfile(p => ({ ...p, ats_score: result.score, keywords: result.missing_keywords }));
      refreshCredits();
    } catch (err) { handleAIError(err, 'ATS score'); }
    setScoring(false);
  };

  const handleOptimize = async () => {
    if (!settings) return;
    if (!hasCredits('ai_optimize')) {
      toast(`AI optimize costs ${costOf('ai_optimize')} credits — buy more to run it.`, 'error');
      return;
    }
    setOptimizing(true);
    try {
      const result = await optimizeCV(profile as CVProfile, experience, education, skills, settings, profile.target_role || undefined, certifications, projects, languages);
      setSuggestions(result);
      refreshCredits();
    } catch (err) { handleAIError(err, 'AI optimize'); }
    setOptimizing(false);
  };

  // Which bullet is currently being rewritten by AI (if any). Keyed on
  // (expIndex, bulletIndex) so only the specific BulletHealth row shows a
  // spinner; siblings stay interactive.
  const [fixingBullet, setFixingBullet] = useState<{ expIndex: number; bulletIndex: number } | null>(null);

  /**
   * Inline "Fix with AI" for a single achievement bullet inside a specific
   * Experience entry. Reuses `improveSection('achievements', …)` so the
   * rewrite follows the same ATS rules (power verb + metric + outcome, ≤150
   * chars) as the batch Optimize flow. One credit per fix.
   */
  const handleFixBullet = async (expIndex: number, bulletIndex: number, original: string) => {
    if (!settings) return;
    if (!hasCredits('ai_improve')) {
      toast(`Fixing with AI costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    const exp = experience[expIndex];
    if (!exp) return;
    setFixingBullet({ expIndex, bulletIndex });
    try {
      const context = `Role: ${exp.role || 'Unknown'} at ${exp.company || 'Unknown'}${profile.target_role ? `. Target role: ${profile.target_role}` : ''}${exp.technologies?.length ? `. Tech: ${exp.technologies.join(', ')}` : ''}. ${exp.is_current ? 'Current role (use present tense).' : 'Previous role (use past tense).'}`;
      const rewritten = await improveSection('achievements', original, context, settings);
      setExperience(prev => prev.map((e, i) => i !== expIndex ? e : {
        ...e,
        achievements: e.achievements.map((a, j) => j === bulletIndex ? rewritten : a),
      }));
      refreshCredits();
    } catch (err) {
      handleAIError(err, 'AI fix');
    } finally {
      setFixingBullet(null);
    }
  };

  /**
   * QualityChecks "Fix with AI" dispatcher. Each finding carries a `fix`
   * descriptor that tells us what to rewrite and where to put the result.
   * Only bullet + summary rewrites are wired — both reuse improveSection.
   */
  const handleFixFinding = async (finding: import('../components/QualityChecks').Finding) => {
    if (!settings || !finding.fix) return;
    if (!hasCredits('ai_improve')) {
      toast(`Fixing with AI costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    try {
      if (finding.fix.kind === 'rewrite-bullet') {
        const { expIndex, bulletIndex, original } = finding.fix;
        const exp = experience[expIndex];
        if (!exp) return;
        const context = `Role: ${exp.role || 'Unknown'} at ${exp.company || 'Unknown'}${profile.target_role ? `. Target role: ${profile.target_role}` : ''}${exp.technologies?.length ? `. Tech: ${exp.technologies.join(', ')}` : ''}. ${exp.is_current ? 'Current role (use present tense).' : 'Previous role (use past tense).'}`;
        const rewritten = await improveSection('achievements', original, context, settings);
        setExperience(prev => prev.map((e, i) => i !== expIndex ? e : {
          ...e,
          achievements: e.achievements.map((a, j) => j === bulletIndex ? rewritten : a),
        }));
        refreshCredits();
      } else if (finding.fix.kind === 'rewrite-summary') {
        const { original } = finding.fix;
        const context = `Career stage: ${profile.career_stage || 'unspecified'}. Industry: ${profile.industry || 'unspecified'}.${profile.target_role ? ` Target role: ${profile.target_role}.` : ''}${profile.job_title ? ` Current title: ${profile.job_title}.` : ''}`;
        const rewritten = await improveSection('summary', original, context, settings);
        setProfile(p => ({ ...p, summary: rewritten }));
        refreshCredits();
      }
    } catch (err) { handleAIError(err, 'AI fix'); }
  };

  const handleATSAnalysis = async () => {
    if (!settings || !atsJobText.trim()) return;
    if (!hasCredits('ats_score')) {
      toast(`ATS analysis costs ${costOf('ats_score')} credits — buy more to run it.`, 'error');
      return;
    }
    setAtsLoading(true);
    try {
      const result = await atsScore(profile as CVProfile, experience, education, skills, atsJobText, settings);
      setAtsAnalysis(result);
      setProfile(p => ({ ...p, ats_score: result.score }));
      refreshCredits();
    } catch (err) { handleAIError(err, 'ATS analysis'); }
    setAtsLoading(false);
  };

  // ── Cover Letter handler ──────────────────────────────────────────────────
  const handleGenerateCoverLetter = async () => {
    if (!settings || !atsJobText.trim()) {
      toast('Paste a job description first so I can tailor the letter.', 'error');
      return;
    }
    if (!hasCredits('ai_improve')) {
      toast(`Cover letter costs ${costOf('ai_improve')} credit — buy more to continue.`, 'error');
      return;
    }
    setCoverLetterLoading(true);
    setCoverLetterText(null);
    try {
      const letter = await generateCoverLetter(
        profile as CVProfile,
        experience,
        skills,
        atsJobText,
        coverLetterCompany.trim() || undefined,
        coverLetterPosition.trim() || undefined,
        settings,
      );
      setCoverLetterText(letter);
      refreshCredits();
    } catch (err) { handleAIError(err, 'Cover letter'); }
    setCoverLetterLoading(false);
  };

  // ── Interview Prep handler ────────────────────────────────────────────────
  const handleGenerateInterviewQuestions = async () => {
    if (!settings || !atsJobText.trim()) {
      toast('Paste a job description first so I can generate targeted questions.', 'error');
      return;
    }
    if (!hasCredits('ai_improve')) {
      toast(`Interview prep costs ${costOf('ai_improve')} credit — buy more to continue.`, 'error');
      return;
    }
    setInterviewLoading(true);
    setInterviewQuestions(null);
    try {
      const questions = await generateInterviewQuestions(
        profile as CVProfile,
        experience,
        skills,
        atsJobText,
        settings,
      );
      setInterviewQuestions(questions);
      refreshCredits();
    } catch (err) { handleAIError(err, 'Interview prep'); }
    setInterviewLoading(false);
  };

  const handleAcceptSuggestion = (s: CVSuggestion) => {
    if (s.type === 'summary' && s.suggested) {
      setProfile(p => ({ ...p, summary: s.suggested }));
    } else if (s.type === 'experience' && s.experience_id && s.suggested) {
      setExperience(prev => prev.map(exp => {
        if (exp.id !== s.experience_id) return exp;
        if (s.achievement_index != null) {
          const achievements = [...exp.achievements];
          achievements[s.achievement_index] = s.suggested!;
          return { ...exp, achievements };
        }
        return exp;
      }));
    } else if (s.type === 'skill' && s.action === 'add' && s.suggested) {
      setSkills(prev => [...prev, { id: '', profile_id: '', name: s.suggested!, category: 'Technical', proficiency: 'intermediate', years: null, sort_order: prev.length }]);
    } else if (s.type === 'skill' && s.action === 'remove' && s.current) {
      setSkills(prev => prev.filter(sk => sk.name.toLowerCase() !== s.current!.toLowerCase()));
    }
  };

  const handlePDF = async () => {
    if (!hasCredits('export_pdf')) {
      toast(`PDF export costs ${costOf('export_pdf')} credit — top up to continue.`, 'error');
      return;
    }
    // Deduct server-side first so the user can't bypass by closing the tab.
    const { error: chargeErr } = await supabase.rpc('consume_credits', {
      p_action: 'export_pdf',
      p_reference: id && id !== 'new' ? id : null,
      p_metadata: { template },
    });
    if (chargeErr) {
      if (chargeErr.message?.toLowerCase().includes('insufficient_credits')) {
        toast('Not enough credits to export.', 'error');
      } else {
        toast('Could not charge credits for export.', 'error');
      }
      return;
    }
    refreshCredits();

    // Every template uses the shared jsPDF ATS-safe generator — produces
    // selectable vector text (never rasterised), parseable by ATS systems.
    // `cvProjects` honours the per-project "Show on CV" toggle, and
    // `renderedExperience` has the layoff note pre-baked into role lines.
    const args = [profile as CVProfile, renderedExperience, education, skills, certifications, cvProjects, languages] as const;
    if (template === 'modern')            generateModernPDF(...args);
    else if (template === 'professional') generateProfessionalPDF(...args);
    else if (template === 'minimal')      generateMinimalPDF(...args);
    else if (template === 'executive')    generateExecutivePDF(...args);
    else if (template === 'corporate')    generateCorporatePDF(...args);
    else if (template === 'neo')          generateNeoPDF(...args);
    else if (template === 'neo-dark')     generateNeoDarkPDF(...args);
    else                                  generateClassicPDF(...args);

    if (id && id !== 'new') recordCVEvent(id, 'download', { template });
  };

  const addExperience = () => {
    setExperience(prev => [...prev, { id: '', profile_id: '', company: '', role: '', location: '', start_date: '', end_date: null, is_current: false, description: '', achievements: [], technologies: [], sort_order: prev.length, created_at: '' }]);
    setOpenExp(prev => new Set(prev).add(experience.length)); // open the new card
  };

  /**
   * Insert a gap entry with a preset leave label into the Experience list.
   * Pre-fills the dates from the detected gap so the user sees a finished
   * entry by default and can tweak wording/dates if they want. The leave
   * label goes into `role`, company stays empty, `gap_reason` flags the row
   * so the editor renders the simplified gap-row UI and existing PDF / live
   * preview templates render it as a plain single-line Experience entry.
   */
  const insertGapEntry = (reason: CVGapReason, from: Date, to: Date) => {
    const preset = GAP_PRESETS.find(p => p.reason === reason) ?? GAP_PRESETS[GAP_PRESETS.length - 1];
    const newRow: CVExperience = {
      id: '', profile_id: '',
      role: preset.label, company: '',
      location: null,
      start_date: formatMonthYear(from),
      end_date: formatMonthYear(to),
      is_current: false,
      description: null,
      achievements: [],
      technologies: [],
      gap_reason: reason,
      departure_reason: null,
      sort_order: experience.length,
      created_at: '',
    };
    setExperience(prev => [...prev, newRow]);
    setOpenExp(prev => new Set(prev).add(experience.length));
  };
  const addEducation = () => {
    setEducation(prev => [...prev, { id: '', profile_id: '', institution: '', degree: '', field: '', location: '', start_date: '', end_date: '', grade: '', description: '', sort_order: prev.length, created_at: '' }]);
    setOpenEdu(prev => new Set(prev).add(education.length));
  };
  const addProject = () => {
    setProjects(prev => [...prev, { id: '', profile_id: '', name: '', description: '', url: '', technologies: [], highlights: [], start_date: '', end_date: '', sort_order: prev.length }]);
    setOpenProj(prev => new Set(prev).add(projects.length));
  };

  /**
   * AI-draft a first Experience or Project entry from a free-text description.
   * On success: insert the drafted entry, auto-open the card, clear loading.
   * On failure (parse error, auth, credits): surface a toast, do NOT insert.
   */
  const handleDraftEntry = async (kind: 'experience' | 'project', text: string) => {
    if (!settings || !text.trim()) return;
    if (!hasCredits('ai_improve')) {
      toast(`AI drafting costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    setDrafting(kind);
    try {
      const context = `Career stage: ${profile.career_stage || 'unspecified'}. Industry: ${profile.industry || 'unspecified'}.${profile.target_role ? ` Target role: ${profile.target_role}.` : ''}`;
      const drafted = await draftEntryFromText(kind, text, context, settings);
      if (!drafted) {
        toast('AI returned nothing usable — try rephrasing.', 'error');
        setDrafting(null);
        return;
      }
      if (kind === 'experience') {
        const d = drafted as DraftedExperience;
        setExperience(prev => [...prev, {
          id: '', profile_id: '',
          role: d.role || '', company: d.company || '', location: d.location || '',
          start_date: d.start_date || '', end_date: d.is_current ? null : (d.end_date || null),
          is_current: !!d.is_current, description: d.description || '',
          achievements: Array.isArray(d.achievements) ? d.achievements : [],
          technologies: Array.isArray(d.technologies) ? d.technologies : [],
          sort_order: prev.length, created_at: '',
        }]);
        setOpenExp(prev => new Set(prev).add(experience.length));
      } else {
        const d = drafted as DraftedProject;
        setProjects(prev => [...prev, {
          id: '', profile_id: '',
          name: d.name || '', description: d.description || '', url: d.url || '',
          technologies: Array.isArray(d.technologies) ? d.technologies : [],
          highlights: Array.isArray(d.highlights) ? d.highlights : [],
          start_date: d.start_date || '', end_date: d.end_date || '',
          sort_order: prev.length,
        }]);
        setOpenProj(prev => new Set(prev).add(projects.length));
      }
      refreshCredits();
    } catch (err) { handleAIError(err, 'AI draft'); }
    setDrafting(null);
  };

  // ── Draft Professional Summary with AI ───────────────────────────────────
  // One-click summary generation that synthesises from the candidate's
  // existing Experience + Skills + target role. Solves the empty-state
  // problem (users stare at a blank textarea) without the cost of a full
  // Optimize run. Costs 1 `ai_improve` credit.
  const [draftingSummary, setDraftingSummary] = useState(false);

  const handleDraftSummary = async () => {
    if (!settings) return;
    if (!hasCredits('ai_improve')) {
      toast(`Drafting a summary costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    // Intentional overwrite confirmation — losing a hand-written summary to
    // a misclick is annoying enough to warrant a blocking prompt.
    const hasText = (profile.summary || '').trim().length >= 30;
    if (hasText && !window.confirm('Replace your current Professional Summary with an AI-drafted one?')) return;
    setDraftingSummary(true);
    try {
      const drafted = await draftSummaryFromCV(
        profile as CVProfile,
        experience,
        skills,
        settings,
      );
      if (!drafted?.trim()) {
        toast('AI returned an empty summary — try filling in a target role or one experience first.', 'error');
        return;
      }
      setProfile(p => ({ ...p, summary: drafted.trim() }));
      refreshCredits();
    } catch (err) {
      handleAIError(err, 'Summary draft');
    } finally {
      setDraftingSummary(false);
    }
  };

  // ── Beautify Summary / Project descriptions ─────────────────────────────
  // Keeps user-entered facts but restructures for clarity + recruiter impact.
  // Returns plain text with `\n\n` paragraph breaks — the portfolio renderer
  // turns those into real <p> blocks, so beautified text actually looks
  // beautiful without introducing markdown syntax that would break ATS.
  const [beautifyingSummary, setBeautifyingSummary] = useState(false);
  const [beautifyingProjectIdx, setBeautifyingProjectIdx] = useState<number | null>(null);

  const handleBeautifySummary = async () => {
    if (!settings) return;
    const current = (profile.summary || '').trim();
    if (!current) {
      toast('Write or draft a summary first, then beautify it.', 'info');
      return;
    }
    if (!hasCredits('ai_improve')) {
      toast(`Beautify costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    setBeautifyingSummary(true);
    try {
      const ctx = [
        profile.target_role ? `Target role: ${profile.target_role}` : '',
        profile.career_stage ? `Career stage: ${profile.career_stage}` : '',
        profile.industry ? `Industry: ${profile.industry}` : '',
      ].filter(Boolean).join('. ');
      const polished = await beautifyText(current, 'summary', ctx, settings);
      if (polished) setProfile(p => ({ ...p, summary: polished }));
      refreshCredits();
    } catch (err) {
      handleAIError(err, 'Summary beautify');
    } finally {
      setBeautifyingSummary(false);
    }
  };

  const handleBeautifyProjectDescription = async (i: number) => {
    if (!settings) return;
    const proj = projects[i];
    if (!proj) return;
    const current = (proj.description || '').trim();
    if (!current) {
      toast('Add a description first, then beautify it.', 'info');
      return;
    }
    if (!hasCredits('ai_improve')) {
      toast(`Beautify costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    setBeautifyingProjectIdx(i);
    try {
      const ctx = [
        `Project: ${proj.name || 'Untitled'}`,
        proj.technologies?.length ? `Tech: ${proj.technologies.join(', ')}` : '',
        proj.url ? `URL: ${proj.url}` : '',
      ].filter(Boolean).join('. ');
      const polished = await beautifyText(current, 'project_description', ctx, settings);
      if (polished) {
        setProjects(prev => prev.map((p, j) => j === i ? { ...p, description: polished } : p));
      }
      refreshCredits();
    } catch (err) {
      handleAIError(err, 'Project beautify');
    } finally {
      setBeautifyingProjectIdx(null);
    }
  };

  // ── Project import from URL ──────────────────────────────────────────────
  // Paste a GitHub / homepage / portfolio link → AI drafts a fully-populated
  // Project card in seconds. Reuses `draftEntryFromText` under the hood so
  // credit accounting stays identical (1 `ai_improve` credit).
  const [projectUrlInput, setProjectUrlInput] = useState('');
  const [importingProjectUrl, setImportingProjectUrl] = useState(false);

  const handleImportProjectFromUrl = async () => {
    if (!settings) return;
    const url = projectUrlInput.trim();
    if (!url) return;
    if (!hasCredits('ai_improve')) {
      toast(`Importing a project costs ${costOf('ai_improve')} credit — top up to continue.`, 'error');
      return;
    }
    setImportingProjectUrl(true);
    try {
      const { project: d, source } = await draftProjectFromUrl(url, settings);
      if (!d) {
        toast('AI returned nothing usable — try a GitHub URL or use the free-text drafter.', 'error');
        return;
      }
      setProjects(prev => [...prev, {
        id: '', profile_id: '',
        name: d.name || '',
        description: d.description || '',
        url: d.url || url,
        technologies: Array.isArray(d.technologies) ? d.technologies : [],
        highlights: Array.isArray(d.highlights) ? d.highlights : [],
        start_date: d.start_date || '',
        end_date: d.end_date || '',
        sort_order: prev.length,
      }]);
      setOpenProj(prev => new Set(prev).add(projects.length));
      setProjectUrlInput('');
      refreshCredits();
      if (source === 'url-only') {
        toast('Imported from URL — review the draft, AI had limited context.', 'success');
      }
    } catch (err) {
      handleAIError(err, 'Project URL import');
    } finally {
      setImportingProjectUrl(false);
    }
  };

  /** Toggle an index in a Set state. Used by EntryCard's onToggle prop. */
  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, idx: number) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  /** Remove an index from a Set and shift all indices > idx down by 1. Used after deleting an entry. */
  const removeIndexFromSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, idx: number) => {
    setter(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === idx) continue;
        next.add(i > idx ? i - 1 : i);
      }
      return next;
    });
  };

  /** After reorder, rebuild the Set by mapping old indices to new indices. */
  const reorderSet = (setter: React.Dispatch<React.SetStateAction<Set<number>>>, from: number, to: number) => {
    setter(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i === from) { next.add(to); continue; }
        if (from < to && i > from && i <= to) { next.add(i - 1); continue; }
        if (from > to && i >= to && i < from) { next.add(i + 1); continue; }
        next.add(i);
      }
      return next;
    });
  };

  /** "Open all" / "Close all" section toggle. */
  const toggleAllInSection = (
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    total: number,
    currentSize: number,
  ) => {
    setter(() => currentSize === total ? new Set<number>() : new Set(Array.from({ length: total }, (_, i) => i)));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <div className="w-6 h-6 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-bold uppercase tracking-wider text-muted">Loading…</span>
    </div>
  );

  const isEdit = id && id !== 'new';

  const completeColor =
    completeness.pct >= 80 ? 'bg-brand' :
    completeness.pct >= 50 ? 'bg-accent'  :
                             'bg-red-400';
  const completeLabelColor =
    completeness.pct >= 80 ? 'text-brand-light' :
    completeness.pct >= 50 ? 'text-accent' :
                             'text-red-400';

  return (
    <div>
      {/* ── POLISHED TOP BAR ─────────────────────────────────────────
          Sticky app-style bar: back + CV name left, tabs centered,
          Save / Download CTAs right. Completeness bar sits underneath
          as a passive progress indicator. Spans the full viewport in
          the chromeless FullScreenShell (resume.io-style). */}
      <div className="sticky top-0 z-40 px-4 md:px-6 pt-3 pb-0 mb-4 bg-surface border-b-[3px] border-neo-border">
        <div className="flex items-center justify-between gap-4 mb-3">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/cv" className="neo-btn neo-btn-ghost p-2 shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold uppercase tracking-wide truncate">
                {profile.version_name || (isEdit ? 'Edit CV' : 'New CV')}
              </h1>
              <div className="text-[11px] text-muted flex items-center gap-2">
                <span className={completeLabelColor + ' font-semibold'}>{completeness.pct}%</span>
                <span>complete</span>
                {profile.ats_score != null && (
                  <>
                    <span className="text-subtle">·</span>
                    <span className={`font-semibold ${profile.ats_score >= 80 ? 'text-brand-light' : profile.ats_score >= 60 ? 'text-accent' : 'text-red-400'}`}>
                      ATS {profile.ats_score}%
                    </span>
                    <button
                      type="button"
                      onClick={handleATSScore}
                      disabled={scoring || !profile.target_role || !hasCredits('ats_score')}
                      title={
                        !profile.target_role ? 'Set a target role to re-score'
                        : !hasCredits('ats_score') ? `Re-score needs ${costOf('ats_score')} credits`
                        : `Re-score (${costOf('ats_score')} credits)`
                      }
                      className="inline-flex items-center justify-center w-4 h-4 rounded text-subtle hover:text-brand-light transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center: pill tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-md border-[3px] border-neo-border bg-surface">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wide transition-all ${
                    active
                      ? 'bg-brand text-white shadow'
                      : 'text-muted hover:text-white hover:bg-surface-light'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Right: preview + Save + Download */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:inline-flex"><PlanBadge /></div>
            <button
              onClick={() => setShowPreview(!showPreview)}
              title={showPreview ? 'Hide preview' : 'Show preview'}
              className={`neo-btn neo-btn-ghost p-2 transition-colors ${showPreview ? 'border-brand text-brand-light bg-brand/10' : ''}`}
            >
              <Eye className="w-4 h-4" />
            </button>
            {/* Save-status chip. Hidden for new CVs (where Save is the only
                meaningful action) and while the editor is still loading. */}
            {!isNewCV && !loading && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2 text-[11px] font-medium whitespace-nowrap"
                aria-live="polite"
                title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleTimeString()}` : undefined}
              >
                {saving ? (
                  <><Loader2 className="w-3 h-3 animate-spin text-brand-light" /><span className="text-muted">Saving…</span></>
                ) : saveError ? (
                  <><AlertCircle className="w-3 h-3 text-red-400" /><span className="text-red-400">Save failed</span></>
                ) : isDirty ? (
                  <><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="text-muted">Unsaved</span></>
                ) : lastSavedAt ? (
                  <><CheckCircle2 className="w-3 h-3 text-brand-light" /><span className="text-muted">Saved · {formatAgo(lastSavedAt)}</span></>
                ) : (
                  <><CheckCircle2 className="w-3 h-3 text-muted" /><span className="text-muted">All changes saved</span></>
                )}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !profile.full_name?.trim() || (!isEdit && !hasCredits('create_cv'))}
              title={!isEdit ? `Creating a new CV · ${costOf('create_cv')} credit (balance: ${credits})` : 'Save now (⌘S / Ctrl+S)'}
              className="neo-btn neo-btn-ghost px-4 py-2.5 text-xs inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving…' : 'Save'}</span>
              {!isEdit && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80"><Coins className="w-3 h-3" />{costOf('create_cv')}</span>
              )}
            </button>
            <button
              onClick={handlePDF}
              disabled={!hasCredits('export_pdf')}
              title={`PDF export · ${costOf('export_pdf')} credit`}
              className="neo-btn neo-btn-primary px-4 py-2.5 text-xs inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80"><Coins className="w-3 h-3" />{costOf('export_pdf')}</span>
            </button>
          </div>
        </div>

        {/* Completeness progress rail */}
        <div className="h-1 w-full rounded-full bg-surface-light overflow-hidden">
          <div
            className={`h-full ${completeColor} transition-all duration-500 ease-out`}
            style={{ width: `${completeness.pct}%` }}
          />
        </div>

        {/* Mobile tabs (below progress on small screens) */}
        <nav className="flex md:hidden items-center gap-1 pt-2 pb-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${
                  active ? 'bg-brand text-white' : 'text-muted hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Split pane: Editor + Live Preview.
          On mobile: editor is always full-width; preview renders as a
          dismissible full-screen overlay (bottom of this return block).
          At md+: editor shares the viewport with the inline preview pane.
          Capped at 1600px so the split pane stays readable on ultra-wide
          monitors without letting columns get too wide. */}
      {/* The Portfolio tab owns its own iframe preview, so we suppress the
          CV PDF preview there and let the editor column take full width.
          That's handled inline on the preview conditionals below. */}
      <div className="flex flex-col md:flex-row md:gap-4 px-4 md:px-6 max-w-400 mx-auto">
        {/* Editor panel */}
        <div className={`w-full space-y-3 pb-28 md:overflow-y-auto ${(showPreview && activeTab !== 'portfolio') ? 'md:w-1/2 md:max-h-[calc(100vh-120px)]' : 'md:max-w-3xl md:mx-auto md:max-h-[calc(100vh-120px)]'} ${activeTab === 'portfolio' ? 'md:max-w-none' : ''}`}>
          {/* ═══ EDIT TAB ═════════════════════════════════════════════ */}
          {activeTab === 'edit' && (<>
          <InlineJDDelta
            analysis={atsAnalysis}
            skills={skills}
            onAddSkill={(name) => {
              const exists = skills.some(s => s.name.toLowerCase() === name.toLowerCase());
              if (exists) return;
              setSkills(prev => [...prev, { id: '', profile_id: '', name, category: 'Technical', proficiency: 'intermediate', years: null, sort_order: prev.length }]);
            }}
            onAddAllSkills={() => {
              if (!atsAnalysis) return;
              const existing = new Set(skills.map(s => s.name.toLowerCase()));
              const toAdd = (atsAnalysis.skills_to_add || []).filter(n => !existing.has(n.toLowerCase()));
              setSkills(prev => [
                ...prev,
                ...toAdd.map((name, i) => ({
                  id: '', profile_id: '', name,
                  category: 'Technical' as const,
                  proficiency: 'intermediate' as const,
                  years: null,
                  sort_order: prev.length + i,
                })),
              ]);
            }}
            onOpenTailor={() => setActiveTab('tailor')}
          />
          <SectionNav
            items={[
              { id: 'sec-personal',       label: 'Personal',      state:
                (profile.full_name?.trim() && profile.email?.trim() && profile.job_title?.trim() && (profile.linkedin || profile.github || profile.website) && (profile.summary || '').trim().length >= 100)
                  ? 'full'
                  : (profile.full_name?.trim() && profile.email?.trim()) ? 'partial' : 'empty' },
              { id: 'sec-experience',     label: 'Experience',    state:
                experience.length >= 1 && (experience[0]?.achievements?.length ?? 0) >= 1
                  ? 'full'
                  : experience.length >= 1 ? 'partial' : 'empty' },
              { id: 'sec-education',      label: 'Education',     state:
                education.length >= 1 && !!education[0]?.institution && !!education[0]?.degree
                  ? 'full'
                  : education.length >= 1 ? 'partial' : 'empty' },
              { id: 'sec-skills',         label: 'Skills',        state:
                skills.length >= 5 ? 'full' : skills.length >= 1 ? 'partial' : 'empty' },
              { id: 'sec-projects',       label: 'Projects',      state:
                projects.length >= 1 && (projects[0]?.highlights?.length ?? 0) >= 1
                  ? 'full'
                  : projects.length >= 1 ? 'partial' : 'empty' },
              { id: 'sec-certifications', label: 'Certifications', state: certifications.length >= 1 ? 'full' : 'empty' },
              { id: 'sec-languages',      label: 'Languages',     state: languages.length >= 1 ? 'full' : 'empty' },
            ]}
          />
          {/* Personal Info */}
          <Section id="sec-personal" title="Personal Information" {...sectionProps('sec-personal')}>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={profile.full_name || ''} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Full Name *" className="neo-input px-3 py-2.5 sm:col-span-2" />
                <input type="text" value={profile.version_name || ''} onChange={e => setProfile(p => ({ ...p, version_name: e.target.value }))}
                  placeholder="CV Version Name (e.g. Tech CV)" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.job_title || ''} onChange={e => setProfile(p => ({ ...p, job_title: e.target.value }))}
                  placeholder="Job Title" className="neo-input px-3 py-2.5" />
                <input type="email" value={profile.email || ''} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.location || ''} onChange={e => setProfile(p => ({ ...p, location: e.target.value }))}
                  placeholder="Location" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.linkedin || ''} onChange={e => setProfile(p => ({ ...p, linkedin: e.target.value }))}
                  placeholder="LinkedIn URL" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.github || ''} onChange={e => setProfile(p => ({ ...p, github: e.target.value }))}
                  placeholder="GitHub URL" className="neo-input px-3 py-2.5" />
                <input type="text" value={profile.website || ''} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))}
                  placeholder="Website / Portfolio" className="neo-input px-3 py-2.5 sm:col-span-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted">Professional Summary</label>
                  <input type="text" value={profile.target_role || ''} onChange={e => setProfile(p => ({ ...p, target_role: e.target.value }))}
                    placeholder="Target role (for ATS scoring)"
                    className="px-2 py-1 rounded bg-surface border-2 border-neo-border text-xs w-48" />
                </div>
                <RichTextEditor
                  mode="paragraph"
                  value={profile.summary || ''}
                  onChange={(v) => setProfile(p => ({ ...p, summary: v }))}
                  placeholder="Write a compelling professional summary…"
                  minHeight={96}
                  ariaLabel="Professional summary"
                />
                {/* Quick AI draft — synthesises a 50–80-word summary from the
                    candidate's existing Experience + Skills + target role.
                    Mirrors the Project URL importer's pattern (one-click,
                    1 credit, inline spinner). */}
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDraftSummary}
                      disabled={draftingSummary || beautifyingSummary || !hasCredits('ai_improve')}
                      title={
                        !hasCredits('ai_improve')
                          ? `Not enough credits (need ${costOf('ai_improve')})`
                          : (profile.summary || '').trim().length >= 30
                            ? 'Regenerate from Experience + Skills — will replace current text'
                            : 'Draft from Experience + Skills'
                      }
                      className="neo-btn neo-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {draftingSummary ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…</>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-brand-light" />
                          {(profile.summary || '').trim().length >= 30 ? 'Regenerate with AI' : 'Draft with AI'}
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                            <Coins className="w-3 h-3" />{costOf('ai_improve')}
                          </span>
                        </>
                      )}
                    </button>
                    {/* Beautify — keeps user's text, restructures for flow + clarity. */}
                    <button
                      type="button"
                      onClick={handleBeautifySummary}
                      disabled={beautifyingSummary || draftingSummary || !hasCredits('ai_improve') || !(profile.summary || '').trim()}
                      title={
                        !hasCredits('ai_improve') ? `Not enough credits (need ${costOf('ai_improve')})`
                          : !(profile.summary || '').trim() ? 'Write or draft a summary first'
                            : 'Polish your existing text — keeps your facts, tightens the flow'
                      }
                      className="neo-btn neo-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {beautifyingSummary ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Beautifying…</>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5 text-brand-light" />
                          Beautify
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                            <Coins className="w-3 h-3" />{costOf('ai_improve')}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="text-[10px] text-subtle">Draft generates from scratch · Beautify polishes what you wrote.</span>
                </div>
                <FieldTip>
                  <strong>50–80 words, 3–5 sentences.</strong> Front-load years + role + top 3 skills. Recruiters spend ~6 seconds on first scan — anything past 80 words goes unread. <em>Source: Ladders eye-tracking 2018.</em>
                </FieldTip>
                {profile.target_role && (
                  <FieldTip>
                    Weave your target role <strong>verbatim</strong> into the summary. Exact-title match = <strong>10.6× interview rate</strong>. <em>Source: Jobscan.</em>
                  </FieldTip>
                )}
              </div>
              {/* Career stage + industry — drives AI prompt personalisation and section ordering */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neo-border">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">Career stage</label>
                  <select value={profile.career_stage || ''} onChange={e => setProfile(p => ({ ...p, career_stage: (e.target.value || null) as any }))}
                    className="w-full neo-input px-2 py-1.5 text-sm">
                    <option value="">Unspecified</option>
                    {CAREER_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {profile.career_stage && (
                    <p className="text-[10px] text-muted mt-1">
                      {CAREER_STAGES.find(s => s.value === profile.career_stage)?.hint}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">Industry</label>
                  <select value={profile.industry || ''} onChange={e => setProfile(p => ({ ...p, industry: e.target.value || null }))}
                    className="w-full neo-input px-2 py-1.5 text-sm">
                    <option value="">Unspecified</option>
                    {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Entry-level-only fields — surfaced only when the user has set career_stage = entry_level */}
              {profile.career_stage === 'entry_level' && (
                <div className="grid grid-cols-1 gap-3 pt-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">Relevant coursework</label>
                    <input type="text" value={profile.relevant_coursework || ''}
                      onChange={e => setProfile(p => ({ ...p, relevant_coursework: e.target.value || null }))}
                      placeholder="Data Structures, Machine Learning, Distributed Systems"
                      className="w-full neo-input px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted mb-1 block">Capstone / thesis project</label>
                    <RichTextEditor
                      mode="paragraph"
                      value={profile.capstone_project || ''}
                      onChange={(v) => setProfile(p => ({ ...p, capstone_project: v || null }))}
                      placeholder="One-sentence summary + measurable outcome"
                      minHeight={56}
                      ariaLabel="Capstone or thesis project"
                    />
                  </div>
                </div>
              )}

              {profile.target_role && (
                <button onClick={handleATSScore} disabled={scoring || !hasCredits('ats_score')}
                  title={hasCredits('ats_score') ? `ATS score · ${costOf('ats_score')} credits` : `Not enough credits (need ${costOf('ats_score')})`}
                  className="neo-btn neo-btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                  {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                  {scoring ? 'Scoring…' : 'Check ATS Score'}
                  <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80"><Coins className="w-3 h-3" />{costOf('ats_score')}</span>
                </button>
              )}
            </div>
          </Section>

          {/* Experience */}
          <Section id="sec-experience" title="Work Experience" count={experience.length} {...sectionProps('sec-experience')}>
            <p className="text-xs text-muted mb-3 leading-snug">
              Highlight relevant experience (last 10 years). Use bullet points with measurable outcomes — achieved [X], measured by [Y], by doing [Z].
            </p>
            {experience.length > 1 && (
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  onClick={() => toggleAllInSection(setOpenExp, experience.length, openExp.size)}
                  className="neo-btn neo-btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
                >
                  {openExp.size === experience.length ? 'Close all' : 'Open all'} Work Experience
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="space-y-2">
              {/* Gap analysis panel — shown when consecutive roles have a
                  ≥3-month gap between them. One-click inserts a preset leave
                  entry with dates pre-filled; user can retitle / reword. */}
              {detectedGaps.length > 0 && (
                <GapAnalysisPanel
                  gaps={detectedGaps}
                  experience={experience}
                  onInsert={insertGapEntry}
                />
              )}
              {experience.length === 0 && (
                <EmptyDraftPrompt
                  kind="experience"
                  loading={drafting === 'experience'}
                  placeholder="Backend engineer at Acme, Jan 2021 – now. Shipped a payments service in Go handling $4M/mo, cut p99 by 60%, led 3 engineers. Stack: Go, Postgres, Kafka."
                  onDraft={(text) => handleDraftEntry('experience', text)}
                  onManual={addExperience}
                />
              )}
              {experience.map((exp, i) => {
                const isGap = !!exp.gap_reason;
                const dateLabel = (exp.start_date || exp.end_date || exp.is_current)
                  ? `${exp.start_date || '?'} – ${exp.is_current ? 'Present' : (exp.end_date || '?')}`
                  : '';
                const cardTitle = isGap
                  ? (exp.role || 'Career Break')
                  : [exp.role, exp.company].filter(Boolean).join(' at ');
                const cardSubtitle = isGap
                  ? `Leave · ${dateLabel}`
                  : `${dateLabel}${layoffNote(exp)}`;
                const showLayoffNudge = !isGap && layoffFlagged.has(i);
                return (
                  <EntryCard
                    key={i}
                    index={i}
                    title={cardTitle}
                    subtitle={cardSubtitle}
                    open={openExp.has(i)}
                    onToggle={() => toggleInSet(setOpenExp, i)}
                    onDelete={() => {
                      setExperience(prev => prev.filter((_, j) => j !== i));
                      removeIndexFromSet(setOpenExp, i);
                    }}
                    onReorder={(from, to) => {
                      setExperience(prev => reorderArray(prev, from, to));
                      reorderSet(setOpenExp, from, to);
                    }}
                  >
                    {isGap ? (
                      /* Gap-row editor: dates + leave preset + optional note.
                         Company / achievements / tech are deliberately hidden
                         to communicate that this is a gap, not a job. */
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 p-2 rounded-sm bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>This entry represents an employment gap. On your CV it'll render as a single line so recruiters see the period is accounted for.</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Leave type</span>
                            <select
                              value={exp.gap_reason || 'other'}
                              onChange={e => {
                                const reason = e.target.value as CVGapReason;
                                const preset = GAP_PRESETS.find(p => p.reason === reason);
                                const n = [...experience];
                                n[i] = { ...n[i], gap_reason: reason, role: preset?.label || n[i].role };
                                setExperience(n);
                              }}
                              className="neo-input px-2 py-1.5 text-sm"
                            >
                              {GAP_PRESETS.map(p => (
                                <option key={p.reason} value={p.reason}>{p.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Displayed label (editable)</span>
                            <input
                              type="text"
                              value={exp.role}
                              onChange={e => { const n = [...experience]; n[i] = { ...n[i], role: e.target.value }; setExperience(n); }}
                              placeholder="Family Care Leave"
                              className="neo-input px-2 py-1.5 text-sm"
                            />
                          </label>
                          <input type="text" value={exp.start_date} onChange={e => { const n = [...experience]; n[i] = { ...n[i], start_date: e.target.value }; setExperience(n); }}
                            placeholder="Start (Jul 2023)" className="neo-input px-2 py-1.5 text-sm" />
                          <input type="text" value={exp.end_date || ''} onChange={e => { const n = [...experience]; n[i] = { ...n[i], end_date: e.target.value || null }; setExperience(n); }}
                            placeholder="End (Feb 2024)" className="neo-input px-2 py-1.5 text-sm" />
                        </div>
                        <RichTextEditor
                          mode="paragraph"
                          value={exp.achievements[0] || ''}
                          onChange={(v) => {
                            const trimmed = v.trim();
                            const n = [...experience];
                            n[i] = { ...n[i], achievements: trimmed ? [trimmed] : [] };
                            setExperience(n);
                          }}
                          placeholder="Optional one-line note (e.g. “Cared for unwell family member; now eagerly approaching return to full-time work.”)"
                          minHeight={56}
                          ariaLabel="Career-gap note"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input type="text" value={exp.role} onChange={e => { const n = [...experience]; n[i] = { ...n[i], role: e.target.value }; setExperience(n); }}
                            placeholder="Role / Job Title *" className="neo-input px-2 py-1.5 text-sm" />
                          <input type="text" value={exp.company} onChange={e => { const n = [...experience]; n[i] = { ...n[i], company: e.target.value }; setExperience(n); }}
                            placeholder="Company *" className="neo-input px-2 py-1.5 text-sm" />
                          <input type="text" value={exp.start_date} onChange={e => { const n = [...experience]; n[i] = { ...n[i], start_date: e.target.value }; setExperience(n); }}
                            placeholder="Start (Jan 2022)" className="neo-input px-2 py-1.5 text-sm" />
                          <input type="text" value={exp.end_date || ''} onChange={e => { const n = [...experience]; n[i] = { ...n[i], end_date: e.target.value || null }; setExperience(n); }}
                            placeholder="End (or blank for Present)" className="neo-input px-2 py-1.5 text-sm" />
                        </div>
                        {/* Layoff nudge: only surfaced when this role is part
                            of a short-tenure PATTERN (≥2 consecutive sub-1yr
                            roles). Single short role on its own never shows
                            the nudge — podcast guidance. */}
                        {(showLayoffNudge || exp.departure_reason === 'layoff') && (
                          <label className="flex items-start gap-2 p-2 rounded-sm bg-surface-light/40 border border-neo-border/60 text-[11px] text-muted cursor-pointer">
                            <input
                              type="checkbox"
                              checked={exp.departure_reason === 'layoff'}
                              onChange={e => {
                                const n = [...experience];
                                n[i] = { ...n[i], departure_reason: e.target.checked ? 'layoff' : null };
                                setExperience(n);
                              }}
                              className="w-3.5 h-3.5 accent-brand cursor-pointer mt-0.5"
                            />
                            <span>
                              <span className="text-white font-medium">Ended by layoff?</span>
                              <span className="block text-[10px]">This role is under 1 year and part of a short-tenure pattern. Marking it adds <em>"(position ended in layoff, {new Date().getFullYear()})"</em> on your CV so recruiters don't read job-hopper.</span>
                            </span>
                          </label>
                        )}
                        <RichTextEditor
                          mode="list"
                          value={exp.achievements}
                          onChange={(v) => { const n = [...experience]; n[i] = { ...n[i], achievements: v }; setExperience(n); }}
                          placeholder="One achievement per bullet — e.g. Led team of 5 engineers; Increased revenue by 25%"
                          minHeight={88}
                          ariaLabel={`Achievements for ${exp.role || 'role'} at ${exp.company || 'company'}`}
                        />
                        <BulletHealth
                          bullets={exp.achievements}
                          fixingIndex={fixingBullet?.expIndex === i ? fixingBullet.bulletIndex : null}
                          fixCost={costOf('ai_improve')}
                          fixDisabled={!hasCredits('ai_improve')}
                          onFix={(bi, original) => handleFixBullet(i, bi, original)}
                        />
                        {i === 0 && (
                          <FieldTip>
                            <strong>Google X-Y-Z:</strong> "Accomplished <strong>[X]</strong> as measured by <strong>[Y]</strong> by doing <strong>[Z]</strong>." ≥1 number per bullet, max 2 lines (~150 chars). 3–5 bullets per role. <em>Source: Bock/Google, Rezi.</em>
                          </FieldTip>
                        )}
                        <TagsInput
                          value={exp.technologies}
                          onChange={(v) => { const n = [...experience]; n[i] = { ...n[i], technologies: v }; setExperience(n); }}
                          placeholder="Technologies (comma-separated): React, Node.js, PostgreSQL"
                          className="w-full neo-input px-2 py-1.5 text-sm"
                        />
                      </>
                    )}
                  </EntryCard>
                );
              })}
              {experience.length > 0 && (
                <button
                  onClick={addExperience}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border-[3px] border-dashed border-neo-border text-xs font-bold uppercase tracking-wide text-brand-light hover:border-brand hover:bg-brand/5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add one more employment
                </button>
              )}
            </div>
          </Section>

          {/* Education */}
          <Section id="sec-education" title="Education" count={education.length} {...sectionProps('sec-education')}>
            <p className="text-xs text-muted mb-3 leading-snug">
              A varied education on your CV sums up the value your learnings and background bring to the role.
            </p>
            {education.length > 1 && (
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  onClick={() => toggleAllInSection(setOpenEdu, education.length, openEdu.size)}
                  className="neo-btn neo-btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
                >
                  {openEdu.size === education.length ? 'Close all' : 'Open all'} Education
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="space-y-2">
              {education.map((edu, i) => {
                const cardTitle = [edu.degree, edu.institution].filter(Boolean).join(' at ');
                const dateLabel = edu.end_date || edu.start_date || '';
                return (
                  <EntryCard
                    key={i}
                    index={i}
                    title={cardTitle}
                    subtitle={dateLabel}
                    open={openEdu.has(i)}
                    onToggle={() => toggleInSet(setOpenEdu, i)}
                    onDelete={() => {
                      setEducation(prev => prev.filter((_, j) => j !== i));
                      removeIndexFromSet(setOpenEdu, i);
                    }}
                    onReorder={(from, to) => {
                      setEducation(prev => reorderArray(prev, from, to));
                      reorderSet(setOpenEdu, from, to);
                    }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="text" value={edu.degree} onChange={e => { const n = [...education]; n[i] = { ...n[i], degree: e.target.value }; setEducation(n); }}
                        placeholder="Degree *" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={edu.institution} onChange={e => { const n = [...education]; n[i] = { ...n[i], institution: e.target.value }; setEducation(n); }}
                        placeholder="Institution *" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={edu.field || ''} onChange={e => { const n = [...education]; n[i] = { ...n[i], field: e.target.value }; setEducation(n); }}
                        placeholder="Field of study" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={edu.end_date || ''} onChange={e => { const n = [...education]; n[i] = { ...n[i], end_date: e.target.value }; setEducation(n); }}
                        placeholder="Year (2020)" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={edu.grade || ''} onChange={e => { const n = [...education]; n[i] = { ...n[i], grade: e.target.value }; setEducation(n); }}
                        placeholder="Grade / GPA (optional)" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={edu.location || ''} onChange={e => { const n = [...education]; n[i] = { ...n[i], location: e.target.value }; setEducation(n); }}
                        placeholder="Location (optional)" className="neo-input px-2 py-1.5 text-sm" />
                    </div>
                  </EntryCard>
                );
              })}
              <button
                onClick={addEducation}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border-[3px] border-dashed border-neo-border text-xs font-bold uppercase tracking-wide text-brand-light hover:border-brand hover:bg-brand/5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add one more education
              </button>
            </div>
          </Section>

          {/* Skills */}
          <Section id="sec-skills" title="Skills" count={skills.length} {...sectionProps('sec-skills')}>
            <FieldTip>
              <strong>8–12 skills</strong> that match the job description. Use <strong>exact JD terminology</strong> ("CI/CD" not "continuous integration", "React.js" not "React"). Don't dump 30+ generic items. <em>Source: uppl.ai, Workday guide.</em>
            </FieldTip>
            <SkillsEditor skills={skills} setSkills={setSkills} />
          </Section>

          {/* Languages */}
          <Section id="sec-languages" title="Languages" count={languages.length} {...sectionProps('sec-languages')}>
            <LanguagesEditor languages={languages} setLanguages={setLanguages} />
          </Section>

          {/* Certifications */}
          <Section id="sec-certifications" title="Certifications" count={certifications.length} {...sectionProps('sec-certifications')}>
            <CertificationsEditor certifications={certifications} setCertifications={setCertifications} />
          </Section>

          {/* Projects */}
          <Section id="sec-projects" title="Projects" count={projects.length} {...sectionProps('sec-projects')}>
            <p className="text-xs text-muted mb-3 leading-snug">
              Showcase 2+ projects that prove your skills. Include GitHub/live links and measurable adoption (users, stars, revenue).
            </p>

            {/* Import from URL — AI reads a GitHub repo (or any URL) and fills
                name / description / technologies / highlights automatically. */}
            <div className="mb-3 rounded-md border-2 border-neo-border/60 bg-surface/40 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-light" />
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-white">Import from URL</span>
                <span className="text-[10px] text-subtle">· GitHub works best</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={projectUrlInput}
                  onChange={e => setProjectUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && projectUrlInput.trim() && !importingProjectUrl) { e.preventDefault(); handleImportProjectFromUrl(); } }}
                  placeholder="https://github.com/owner/repo   or   https://your-project.com"
                  className="flex-1 min-w-0 neo-input px-2.5 py-1.5 text-sm"
                  disabled={importingProjectUrl}
                />
                <button
                  type="button"
                  onClick={handleImportProjectFromUrl}
                  disabled={!projectUrlInput.trim() || importingProjectUrl || !hasCredits('ai_improve')}
                  title={!hasCredits('ai_improve') ? `Not enough credits (need ${costOf('ai_improve')})` : 'Import with AI'}
                  className="shrink-0 neo-btn neo-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {importingProjectUrl ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Import
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                        <Coins className="w-3 h-3" />{costOf('ai_improve')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {projects.length > 1 && (
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  onClick={() => toggleAllInSection(setOpenProj, projects.length, openProj.size)}
                  className="neo-btn neo-btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
                >
                  {openProj.size === projects.length ? 'Close all' : 'Open all'} Projects
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
            <div className="space-y-2">
              {projects.length === 0 && (
                <EmptyDraftPrompt
                  kind="project"
                  loading={drafting === 'project'}
                  placeholder="TheDevCV — ATS-first CV builder. React + Supabase + Stripe. Live at thedevcv.com. ~300 signups in first month, 40% conversion to Pro."
                  onDraft={(text) => handleDraftEntry('project', text)}
                  onManual={addProject}
                />
              )}
              {projects.map((proj, i) => {
                const showCv = proj.show_on_cv !== false;
                const showPortfolio = proj.show_on_portfolio !== false;
                // Small visibility hint in the collapsed card subtitle so
                // users can scan which projects are hidden without expanding.
                const visibilityHint =
                  !showCv && !showPortfolio ? 'Hidden'
                    : !showCv ? 'Portfolio only'
                      : !showPortfolio ? 'CV only'
                        : '';
                const subtitle = [
                  proj.url,
                  proj.technologies.slice(0, 3).join(', '),
                  visibilityHint,
                ].filter(Boolean).join(' · ');
                return (
                  <EntryCard
                    key={i}
                    index={i}
                    title={proj.name}
                    subtitle={subtitle}
                    open={openProj.has(i)}
                    onToggle={() => toggleInSet(setOpenProj, i)}
                    onDelete={() => {
                      setProjects(prev => prev.filter((_, j) => j !== i));
                      removeIndexFromSet(setOpenProj, i);
                    }}
                    onReorder={(from, to) => {
                      setProjects(prev => reorderArray(prev, from, to));
                      reorderSet(setOpenProj, from, to);
                    }}
                  >
                    {/* Per-destination visibility — lets users keep every
                        project on their profile but pick which appear on the
                        exported CV PDF vs the exported Portfolio HTML. */}
                    <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-neo-border/40 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Show on</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showCv}
                          onChange={e => { const n = [...projects]; n[i] = { ...n[i], show_on_cv: e.target.checked }; setProjects(n); }}
                          className="w-3.5 h-3.5 accent-brand cursor-pointer"
                        />
                        <FileText className="w-3 h-3 text-muted" /> CV
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showPortfolio}
                          onChange={e => { const n = [...projects]; n[i] = { ...n[i], show_on_portfolio: e.target.checked }; setProjects(n); }}
                          className="w-3.5 h-3.5 accent-brand cursor-pointer"
                        />
                        <Globe className="w-3 h-3 text-muted" /> Portfolio
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="text" value={proj.name} onChange={e => { const n = [...projects]; n[i] = { ...n[i], name: e.target.value }; setProjects(n); }}
                        placeholder="Project name *" className="neo-input px-2 py-1.5 text-sm" />
                      <input type="text" value={proj.url || ''} onChange={e => { const n = [...projects]; n[i] = { ...n[i], url: e.target.value }; setProjects(n); }}
                        placeholder="URL" className="neo-input px-2 py-1.5 text-sm" />
                    </div>
                    <RichTextEditor
                      mode="paragraph"
                      value={proj.description || ''}
                      onChange={(v) => { const n = [...projects]; n[i] = { ...n[i], description: v }; setProjects(n); }}
                      placeholder="Description"
                      minHeight={64}
                      ariaLabel={`Description for ${proj.name || 'project'}`}
                    />
                    {/* Beautify — AI restructures this description for clarity + impact.
                        Plain-text output with natural paragraph breaks; the portfolio
                        renderer turns `\n\n` into real <p> blocks. */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleBeautifyProjectDescription(i)}
                        disabled={beautifyingProjectIdx !== null || !hasCredits('ai_improve') || !(proj.description || '').trim()}
                        title={
                          !hasCredits('ai_improve') ? `Not enough credits (need ${costOf('ai_improve')})`
                            : !(proj.description || '').trim() ? 'Add a description first'
                              : 'Polish this description — keeps your facts, improves flow'
                        }
                        className="neo-btn neo-btn-ghost px-2.5 py-1 text-[11px] inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {beautifyingProjectIdx === i ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Beautifying…</>
                        ) : (
                          <>
                            <Wand2 className="w-3 h-3 text-brand-light" /> Beautify
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-brand-light/80">
                              <Coins className="w-3 h-3" />{costOf('ai_improve')}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                    <TagsInput
                      value={proj.technologies}
                      onChange={(v) => { const n = [...projects]; n[i] = { ...n[i], technologies: v }; setProjects(n); }}
                      placeholder="Technologies (comma-separated)"
                      className="w-full neo-input px-2 py-1.5 text-sm" />
                  </EntryCard>
                );
              })}
              {projects.length > 0 && (
                <button
                  onClick={addProject}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border-[3px] border-dashed border-neo-border text-xs font-bold uppercase tracking-wide text-brand-light hover:border-brand hover:bg-brand/5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add one more project
                </button>
              )}
            </div>
          </Section>

          {/* Import from other CV */}
          <ImportFromCV
            currentProfileId={id}
            onImportSummary={(s) => setProfile(p => ({ ...p, summary: s }))}
            onImportExperience={(items) => setExperience(prev => [...prev, ...items.map(e => ({ ...e, id: '', profile_id: '' }))])}
            onImportEducation={(items) => setEducation(prev => [...prev, ...items.map(e => ({ ...e, id: '', profile_id: '' }))])}
            onImportSkills={(items) => {
              const existingNames = new Set(skills.map(s => s.name.toLowerCase()));
              const newItems = items.filter(s => !existingNames.has(s.name.toLowerCase()));
              setSkills(prev => [...prev, ...newItems.map(s => ({ ...s, id: '', profile_id: '' }))]);
            }}
            onImportCertifications={(items) => setCertifications(prev => [...prev, ...items.map(c => ({ ...c, id: '', profile_id: '' }))])}
            onImportLanguages={(items) => {
              const existing = new Set(languages.map(l => l.language.toLowerCase()));
              const newItems = items.filter(l => !existing.has(l.language.toLowerCase()));
              setLanguages(prev => [...prev, ...newItems.map(l => ({ ...l, id: '', profile_id: '' }))]);
            }}
          />
          </>)}
          {/* ═══ DESIGN TAB ═══════════════════════════════════════════ */}
          {activeTab === 'design' && (
            <div className="space-y-3">
              <SharePanel
                profileId={id}
                isShared={!!profile.is_shared}
                shareToken={profile.share_token ?? null}
                onChange={(next) => setProfile(p => ({ ...p, ...next }))}
              />
              <div className="neo-card p-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm flex items-center justify-center shrink-0 text-brand-light"><Layers className="w-4 h-4" /></div>
                  <div>
                    <h2 className="text-xs font-extrabold uppercase tracking-wide text-white">Choose a template</h2>
                    <p className="text-xs text-muted mt-0.5">All templates are ATS-safe — the same content renders in any style.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TEMPLATES.map((t) => {
                    const active = template === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplate(t.id)}
                        className={`text-left p-3 rounded-md border-[3px] transition-all ${
                          active
                            ? 'border-brand bg-brand/10 shadow'
                            : 'border-neo-border bg-surface hover:border-brand/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-extrabold uppercase tracking-wide">{t.label}</span>
                          {active && <CheckCircle2 className="w-4 h-4 text-brand-light" />}
                        </div>
                        <p className="text-[11px] text-muted leading-snug">{t.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* JSON Resume export — unlocks autofill via Chrome extensions + LinkedIn importers. */}
              <div className="neo-card p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm flex items-center justify-center shrink-0 text-brand-light"><Braces className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-white">Export for autofill</h3>
                    <p className="text-xs text-muted mt-0.5">
                      JSON Resume format — feeds Chrome autofill extensions, LinkedIn importers, and most ATS tools. Carry your CV everywhere.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const resume = toJSONResume(
                      profile as CVProfile, renderedExperience, education, skills, certifications, cvProjects, languages,
                    );
                    const safeName = (profile.full_name || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    downloadJSONResume(resume, `${safeName || 'resume'}.json`);
                  }}
                  disabled={!profile.full_name?.trim()}
                  className="neo-btn neo-btn-ghost px-4 py-2.5 text-sm inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download resume.json
                </button>
              </div>

              {/* Plain-text export — lets users paste into free ATS scanners to audit parser output. */}
              <div className="neo-card p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm flex items-center justify-center shrink-0 text-brand-light"><FileText className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-white">Export as plain text</h3>
                    <p className="text-xs text-muted mt-0.5">
                      Pure ASCII .txt — paste into free ATS scanners (Jobscan, Resume Worded) to audit exactly what real parsers extract from your CV.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const text = toPlainText(
                      profile as CVProfile, renderedExperience, education, skills, certifications, cvProjects, languages,
                    );
                    const safeName = (profile.full_name || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    downloadPlainText(text, `${safeName || 'resume'}.txt`);
                  }}
                  disabled={!profile.full_name?.trim()}
                  className="neo-btn neo-btn-ghost px-4 py-2.5 text-sm inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download resume.txt
                </button>
              </div>
            </div>
          )}
          {/* ═══ AI REVIEW TAB ════════════════════════════════════════ */}
          {activeTab === 'ai-review' && (<>
            <QualityChecks
              profile={profile}
              experience={experience}
              skills={skills}
              education={education}
              onFix={handleFixFinding}
              fixCost={costOf('ai_improve')}
              canFix={hasCredits('ai_improve')}
            />
            <OptimizePanel
              suggestions={suggestions}
              loading={optimizing}
              onGenerate={handleOptimize}
              onAccept={handleAcceptSuggestion}
              onReject={(id) => setSuggestions(prev => prev.filter(s => s.id !== id))}
              onAcceptAll={() => suggestions.forEach(s => handleAcceptSuggestion(s))}
            />
          </>)}
          {/* ═══ TAILOR TAB ═══════════════════════════════════════════ */}
          {activeTab === 'tailor' && (
            <div className="space-y-4">
            <ATSAnalysis
              analysis={atsAnalysis}
              loading={atsLoading}
              jobText={atsJobText}
              onJobTextChange={setAtsJobText}
              onAnalyze={handleATSAnalysis}
              onApplySummary={(s) => setProfile(p => ({ ...p, summary: s }))}
              onApplyAchievement={(expId, current, suggested) => {
                setExperience(prev => prev.map(exp => {
                  if (exp.id !== expId) return exp;
                  const idx = exp.achievements.findIndex(a => a === current);
                  if (idx === -1) return exp;
                  const achievements = [...exp.achievements];
                  achievements[idx] = suggested;
                  return { ...exp, achievements };
                }));
              }}
              onAddSkills={(newSkills) => {
                const existing = new Set(skills.map(s => s.name.toLowerCase()));
                const toAdd = newSkills.filter(s => !existing.has(s.toLowerCase()));
                setSkills(prev => [...prev, ...toAdd.map((s, i) => ({
                  id: '', profile_id: '', name: s, category: 'Technical' as const,
                  proficiency: 'intermediate' as const, years: null, sort_order: prev.length + i,
                }))]);
              }}
              onApplyAll={() => {
                // Score gets updated via the individual handlers above
              }}
            />

            {/* ── Cover Letter Generator ───────────────────────────── */}
            <div className="neo-card p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm flex items-center justify-center shrink-0 text-brand-light">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-white">Cover Letter</h2>
                  <p className="text-xs text-muted mt-0.5">Tailored to the job description above. Add a company and role for a sharper letter.</p>
                </div>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted shrink-0">
                  <Coins className="w-3 h-3" />{costOf('ai_improve')} credit
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <input
                  type="text"
                  value={coverLetterCompany}
                  onChange={e => setCoverLetterCompany(e.target.value)}
                  placeholder="Company name (optional)"
                  className="neo-input px-2.5 py-1.5 text-sm"
                />
                <input
                  type="text"
                  value={coverLetterPosition}
                  onChange={e => setCoverLetterPosition(e.target.value)}
                  placeholder="Role/position (optional)"
                  className="neo-input px-2.5 py-1.5 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateCoverLetter}
                disabled={coverLetterLoading || !atsJobText.trim() || !hasCredits('ai_improve')}
                className="neo-btn neo-btn-primary px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {coverLetterLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Sparkles className="w-4 h-4" /> Generate Cover Letter</>}
              </button>

              {coverLetterText && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Your cover letter</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(coverLetterText);
                        toast('Cover letter copied to clipboard', 'success');
                      }}
                      className="neo-btn neo-btn-ghost px-2.5 py-1 text-xs inline-flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                  <div className="bg-surface-light border-2 border-neo-border rounded-md p-3 whitespace-pre-wrap text-sm text-white leading-relaxed max-h-72 overflow-y-auto">
                    {coverLetterText}
                  </div>
                </div>
              )}
            </div>

            {/* ── Interview Prep ───────────────────────────────────── */}
            <div className="neo-card p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 border-[3px] border-neo-border bg-brand/20 rounded-sm flex items-center justify-center shrink-0 text-brand-light">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-white">Interview Prep</h2>
                  <p className="text-xs text-muted mt-0.5">10 targeted questions — behavioural, technical, and situational — matched to this exact job.</p>
                </div>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted shrink-0">
                  <Coins className="w-3 h-3" />{costOf('ai_improve')} credit
                </span>
              </div>

              <button
                type="button"
                onClick={handleGenerateInterviewQuestions}
                disabled={interviewLoading || !atsJobText.trim() || !hasCredits('ai_improve')}
                className="neo-btn neo-btn-primary px-4 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {interviewLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><TrendingUp className="w-4 h-4" /> Generate Interview Questions</>}
              </button>

              {interviewQuestions && interviewQuestions.length > 0 && (
                <div className="mt-4 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{interviewQuestions.length} questions · based on your CV and the JD</span>
                  {interviewQuestions.map((q, i) => (
                    <details key={i} className="group bg-surface-light border-2 border-neo-border rounded-md overflow-hidden">
                      <summary className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer list-none select-none hover:bg-surface">
                        <span className={`mt-0.5 shrink-0 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded border-2 ${
                          q.type === 'behavioral'
                            ? 'text-brand-light border-brand bg-brand/10'
                            : q.type === 'technical'
                            ? 'text-yellow-400 border-yellow-500/60 bg-yellow-500/10'
                            : 'text-orange-400 border-orange-400/60 bg-orange-500/10'
                        }`}>{q.type}</span>
                        <span className="text-sm text-white leading-snug flex-1">{q.question}</span>
                        <ChevronDown className="w-4 h-4 text-muted shrink-0 mt-0.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-3 pb-3 pt-1 border-t-2 border-neo-border">
                        <p className="text-xs text-muted font-bold uppercase tracking-wide mb-1">How to approach it</p>
                        <p className="text-sm text-subtle leading-relaxed">{q.angle}</p>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
          {/* ═══ PORTFOLIO TAB ════════════════════════════════════════ */}
          {activeTab === 'portfolio' && (
            <PortfolioBuilder
              cvId={id}
              profile={profile}
              experience={renderedExperience}
              projects={portfolioProjects}
              skills={skills}
            />
          )}
        </div>

        {/* ── Floating "Ask AI writer" pill — always available, opens AI Review ── */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('ai-review');
            if (!suggestions.length && !optimizing && hasCredits('ai_optimize')) {
              handleOptimize();
            }
          }}
          disabled={optimizing}
          title={`AI review · ${costOf('ai_optimize')} credits`}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-30 neo-btn neo-btn-accent px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60 ${showPreview ? 'md:left-[25%]' : ''}`}
        >
          {optimizing ? (
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 text-accent" />
          )}
          <span className="text-sm font-bold uppercase tracking-wide">{optimizing ? 'Thinking…' : 'Ask AI writer'}</span>
          <span className="inline-flex items-center gap-0.5 text-[10px] text-accent/80">
            <Coins className="w-3 h-3" />{costOf('ai_optimize')}
          </span>
        </button>

        {/* Inline Live Preview — desktop only (mobile uses the overlay below). */}
        {showPreview && activeTab !== 'portfolio' && (
          <div className="hidden md:block md:w-1/2 md:sticky md:top-4" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <div className="bg-white rounded-lg shadow-xl overflow-hidden" style={{ transform: 'scale(0.72)', transformOrigin: 'top center' }}>
              {template === 'modern' ? (
                <CVTemplateModern
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'minimal' ? (
                <CVTemplateMinimal
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'professional' ? (
                <CVTemplateProfessional
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'executive' ? (
                <CVTemplateExecutive
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'corporate' ? (
                <CVTemplateCorporate
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'neo' ? (
                <CVTemplateNeo
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'neo-dark' ? (
                <CVTemplateNeoDark
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : (
                <CVTemplateClassic
                  profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile-only full-screen preview overlay. Hidden at md+ where the
          inline preview takes over. Scrolls the whole viewport and offers a
          clear dismiss control; zoom is constrained so the CV is readable
          without a magnifier. */}
      {showPreview && activeTab !== 'portfolio' && (
        <div className="md:hidden fixed inset-0 z-50 bg-surface overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-surface border-b-[3px] border-neo-border">
            <span className="text-sm font-extrabold uppercase tracking-wide">Preview</span>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className="neo-btn neo-btn-ghost px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            <div className="bg-white rounded-lg shadow-xl overflow-hidden" style={{ transform: 'scale(0.48)', transformOrigin: 'top left', width: '208%' }}>
              {template === 'modern' ? (
                <CVTemplateModern profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'minimal' ? (
                <CVTemplateMinimal profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'professional' ? (
                <CVTemplateProfessional profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'executive' ? (
                <CVTemplateExecutive profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'corporate' ? (
                <CVTemplateCorporate profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'neo' ? (
                <CVTemplateNeo profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : template === 'neo-dark' ? (
                <CVTemplateNeoDark profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              ) : (
                <CVTemplateClassic profile={profile as CVProfile} experience={renderedExperience} education={education}
                  skills={skills} certifications={certifications} projects={cvProjects} languages={languages} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Writing animation overlay */}
      <AIWritingOverlay visible={optimizing} />
    </div>
  );
}
