import jsPDF from 'jspdf';
import type {
  CVProfile, CVExperience, CVEducation, CVSkill,
  CVCertification, CVProject, CVLanguage,
} from '../types';

/**
 * ATS-safe PDF generator.
 *
 * Every template renders via the same pipeline: selectable vector text, single
 * column body, standard fonts (helvetica or times), plain disc bullets, no
 * tables / floats / background fills / unicode icons / pills / dots.
 *
 * ATS parsers read top-to-bottom, left-to-right. We never put two text blocks
 * on the same horizontal line within the body, we keep dates/locations inline
 * with the role heading, and every section is announced by a standard uppercase
 * heading.
 *
 * Style-only knobs (accent colour, font, heading decoration) vary between the
 * four templates — the underlying structure is identical so every preset is
 * equally parseable.
 */

// ── Page geometry (mm) ───────────────────────
const PW = 210;
const PH = 297;
const DEFAULT_ML = 14;
const DEFAULT_MR = 14;
const DEFAULT_MT = 14;
const DEFAULT_MB = 14;

// ── Colour palette ───────────────────────────
const BLACK: RGB = [20, 20, 20];
const BODY:  RGB = [60, 60, 60];
const MUTED: RGB = [120, 120, 120];
const RULE:  RGB = [200, 200, 200];

type RGB = [number, number, number];

export interface PDFStyle {
  id: 'classic' | 'modern' | 'minimal' | 'professional' | 'executive' | 'corporate' | 'neo' | 'neo-dark';
  baseFont: 'helvetica' | 'times';
  accent: RGB;
  /** How section titles are drawn. */
  headingStyle: 'underline-accent' | 'underline-gray' | 'tracked-caps' | 'labeled-rule' | 'serif-accent' | 'double-rule';
  /** Lead paragraph (summary) treatment. */
  summaryItalic?: boolean;
  /** Draw a vertical accent bar to the left of the name block. */
  nameBar?: boolean;
  /** Render the name in the accent colour. */
  nameAccent?: boolean;
  /** Render the name in uppercase. */
  nameUppercase?: boolean;
  /** Fill each page with this background colour (dark templates). */
  pageBg?: RGB;
  /** Override default body text colour (for dark templates). */
  bodyText?: RGB;
}

const STYLES: Record<PDFStyle['id'], PDFStyle> = {
  classic:      { id: 'classic',      baseFont: 'helvetica', accent: [40, 40, 40],   headingStyle: 'underline-gray'   },
  modern:       { id: 'modern',       baseFont: 'helvetica', accent: [37, 99, 235],  headingStyle: 'underline-accent' },
  minimal:      { id: 'minimal',      baseFont: 'times',     accent: [150, 150, 150], headingStyle: 'tracked-caps',     summaryItalic: true },
  professional: { id: 'professional', baseFont: 'helvetica', accent: [26, 26, 26],   headingStyle: 'labeled-rule'     },
  executive:    { id: 'executive',    baseFont: 'times',     accent: [30, 78, 140],  headingStyle: 'serif-accent',     nameBar: true,  nameAccent: true },
  corporate:    { id: 'corporate',    baseFont: 'helvetica', accent: [37, 99, 235],  headingStyle: 'double-rule',      nameAccent: true, nameUppercase: true },
  neo:          { id: 'neo',          baseFont: 'helvetica', accent: [13, 150, 104], headingStyle: 'underline-accent', nameUppercase: true },
  'neo-dark':   { id: 'neo-dark',     baseFont: 'helvetica', accent: [43, 184, 133], headingStyle: 'underline-accent', nameUppercase: true, pageBg: [12, 18, 34], bodyText: [200, 214, 232] },
};

interface CVData {
  profile: CVProfile;
  experience: CVExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  certifications: CVCertification[];
  projects: CVProject[];
  languages: CVLanguage[];
}

// ── Cursor state threaded through every helper ────────────────────
interface Ctx {
  doc: jsPDF;
  style: PDFStyle;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  cw: number;    // content width
  y: number;     // current vertical cursor
  bodyRgb: RGB;  // body text — overridden for dark templates
}

