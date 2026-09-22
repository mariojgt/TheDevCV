import { checkCVReadiness } from '../lib/readiness';
import { useMemo, useState } from 'react';
import { CheckCircle, ChevronDown, ShieldCheck, Sparkles, Loader2, Coins } from 'lucide-react';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CareerStage } from '../types';

/** Local writing heuristics and completeness checks, not an ATS certification. */

/**
 * A finding may be `fixable` — either by a single AI rewrite call (costs 1
 * credit) or by a deterministic transform the UI can do for free. The parent
 * component (CVEditor) reads this descriptor and dispatches the right handler.
 */
export type FixAction =
  | { kind: 'rewrite-bullet'; expIndex: number; bulletIndex: number; original: string }
  | { kind: 'rewrite-summary'; original: string };

export interface Finding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  /** Human-readable source location, e.g. "Experience · Patchstack · bullet 3". */
  location?: string;
  /** The offending text snippet, if any, so the user can find it instantly. */
  snippet?: string;
  /** If present, a "Fix with AI" button is shown and calls the parent's onFix. */
  fix?: FixAction;
}

const WEAK_OPENERS = [
  'responsible for',
  'responsibilities include',
  'responsibilities included',
  'duties include',
  'duties included',
  'tasks included',
  'tasks include',
  'worked on',
  'worked with',
  'helped with',
  'helped to',
  'helped',
  'assisted with',
  'assisted in',
  'assisted',
  'supported',
  'aided',
  'in charge of',
  'involved in',
  'participated in',
];

/** Generic wording worth reviewing; these words do not prove AI authorship. */
const AI_TELL_WORDS = [
  'delve', 'realm', 'tapestry', 'pivotal', 'intricate',
  'foster', 'comprehensive', 'showcasing', 'adept',
  'tech-savvy', 'cutting-edge', 'robust',
];

/**
 * Unquantified filler phrases recruiters see as hollow. Allowed only when the
 * same bullet contains a concrete metric.
 */
const FILLER_PHRASES = [
  'results-driven', 'team player', 'dynamic individual',
  'proven track record', 'excellent communicator',
  'strong analytical skills', 'detail-oriented', 'go-getter',
  'self-starter', 'hard worker', 'think outside the box',
];

/** Hidden-character / prompt-injection detector. Flags zero-width chars,
 *  right-to-left overrides, and 1-pt style markers (rarely legitimate in a CV). */
const HIDDEN_CHAR_RE = /[​-‏‪-‮⁠-⁯﻿]/;

/** Looks like a full street address (numbers + street keyword) — research says
 *  omit; use City + State only. */
const STREET_ADDRESS_RE = /\b\d{1,5}\s+[A-Za-z][\w\s]*\b(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|way|court|ct\.?|place|pl\.?)\b/i;

/** Fields banned in US/UK/CA/AU/IE CVs: DOB, age, marital status, nationality. */
const BANNED_PERSONAL_RE = /\b(date of birth|d\.?o\.?b\.?|born on|birth date|age[:\s]+\d|marital status|married|single|divorced|nationality|religion|gender[:\s])\b/i;

// Boundaries guard against matching "my" inside "myself"? we want both.
const FIRST_PERSON = /\b(i|me|my|mine|we|our|ours|myself|ourselves)\b/i;

/** Quantifier detection: digits, %, currency, scale words, time words. */
const QUANTIFIER_RE =
  /(\d|\%|£|\$|€|¥)|(\b(k|m|b|bn|mm|percent|x|×)\b)|(\b(hour|day|week|month|year|minute|second|qtr|quarter|sprint)s?\b)/i;

/** Past-tense verb-form guard for leading action word. Present-tense forms end in 's' or 'e'; past forms usually end in 'ed' or are irregular. We use a small allowlist of irregular verbs common on resumes. */
const IRREGULAR_PAST = new Set([
  'led', 'built', 'wrote', 'drove', 'drew', 'ran', 'grew', 'sold', 'kept',
  'rebuilt', 'rewrote', 'met', 'sent', 'made', 'saw', 'took', 'won', 'spoke',
  'chose', 'shipped', 'taught', 'brought', 'began', 'set', 'cut', 'held',
  'gave', 'told', 'found', 'spent', 'oversaw', 'undertook',
]);

