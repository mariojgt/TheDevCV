import type { CVExperience } from '../types';

/**
 * Gap + short-tenure detection for the Experience timeline.
 *
 * Guidance source: "Next Job Now" podcast — "Is a resume gap ruining your
 * job search?" and "How to turn your layoff into a massive career advantage."
 * Both recommend explicit framing over concealment: label gaps, tag layoffs
 * that form a pattern (NOT isolated single short roles).
 */

// Parses the free-text dates used by the editor ("Jan 2022", "2022-03",
// "March 2022", "2022", "Present") into a Date at the first of the month.
// Returns null when the input is empty / unparseable so the caller can
// decide how to treat the row (we skip undateable rows for gap detection).
export function parseLooseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || /^present$|^current$/i.test(s)) return null;

  // ISO-ish: 2024-03 / 2024-03-15 / 2024
  const iso = s.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (iso) {
    const y = +iso[1];
    const m = iso[2] ? Math.max(1, Math.min(12, +iso[2])) : 1;
    const d = iso[3] ? Math.max(1, Math.min(28, +iso[3])) : 1;
    return new Date(y, m - 1, d);
  }

  // "Jan 2022" / "January 2022" / "Jan. 2022" — try native Date parse first,
  // then fall back to month-word + year extraction.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','sept','oct','nov','dec'];
  const lower = s.toLowerCase();
  const year = lower.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;
  const monthIdx = MONTHS.findIndex(m => lower.includes(m));
  return new Date(+year[0], monthIdx >= 0 ? Math.min(11, monthIdx) : 0, 1);
}

/** Whole months between two dates (b - a). Negative if b < a. */
export function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export interface DetectedGap {
  /** Index in the chronologically-sorted (newest first) experience array of
   *  the newer role flanking the gap. The older role is at `afterIndex + 1`. */
  afterIndex: number;
  /** End of the older role (gap start). */
  from: Date;
  /** Start of the newer role (gap end). */
  to: Date;
  /** Integer months in the gap. */
  months: number;
}

/**
 * Detects employment gaps ≥ `minMonths` between consecutive non-gap roles.
 * Ignores roles that are already tagged as gaps (gap_reason set) so inserting
 * a leave entry resolves its own hint. Currently-held roles don't contribute
 * to the newer edge of a gap since they have no end_date yet.
 *
 * Returns an empty array when there's nothing useful to say (0 or 1 roles,
 * or every gap is under the threshold).
 */
export function detectGaps(experience: CVExperience[], minMonths = 3): DetectedGap[] {
  const roles = experience
    .map((e, i) => ({
      e, i,
      start: parseLooseDate(e.start_date),
      end: e.is_current ? new Date() : parseLooseDate(e.end_date),
    }))
    .filter(r => !r.e.gap_reason && r.start)
    // Newest first — matches how the UI and rendering order them.
    .sort((a, b) => (b.start!.getTime() - a.start!.getTime()));

  const gaps: DetectedGap[] = [];
  for (let k = 0; k < roles.length - 1; k++) {
    const newer = roles[k];
    const older = roles[k + 1];
    const gapStart = older.end;           // when the older role ended
    const gapEnd   = newer.start;         // when the newer role began
    if (!gapStart || !gapEnd) continue;
    const months = monthsBetween(gapStart, gapEnd);
    if (months >= minMonths) {
      gaps.push({
        afterIndex: newer.i,
        from: gapStart,
        to: gapEnd,
        months,
      });
    }
  }
  return gaps;
}

/**
 * Flags sub-1-year roles that belong to a "pattern" — 2+ consecutive short
 * tenures. Used to decide whether the editor shows the "was this a layoff?"
 * nudge. A single short role alone is not flagged (podcast guidance).
 *
 * Returns a Set of original-array indexes (NOT chronological indexes) so the
 * caller can cheaply check `flaggedRoles.has(i)` when rendering each card.
 */
export function detectShortTenurePattern(
  experience: CVExperience[],
  maxMonths = 12,
  minRunLength = 2,
): Set<number> {
  const withDur = experience
    .map((e, i) => {
      if (e.gap_reason) return null;
      const start = parseLooseDate(e.start_date);
      const end   = e.is_current ? new Date() : parseLooseDate(e.end_date);
      if (!start || !end) return null;
      return { i, months: monthsBetween(start, end), start };
    })
    .filter((x): x is { i: number; months: number; start: Date } => x !== null)
    .sort((a, b) => b.start.getTime() - a.start.getTime()); // newest first

  const flagged = new Set<number>();
  let runStart = 0;
  while (runStart < withDur.length) {
    let runEnd = runStart;
    while (runEnd < withDur.length && withDur[runEnd].months > 0 && withDur[runEnd].months < maxMonths) {
      runEnd++;
    }
    const runLen = runEnd - runStart;
    if (runLen >= minRunLength) {
      for (let k = runStart; k < runEnd; k++) flagged.add(withDur[k].i);
    }
    runStart = Math.max(runEnd + 1, runStart + 1);
  }
  return flagged;
}

/** Year component of a date, or null when the date is unparseable. Used to
 *  render the "position ended in layoff, YYYY" note. */
export function yearOfEnd(exp: CVExperience): number | null {
  if (exp.is_current) return null;
  const d = parseLooseDate(exp.end_date);
  return d ? d.getFullYear() : null;
}

/**
 * Compose the polite layoff suffix the renderer appends to role line / dates
 * when the user has marked a role as `departure_reason = 'layoff'`. Returns
 * an empty string when departure_reason isn't layoff, so the caller can
 * unconditionally concat the result.
 */
export function layoffNote(exp: CVExperience): string {
  if (exp.departure_reason !== 'layoff') return '';
  const y = yearOfEnd(exp);
  return y ? ` (position ended in layoff, ${y})` : ' (position ended in layoff)';
}

/** Human-readable "8 months", "1 year 2 months" phrasing for the gap panel. */
export function formatMonths(n: number): string {
  if (n < 1) return 'under a month';
  if (n < 12) return `${n} month${n === 1 ? '' : 's'}`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  if (m === 0) return `${y} year${y === 1 ? '' : 's'}`;
  return `${y} year${y === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`;
}

/** "Mar 2024" — short-form month-year string for inserted gap entries. */
export function formatMonthYear(d: Date): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
