import type { UserSettings } from '../../../lib/types';
import type { CVProfile, CVSkill } from '../types';
import { aiComplete } from '../../../lib/ai-client';
import { partialParse } from '../../../lib/partial-json';
import { UNIVERSAL_CV_RULES, buildCandidateContext } from './ai';

export interface LinkedInBannerDesign {
  headline: string;
  tagline: string;
  cta: string;
  keywords: string[];
  theme: string;
  gradient_from: string;
  gradient_to: string;
  accent: string;
}

export const BANNER_PRESETS: { label: string; gradient_from: string; gradient_to: string; accent: string }[] = [
  { label: 'Deep Ocean',  gradient_from: '#0b1b2b', gradient_to: '#1e5f74', accent: '#38e0c3' },
  { label: 'Ember',       gradient_from: '#1a0b12', gradient_to: '#7a2b2b', accent: '#ffb86b' },
  { label: 'Royal',       gradient_from: '#12041f', gradient_to: '#4c1d95', accent: '#f5a524' },
  { label: 'Forest',      gradient_from: '#08130f', gradient_to: '#14532d', accent: '#a3e635' },
  { label: 'Mono',        gradient_from: '#0b0f14', gradient_to: '#2b3440', accent: '#e6edf3' },
  { label: 'Sunset',      gradient_from: '#1f0530', gradient_to: '#a63d3d', accent: '#ffd166' },
];

export const BANNER_WIDTH = 1584;
export const BANNER_HEIGHT = 396;

const FONT = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function splitLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  while (i < words.length && lines.length < maxLines - 1) {
    const w = words[i];
    const candidate = cur ? `${cur} ${w}` : w;
    if (cur && candidate.length > maxCharsPerLine) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
    i++;
  }
  if (cur) lines.push(cur);
  for (; i < words.length && lines.length > 0; i++) {
    const candidate = `${lines[lines.length - 1]} ${words[i]}`;
    if (candidate.length <= maxCharsPerLine) lines[lines.length - 1] = candidate;
  }
  if (lines.length && lines[lines.length - 1].length > maxCharsPerLine) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, Math.max(6, maxCharsPerLine - 1)) + '…';
  }
  return lines;
}

