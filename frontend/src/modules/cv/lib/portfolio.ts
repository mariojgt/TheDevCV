/**
 * Portfolio builder — turns CV data into a single self-contained HTML file
 * that users can drop into a `<username>.github.io` repo to publish as their
 * portfolio site. No external CSS/JS, no build step, no framework — just
 * open-and-serve.
 *
 * Design language mirrors thedevrealm-neo: 3px borders, hard offset shadows,
 * squared corners, uppercase headings, dark navy/teal palette with a single
 * configurable accent colour.
 */
import type { CVProfile, CVExperience, CVProject, CVSkill } from '../types';
import { parseGitHubRepoUrl } from './ai';

// ─── Types & defaults ─────────────────────────────────────────────────────

export type PortfolioTheme = 'neo-brutalist';

export interface PortfolioConfig {
  theme: PortfolioTheme;
  accentColor: string;
  sections: {
    hero: boolean;
    projects: boolean;
    experience: boolean;
    skills: boolean;
    contact: boolean;
  };
  /** Overrides profile.summary as the hero tagline when set. */
  taglineOverride?: string;
  /** Optional avatar image URL — falls back to initials monogram when empty. */
  avatarUrl?: string;
  /** When true, fetches stars/language/topics from GitHub API for each project
   *  with a github.com URL. Uses unauthenticated public API (60 req/hr). */
  enhanceWithGithub: boolean;
  /** Toggles the "Built with TheDevCV" footer attribution. Default true; users
   *  who want a pristine artifact can opt out at zero cost. */
  showAttribution: boolean;
}

export interface PortfolioGithubDecoration {
  stars?: number;
  language?: string;
  topics?: string[];
}

export type PortfolioDecorations = Record<string, PortfolioGithubDecoration>;

export const DEFAULT_PORTFOLIO_CONFIG: PortfolioConfig = {
  theme: 'neo-brutalist',
  accentColor: '#0d9668',
  sections: { hero: true, projects: true, experience: true, skills: true, contact: true },
  enhanceWithGithub: false,
  showAttribution: true,
};

// ─── GitHub decoration fetch ──────────────────────────────────────────────

/**
 * For each project URL that points at a GitHub repo, fetch public metadata
 * (stars, primary language, topics). Fails soft — a single broken repo never
 * poisons the batch, and a hit rate-limit just returns what we have so far.
 */
export async function fetchGithubDecorations(
  projects: CVProject[],
): Promise<PortfolioDecorations> {
  const result: PortfolioDecorations = {};
  const targets = projects
    .map(p => ({ url: p.url, repo: parseGitHubRepoUrl(p.url || '') }))
    .filter((x): x is { url: string; repo: { owner: string; repo: string } } => !!x.url && !!x.repo);

  await Promise.all(targets.map(async ({ url, repo }) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) return;
      const meta = await r.json() as { stargazers_count?: number; language?: string | null; topics?: string[] };
      result[url] = {
        stars: meta.stargazers_count,
        language: meta.language ?? undefined,
        topics: meta.topics,
      };
    } catch { /* ignore */ }
  }));

  return result;
}

// ─── String helpers ───────────────────────────────────────────────────────

/** HTML-escape user text before interpolating into templates. */
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Safer version for href attributes — strips dangerous schemes. */
function escUrl(s: string | null | undefined): string {
  const v = String(s ?? '').trim();
  if (!v) return '';
  // Allow http(s), mailto, tel, and relative paths. Anything else → empty.
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return esc(v);
  return '';
}

/** URL-safe slug for filenames. "Mario Tarosso" → "mario-tarosso". */
export function slugifyName(name: string): string {
  return String(name || 'portfolio')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'portfolio';
}