function looksPastTense(verb: string): boolean {
  const v = verb.toLowerCase().replace(/[.,;:]$/, '');
  if (IRREGULAR_PAST.has(v)) return true;
  if (v.endsWith('ed')) return true;
  return false;
}

/**
 * Research-grounded summary word-count ranges. 50-80 is the cross-stage
 * default (Ladders 6-second study, ResuFit, Enhancv). Executives get a wider
 * ceiling because their summary includes a "signature achievements" opener.
 */
function summaryRange(stage: CareerStage | null | undefined): [number, number] {
  switch (stage) {
    case 'entry_level':    return [40, 70];  // often omitted entirely; short if present
    case 'mid_career':     return [50, 80];
    case 'senior':         return [60, 100];
    case 'executive':      return [70, 140]; // 4-5 sentences per research
    case 'career_changer': return [50, 90];
    default:               return [50, 80];
  }
}

/**
 * Parse a year from a free-text date string like "March 2023", "03/2023",
 * "2023", or "Jan 2023". Returns null if no 4-digit year found.
 */
function parseYear(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

/** Parse a month index 0-11 from free-text. Returns 6 (July, midpoint) if unparseable. */
const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
function parseMonth(s: string | null | undefined): number {
  if (!s) return 6;
  const m = s.toLowerCase().match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (m) return MONTH_MAP[m[1]] ?? 6;
  // Try "03/2023"
  const slash = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) return Math.max(0, Math.min(11, parseInt(slash[1], 10) - 1));
  return 6;
}

