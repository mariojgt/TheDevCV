import type {
  CVProfile, CVExperience, CVEducation, CVSkill,
  CVCertification, CVProject, CVLanguage,
} from '../types';
import { mdToPlain } from './markdown';

/**
 * Plain-text (.txt) ATS-safe export — pure ASCII, no tables, no Unicode
 * bullets. Purpose is validation: users can paste the output into free
 * scanners (Jobscan, Resume Worded) to see exactly what a real ATS parser
 * extracts, independent of our in-app ATS score.
 */

function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  isCurrent = false,
): string {
  const s = (start ?? '').trim();
  const e = isCurrent ? 'Present' : (end ?? '').trim();
  if (s && e) return `${s} - ${e}`;
  return s || e || '';
}

function pushSection(lines: string[], title: string): void {
  lines.push('');
  lines.push(title.toUpperCase());
  lines.push('-'.repeat(title.length));
}

export function toPlainText(
  profile: CVProfile,
  experience: CVExperience[],
  education: CVEducation[],
  skills: CVSkill[],
  certifications: CVCertification[],
  projects: CVProject[],
  languages: CVLanguage[],
): string {
  const lines: string[] = [];

  if (profile.full_name) lines.push(profile.full_name.toUpperCase());
  if (profile.job_title) lines.push(profile.job_title);

  const contact = [profile.location, profile.email, profile.phone, profile.website].filter(Boolean);
  if (contact.length)    lines.push(contact.join(' | '));
  if (profile.linkedin)  lines.push(`LinkedIn: ${profile.linkedin}`);
  if (profile.github)    lines.push(`GitHub: ${profile.github}`);
  if (profile.portfolio) lines.push(`Portfolio: ${profile.portfolio}`);

  // Areas of Experience (formerly "Skills") — moved above the Summary so an
  // ATS pasting the .txt sees domain keywords before marketing prose.
  if (skills.length) {
    pushSection(lines, 'Areas of Experience');
    const byCategory = new Map<string, string[]>();
    skills.forEach((s) => {
      const list = byCategory.get(s.category) ?? [];
      list.push(s.name);
      byCategory.set(s.category, list);
    });
    byCategory.forEach((names, category) => {
      lines.push(`${category}: ${names.join(', ')}`);
    });
  }

  if (profile.summary?.trim()) {
    pushSection(lines, 'Summary');
    lines.push(mdToPlain(profile.summary).trim());
  }

  if (experience.length) {
    pushSection(lines, 'Experience');
    experience.forEach((e) => {
      lines.push('');
      lines.push(`${e.role} - ${e.company}`);
      const meta = [e.location, formatDateRange(e.start_date, e.end_date, e.is_current)].filter(Boolean);
      if (meta.length) lines.push(meta.join(' | '));
      if (e.description?.trim()) lines.push(mdToPlain(e.description).trim());
      e.achievements.forEach((a) => {
        const plain = mdToPlain(a).trim();
        if (plain) lines.push(`- ${plain}`);
      });
      if (e.technologies.length) lines.push(`Technologies: ${e.technologies.join(', ')}`);
    });
  }

  if (education.length) {
    pushSection(lines, 'Education');
    education.forEach((ed) => {
      lines.push('');
      const degreePart = [ed.degree, ed.field].filter(Boolean).join(' in ');
      lines.push(degreePart ? `${degreePart} - ${ed.institution}` : ed.institution);
      const meta = [ed.location, formatDateRange(ed.start_date, ed.end_date)].filter(Boolean);
      if (meta.length) lines.push(meta.join(' | '));
      if (ed.grade) lines.push(`Grade: ${ed.grade}`);
      if (ed.description?.trim()) lines.push(mdToPlain(ed.description).trim());
    });
  }

  if (certifications.length) {
    pushSection(lines, 'Certifications');
    certifications.forEach((c) => {
      lines.push('');
      lines.push(c.issuer ? `${c.name} - ${c.issuer}` : c.name);
      const meta = [
        c.date_obtained,
        c.credential_id ? `ID: ${c.credential_id}` : '',
        c.url,
      ].filter(Boolean);
      if (meta.length) lines.push(meta.join(' | '));
    });
  }

  if (projects.length) {
    pushSection(lines, 'Projects');
    projects.forEach((p) => {
      lines.push('');
      lines.push(p.url ? `${p.name} - ${p.url}` : p.name);
      const range = formatDateRange(p.start_date, p.end_date);
      if (range) lines.push(range);
      const projDesc = (p.cv_description?.trim() || p.description?.trim()) || '';
      if (projDesc) lines.push(mdToPlain(projDesc).trim());
      p.highlights.forEach((h) => { if (h.trim()) lines.push(`- ${h.trim()}`); });
      if (p.technologies.length) lines.push(`Technologies: ${p.technologies.join(', ')}`);
    });
  }

  if (languages.length) {
    pushSection(lines, 'Languages');
    languages.forEach((l) => lines.push(`${l.language} - ${l.proficiency}`));
  }

  return lines.join('\n').replace(/[ \t]+$/gm, '') + '\n';
}

/** Trigger a browser download of the plain-text resume. */
export function downloadPlainText(text: string, filename = 'resume.txt') {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
