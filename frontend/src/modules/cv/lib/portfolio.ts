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
import { mdToHtml, mdToPlain } from './markdown';

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
  /** SPDX id (e.g. "MIT") or full license name. Surfaced as a small chip on
   *  open-source project cards when GitHub enhancement is enabled. */
  license?: string;
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
  // Prefer repo_url for open-source projects (canonical source link), fall
  // back to the live `url` so any project pointing at a github.com repo gets
  // decorated regardless of OSS flag. Decorations are keyed by the URL we
  // actually fetched so renderProjects can do the same lookup.
  const targets = projects
    .map(p => {
      const candidate = (p.is_open_source && p.repo_url) ? p.repo_url : (p.url || '');
      const repo = parseGitHubRepoUrl(candidate);
      return repo && candidate ? { url: candidate, repo } : null;
    })
    .filter((x): x is { url: string; repo: { owner: string; repo: string } } => !!x);

  await Promise.all(targets.map(async ({ url, repo }) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!r.ok) return;
      const meta = await r.json() as {
        stargazers_count?: number;
        language?: string | null;
        topics?: string[];
        license?: { spdx_id?: string | null; name?: string | null } | null;
      };
      result[url] = {
        stars: meta.stargazers_count,
        language: meta.language ?? undefined,
        topics: meta.topics,
        license: meta.license?.spdx_id || meta.license?.name || undefined,
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
 * Convert text with newlines into structured HTML, applying the limited
 * inline-markdown subset emitted by the editor (**bold**, *italic*, links).
 *   blank line → new `<p>`
 *   single newline → `<br>`
 * `mdToHtml` HTML-escapes the underlying text before inserting markup, so no
 * raw tags leak through. Used for hero tagline, summary, and project
 * descriptions.
 */
function nl2html(text: string | null | undefined): string {
  const v = String(text ?? '').trim();
  if (!v) return '';
  return v
    .split(/\n{2,}/)
    .map(block => {
      const lines = block.split('\n').map(line => mdToHtml(line));
      return `<p>${lines.join('<br>')}</p>`;
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
    // Decorations are keyed by whichever URL we used to fetch — repo_url for
    // OSS projects, otherwise live `url`. Mirror the same priority here.
    const decKey = (p.is_open_source && p.repo_url) ? p.repo_url : (p.url || '');
    const dec = decKey ? decorations[decKey] : undefined;
    const tech = (p.technologies || []).slice(0, 8);
    const highlights = (p.highlights || []).filter(Boolean).slice(0, 3);
    // Portfolio-specific description override falls back to the shared one.
    const desc = p.portfolio_description || p.description;
    const imageUrl = (p.image_url || '').trim();

    const metaBits: string[] = [];
    if (p.is_open_source)     metaBits.push(`<span class="meta-oss" aria-label="Open source project">OPEN SOURCE</span>`);
    if (dec?.stars != null)   metaBits.push(`<span class="meta-star">★ ${dec.stars.toLocaleString()}</span>`);
    if (dec?.language)        metaBits.push(`<span class="meta-lang">${esc(dec.language)}</span>`);
    if (dec?.license)         metaBits.push(`<span class="meta-license">${esc(dec.license)}</span>`);

    const ctas: string[] = [];
    if (p.url) {
      ctas.push(`<a class="card-cta" href="${escUrl(p.url)}" rel="noopener" target="_blank">Open &rarr;</a>`);
    }
    if (p.is_open_source && p.repo_url && p.repo_url !== p.url) {
      ctas.push(`<a class="card-cta card-cta-ghost" href="${escUrl(p.repo_url)}" rel="noopener" target="_blank">Source &rarr;</a>`);
    }

    // Cover image — sits above the header so it acts as a visual lead. Lazy-
    // loaded so a portfolio with 12 cards doesn't fire 12 simultaneous fetches
    // on first paint. alt text falls back to the project name for a11y.
    const imageBlock = imageUrl
      ? `<a class="card-img-wrap" href="${escUrl(p.url || imageUrl)}" rel="noopener" target="_blank" aria-label="${esc(p.name || 'Open project')}"><img class="card-img" src="${escUrl(imageUrl)}" alt="${esc(p.name || 'Project cover')}" loading="lazy"></a>`
      : '';

    return `
    <article class="card${imageUrl ? ' card-with-img' : ''}">
      ${imageBlock}
      <header class="card-h">
        <h3>${esc(p.name || 'Untitled project')}</h3>
        ${metaBits.length ? `<div class="card-meta">${metaBits.join('')}</div>` : ''}
      </header>
      ${desc ? `<div class="card-desc">${nl2html(desc)}</div>` : ''}
      ${highlights.length ? `<ul class="card-list">${highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${tech.length ? `<div class="chips">${tech.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
      ${ctas.length ? `<div class="card-ctas">${ctas.join('')}</div>` : ''}
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
        ${bullets.length ? `<ul class="card-list">${bullets.map(b => `<li>${mdToHtml(b)}</li>`).join('')}</ul>` : ''}
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
.card-with-img { padding: 0; }
.card-with-img .card-h, .card-with-img .card-desc, .card-with-img .card-list,
.card-with-img .chips, .card-with-img .card-ctas { padding-left: 18px; padding-right: 18px; }
.card-with-img .card-h { padding-top: 14px; }
.card-with-img .card-ctas { padding-bottom: 18px; }
.card-img-wrap {
  display: block; margin: 0; line-height: 0;
  border-bottom: 3px solid var(--border);
  background: var(--bg);
  overflow: hidden;
}
.card-img {
  display: block; width: 100%; height: auto;
  aspect-ratio: 16 / 9; object-fit: cover;
  transition: transform .25s ease;
}
.card-img-wrap:hover .card-img { transform: scale(1.03); }
.card-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.card h3 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: .5px; }
.card-meta { display: flex; gap: 6px; font-size: 11px; color: var(--muted); flex-wrap: wrap; align-items: center; }
.meta-star { color: var(--accent2); font-weight: 700; }
.meta-lang { color: var(--accent); font-weight: 700; }
.meta-oss {
  background: var(--accent); color: var(--bg);
  padding: 2px 7px; font-weight: 800; font-size: 10px;
  letter-spacing: 1.5px; border: 2px solid var(--accent);
  text-transform: uppercase; box-shadow: 2px 2px 0 0 var(--border);
}
.meta-license {
  padding: 2px 6px; border: 2px solid var(--border); background: var(--surface2);
  font-weight: 700; font-size: 10px; letter-spacing: .5px; color: var(--muted);
  text-transform: uppercase;
}
.card-desc { margin: 0; font-size: 14px; color: var(--muted); }
.card-desc p { margin: 0 0 8px; }
.card-desc p:last-child { margin-bottom: 0; }
.card-list { margin: 0; padding-left: 18px; font-size: 13px; color: var(--text); }
.card-list li { margin: 4px 0; }
.card-ctas { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.card-cta {
  padding: 6px 10px; border: 2px solid var(--accent); background: transparent;
  color: var(--accent); font-weight: 700; font-size: 12px;
  text-transform: uppercase; letter-spacing: 1px;
  box-shadow: 3px 3px 0 0 var(--border);
}
.card-cta:hover { background: var(--accent); color: var(--bg); text-decoration: none; }
.card-cta-ghost { color: var(--muted); border-color: var(--border); }
.card-cta-ghost:hover { background: transparent; color: var(--accent); border-color: var(--accent); }

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

// ─── OG image (Canvas → data URL) ─────────────────────────────────────────

/**
 * Render a 1200×630 Open Graph share card to a `data:image/png;base64,…`
 * URL. Returned URL is small enough (~80–150 KB for typical text-only
 * cards) to embed inline in `<meta property="og:image">`, which all
 * modern social scrapers (Slack, Discord, LinkedIn, Twitter, Bluesky)
 * follow as of 2026.
 *
 * Pure browser API (HTMLCanvasElement), no external assets, so the
 * generated image survives offline and air-gapped deploys. Returns
 * `null` outside a browser context (SSR / tests) so callers can skip
 * the og:image tag without crashing.
 *
 * Visual design mirrors the neo-brutalist portfolio template — same
 * dark navy, accent ribbon, 6px border, uppercase display name — so a
 * link preview "looks like" the destination page.
 */
export function generateOgImage(
  profile: Partial<CVProfile>,
  config: PortfolioConfig,
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const accent = /^#[0-9a-f]{3,8}$/i.test(config.accentColor) ? config.accentColor : '#0d9668';
  const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // Background
  ctx.fillStyle = '#080d19';
  ctx.fillRect(0, 0, 1200, 630);

  // Top + bottom accent ribbons
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 1200, 12);
  ctx.fillRect(0, 618, 1200, 12);

  // 6px outer border (neo-brutalist)
  ctx.strokeStyle = '#3a506e';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 1194, 624);

  // "PORTFOLIO" tag pill (top-left)
  ctx.fillStyle = '#0c1222';
  ctx.fillRect(72, 72, 200, 50);
  ctx.lineWidth = 4;
  ctx.strokeRect(72, 72, 200, 50);
  // Drop shadow for the pill
  ctx.fillStyle = '#3a506e';
  ctx.fillRect(76, 124, 200, 4);
  // Pill text
  ctx.fillStyle = accent;
  ctx.font = `800 18px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('PORTFOLIO', 90, 97);

  // Name — auto-shrinks if too wide
  const name = (profile.full_name || 'Your Name').toUpperCase();
  const maxNameWidth = 980;
  let nameSize = 88;
  ctx.font = `900 ${nameSize}px ${FONT_STACK}`;
  while (ctx.measureText(name).width > maxNameWidth && nameSize > 40) {
    nameSize -= 4;
    ctx.font = `900 ${nameSize}px ${FONT_STACK}`;
  }
  ctx.fillStyle = '#e6ecf6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(name, 72, 180, maxNameWidth);

  // Role
  const role = (profile.target_role || profile.job_title || '').trim().toUpperCase();
  let yCursor = 180 + nameSize + 16;
  if (role) {
    ctx.fillStyle = accent;
    ctx.font = `800 30px ${FONT_STACK}`;
    ctx.fillText(role, 72, yCursor, maxNameWidth);
    yCursor += 50;
  }

  // Tagline (word-wrap, max ~3 lines)
  const tagline = mdToPlain(config.taglineOverride?.trim() || profile.summary || '').trim();
  if (tagline) {
    ctx.fillStyle = '#8aa0bf';
    ctx.font = `400 22px ${FONT_STACK}`;
    const words = tagline.split(/\s+/);
    const maxLineWidth = 980;
    let line = '';
    let linesDrawn = 0;
    const maxLines = 3;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxLineWidth) {
        ctx.fillText(line, 72, yCursor);
        yCursor += 30;
        linesDrawn += 1;
        line = w;
        if (linesDrawn >= maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && linesDrawn < maxLines) ctx.fillText(line, 72, yCursor);
  }

  // Initials monogram (bottom-right)
  const initials = initialsOf(profile.full_name || '');
  ctx.fillStyle = '#0c1222';
  ctx.fillRect(1040, 460, 90, 90);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3a506e';
  ctx.strokeRect(1040, 460, 90, 90);
  ctx.fillStyle = accent;
  ctx.font = `900 38px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, 1085, 505);

  // Footer mark
  ctx.fillStyle = '#3a506e';
  ctx.font = `400 13px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('cv.thedevrealm.com', 72, 580);

  return canvas.toDataURL('image/png');
}

// ─── SEO + Open Graph + JSON-LD ───────────────────────────────────────────

/** Inline-script-safe JSON. Replaces `</` so a stray closing-tag-looking
 *  substring inside a string value can't break out of `<script>` context. */
function jsonForScript(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003C');
}

/**
 * Build the full `<head>` metadata block: title, description, Open Graph,
 * Twitter card, canonical link, and a `Person`-typed JSON-LD blob for
 * rich-result eligibility on Google. Tags are emitted only when their
 * inputs are present so the output stays minimal.
 *
 * `deployUrl` (when provided) populates `og:url` + `<link rel="canonical">`.
 * `ogImage` (when provided) is a data: URL or absolute URL pointing at
 * the share card.
 */
export function generateMetaTags(
  profile: Partial<CVProfile>,
  config: PortfolioConfig,
  opts: { deployUrl?: string; ogImage?: string | null } = {},
): string {
  const fullName = (profile.full_name || '').trim();
  const role     = (profile.target_role || profile.job_title || '').trim();
  const title    = role
    ? `${fullName || 'Portfolio'} — ${role}`
    : (fullName ? `${fullName} — Portfolio` : 'Portfolio');
  const desc     = mdToPlain(config.taglineOverride?.trim() || profile.summary || '').slice(0, 160).trim()
    || (fullName ? `Portfolio of ${fullName}` : 'Personal portfolio');
  const url      = opts.deployUrl?.trim() ? opts.deployUrl.trim().replace(/\/+$/, '') : '';
  const ogImage  = opts.ogImage || '';

  const tags: string[] = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:site_name" content="${esc(fullName || 'Portfolio')}">`,
  ];

  // profile:first_name / profile:last_name when we can split safely
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      tags.push(`<meta property="profile:first_name" content="${esc(parts[0])}">`);
      tags.push(`<meta property="profile:last_name" content="${esc(parts.slice(1).join(' '))}">`);
    }
  }

  if (url) {
    tags.push(`<meta property="og:url" content="${esc(url)}">`);
    tags.push(`<link rel="canonical" href="${esc(url)}">`);
  }
  if (ogImage) {
    tags.push(`<meta property="og:image" content="${ogImage}">`);
    tags.push(`<meta property="og:image:width" content="1200">`);
    tags.push(`<meta property="og:image:height" content="630">`);
    tags.push(`<meta property="og:image:alt" content="${esc(title)}">`);
  }

  // Twitter card
  tags.push(`<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`);
  tags.push(`<meta name="twitter:title" content="${esc(title)}">`);
  tags.push(`<meta name="twitter:description" content="${esc(desc)}">`);
  if (ogImage) tags.push(`<meta name="twitter:image" content="${ogImage}">`);

  // Robots — explicit allow so corp-firewalled previews don't see ambiguity
  tags.push(`<meta name="robots" content="index, follow">`);
  tags.push(`<meta name="generator" content="TheDevCV Portfolio Builder">`);

  // JSON-LD Person (helps Google render rich knowledge-panel-style results
  // for personal-name searches; ~300 bytes, harmless when ignored)
  const sameAs = [profile.github, profile.linkedin, profile.website].filter(Boolean) as string[];
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
  };
  if (fullName)        ld.name = fullName;
  if (role)            ld.jobTitle = role;
  if (desc)            ld.description = desc;
  if (url)             ld.url = url;
  if (ogImage)         ld.image = ogImage;
  if (profile.email)   ld.email = `mailto:${profile.email}`;
  if (sameAs.length)   ld.sameAs = sameAs;
  if (profile.location) ld.address = profile.location;
  tags.push(`<script type="application/ld+json">${jsonForScript(ld)}</script>`);

  return tags.join('\n');
}

// ─── Main template ────────────────────────────────────────────────────────

export interface GeneratePortfolioOptions {
  /** Where the portfolio will be hosted. When set, populates `og:url` and
   *  `<link rel="canonical">`. Optional — omitting these tags is still
   *  SEO-valid; Google derives canonical from the live URL. */
  deployUrl?: string;
  /** Pre-computed OG image as a data: URL or absolute URL. Skipped when
   *  null/undefined; Twitter card downgrades to `summary` automatically. */
  ogImage?: string | null;
}

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
  opts: GeneratePortfolioOptions = {},
): string {
  const ctx: RenderCtx = { profile, experience, projects, skills, config, decorations };

  const body: string[] = [];
  if (config.sections.hero)       body.push(renderHero(ctx));
  if (config.sections.projects)   body.push(renderProjects(ctx));
  if (config.sections.experience) body.push(renderExperience(ctx));
  if (config.sections.skills)     body.push(renderSkills(ctx));
  if (config.sections.contact)    body.push(renderContact(ctx));

  const css = renderCss(config.accentColor);
  const head = generateMetaTags(profile, config, opts);
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
${head}
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