/** Parse "3.7" or "3.70/4.0" or "First Class" — returns numeric GPA on 4.0 scale or null. */
function parseGPA(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const m = grade.match(/(\d(?:\.\d{1,2})?)\s*(?:\/\s*4(?:\.0)?)?/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return v >= 0 && v <= 4 ? v : null;
}

function totalYearsExperience(experience: CVExperience[]): number {
  if (!experience.length) return 0;
  const now = new Date();
  let months = 0;
  for (const e of experience) {
    const startY = parseYear(e.start_date);
    if (!startY) continue;
    const endY = e.is_current ? now.getFullYear() : parseYear(e.end_date) ?? startY;
    const startM = parseMonth(e.start_date);
    const endM = e.is_current ? now.getMonth() : parseMonth(e.end_date);
    months += Math.max(0, (endY - startY) * 12 + (endM - startM));
  }
  return months / 12;
}

export interface QualityChecksProps {
  profile: Partial<CVProfile>;
  experience: CVExperience[];
  skills: CVSkill[];
  /** Optional — enables EDU-001 (GPA rules). Older call sites can omit. */
  education?: CVEducation[];
  /**
   * Parent handler for "Fix with AI". Receives the finding (with its `fix`
   * descriptor) and is expected to run the rewrite + update state. If omitted,
   * no Fix buttons render.
   */
  onFix?: (finding: Finding) => Promise<void>;
  /** Cost shown on the Fix button; defaults to 1 credit. */
  fixCost?: number;
  /** Whether the user has enough credits to run a fix — drives disabled state. */
  canFix?: boolean;
}

export default function QualityChecks({
  profile, experience, skills, education = [], onFix, fixCost = 1, canFix = true,
}: QualityChecksProps) {
  const [open, setOpen] = useState(true);
  /** IDs of findings currently being fixed by AI — shows a per-row spinner. */
  const [fixingIds, setFixingIds] = useState<Set<string>>(new Set());

  const handleFix = async (finding: Finding) => {
    if (!onFix || !finding.fix) return;
    setFixingIds((prev) => new Set(prev).add(finding.id));
    try { await onFix(finding); } finally {
      setFixingIds((prev) => {
        const next = new Set(prev);
        next.delete(finding.id);
        return next;
      });
    }
  };

  const findings: Finding[] = useMemo(() => {
    const out: Finding[] = checkCVReadiness(profile, experience);
    const yearsExp = totalYearsExperience(experience);

    // ── Per-experience / per-bullet checks ────────────────────────
    experience.forEach((exp, xi) => {
      if (exp.gap_reason) return; // Leave entries are not jobs requiring achievements.
      const label = `Experience · ${exp.company || `entry ${xi + 1}`}`;

      if (!exp.achievements?.length) {
        out.push({
          id: `exp-${xi}-no-bullets`,
          severity: 'warning',
          title: 'No achievement bullets',
          detail: 'Each role should have 3–5 achievement bullets (up to 7 for current/senior roles). Source: Rezi, Teal.',
          location: label,
        });
      } else {
        // BUL-001 — 3-5 bullets per role (up to 7 for current/senior)
        const maxBullets = exp.is_current ? 7 : 5;
        if (exp.achievements.length < 3) {
          out.push({
            id: `exp-${xi}-few-bullets`,
            severity: 'warning',
            title: `Only ${exp.achievements.length} bullet${exp.achievements.length === 1 ? '' : 's'}`,
            detail: 'Aim for 3–5 bullets per role. Recent/current roles can go up to 7. Source: Rezi, Teal.',
            location: label,
          });
        }
        if (exp.achievements.length > maxBullets) {
          out.push({
            id: `exp-${xi}-many-bullets`,
            severity: 'info',
            title: `${exp.achievements.length} bullets — consider trimming to ${maxBullets}`,
            detail: `More than ${maxBullets} bullets dilutes impact. Keep only the strongest, most-quantified achievements. Source: Rezi, Teal.`,
            location: label,
          });
        }

        exp.achievements.forEach((a, bi) => {
          const where = `${label} · bullet ${bi + 1}`;
          const lower = a.toLowerCase().trim();
          if (!lower) return;

          // Weak opener
          for (const phrase of WEAK_OPENERS) {
            if (lower.startsWith(phrase)) {
              out.push({
                id: `exp-${xi}-b${bi}-weak`,
                severity: 'error',
                title: `Weak opener: "${phrase}"`,
                detail: 'Replace with a strong action verb (Led, Architected, Spearheaded, Engineered, Optimised, Reduced, Delivered…).',
                location: where,
                snippet: a,
              });
              break;
            }
          }

          // First person
          if (FIRST_PERSON.test(a)) {
            out.push({
              id: `exp-${xi}-b${bi}-firstperson`,
              severity: 'error',
              title: 'First-person pronoun in bullet',
              detail: 'Resumes use implied first person. Remove I / me / my / we / our.',
              location: where,
              snippet: a,
              fix: { kind: 'rewrite-bullet', expIndex: xi, bulletIndex: bi, original: a },
            });
          }

          // Missing quantifier
          if (!QUANTIFIER_RE.test(a)) {
            out.push({
              id: `exp-${xi}-b${bi}-no-metric`,
              severity: 'info',
              title: 'Consider evidence of impact',
              detail: 'If you know a real result, scale, or timeframe, add it. A clear qualitative contribution is valid; never guess a number.',
              location: where,
              snippet: a,
            });
          }

          // BUL-004 — Max 2 lines / ~150 chars per bullet (Rezi; recruiters skim first line)
          if (a.length > 200) {
            out.push({
              id: `exp-${xi}-b${bi}-long`,
              severity: 'warning',
              title: `Bullet is ${a.length} chars — too long`,
              detail: 'Max 2 lines / ~150 chars. Recruiters skim the first line only. Source: Rezi.',
              location: where,
              snippet: a,
              fix: { kind: 'rewrite-bullet', expIndex: xi, bulletIndex: bi, original: a },
            });
          } else if (a.length > 150) {
            out.push({
              id: `exp-${xi}-b${bi}-longish`,
              severity: 'info',
              title: `Bullet is ${a.length} chars — consider tightening`,
              detail: 'Aim for 80–150 chars to stay on one line. Source: Rezi.',
              location: where,
              snippet: a,
              fix: { kind: 'rewrite-bullet', expIndex: xi, bulletIndex: bi, original: a },
            });
          }

          // AI-001 — AI-tell vocabulary detection (GPTZero, Enhancv 2026)
          const aiTellHits = AI_TELL_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(a));
          if (aiTellHits.length > 0) {
            out.push({
              id: `exp-${xi}-b${bi}-ai-tell`,
              severity: 'warning',
              title: `Consider more specific wording: "${aiTellHits.join(', ')}"`,
              detail: 'These words can be vague. Prefer concrete verbs and domain-specific nouns. Source: GPTZero, Enhancv 2026.',
              location: where,
              snippet: a,
              fix: { kind: 'rewrite-bullet', expIndex: xi, bulletIndex: bi, original: a },
            });
          }

          // Unquantified filler phrases — OK only when the bullet has a concrete number
          if (!QUANTIFIER_RE.test(a)) {
            for (const phrase of FILLER_PHRASES) {
              if (new RegExp(`\\b${phrase}\\b`, 'i').test(a)) {
                out.push({
                  id: `exp-${xi}-b${bi}-filler`,
                  severity: 'info',
                  title: `Unquantified filler: "${phrase}"`,
                  detail: 'Replace generic praise with a specific contribution. Include a number only if you can verify it.',
                  location: where,
                  snippet: a,
                });
                break;
              }
            }
          }

          // AI-002 — Hidden characters / prompt-injection patterns
          if (HIDDEN_CHAR_RE.test(a)) {
            out.push({
              id: `exp-${xi}-b${bi}-hidden`,
              severity: 'error',
              title: 'Hidden / zero-width characters detected',
              detail: 'Check for accidental invisible formatting. Some characters are legitimate in non-English text; remove only unintended formatting.',
              location: where,
              snippet: a,
              fix: { kind: 'rewrite-bullet', expIndex: xi, bulletIndex: bi, original: a },
            });
          }

          // Tense heuristic for non-current roles
          if (!exp.is_current) {
            const firstWord = a.trim().split(/\s+/)[0] ?? '';
            // Skip if it starts with a number, punctuation, or is very short
            if (firstWord.length > 2 && /^[A-Za-z]+$/.test(firstWord) && !looksPastTense(firstWord)) {
              out.push({
                id: `exp-${xi}-b${bi}-tense`,
                severity: 'info',
                title: `Verb tense check: "${firstWord}"`,
                detail: 'Previous roles should use past tense. Start this bullet with a past-tense action verb.',
                location: where,
                snippet: a,
              });
            }
          }
        });
      }
    });

    const allBullets = experience.filter(e => !e.gap_reason).flatMap(e => e.achievements || []);

    // ── SUM-001: summary length + CON-001: banned personal fields ────
    const summary = (profile.summary ?? '').trim();
    if (summary) {
      const words = summary.split(/\s+/).filter(Boolean).length;
      const [lo, hi] = summaryRange(profile.career_stage as CareerStage | null | undefined);
      if (words < lo) {
        out.push({
          id: 'summary-short',
          severity: 'warning',
          title: `Summary is ${words} words — too short`,
          detail: `Aim for ${lo}–${hi} words. Front-load: years of experience + role + top 3 skills + signature achievement. Source: Ladders 6-sec study.`,
          location: 'Professional Summary',
          fix: { kind: 'rewrite-summary', original: summary },
        });
      } else if (words > hi) {
        out.push({
          id: 'summary-long',
          severity: 'warning',
          title: `Summary is ${words} words — too long`,
          detail: `Summaries over ${hi} words go unread in the 6-second scan. Tighten to ${lo}–${hi} words. Source: Ladders eye-tracking 2018.`,
          location: 'Professional Summary',
          fix: { kind: 'rewrite-summary', original: summary },
        });
      }

      // CON-001: DOB/age/marital/nationality banned in US/UK/CA/AU/IE CVs
      if (BANNED_PERSONAL_RE.test(summary)) {
        out.push({
          id: 'summary-banned-personal',
          severity: 'error',
          title: 'Summary contains banned personal info',
          detail: 'US/UK/CA/AU/IE CVs omit DOB, age, marital status, nationality. These fields are illegal to request in several jurisdictions and can trigger auto-rejection. Source: LSE Careers, Jobscan.',
          location: 'Professional Summary',
          snippet: summary,
          fix: { kind: 'rewrite-summary', original: summary },
        });
      }

      // AI-001 on the summary as well
      const summaryAiTell = AI_TELL_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(summary));
      if (summaryAiTell.length >= 2) {
        out.push({
          id: 'summary-ai-tell',
          severity: 'warning',
          title: `Consider more specific summary wording: "${summaryAiTell.join(', ')}"`,
          detail: 'Consider concrete verbs and specific examples where these words add little meaning. Word choice alone does not indicate AI authorship.',
          location: 'Professional Summary',
          fix: { kind: 'rewrite-summary', original: summary },
        });
      }

      // AI-002 on summary
      if (HIDDEN_CHAR_RE.test(summary)) {
        out.push({
          id: 'summary-hidden',
          severity: 'error',
          title: 'Hidden characters in summary',
          detail: 'Modern ATS flag zero-width / invisible characters as tampering. Retype as plain text. Source: Built In, NYT 2024.',
          location: 'Professional Summary',
        });
      }
    } else if (profile.career_stage !== 'entry_level') {
      out.push({
        id: 'summary-missing',
        severity: 'warning',
        title: 'No professional summary',
        detail: 'Non-entry-level CVs need a 3-5 sentence summary up top. 80% of recruiter attention in the 6-second scan lands here. Source: Ladders eye-tracking 2018.',
        location: 'Professional Summary',
      });
    }

    // ── KW-001: target role keyword should appear somewhere in the body ─
    if (profile.target_role?.trim()) {
      const target = profile.target_role.trim().toLowerCase();
      const inSummary = summary.toLowerCase().includes(target);
      const inSkills = skills.some((s) => s.name.toLowerCase().includes(target));
      const inBullets = allBullets.some((b) => b.toLowerCase().includes(target));
      const inRoles = experience.some((e) => (e.role || '').toLowerCase().includes(target));
      if (!(inSummary || inSkills || inBullets || inRoles)) {
        out.push({
          id: 'target-role-absent',
          severity: 'warning',
          title: `Target role "${profile.target_role}" not found in CV body`,
          detail: 'Candidates whose CV contains the exact JD job title get 10.6× the interview rate. Weave the phrase into the summary, skills, or a recent bullet. Source: Jobscan.',
          location: 'Keywords',
        });
      }
    }

    // ── KW-003: skills count (8-12 sweet spot per uppl.ai) ─────────
    if (skills.length > 0 && skills.length < 5) {
      out.push({
        id: 'skills-too-few',
        severity: 'warning',
        title: `Only ${skills.length} skill${skills.length === 1 ? '' : 's'}`,
        detail: 'Aim for 8–12 skills that match the job description. ATS-friendly and signals breadth without stuffing. Source: uppl.ai.',
        location: 'Skills',
      });
    } else if (skills.length > 20) {
      out.push({
        id: 'skills-too-many',
        severity: 'warning',
        title: `${skills.length} skills — trim to 8-12`,
        detail: 'Dumping 20+ skills dilutes keyword density and signals low judgment. Keep only the skills that match the target JD. Source: uppl.ai.',
        location: 'Skills',
      });
    }

    // ── KW-004: duplicate skill names ─────────────────────────────
    const skillNameCounts = skills.reduce((acc, s) => {
      const key = s.name.trim().toLowerCase();
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const duplicates = Object.entries(skillNameCounts).filter(([, n]) => n > 1);
    if (duplicates.length > 0) {
      out.push({
        id: 'skills-duplicates',
        severity: 'info',
        title: `Duplicate skills: ${duplicates.map(([k, n]) => `"${k}" (×${n})`).join(', ')}`,
        detail: 'Remove duplicates — repeating a skill doesn\'t boost the ATS score and looks careless.',
        location: 'Skills',
      });
    }

    // ── Skills grouping ───────────────────────────────────────────
    if (skills.length >= 6) {
      const categories = new Set(skills.map((s) => s.category || 'Other'));
      if (categories.size === 1) {
        out.push({
          id: 'skills-ungrouped',
          severity: 'info',
          title: 'Skills all in one category',
          detail: 'Group skills into categories (Technical, Frameworks, Tools, Cloud…) so ATS parses them into the right buckets.',
          location: 'Skills',
        });
      }
    }

    // ── EDU-001: GPA rules (include only if ≥3.5 AND <3 yrs exp) ───
    for (const edu of education) {
      const gpa = parseGPA(edu.grade);
      if (gpa == null) continue;
      if (yearsExp >= 3) {
        out.push({
          id: `edu-gpa-stale-${edu.id || edu.institution}`,
          severity: 'info',
          title: `Drop GPA from ${edu.institution || 'education'}`,
          detail: 'After 3+ years of work experience, GPA no longer helps — remove it to free space for recent impact. Source: Indeed, Harvard OCS.',
          location: `Education · ${edu.institution || edu.degree || 'entry'}`,
        });
      } else if (gpa < 3.5) {
        out.push({
          id: `edu-gpa-low-${edu.id || edu.institution}`,
          severity: 'warning',
          title: `GPA ${gpa.toFixed(2)} below include-threshold`,
          detail: 'Include GPA only if ≥3.5. Below that, omitting is safer than showing. Source: Indeed, Harvard OCS.',
          location: `Education · ${edu.institution || edu.degree || 'entry'}`,
        });
      }
    }

    // ── GAP-001: employment gaps >6 months ────────────────────────
    const sortedExp = [...experience]
      .map((e) => ({
        role: e.role,
        company: e.company,
        startY: parseYear(e.start_date),
        startM: parseMonth(e.start_date),
        endY: e.is_current ? new Date().getFullYear() : parseYear(e.end_date),
        endM: e.is_current ? new Date().getMonth() : parseMonth(e.end_date),
      }))
      .filter((e) => e.startY != null && e.endY != null)
      .sort((a, b) => ((a.startY! * 12 + a.startM) - (b.startY! * 12 + b.startM)));
    for (let i = 1; i < sortedExp.length; i++) {
      const prev = sortedExp[i - 1];
      const curr = sortedExp[i];
      const prevEndMonths = prev.endY! * 12 + prev.endM;
      const currStartMonths = curr.startY! * 12 + curr.startM;
      const gapMonths = currStartMonths - prevEndMonths;
      if (gapMonths > 6) {
        const years = Math.floor(gapMonths / 12);
        const months = gapMonths % 12;
        const label = years ? `${years}y${months ? ` ${months}mo` : ''}` : `${months}mo`;
        out.push({
          id: `gap-${i}`,
          severity: 'info',
          title: `${label} gap between ${prev.company || prev.role} and ${curr.company || curr.role}`,
          detail: 'Unexplained gaps >6 months get 50% fewer callbacks than explained ones. Add a one-line entry (sabbatical, caregiving, freelance, upskilling) to frame it. Source: HBR 2024.',
          location: 'Experience',
        });
      }
    }

    // ── LEN-001: page-count estimate vs stage-appropriate limit ────
    // Rough estimator: A4 page holds ~4000 chars of body text at 10-11pt.
    const charsTotal =
      (profile.summary || '').length +
      allBullets.join(' ').length +
      experience.reduce((a, e) => a + (e.role?.length ?? 0) + (e.company?.length ?? 0) + (e.location?.length ?? 0) + (e.description?.length ?? 0), 0) +
      education.reduce((a, e) => a + (e.degree?.length ?? 0) + (e.institution?.length ?? 0) + (e.description?.length ?? 0), 0) +
      skills.reduce((a, s) => a + s.name.length + 4, 0);
    const estPages = Math.max(1, Math.ceil(charsTotal / 3800));
    const stageLimit = (() => {
      if (yearsExp >= 20 || profile.career_stage === 'executive') return 3;
      if (yearsExp >= 10 || profile.career_stage === 'senior') return 2;
      return 1;
    })();
    if (estPages > stageLimit) {
      out.push({
        id: 'length-over',
        severity: 'warning',
        title: `~${estPages} pages — target ${stageLimit} page${stageLimit === 1 ? '' : 's'} for your stage`,
        detail: `Estimated character count suggests ~${estPages} printed pages. For ${yearsExp < 10 ? '<10 yrs experience' : yearsExp < 20 ? '10-20 yrs' : 'executive/senior'} target ${stageLimit} page${stageLimit === 1 ? '' : 's'}. Trim older roles, shorter bullets, or tighter summary. Source: Bock/Google, Briefcase Coach.`,
        location: 'Length',
      });
    }

    // ── Contact basics + CON-002 location format ─────────────────
    if (!profile.email) {
      out.push({
        id: 'no-email',
        severity: 'error',
        title: 'Missing email',
        detail: 'An ATS-parseable email address is required at the top of the CV.',
        location: 'Contact',
      });
    }
    if (profile.location && STREET_ADDRESS_RE.test(profile.location)) {
      out.push({
        id: 'location-street-address',
        severity: 'warning',
        title: 'Location contains full street address',
        detail: 'Use City + State only (e.g., "San Francisco, CA"). Full street addresses are a privacy risk and no longer expected. Source: Jobscan.',
        location: 'Contact',
      });
    }
    if (!profile.phone) {
      out.push({
        id: 'no-phone',
        severity: 'warning',
        title: 'Missing phone number',
        detail: 'Most recruiters expect a phone number in the header.',
        location: 'Contact',
      });
    }

    return out;
  }, [profile, experience, skills, education]);

  const errors   = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const infos    = findings.filter((f) => f.severity === 'info');
  const score = scoreFromFindings(errors.length, warnings.length, infos.length);

  return (
    <div className="neo-card overflow-hidden">
      {/* ── Header: score + counts, always visible ─────────────── */}
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-light transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className={`w-4 h-4 ${score >= 80 ? 'text-brand-light' : score >= 60 ? 'text-accent' : 'text-red-400'}`} />
          <span className="font-display font-extrabold text-sm uppercase tracking-wide text-white">Quality Checks</span>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-subtle hidden sm:inline">free · no AI</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {findings.length === 0 ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> All clear</span>
          ) : (
            <div className="flex items-center gap-1.5">
              {errors.length   > 0 && <CountBadge count={errors.length}   tone="error" />}
              {warnings.length > 0 && <CountBadge count={warnings.length} tone="warning" />}
              {infos.length    > 0 && <CountBadge count={infos.length}    tone="info" />}
            </div>
          )}
          <span className={`text-xs font-bold tabular-nums ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{score}</span>
          <ChevronDown className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* ── Body: grouped by priority, collapsible sub-sections ─── */}
      {open && (
        <div className="border-t border-[var(--color-border)]">
          <p className="px-4 py-3 text-xs text-muted">Writing and completeness checks, not an employer ATS score. Style tips are optional; verify facts and follow the application instructions.</p>
          {findings.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-emerald-400 font-medium">All clear on mechanical checks.</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">Run an AI ATS score against a target job for deeper analysis.</p>
            </div>
          ) : (
            <div>
              <FindingGroup
                title="Fix first"
                blurb="Completeness and clarity issues to review."
                findings={errors}
                tone="error"
                defaultOpen
                onFix={onFix ? handleFix : undefined}
                fixCost={fixCost}
                canFix={canFix}
                fixingIds={fixingIds}
              />
              <FindingGroup
                title="Worth fixing"
                blurb="Suggestions to make your CV clearer."
                findings={warnings}
                tone="warning"
                defaultOpen
                onFix={onFix ? handleFix : undefined}
                fixCost={fixCost}
                canFix={canFix}
                fixingIds={fixingIds}
              />
              <FindingGroup
                title="Polish"
                blurb="Small refinements — optional."
                findings={infos}
                tone="info"
                defaultOpen={false}
                onFix={onFix ? handleFix : undefined}
                fixCost={fixCost}
                canFix={canFix}
                fixingIds={fixingIds}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components for the new grouped display ──────────────────

type Tone = 'error' | 'warning' | 'info';

const TONE: Record<Tone, { label: string; text: string; bg: string; border: string; dot: string }> = {
  error:   { label: 'Error',   text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-l-rose-400',    dot: 'bg-rose-400' },
  warning: { label: 'Warning', text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-l-amber-400',   dot: 'bg-amber-400' },
  info:    { label: 'Tip',     text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-l-sky-400/60',  dot: 'bg-sky-400/70' },
};

function CountBadge({ count, tone }: { count: number; tone: Tone }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${t.bg} ${t.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {count}
    </span>
  );
}

/**
 * Derive a short category chip from a Finding's location string.
 * Turns "Experience · Patchstack · bullet 3" → "Experience",
 *       "Professional Summary" → "Summary", etc.
 */
function categoryOf(location: string | undefined): string | null {
  if (!location) return null;
  const head = location.split('·')[0]?.trim();
  if (!head) return null;
  if (head === 'Professional Summary') return 'Summary';
  return head;
}

function FindingGroup({
  title, blurb, findings, tone, defaultOpen, onFix, fixCost, canFix, fixingIds,
}: {
  title: string;
  blurb: string;
  findings: Finding[];
  tone: Tone;
  defaultOpen: boolean;
  onFix?: (f: Finding) => Promise<void>;
  fixCost: number;
  canFix: boolean;
  fixingIds: Set<string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (findings.length === 0) return null;
  const t = TONE[tone];

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="border-b-[3px] border-neo-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-light transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${t.dot} shrink-0`} />
          <span className="text-xs font-bold uppercase tracking-wide text-white">{title}</span>
          <span className={`text-[10px] font-mono font-bold ${t.text}`}>{findings.length}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle truncate hidden md:inline">· {blurb}</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className="pb-2">
          {findings.map((f) => {
            const cat = categoryOf(f.location);
            const isExpanded = expanded.has(f.id);
            const hasDetail = !!f.detail || !!f.snippet;
            const isFixing = fixingIds.has(f.id);
            const canShowFix = !!onFix && !!f.fix;
            return (
              <li key={f.id} className={`mx-3 my-1 rounded-md border-l-[3px] ${t.border} bg-surface-light hover:bg-surface-lighter transition-colors`}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => hasDetail && toggle(f.id)}
                    className={`flex-1 text-left px-3 py-2 flex items-center gap-2 min-w-0 ${hasDetail ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className="text-xs font-semibold text-white flex-1 min-w-0 truncate">{f.title}</span>
                    {cat && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-1.5 py-0.5 rounded-md border-2 border-neo-border bg-surface shrink-0">
                        {cat}
                      </span>
                    )}
                    {hasDetail && (
                      <ChevronDown className={`w-3 h-3 text-subtle transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                  {canShowFix && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onFix!(f); }}
                      disabled={isFixing || !canFix}
                      title={canFix ? `Rewrite with AI · ${fixCost} credit` : `Not enough credits (need ${fixCost})`}
                      className={`mr-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0 ${
                        isFixing
                          ? 'border-brand bg-brand/10 text-brand-light cursor-wait'
                          : canFix
                            ? 'border-brand bg-brand/10 text-brand-light hover:bg-brand/20'
                            : 'border-neo-border bg-surface text-subtle cursor-not-allowed'
                      }`}
                    >
                      {isFixing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {isFixing ? 'Fixing…' : 'Fix'}
                      {!isFixing && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] opacity-80">
                          <Coins className="w-2.5 h-2.5" />{fixCost}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {isExpanded && hasDetail && (
                  <div className="px-3 pb-2.5 pt-0 border-t border-[var(--color-border)]/50">
                    {f.detail && <p className="text-[11px] text-[var(--color-text-secondary)] mt-2 leading-snug">{f.detail}</p>}
                    {f.location && f.location.includes('·') && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">↳ {f.location}</p>
                    )}
                    {f.snippet && (
                      <p className="mt-1.5 text-[11px] italic text-[var(--color-text-muted)] border-l-2 border-[var(--color-border)] pl-2">
                        "{f.snippet.length > 200 ? f.snippet.slice(0, 197) + '…' : f.snippet}"
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Crude scoring: errors hurt most, warnings next, infos least. Bottoms out at 0. */
function scoreFromFindings(errors: number, warnings: number, infos: number): number {
  return Math.max(0, 100 - errors * 10 - warnings * 4);
}