/** "Mario Tarosso" → "MT"; fallback to first char or "?" */
function initialsOf(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Strip scheme + trailing slash so we can display a short "github.com/x/y" label. */
function stripProtocol(url: string): string {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Convert plain text with newlines into structured HTML:
 *   blank line → new `<p>`
 *   single newline → `<br>`
 * Every segment is HTML-escaped — this is NOT a markdown renderer, no tags
 * leak through. Empty string returns empty string. Used for hero tagline,
 * summary, and project descriptions after the "Beautify with AI" action has
 * optionally inserted paragraph breaks.
 */
function nl2html(text: string | null | undefined): string {
  const v = String(text ?? '').trim();
  if (!v) return '';
  return v
    .split(/\n{2,}/)
    .map(block => {
      const escaped = esc(block).replace(/\n/g, '<br>');
      return `<p>${escaped}</p>`;
    })
    .join('');
}

// ─── Section renderers ────────────────────────────────────────────────────

interface RenderCtx {
  profile: Partial<CVProfile>;
  experience: CVExperience[];
  projects: CVProject[];
  skills: CVSkill[];
  config: PortfolioConfig;
  decorations: PortfolioDecorations;
}

function renderHero({ profile, config }: RenderCtx): string {
  const name = esc(profile.full_name || 'Your Name');
  const role = esc(profile.target_role || profile.job_title || '');
  // Tagline honours paragraph breaks (blank line) so a "Beautify with AI"
  // multi-paragraph summary renders as distinct <p>s instead of a wall of
  // text with literal line breaks.
  const taglineHtml = nl2html(config.taglineOverride?.trim() || profile.summary || '');
  const initials = esc(initialsOf(profile.full_name || ''));

  const pills: string[] = [];
  if (profile.location) pills.push(`<span class="pill">${esc(profile.location)}</span>`);
  if (profile.email)    pills.push(`<a class="pill" href="mailto:${escUrl(profile.email)}">${esc(profile.email)}</a>`);
  if (profile.github)   pills.push(`<a class="pill" href="${escUrl(profile.github)}" rel="noopener" target="_blank">${esc(stripProtocol(profile.github))}</a>`);
  if (profile.linkedin) pills.push(`<a class="pill" href="${escUrl(profile.linkedin)}" rel="noopener" target="_blank">${esc(stripProtocol(profile.linkedin))}</a>`);
  if (profile.website)  pills.push(`<a class="pill" href="${escUrl(profile.website)}" rel="noopener" target="_blank">${esc(stripProtocol(profile.website))}</a>`);

  const avatar = config.avatarUrl
    ? `<img class="avatar-img" src="${escUrl(config.avatarUrl)}" alt="${name}" loading="lazy">`
    : `<div class="avatar-mono" aria-hidden="true">${initials}</div>`;

  return `
<section class="hero">
  <div class="hero-inner">
    ${avatar}
    <div class="hero-text">
      <div class="tag">Portfolio</div>
      <h1>${name}</h1>
      ${role ? `<h2>${role}</h2>` : ''}
      ${taglineHtml ? `<div class="tagline">${taglineHtml}</div>` : ''}
      ${pills.length ? `<div class="pills">${pills.join('')}</div>` : ''}
    </div>
  </div>
</section>`;
}

function renderProjects({ projects, decorations }: RenderCtx): string {
  if (!projects.length) return '';
  const cards = projects.map(p => {
    const dec = p.url ? decorations[p.url] : undefined;
    const tech = (p.technologies || []).slice(0, 8);
    const highlights = (p.highlights || []).filter(Boolean).slice(0, 3);
    const metaBits: string[] = [];
    if (dec?.stars != null)   metaBits.push(`<span class="meta-star">★ ${dec.stars.toLocaleString()}</span>`);
    if (dec?.language)        metaBits.push(`<span class="meta-lang">${esc(dec.language)}</span>`);

    return `
    <article class="card">
      <header class="card-h">
        <h3>${esc(p.name || 'Untitled project')}</h3>
        ${metaBits.length ? `<div class="card-meta">${metaBits.join('')}</div>` : ''}
      </header>
      ${p.description ? `<div class="card-desc">${nl2html(p.description)}</div>` : ''}
      ${highlights.length ? `<ul class="card-list">${highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${tech.length ? `<div class="chips">${tech.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      ${p.url ? `<a class="card-cta" href="${escUrl(p.url)}" rel="noopener" target="_blank">Open &rarr;</a>` : ''}
    </article>`;
  }).join('');

  return `
<section class="section" id="projects">
  <h2 class="section-title">Selected Projects</h2>
  <div class="grid">${cards}</div>
</section>`;
}

function renderExperience({ experience }: RenderCtx): string {
  if (!experience.length) return '';
  const rows = experience.map(e => {
    const dates = [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' – ');
    const bullets = (e.achievements || []).filter(Boolean).slice(0, 4);
    const tech = (e.technologies || []).slice(0, 8);
    return `
    <article class="exp">
      <div class="exp-side">
        <div class="exp-dates">${esc(dates)}</div>
      </div>
      <div class="exp-body">
        <h3>${esc(e.role || 'Role')}</h3>
        <div class="exp-company">${esc(e.company || '')}${e.location ? ` · ${esc(e.location)}` : ''}</div>
        ${bullets.length ? `<ul class="card-list">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        ${tech.length ? `<div class="chips">${tech.map(t => `<span class="chip chip-sm">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </article>`;
  }).join('');

  return `
<section class="section" id="experience">
  <h2 class="section-title">Experience</h2>
  <div class="exp-list">${rows}</div>
</section>`;
}

function renderSkills({ skills }: RenderCtx): string {
  if (!skills.length) return '';
  // Group by category, preserving insertion order.
  const groups = new Map<string, CVSkill[]>();
  for (const s of skills) {
    const cat = s.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(s);
  }
  const blocks = [...groups.entries()].map(([cat, items]) => `
    <div class="skill-group">
      <div class="skill-cat">${esc(cat)}</div>
      <div class="chips">${items.map(s => `<span class="chip">${esc(s.name)}</span>`).join('')}</div>
    </div>`).join('');
  return `
<section class="section" id="skills">
  <h2 class="section-title">Skills</h2>
  <div class="skills-grid">${blocks}</div>
</section>`;
}

function renderContact({ profile }: RenderCtx): string {
  if (!profile.email && !profile.linkedin && !profile.github) return '';
  const name = esc(profile.full_name || '');
  return `
<section class="section contact" id="contact">
  <h2 class="section-title">Get in touch</h2>
  <p class="contact-lead">Open to new opportunities${name ? ` — reach out any time.` : '.'}</p>
  <div class="contact-actions">
    ${profile.email ? `<a class="btn btn-primary" href="mailto:${escUrl(profile.email)}">Email me</a>` : ''}
    ${profile.linkedin ? `<a class="btn" href="${escUrl(profile.linkedin)}" rel="noopener" target="_blank">LinkedIn</a>` : ''}
    ${profile.github ? `<a class="btn" href="${escUrl(profile.github)}" rel="noopener" target="_blank">GitHub</a>` : ''}
  </div>
</section>`;
}

// ─── CSS (single theme: neo-brutalist) ────────────────────────────────────

function renderCss(accent: string): string {
  const safeAccent = /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '#0d9668';
  return `
:root {
  --bg:       #080d19;
  --surface:  #0c1222;
  --surface2: #121a2f;
  --border:   #3a506e;
  --text:     #e6ecf6;
  --muted:    #8aa0bf;
  --accent:   ${safeAccent};
  --accent2:  #e6930a;
  --shadow:   6px 6px 0 0 var(--border);
  --shadow-hover: 3px 3px 0 0 var(--accent);
  --maxw:     1100px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.55; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; }

.wrap { max-width: var(--maxw); margin: 0 auto; padding: 24px; }

/* ── Hero ── */
.hero { padding: 56px 24px 40px; border-bottom: 3px solid var(--border); background:
  repeating-linear-gradient(135deg, var(--surface) 0 24px, var(--bg) 24px 48px); }
.hero-inner { max-width: var(--maxw); margin: 0 auto; display: grid; grid-template-columns: 140px 1fr; gap: 24px; align-items: center; }
.avatar-mono, .avatar-img {
  width: 140px; height: 140px; border: 3px solid var(--border);
  background: var(--surface); box-shadow: var(--shadow);
  display: flex; align-items: center; justify-content: center;
  font-size: 48px; font-weight: 900; letter-spacing: 2px; color: var(--accent);
  object-fit: cover;
}
.tag { display: inline-block; padding: 4px 10px; border: 3px solid var(--border); background: var(--surface); color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; box-shadow: 3px 3px 0 0 var(--border); margin-bottom: 12px; }
h1 { margin: 0 0 4px; font-size: clamp(32px, 5vw, 56px); line-height: 1.05; text-transform: uppercase; letter-spacing: 1px; }
h2 { margin: 0 0 16px; font-size: clamp(16px, 2.2vw, 20px); color: var(--accent); text-transform: uppercase; letter-spacing: 2px; font-weight: 800; }
.tagline { max-width: 56ch; color: var(--muted); font-size: 15px; margin: 0 0 16px; }
.tagline p { margin: 0 0 10px; }
.tagline p:last-child { margin-bottom: 0; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; }
.pill {
  display: inline-block; padding: 5px 10px;
  border: 2px solid var(--border); background: var(--surface);
  font-size: 12px; color: var(--text); text-decoration: none;
  box-shadow: 3px 3px 0 0 var(--border); transition: transform .12s, box-shadow .12s;
}
.pill:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 0 var(--accent); text-decoration: none; color: var(--accent); }

/* ── Sections ── */
.section { padding: 56px 24px; max-width: var(--maxw); margin: 0 auto; }
.section-title {
  font-size: clamp(22px, 3vw, 30px); margin: 0 0 24px;
  text-transform: uppercase; letter-spacing: 2px;
  padding-bottom: 6px; border-bottom: 3px solid var(--border);
}

/* ── Project grid ── */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.card {
  border: 3px solid var(--border); background: var(--surface); padding: 18px;
  box-shadow: var(--shadow); transition: transform .12s, box-shadow .12s;
  display: flex; flex-direction: column; gap: 10px;
}
.card:hover { transform: translate(-2px,-2px); box-shadow: 8px 8px 0 0 var(--accent); }
.card-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.card h3 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: .5px; }
.card-meta { display: flex; gap: 8px; font-size: 11px; color: var(--muted); white-space: nowrap; }
.meta-star { color: var(--accent2); font-weight: 700; }
.meta-lang { color: var(--accent); font-weight: 700; }
.card-desc { margin: 0; font-size: 14px; color: var(--muted); }
.card-desc p { margin: 0 0 8px; }
.card-desc p:last-child { margin-bottom: 0; }
.card-list { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text); }
.card-list li { margin: 4px 0; }
.card-cta {
  align-self: flex-start; margin-top: 4px;
  padding: 6px 10px; border: 2px solid var(--accent); background: transparent;
  color: var(--accent); font-weight: 700; font-size: 12px;
  text-transform: uppercase; letter-spacing: 1px;
  box-shadow: 3px 3px 0 0 var(--border);
}
.card-cta:hover { background: var(--accent); color: var(--bg); text-decoration: none; }

/* ── Chips ── */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-block; padding: 3px 8px;
  border: 2px solid var(--border); background: var(--surface2);
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .5px; color: var(--muted);
}
.chip-sm { font-size: 10px; padding: 2px 6px; }

/* ── Experience timeline ── */
.exp-list { display: flex; flex-direction: column; gap: 16px; }
.exp {
  display: grid; grid-template-columns: 140px 1fr; gap: 16px;
  border: 3px solid var(--border); background: var(--surface); padding: 18px;
  box-shadow: var(--shadow);
}
.exp-side { border-right: 2px dashed var(--border); padding-right: 12px; }
.exp-dates { font-size: 12px; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
.exp-body h3 { margin: 0; font-size: 18px; text-transform: uppercase; }
.exp-company { color: var(--muted); font-size: 13px; margin-bottom: 8px; }

/* ── Skills ── */
.skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.skill-group { border: 3px solid var(--border); background: var(--surface); padding: 14px; box-shadow: var(--shadow); }
.skill-cat { font-size: 11px; font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }

/* ── Contact ── */
.contact { text-align: center; border-top: 3px solid var(--border); }
.contact-lead { color: var(--muted); margin-bottom: 18px; }
.contact-actions { display: inline-flex; flex-wrap: wrap; gap: 10px; }
.btn {
  display: inline-block; padding: 10px 18px;
  border: 3px solid var(--border); background: var(--surface);
  color: var(--text); font-weight: 800; font-size: 13px;
  text-transform: uppercase; letter-spacing: 2px;
  box-shadow: var(--shadow); transition: transform .12s, box-shadow .12s;
}
.btn:hover { transform: translate(-2px,-2px); box-shadow: 8px 8px 0 0 var(--accent); text-decoration: none; color: var(--accent); }
.btn-primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
.btn-primary:hover { color: var(--bg); box-shadow: 8px 8px 0 0 var(--border); }

/* ── Footer ── */
footer { text-align: center; padding: 30px 24px; border-top: 3px solid var(--border); color: var(--muted); font-size: 12px; }
footer a { color: var(--accent); }

/* ── Responsive ── */
@media (max-width: 720px) {
  .hero-inner { grid-template-columns: 1fr; text-align: center; }
  .avatar-mono, .avatar-img { margin: 0 auto; }
  .pills { justify-content: center; }
  .exp { grid-template-columns: 1fr; }
  .exp-side { border-right: 0; border-bottom: 2px dashed var(--border); padding-bottom: 8px; padding-right: 0; }
}
`;
}

// ─── Main template ────────────────────────────────────────────────────────

/**
 * Produce a single complete HTML document. Self-contained (inline CSS, no JS,
 * no external fonts) so it's drop-into-GitHub-Pages ready without any build.
 * The opening comment block is a mini deploy guide so a user who rediscovers
 * the file in 6 months knows what to do with it.
 */
export function generatePortfolioHtml(
  profile: Partial<CVProfile>,
  experience: CVExperience[],
  projects: CVProject[],
  skills: CVSkill[],
  config: PortfolioConfig,
  decorations: PortfolioDecorations = {},
): string {
  const ctx: RenderCtx = { profile, experience, projects, skills, config, decorations };
  const title = esc(`${profile.full_name || 'Portfolio'} — ${profile.target_role || profile.job_title || 'Portfolio'}`);
  const desc = esc(
    (config.taglineOverride?.trim() || profile.summary || '').slice(0, 160),
  );

  const body: string[] = [];
  if (config.sections.hero)       body.push(renderHero(ctx));
  if (config.sections.projects)   body.push(renderProjects(ctx));
  if (config.sections.experience) body.push(renderExperience(ctx));
  if (config.sections.skills)     body.push(renderSkills(ctx));
  if (config.sections.contact)    body.push(renderContact(ctx));

  const css = renderCss(config.accentColor);
  const deployComment = `
<!--
  ════════════════════════════════════════════════════════════════
  Your portfolio — host it free on GitHub Pages in 5 minutes:
  ════════════════════════════════════════════════════════════════
  1. Rename this file to   index.html
  2. Create a GitHub repo   <your-username>.github.io   (public)
  3. In that repo folder:   git init
  4.                        git add index.html
  5.                        git commit -m "initial portfolio"
  6.                        git branch -M main
  7.                        git remote add origin https://github.com/<your-username>/<your-username>.github.io.git
  8.                        git push -u origin main
  9. Visit   https://<your-username>.github.io   (give it ~60s)
  ════════════════════════════════════════════════════════════════
  Built with TheDevCV — https://cv.thedevrealm.com
-->`;

  return `<!DOCTYPE html>
<html lang="en">
<head>${deployComment}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${desc ? `<meta name="description" content="${desc}">` : ''}
<meta name="generator" content="TheDevCV Portfolio Builder">
<style>${css}</style>
</head>
<body>
<main>${body.join('\n')}</main>
${config.showAttribution !== false ? `<footer>
  <p>Built with <a href="https://cv.thedevrealm.com" rel="noopener" target="_blank">TheDevCV</a></p>
</footer>` : ''}
</body>
</html>`;
}

// ─── Download trigger ─────────────────────────────────────────────────────

/** Kick off a browser download of the given string as an HTML file. */
export function downloadPortfolioHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke a tick later so Safari doesn't choke.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
