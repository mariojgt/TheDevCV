export type CareerStage = 'entry_level' | 'mid_career' | 'senior' | 'executive' | 'career_changer';

export interface CVProfile {
  id: string;
  user_id: string;
  version_name: string;
  is_default: boolean;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  summary: string | null;
  target_role: string | null;
  keywords: string[];
  ats_score: number | null;
  /** Career stage drives AI prompt context and section ordering (entry-level puts education first). */
  career_stage: CareerStage | null;
  /** Free-text industry label — typically one of the suggested list, but custom values allowed. */
  industry: string | null;
  /** Comma-separated relevant courses — surfaced in the editor only for entry-level CVs. */
  relevant_coursework: string | null;
  /** Short capstone / thesis project summary — entry-level only. */
  capstone_project: string | null;
  /** When true AND share_token is set, the CV is viewable at /s/:token by anyone. */
  is_shared: boolean;
  /** Opaque 32-hex-char token used in the public URL. Rotating it revokes old links. */
  share_token: string | null;
  shared_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Employment-gap reason codes. Empty / null = not a gap, this is a real role.
 *  Guidance lifted from the gap-handling podcast: use a specific, labeled
 *  leave instead of a blank or "Unemployed" — reframes the period. */
export type CVGapReason = 'family_care' | 'education' | 'relocation' | 'sabbatical' | 'medical' | 'other';

/** How the role ended. Only `layoff` is currently rendered (adds a polite
 *  note to the role line) and it's only surfaced visually when the candidate
 *  has a pattern of short tenures — one short role alone doesn't need it. */
export type CVDepartureReason = 'layoff' | 'resignation' | 'contract_end';

export interface CVExperience {
  id: string;
  profile_id: string;
  company: string;
  role: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  achievements: string[];
  technologies: string[];
  sort_order: number;
  created_at: string;
  /** When set, this row represents an employment gap — editor hides
   *  company / tech / achievement-count fields and the `role` holds the
   *  leave label (e.g. "Family Care Leave"). Legacy rows without the
   *  column are treated as normal roles. */
  gap_reason?: CVGapReason | null;
  /** Reason this role ended. Only `layoff` is surfaced in rendering. */
  departure_reason?: CVDepartureReason | null;
}

export interface CVEducation {
  id: string;
  profile_id: string;
  institution: string;
  degree: string;
  field: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  grade: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface CVSkill {
  id: string;
  profile_id: string;
  name: string;
  category: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  years: number | null;
  sort_order: number;
}

export interface CVCertification {
  id: string;
  profile_id: string;
  name: string;
  issuer: string | null;
  date_obtained: string | null;
  expiry_date: string | null;
  credential_id: string | null;
  url: string | null;
  sort_order: number;
}

export interface CVProject {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  url: string | null;
  technologies: string[];
  highlights: string[];
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  /** When false, hide from the CV PDF + live preview + JSON/plainText export.
   *  Undefined (legacy rows loaded pre-migration) is treated as true. */
  show_on_cv?: boolean;
  /** Same idea but for the GitHub Portfolio HTML export. */
  show_on_portfolio?: boolean;
}

export interface CVLanguage {
  id: string;
  profile_id: string;
  language: string;
  proficiency: 'native' | 'fluent' | 'professional' | 'intermediate' | 'basic';
  sort_order: number;
}

export interface JobApplication {
  id: string;
  user_id: string;
  cv_profile_id: string | null;
  company: string;
  position: string;
  location: string | null;
  job_type: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'internship' | 'remote';
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  job_url: string | null;
  job_description: string | null;
  status: JobStatus;
  applied_date: string | null;
  response_date: string | null;
  interview_dates: { date: string; type: string; notes: string }[];
  ats_match_score: number | null;
  ai_cover_letter: string | null;
  ai_suggestions: string[];
  recruiter_name: string | null;
  recruiter_email: string | null;
  hiring_manager: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type JobStatus = 'saved' | 'applied' | 'screening' | 'interview' | 'technical' | 'final_round' | 'offer' | 'accepted' | 'rejected' | 'withdrawn' | 'ghosted';

export const JOB_STATUSES: { value: JobStatus; label: string; color: string }[] = [
  { value: 'saved',       label: 'Saved',       color: 'border-neo-border  bg-surface-light   text-muted' },
  { value: 'applied',     label: 'Applied',     color: 'border-blue-500    bg-blue-500/10     text-blue-400' },
  { value: 'screening',   label: 'Screening',   color: 'border-cyan-500    bg-cyan-500/10     text-cyan-400' },
  { value: 'interview',   label: 'Interview',   color: 'border-brand       bg-brand/10        text-brand-light' },
  { value: 'technical',   label: 'Technical',   color: 'border-purple-500  bg-purple-500/10   text-purple-400' },
  { value: 'final_round', label: 'Final Round', color: 'border-violet-500  bg-violet-500/10   text-violet-400' },
  { value: 'offer',       label: 'Offer',       color: 'border-brand       bg-brand/10        text-brand-light' },
  { value: 'accepted',    label: 'Accepted',    color: 'border-brand-dark  bg-brand/20        text-brand-light' },
  { value: 'rejected',    label: 'Rejected',    color: 'border-red-500     bg-red-500/10      text-red-400' },
  { value: 'withdrawn',   label: 'Withdrawn',   color: 'border-accent      bg-accent/10       text-accent' },
  { value: 'ghosted',     label: 'Ghosted',     color: 'border-subtle      bg-surface-light   text-subtle' },
];

/** Preset leave labels — these are the `role` string written into the
 *  Experience row when a gap is inserted. Matches the vocabulary from the
 *  "Next Job Now" gap episode: reframes a blank period as a specific,
 *  non-negotiable leave that doesn't invite follow-up probing. */
export const GAP_PRESETS: { reason: CVGapReason; label: string; hint: string }[] = [
  { reason: 'family_care', label: 'Family Care Leave',       hint: 'Caring for children, sick relatives, or personal health — no further questions invited.' },
  { reason: 'education',   label: 'Education Leave',          hint: 'Full-time study, bootcamp, or credential work.' },
  { reason: 'relocation',  label: 'Family Relocation Leave',  hint: 'Moving countries / cities disrupted the job search window.' },
  { reason: 'sabbatical',  label: 'Sabbatical',               hint: 'Intentional break for travel, writing, or personal projects.' },
  { reason: 'medical',     label: 'Medical Leave',            hint: 'Health-related absence now fully recovered.' },
  { reason: 'other',       label: 'Career Break',             hint: 'Generic honest label when none of the above fits.' },
];

export const SKILL_CATEGORIES = ['Technical', 'Soft Skills', 'Tools', 'Frameworks', 'Languages', 'Databases', 'Cloud', 'Other'] as const;
export const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export const LANGUAGE_LEVELS = ['native', 'fluent', 'professional', 'intermediate', 'basic'] as const;

// Career stages and industries follow the resume-builder skill taxonomy so AI
// prompts can pull matching guidance. See references/industry-career-guidance.md.
export const CAREER_STAGES: { value: CareerStage; label: string; hint: string }[] = [
  { value: 'entry_level',    label: 'Entry-level (0–2 yrs)',        hint: 'Education first, emphasise coursework, projects, internships.' },
  { value: 'mid_career',     label: 'Mid-career (5–15 yrs)',         hint: 'Lead with career progression, scope, business impact.' },
  { value: 'senior',         label: 'Senior (15+ yrs)',              hint: 'Strategic impact, P&L, org size, transformation wins.' },
  { value: 'executive',      label: 'Executive / C-suite',           hint: 'Board-level results, budget size, industry influence.' },
  { value: 'career_changer', label: 'Career changer',                hint: 'Lead with transferable skills, explain transition, recent training.' },
];

export const INDUSTRIES: { value: string; label: string }[] = [
  { value: 'technology',    label: 'Technology / Software' },
  { value: 'healthcare',    label: 'Healthcare / Medical' },
  { value: 'finance',       label: 'Finance / Accounting' },
  { value: 'marketing',     label: 'Marketing / Sales' },
  { value: 'education',     label: 'Education / Teaching' },
  { value: 'legal',         label: 'Legal' },
  { value: 'retail',        label: 'Retail / Hospitality' },
  { value: 'non_profit',    label: 'Non-profit / Social impact' },
  { value: 'government',    label: 'Government / Public service' },
  { value: 'creative',      label: 'Creative / Design' },
  { value: 'manufacturing', label: 'Manufacturing / Supply chain' },
];
