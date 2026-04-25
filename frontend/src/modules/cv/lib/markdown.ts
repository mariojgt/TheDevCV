// Lightweight inline-markdown for CV fields. Supports **bold**, *italic*, and
// [text](url). Block-level constructs (headings, blockquotes, etc.) are not
// supported — bullet lists are a separate concern handled by storing each item
// as its own array entry.
//
// Three rendering targets:
//   • mdToReact   — JSX/HTML preview templates
//   • mdToHtml    — same shape, as an HTML string (sanitised by caller)
//   • mdSegments  — flat segments for jsPDF, which can't render inline runs
//   • mdToPlain   — strip formatting for plain-text export / ATS
//
// And the round-trip pair used by the editor:
//   • htmlToMd    — TipTap HTML → markdown (only the subset we emit)
//   • mdToEditorHtml — markdown → HTML for TipTap's setContent()

import type { ReactNode } from 'react';
import { createElement, Fragment } from 'react';

export interface MdSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  url?: string;
}

// Order matters: longer/distinct tokens first so **bold** doesn't get eaten by
// the *italic* pattern.
const TOKEN_RE = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|\[([^\]\n]+?)\]\(([^)\s]+?)\)/g;

function parseTokens(input: string): MdSegment[] {
  if (!input) return [];
  const out: MdSegment[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (m.index > last) {
      out.push({ text: input.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      out.push({ text: m[1], bold: true });
    } else if (m[2] !== undefined) {
      out.push({ text: m[2], italic: true });
    } else if (m[3] !== undefined && m[4] !== undefined) {
      out.push({ text: m[3], url: m[4] });
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ text: input.slice(last) });
  return out;
}

export function mdSegments(input: string | null | undefined): MdSegment[] {
  return parseTokens(input || '');
}

export function mdToPlain(input: string | null | undefined): string {
  return parseTokens(input || '').map((s) => s.text).join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mdToHtml(input: string | null | undefined): string {
  return parseTokens(input || '')
    .map((seg) => {
      const text = escapeHtml(seg.text);
      if (seg.url) {
        return `<a href="${escapeHtml(seg.url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      if (seg.bold) return `<strong>${text}</strong>`;
      if (seg.italic) return `<em>${text}</em>`;
      return text;
    })
    .join('');
}

export function mdToReact(input: string | null | undefined): ReactNode {
  const segs = parseTokens(input || '');
  if (segs.length === 0) return null;
  const nodes: ReactNode[] = segs.map((seg, i) => {
    if (seg.url) {
      return createElement(
        'a',
        { key: i, href: seg.url, target: '_blank', rel: 'noopener noreferrer' },
        seg.text,
      );
    }
    if (seg.bold) return createElement('strong', { key: i }, seg.text);
    if (seg.italic) return createElement('em', { key: i }, seg.text);
    return createElement(Fragment, { key: i }, seg.text);
  });
  return createElement(Fragment, null, ...nodes);
}

// ── Editor round-trip ─────────────────────────────────────────────
// TipTap emits a small HTML subset: <p>, <strong>/<b>, <em>/<i>,
// <a href>, <ul>/<li>, <br>. We never emit anything richer, so this
// regex/walker pair is sufficient and avoids a real HTML parser.

export function htmlToMd(html: string): string {
  if (!html) return '';
  let s = html;
  // Normalise self-closing <br> → newline placeholder
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // Bold (TipTap uses <strong>; older content may have <b>)
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => `**${stripTags(c)}**`);
  // Italic
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, c) => `*${stripTags(c)}*`);
  // Links
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, c) => `[${stripTags(c)}](${href})`);
  // Strip remaining wrapper tags (<p>, <span>, etc.) — leave their text.
  s = stripTags(s);
  return decodeEntities(s).trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Paragraph-mode round-trip: preserves multiple paragraphs (joined by \n\n in
// markdown, wrapped in <p> tags for the editor).
export function htmlParagraphsToMd(html: string): string {
  if (!html) return '';
  const parts: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = re.exec(html)) !== null) {
    matched = true;
    const md = htmlToMd(m[1]).trim();
    if (md) parts.push(md);
  }
  if (!matched) {
    // No <p> wrappers — treat the whole thing as one block.
    const md = htmlToMd(html).trim();
    if (md) parts.push(md);
  }
  return parts.join('\n\n');
}

export function mdToEditorHtml(input: string | null | undefined): string {
  const text = (input || '').trim();
  if (!text) return '<p></p>';
  return text
    .split(/\n{2,}/)
    .map((para) => {
      // Convert each line separately so we can join them with <br> without
      // having mdToHtml escape the literal tag.
      const lines = para.split('\n').map((line) => mdToHtml(line));
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}

// Extract each <li>'s inner content as a markdown line, for list-mode editing.
export function htmlListToMdLines(html: string): string[] {
  if (!html) return [];
  const items: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const md = htmlToMd(m[1]).replace(/\s+/g, ' ').trim();
    if (md) items.push(md);
  }
  return items;
}

export function mdLinesToEditorHtml(lines: string[]): string {
  if (!lines.length) return '<ul><li></li></ul>';
  const items = lines.map((l) => `<li>${mdToHtml(l)}</li>`).join('');
  return `<ul>${items}</ul>`;
}