export function buildBannerSvg(d: LinkedInBannerDesign): string {
  const W = BANNER_WIDTH;
  const H = BANNER_HEIGHT;
  const textRight = W - 44;
  const textLeft = textRight - 780;

  const headlineFont = d.headline.length <= 34 ? 52 : d.headline.length <= 56 ? 46 : 40;
  const headlineChars = Math.max(8, Math.floor(760 / (headlineFont * 0.54)));
  const headlineLines = splitLines(d.headline, headlineChars, 2);

  const tagline = d.tagline.length > 64 ? d.tagline.slice(0, 62) + '…' : d.tagline;
  const cta = d.cta.length > 44 ? d.cta.slice(0, 42) + '…' : d.cta;

  let cursor = 106;
  const headlineTop = cursor;
  for (const line of headlineLines) {
    cursor += Math.round(headlineFont * 1.12);
  }
  if (tagline) cursor += 12;
  const taglineY = cursor + 12;

  const ctaY = taglineY + (tagline ? 16 : 34);
  const ctaWidth = Math.min(textRight - textLeft, cta.length * 19 * 0.56 + 42);
  const ctaX = textRight - ctaWidth;

  const chipY = 348;
  let chipXRight = textRight;
  const chips = d.keywords.slice(0, 4).map(k => ({
    width: Math.min(textRight - textLeft, k.length * 12 * 0.62 + 24),
    height: 28,
  }));

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${esc(d.gradient_from)}"/>
      <stop offset="1" stop-color="${esc(d.gradient_to)}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.12" r="0.9">
      <stop offset="0" stop-color="${esc(d.accent)}" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="${esc(d.accent)}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${esc(d.accent)}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.6" fill="#ffffff" fill-opacity="0.10"/>
    </pattern>
  </defs>`);

  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#dots)"/>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#glow)"/>`);
  parts.push(`<rect x="12" y="0" width="6" height="${H}" fill="${esc(d.accent)}" opacity="0.9"/>`);
  parts.push(`<line x1="${textLeft}" y1="78" x2="${textRight}" y2="78" stroke="${esc(d.accent)}" stroke-width="8" stroke-linecap="round" opacity="0.95"/>`);
  parts.push(`<text x="44" y="40" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="2" fill="#ffffff" fill-opacity="0.45">THEDEVCV · AI COVER</text>`);

  parts.push(`<text x="${textRight}" y="${headlineTop + headlineFont}" text-anchor="end" font-family="${FONT}" font-size="${headlineFont}" font-weight="800" letter-spacing="-1" fill="#ffffff">${esc(headlineLines[0] || '')}</text>`);
  for (let i = 1; i < headlineLines.length; i++) {
    const y = headlineTop + headlineFont + i * Math.round(headlineFont * 1.12);
    parts.push(`<text x="${textRight}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="${headlineFont}" font-weight="800" letter-spacing="-1" fill="#ffffff">${esc(headlineLines[i])}</text>`);
  }

  if (tagline) {
    parts.push(`<text x="${textRight}" y="${taglineY}" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="400" fill="#ffffff" fill-opacity="0.85">${esc(tagline)}</text>`);
  }

  if (cta) {
    parts.push(`<rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="42" rx="21" fill="${esc(d.accent)}"/>`);
    parts.push(`<text x="${ctaX + 20}" y="${ctaY + 27}" font-family="${FONT}" font-size="19" font-weight="700" fill="#0a0e14">${esc(cta)}</text>`);
  }

  let x = textRight;
  for (let i = 0; i < chips.length; i++) {
    x -= chips[i].width;
    parts.push(`<rect x="${x}" y="${chipY - 8}" width="${chips[i].width}" height="${chips[i].height}" rx="14" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.30"/>`);
    parts.push(`<text x="${x + 12}" y="${chipY + 10}" font-family="${FONT}" font-size="12" font-weight="600" fill="#ffffff" fill-opacity="0.92">${esc(d.keywords[i])}</text>`);
    x -= 10;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const isHex = (s: unknown): s is string => typeof s === 'string' && HEX_RE.test(s.trim());

function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export async function generateLinkedInBanner(
  profile: Pick<CVProfile, 'full_name' | 'job_title' | 'target_role' | 'summary' | 'career_stage' | 'industry'>,
  skills: CVSkill[],
  settings: UserSettings,
): Promise<LinkedInBannerDesign> {
  const skillsText = skills.slice(0, 24).map(s => s.name).join(', ');

  const response = await aiComplete(
    `CANDIDATE:\nName: ${profile.full_name}\nCurrent title: ${profile.job_title || 'Not provided'}\nTarget role: ${profile.target_role || 'Not provided'}\nSummary: ${profile.summary || 'Not provided'}\n\nTOP SKILLS:\n${skillsText}`,
    { system: `LINKEDIN_BANNER\n\nDesign a premium LinkedIn profile cover banner (1584×396px) for this candidate.\n\n${UNIVERSAL_CV_RULES}\n\n${buildCandidateContext(profile)}
TASK: Return ONLY valid JSON, no prose, no markdown fences:
{
  "headline": "8-12 word positioning statement that an engineer/manager scanning a profile remembers in 2 seconds. NOT a bare job title — combine impact + niche (example instead of 'Senior Software Engineer': 'Platform Engineer — shipping reliability at scale').",
  "tagline": "one short line (max ~10 words) that adds reach, scope, or a differentiator drawn from the CV.",
  "cta": "short recruitment action line (max ~6 words) ONLY when the CV supports it (e.g. 'Open to senior platform roles'; 'Speaking at KubeCon 2026'). Otherwise an EMPTY string.",
  "keywords": ["3-4 exact skill/domain keywords from the CV that recruiters search for"],
  "theme": "short human theme label, e.g. 'Deep Ocean'",
  "color": { "gradient_from": "#RRGGBB", "gradient_to": "#RRGGBB", "accent": "#RRGGBB" }
}

CREATIVE DIRECTION:
- Left ~25% of the banner must stay visually quiet (LinkedIn places the profile photo there) — no text in that zone.
- gradient_from must be a dark base; gradient_to a distinctly lighter, related hue; accent a vivid complementary color that pops on BOTH and reads as text (avoid pure white if accented text sits on light areas).
- Sophisticated, not neon-cluttered: one bold statement, generous negative space, premium feel.
- Never put the candidate's name or contact info in the copy — LinkedIn already shows those next to the cover.
- All claims must be traceable to the candidate's real CV (TRUTHFULNESS rules above). No invented metrics, years of experience, or titles.
- Keywords must be skills actually present in the candidate's skills list below.
`, action: 'ai_improve', maxTokens: 1536 },
  );

  let parsed: unknown = null;
  try { parsed = JSON.parse(response.trim()); } catch { parsed = partialParse(response); }
  if (!parsed || !record(parsed)) throw new Error('AI did not return a usable banner design. Please try again.');

  const colors = record(parsed.color) ? parsed.color : {};
  const fallback = BANNER_PRESETS[0];
  const headline = str(parsed.headline) || `${profile.job_title || profile.target_role || profile.full_name}`;
  const cta = str(parsed.cta);
  const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((k): k is string => typeof k === 'string' && !!k.trim()).map(k => k.trim()).slice(0, 4) : [];

  return {
    headline,
    tagline: str(parsed.tagline),
    cta,
    keywords,
    theme: str(parsed.theme) || fallback.label,
    gradient_from: isHex(colors.gradient_from) ? colors.gradient_from.trim() : fallback.gradient_from,
    gradient_to: isHex(colors.gradient_to) ? colors.gradient_to.trim() : fallback.gradient_to,
    accent: isHex(colors.accent) ? colors.accent.trim() : fallback.accent,
  };
}