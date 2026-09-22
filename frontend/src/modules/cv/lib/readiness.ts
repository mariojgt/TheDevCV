import type { CVProfile, CVExperience } from '../types';

export interface ReadinessFinding {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  location: string;
}

/** Validate the editor's YYYY-MM / YYYY-MM-DD dates without timezone shifts. */
function monthIndex(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3] || 1);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return year * 12 + month - 1;
}

export function checkCVReadiness(profile: Partial<CVProfile>, experience: CVExperience[], now = new Date()): ReadinessFinding[] {
  const out: ReadinessFinding[] = [];
  if (!profile.full_name?.trim()) out.push({ id: 'contact-name', severity: 'error', title: 'Add your name', detail: 'Use the name you want employers to see at the top of your CV.', location: 'Contact' });
  if (profile.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) out.push({ id: 'contact-email-format', severity: 'error', title: 'Check your email address', detail: 'Enter a complete email address so recruiters can contact you.', location: 'Contact' });
  const placeholder = /\[(?:insert|add|your|company|metric|x%|number)\b[^\]]*\]|\b(?:TODO|TBD|lorem ipsum)\b/i;
  if (placeholder.test(profile.summary || '')) out.push({ id: 'summary-placeholder', severity: 'error', title: 'Replace summary placeholders', detail: 'Remove draft instructions and add only facts you can verify.', location: 'Summary' });
  experience.forEach((exp, i) => {
    const location = `Experience · ${exp.company || exp.role || `entry ${i + 1}`}`;
    const add = (id: string, title: string, detail: string, severity: ReadinessFinding['severity'] = 'error') => out.push({ id: `readiness-${i}-${id}`, title, detail, location, severity });
    if (!exp.role.trim() || (!exp.gap_reason && !exp.company.trim())) add('identity', 'Complete the role and employer', 'Each job needs a role title and employer. A career break only needs its label.');
    const start = monthIndex(exp.start_date);
    const end = monthIndex(exp.end_date);
    if (start === null) add('start', 'Check the start date', 'Choose a valid month and year for this entry.');
    if (!exp.is_current && end === null) add('end', 'Check the end date', 'Add the end month and year, or mark the entry as current if it is ongoing.');
    if (start !== null && end !== null && !exp.is_current && end < start) add('date-order', 'End date is before start date', 'Correct the date range before submitting.');
    if (start !== null && start > now.getFullYear() * 12 + now.getMonth()) add('future', 'Start date is in the future', 'Check the date and clearly identify an incoming role if intentional.', 'warning');
    if (exp.is_current && exp.end_date) add('current-end', 'Current role also has an end date', 'Clear the end date or mark this as a completed role.', 'warning');
    const seen = new Set<string>();
    exp.achievements.forEach((text, j) => {
      const key = text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
      if (key && seen.has(key)) add(`duplicate-${j}`, 'Repeated achievement', 'Remove the duplicate or describe a different contribution.', 'warning');
      seen.add(key);
    });
    if ([exp.description || '', ...exp.achievements].some(t => placeholder.test(t))) add('placeholder', 'Replace draft placeholders', 'Remove draft instructions; use a qualitative result when a metric is unknown.');
  });
  return out;
}