function newPage(ctx: Ctx) {
  ctx.doc.addPage();
  if (ctx.style.pageBg) {
    const [r, g, b] = ctx.style.pageBg;
    ctx.doc.setFillColor(r, g, b);
    ctx.doc.rect(0, 0, PW, PH, 'F');
  }
  ctx.y = ctx.mt;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y + needed > PH - ctx.mb) newPage(ctx);
}

function setFont(ctx: Ctx, weight: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number) {
  ctx.doc.setFont(ctx.style.baseFont, weight);
  ctx.doc.setFontSize(size);
}

function setColor(ctx: Ctx, rgb: RGB) {
  ctx.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function writeLines(ctx: Ctx, lines: string[], x: number, lineHeight: number) {
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    ctx.doc.text(line, x, ctx.y);
    ctx.y += lineHeight;
  }
}

// ── Header (name, contact line) ───────────────────────────────────
function renderHeader(ctx: Ctx, data: CVData) {
  const { profile } = data;

  // Executive: record the top edge so we can draw a vertical accent bar that
  // spans the whole header (name + title + contact + links) once we're done.
  const barTop = ctx.y - 1;
  const textX = ctx.style.nameBar ? ctx.ml + 4 : ctx.ml;

  const nameSize = ctx.style.id === 'minimal' ? 20 : ctx.style.nameUppercase ? 20 : 18;
  setFont(ctx, 'bold', nameSize);
  setColor(ctx, ctx.style.nameAccent ? ctx.style.accent : BLACK);
  const rawName = (profile.full_name || '').trim();
  const name = ctx.style.nameUppercase ? rawName.toUpperCase() : rawName;
  if (name) {
    ctx.doc.text(name, textX, ctx.y);
    ctx.y += ctx.style.id === 'minimal' ? 7 : 6;
  }

  if (profile.job_title) {
    setFont(ctx, 'bold', 11);
    const titleColor = ctx.style.id === 'modern' || ctx.style.id === 'executive'
      ? ctx.style.accent
      : ctx.style.id === 'corporate'
        ? BLACK
        : MUTED;
    setColor(ctx, titleColor);
    const jobTitle = ctx.style.nameUppercase ? profile.job_title.toUpperCase() : profile.job_title;
    ctx.doc.text(jobTitle, textX, ctx.y);
    ctx.y += 5;
  }

  // Contact line — plain text, separated by " | ". ATS parses this reliably.
  const contactBits = [profile.email, profile.phone, profile.location].filter(Boolean) as string[];
  if (contactBits.length) {
    setFont(ctx, 'normal', 8.5);
    setColor(ctx, ctx.bodyRgb);
    const line = contactBits.join('  |  ');
    ctx.doc.text(line, textX, ctx.y);
    ctx.y += 4;
  }

  // Links — separate line, clickable, printed as plain URL text.
  const links = [profile.linkedin, profile.github, profile.website, profile.portfolio]
    .filter((l): l is string => Boolean(l && l.trim()));
  if (links.length) {
    setFont(ctx, 'normal', 8.5);
    setColor(ctx, ctx.style.accent);
    let x = textX;
    for (let i = 0; i < links.length; i++) {
      if (i > 0) {
        setColor(ctx, MUTED);
        ctx.doc.text('  |  ', x, ctx.y);
        x += ctx.doc.getTextWidth('  |  ');
        setColor(ctx, ctx.style.accent);
      }
      const display = links[i].replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      const url = links[i].startsWith('http') ? links[i] : `https://${links[i]}`;
      ctx.doc.textWithLink(display, x, ctx.y, { url });
      x += ctx.doc.getTextWidth(display);
    }
    ctx.y += 4;
  }

  // Executive: draw the vertical accent bar spanning the whole header.
  if (ctx.style.nameBar) {
    const barBottom = ctx.y - 1;
    ctx.doc.setFillColor(ctx.style.accent[0], ctx.style.accent[1], ctx.style.accent[2]);
    ctx.doc.rect(ctx.ml, barTop, 1.5, barBottom - barTop, 'F');
  }

  ctx.y += 2;

  // Top rule — skipped for styles that paint their own heading rules
  // (double-rule draws accent rules around each heading; serif-accent uses
  // pure typography for separation).
  if (ctx.style.headingStyle === 'double-rule' || ctx.style.headingStyle === 'serif-accent') {
    ctx.y += 3;
    return;
  }
  if (ctx.style.headingStyle === 'underline-accent') {
    ctx.doc.setDrawColor(ctx.style.accent[0], ctx.style.accent[1], ctx.style.accent[2]);
    ctx.doc.setLineWidth(0.6);
  } else {
    ctx.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    ctx.doc.setLineWidth(0.3);
  }
  ctx.doc.line(ctx.ml, ctx.y, PW - ctx.mr, ctx.y);
  ctx.y += 5;
}

