import type { CVExperience, CVProject, CVSkill } from '../types';

export interface ATSGapAnalysis {
  score: number;
  missing_keywords: string[];
  matched_keywords: string[];
  suggestions: string[];
  strengths: string[];
  gaps: { area: string; severity: 'critical' | 'important' | 'nice_to_have'; description: string; fix: string }[];
  summary_rewrite: string;
  skills_to_add: string[];
  achievements_to_enhance: { experience_id: string; current: string; suggested: string }[];
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is string => {
    if (typeof item !== 'string' || !item.trim()) return false;
    const key = item.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => item.trim());
}

/** Only explicit technology lists count as evidence for adding a skill.
 * Mere keyword mentions (e.g. "no Kubernetes experience") are insufficient. */
export function supportedSkillNames(experience: CVExperience[], projects: CVProject[], skills: CVSkill[]): Set<string> {
  const existing = new Set(skills.map(s => s.name.trim().toLocaleLowerCase()));
  return new Set([
    ...experience.filter(e => !e.gap_reason).flatMap(e => e.technologies),
    ...projects.filter(p => p.show_on_cv !== false).flatMap(p => p.technologies),
  ].map(s => s.trim().toLocaleLowerCase()).filter(s => s && !existing.has(s)));
}

/** A numeric guard, not a factual verifier: new claims without numbers still
 * require human review. Preserve source numbers rather than guessing metrics. */
export function preservesNumbers(candidate: string, source: string): boolean {
  const tokens = (s: string) => s.match(/\d+(?:[.,]\d+)*(?:%|[kKmMbB]\b)?/g) || [];
  const supplied = new Set(tokens(source));
  return tokens(candidate).every(n => supplied.has(n));
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeATSAnalysis(
  value: unknown, experience: CVExperience[], skills: CVSkill[],
  projects: CVProject[] = [], sourceText = '',
): ATSGapAnalysis {
  if (!record(value) || typeof value.score !== 'number' || !Number.isFinite(value.score)) {
    throw new Error('AI returned an incomplete analysis. Please try again.');
  }
  const supported = supportedSkillNames(experience, projects, skills);
  const matched = stringList(value.matched_keywords);
  const matchedSet = new Set(matched.map(s => s.toLocaleLowerCase()));
  const changes: ATSGapAnalysis['achievements_to_enhance'] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value.achievements_to_enhance) ? value.achievements_to_enhance : []) {
    if (!record(item) || typeof item.experience_id !== 'string' || typeof item.current !== 'string' || typeof item.suggested !== 'string') continue;
    const exp = experience.find(e => e.id === item.experience_id && !e.gap_reason);
    const key = JSON.stringify([item.experience_id, item.current]);
    if (!exp?.achievements.includes(item.current) || !item.suggested.trim() || seen.has(key)) continue;
    if (!preservesNumbers(item.suggested, item.current)) continue;
    seen.add(key);
    changes.push({ experience_id: item.experience_id, current: item.current, suggested: item.suggested.trim() });
  }
  const gaps: ATSGapAnalysis['gaps'] = [];
  for (const item of Array.isArray(value.gaps) ? value.gaps : []) {
    if (!record(item) || typeof item.area !== 'string' || typeof item.description !== 'string' || typeof item.fix !== 'string') continue;
    const severity = item.severity === 'critical' || item.severity === 'important' ? item.severity : 'nice_to_have';
    gaps.push({ area: item.area, description: item.description, fix: item.fix, severity });
  }
  const summary = typeof value.summary_rewrite === 'string' ? value.summary_rewrite.trim() : '';
  return {
    score: Math.max(0, Math.min(100, Math.round(value.score))),
    matched_keywords: matched,
    missing_keywords: stringList(value.missing_keywords).filter(s => !matchedSet.has(s.toLocaleLowerCase())),
    strengths: stringList(value.strengths), suggestions: stringList(value.suggestions), gaps,
    summary_rewrite: preservesNumbers(summary, sourceText) ? summary : '',
    skills_to_add: stringList(value.skills_to_add).filter(s => supported.has(s.toLocaleLowerCase())),
    achievements_to_enhance: changes,
  };
}