// ── Section heading (style-dependent) ─────────────────────────────
function renderHeading(ctx: Ctx, text: string) {
  ensureSpace(ctx, 10);
  ctx.y += 2;
  const upper = text.toUpperCase();

  switch (ctx.style.headingStyle) {
    case 'underline-accent':
    case 'underline-gray': {
      setFont(ctx, 'bold', 10);
      setColor(ctx, BLACK);
      ctx.doc.text(upper, ctx.ml, ctx.y);
      ctx.y += 1.4;
      const [r, g, b] = ctx.style.headingStyle === 'underline-accent' ? ctx.style.accent : RULE;
      ctx.doc.setDrawColor(r, g, b);
      ctx.doc.setLineWidth(ctx.style.headingStyle === 'underline-accent' ? 0.5 : 0.25);
      ctx.doc.line(ctx.ml, ctx.y, PW - ctx.mr, ctx.y);
      ctx.y += 4;
      break;
    }
    case 'tracked-caps': {
      // Minimal: small tracked label, no rule.
      setFont(ctx, 'normal', 8);
      setColor(ctx, MUTED);
      ctx.doc.text(upper.split('').join(' '), ctx.ml, ctx.y); // fake letter-spacing
      ctx.y += 4.5;
      break;
    }
    case 'labeled-rule': {
      // Professional: tiny label, rule extends to right margin.
      setFont(ctx, 'bold', 8);
      setColor(ctx, MUTED);
      ctx.doc.text(upper, ctx.ml, ctx.y);
      const labelW = ctx.doc.getTextWidth(upper);
      ctx.doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      ctx.doc.setLineWidth(0.2);
      ctx.doc.line(ctx.ml + labelW + 3, ctx.y - 1, PW - ctx.mr, ctx.y - 1);
      ctx.y += 4;
      break;
    }
    case 'serif-accent': {
      // Executive: large serif title in accent colour, title-case, no rule.
      setFont(ctx, 'bold', 13);
      setColor(ctx, ctx.style.accent);
      ctx.doc.text(toTitleCase(text), ctx.ml, ctx.y);
      ctx.y += 5.5;
      break;
    }
    case 'double-rule': {
      // Corporate: uppercase accent title bracketed by thin accent rules above
      // and below — the signature of the Herman Walton-style layout.
      const [r, g, b] = ctx.style.accent;
      ctx.doc.setDrawColor(r, g, b);
      ctx.doc.setLineWidth(0.3);
      ctx.doc.line(ctx.ml, ctx.y - 1, PW - ctx.mr, ctx.y - 1);
      ctx.y += 3;
      setFont(ctx, 'bold', 10);
      setColor(ctx, ctx.style.accent);
      ctx.doc.text(upper, ctx.ml, ctx.y);
      ctx.y += 1.5;
      ctx.doc.line(ctx.ml, ctx.y, PW - ctx.mr, ctx.y);
      ctx.y += 4;
      break;
    }
  }
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Summary paragraph ─────────────────────────────────────────────
function renderSummary(ctx: Ctx, data: CVData) {
  if (!data.profile.summary?.trim()) return;
  renderHeading(ctx, 'Professional Summary');
  setFont(ctx, ctx.style.summaryItalic ? 'italic' : 'normal', 9);
  setColor(ctx, ctx.bodyRgb);
  const lines = ctx.doc.splitTextToSize(data.profile.summary.trim(), ctx.cw);
  writeLines(ctx, lines, ctx.ml, 4);
  ctx.y += 1;
}

// ── Experience ────────────────────────────────────────────────────
function renderExperience(ctx: Ctx, data: CVData) {
  if (!data.experience.length) return;
  renderHeading(ctx, 'Work Experience');

  for (const exp of data.experience) {
    ensureSpace(ctx, 12);

    // Role + company (bold) on one line, dates on the same line right-aligned.
    // ATS parses "Role, Company" as the job title and picks the date range.
    const roleLine = `${exp.role}${exp.company ? ', ' + exp.company : ''}`;
    const dateLine = `${exp.start_date || ''}${exp.start_date || exp.end_date || exp.is_current ? ' — ' : ''}${exp.is_current ? 'Present' : (exp.end_date || '')}`;

    setFont(ctx, 'bold', 10);
    setColor(ctx, BLACK);
    // Truncate role line so the date line fits on the right.
    const dateW = dateLine ? ctx.doc.getTextWidth(dateLine) + 4 : 0;
    const roleLines = ctx.doc.splitTextToSize(roleLine, ctx.cw - dateW);
    ctx.doc.text(roleLines[0] || '', ctx.ml, ctx.y);

    if (dateLine.trim() && dateLine !== ' — ') {
      setFont(ctx, 'normal', 8.5);
      setColor(ctx, MUTED);
      ctx.doc.text(dateLine, PW - ctx.mr, ctx.y, { align: 'right' });
    }
    ctx.y += 4.5;

    // Location (inline, never floated).
    if (exp.location) {
      setFont(ctx, 'italic', 8.5);
      setColor(ctx, MUTED);
      ctx.doc.text(exp.location, ctx.ml, ctx.y);
      ctx.y += 4;
    }

    // Achievement bullets — plain disc, indent 4mm.
    for (const ach of exp.achievements) {
      const bulletLines = ctx.doc.splitTextToSize(ach, ctx.cw - 4);
      ensureSpace(ctx, bulletLines.length * 3.6 + 1);
      setFont(ctx, 'normal', 9);
      setColor(ctx, ctx.bodyRgb);
      ctx.doc.text('•', ctx.ml, ctx.y);
      ctx.doc.text(bulletLines, ctx.ml + 4, ctx.y);
      ctx.y += bulletLines.length * 3.6 + 0.6;
    }

    // Tech stack on its own line, labelled.
    if (exp.technologies.length) {
      ensureSpace(ctx, 4);
      setFont(ctx, 'bold', 8.5);
      setColor(ctx, BLACK);
      const label = 'Tech: ';
      ctx.doc.text(label, ctx.ml, ctx.y);
      const labelW = ctx.doc.getTextWidth(label);
      setFont(ctx, 'normal', 8.5);
      setColor(ctx, ctx.bodyRgb);
      const techLines = ctx.doc.splitTextToSize(exp.technologies.join(', '), ctx.cw - labelW);
      ctx.doc.text(techLines[0] || '', ctx.ml + labelW, ctx.y);
      ctx.y += 3.6;
      if (techLines.length > 1) {
        writeLines(ctx, techLines.slice(1), ctx.ml, 3.6);
      }
    }

    ctx.y += 3;
  }
}

// ── Education ─────────────────────────────────────────────────────
function renderEducation(ctx: Ctx, data: CVData) {
  if (!data.education.length) return;
  renderHeading(ctx, 'Education');

  for (const edu of data.education) {
    ensureSpace(ctx, 6);
    const title = `${edu.degree || ''}${edu.field ? ' in ' + edu.field : ''}${edu.institution ? ', ' + edu.institution : ''}`;
    const dateStr = edu.end_date || edu.start_date || '';
    const dateW = dateStr ? 28 : 0;

    setFont(ctx, 'bold', 9.5);
    setColor(ctx, BLACK);
    const lines = ctx.doc.splitTextToSize(title, ctx.cw - dateW);
    ctx.doc.text(lines[0] || '', ctx.ml, ctx.y);

    if (dateStr) {
      setFont(ctx, 'normal', 8.5);
      setColor(ctx, MUTED);
      ctx.doc.text(dateStr, PW - ctx.mr, ctx.y, { align: 'right' });
    }
    ctx.y += 4;

    if (edu.grade) {
      setFont(ctx, 'italic', 8.5);
      setColor(ctx, MUTED);
      ctx.doc.text(`Grade: ${edu.grade}`, ctx.ml, ctx.y);
      ctx.y += 3.6;
    }
    if (edu.location) {
      setFont(ctx, 'italic', 8.5);
      setColor(ctx, MUTED);
      ctx.doc.text(edu.location, ctx.ml, ctx.y);
      ctx.y += 3.6;
    }
    ctx.y += 1.5;
  }
}

// ── Skills (single column, grouped by category) ───────────────────
function renderSkills(ctx: Ctx, data: CVData) {
  if (!data.skills.length) return;
  renderHeading(ctx, 'Skills');

  const grouped = data.skills.reduce((acc, s) => {
    const k = s.category || 'Other';
    (acc[k] = acc[k] || []).push(s);
    return acc;
  }, {} as Record<string, CVSkill[]>);

  for (const [cat, items] of Object.entries(grouped)) {
    ensureSpace(ctx, 4);
    const label = `${cat}: `;
    setFont(ctx, 'bold', 9);
    setColor(ctx, BLACK);
    ctx.doc.text(label, ctx.ml, ctx.y);
    const labelW = ctx.doc.getTextWidth(label);

    setFont(ctx, 'normal', 9);
    setColor(ctx, ctx.bodyRgb);
    const names = items.map((s) => s.name).join(', ');
    const lines = ctx.doc.splitTextToSize(names, ctx.cw - labelW);
    ctx.doc.text(lines[0] || '', ctx.ml + labelW, ctx.y);
    ctx.y += 3.8;
    if (lines.length > 1) {
      writeLines(ctx, lines.slice(1), ctx.ml, 3.8);
    }
  }
  ctx.y += 1;
}

// ── Projects ──────────────────────────────────────────────────────
function renderProjects(ctx: Ctx, data: CVData) {
  if (!data.projects.length) return;
  renderHeading(ctx, 'Projects');

  for (const p of data.projects) {
    ensureSpace(ctx, 6);
    setFont(ctx, 'bold', 9.5);
    setColor(ctx, BLACK);
    ctx.doc.text(p.name, ctx.ml, ctx.y);
    const nameW = ctx.doc.getTextWidth(p.name);

    if (p.url) {
      const display = p.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      setFont(ctx, 'normal', 8);
      setColor(ctx, ctx.style.accent);
      ctx.doc.textWithLink(`  —  ${display}`, ctx.ml + nameW, ctx.y, {
        url: p.url.startsWith('http') ? p.url : `https://${p.url}`,
      });
    }
    ctx.y += 4;

    if (p.description) {
      setFont(ctx, 'normal', 9);
      setColor(ctx, ctx.bodyRgb);
      const lines = ctx.doc.splitTextToSize(p.description, ctx.cw);
      writeLines(ctx, lines, ctx.ml, 3.6);
    }
    for (const h of p.highlights || []) {
      const bl = ctx.doc.splitTextToSize(h, ctx.cw - 4);
      ensureSpace(ctx, bl.length * 3.6);
      setFont(ctx, 'normal', 9);
      setColor(ctx, ctx.bodyRgb);
      ctx.doc.text('•', ctx.ml, ctx.y);
      ctx.doc.text(bl, ctx.ml + 4, ctx.y);
      ctx.y += bl.length * 3.6;
    }
    if (p.technologies.length) {
      setFont(ctx, 'bold', 8.5);
      setColor(ctx, BLACK);
      ctx.doc.text('Tech: ', ctx.ml, ctx.y);
      const lw = ctx.doc.getTextWidth('Tech: ');
      setFont(ctx, 'normal', 8.5);
      setColor(ctx, ctx.bodyRgb);
      const techLines = ctx.doc.splitTextToSize(p.technologies.join(', '), ctx.cw - lw);
      ctx.doc.text(techLines[0] || '', ctx.ml + lw, ctx.y);
      ctx.y += 3.6;
      if (techLines.length > 1) writeLines(ctx, techLines.slice(1), ctx.ml, 3.6);
    }
    ctx.y += 2;
  }
}

// ── Certifications ────────────────────────────────────────────────
function renderCertifications(ctx: Ctx, data: CVData) {
  if (!data.certifications.length) return;
  renderHeading(ctx, 'Certifications');

  for (const c of data.certifications) {
    ensureSpace(ctx, 4);
    setFont(ctx, 'bold', 9);
    setColor(ctx, BLACK);
    const line = `${c.name}${c.issuer ? ', ' + c.issuer : ''}${c.date_obtained ? ' — ' + c.date_obtained : ''}`;
    const lines = ctx.doc.splitTextToSize(line, ctx.cw);
    writeLines(ctx, lines, ctx.ml, 3.8);
  }
  ctx.y += 1;
}

// ── Languages ─────────────────────────────────────────────────────
function renderLanguages(ctx: Ctx, data: CVData) {
  if (!data.languages.length) return;
  renderHeading(ctx, 'Languages');
  setFont(ctx, 'normal', 9);
  setColor(ctx, ctx.bodyRgb);

  // Single line, comma separated: "English (Native), Spanish (Fluent)"
  const line = data.languages
    .map((l) => `${l.language} (${capitalize(l.proficiency)})`)
    .join(', ');
  const lines = ctx.doc.splitTextToSize(line, ctx.cw);
  writeLines(ctx, lines, ctx.ml, 3.8);
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Main entry: render a CV using the chosen style ────────────────
function renderATSPdf(data: CVData, style: PDFStyle) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // Fill page background for dark templates.
  if (style.pageBg) {
    const [r, g, b] = style.pageBg;
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, PW, PH, 'F');
  }
  doc.setProperties({
    title: `${data.profile.full_name || 'CV'} — CV`,
    author: data.profile.full_name || '',
    subject: data.profile.job_title || 'Curriculum Vitae',
    creator: 'The Dev CV',
  });

  const ctx: Ctx = {
    doc,
    style,
    ml: DEFAULT_ML,
    mr: DEFAULT_MR,
    mt: DEFAULT_MT,
    mb: DEFAULT_MB,
    cw: PW - DEFAULT_ML - DEFAULT_MR,
    y:  DEFAULT_MT,
    bodyRgb: style.bodyText ?? BODY,
  };

  renderHeader(ctx, data);
  renderSummary(ctx, data);
  // Entry-level: lead with Education to highlight academic background + capstone
  // before limited work history (resume-builder skill guidance).
  const eduFirst = data.profile.career_stage === 'entry_level';
  if (eduFirst) {
    renderEducation(ctx, data);
    renderExperience(ctx, data);
  } else {
    renderExperience(ctx, data);
    renderEducation(ctx, data);
  }
  renderSkills(ctx, data);
  renderProjects(ctx, data);
  renderCertifications(ctx, data);
  renderLanguages(ctx, data);

  const filename = `${data.profile.full_name || 'CV'}.pdf`.replace(/[^\w\s.\-]/g, '_');
  doc.save(filename);
}

// ── Public API — one generator per template preset ────────────────

export function generateClassicPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.classic);
}

export function generateModernPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.modern);
}

export function generateMinimalPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.minimal);
}

export function generateProfessionalPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.professional);
}

export function generateExecutivePDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.executive);
}

export function generateCorporatePDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.corporate);
}

export function generateNeoPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES.neo);
}

export function generateNeoDarkPDF(profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[], certifications: CVCertification[], projects: CVProject[], languages: CVLanguage[]) {
  renderATSPdf({ profile, experience, education, skills, certifications, projects, languages }, STYLES['neo-dark']);
}
