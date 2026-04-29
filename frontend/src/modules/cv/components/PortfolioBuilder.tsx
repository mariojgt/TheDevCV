import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Sparkles, Coins, RefreshCw, Github, Info } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext';
import { useToast } from '../../../components/ui/Toast';
import { supabase } from '../../../lib/supabase';
import type { CVProfile, CVExperience, CVProject, CVSkill } from '../types';
import {
  generatePortfolioHtml,
  generateOgImage,
  fetchGithubDecorations,
  downloadPortfolioHtml,
  slugifyName,
  DEFAULT_PORTFOLIO_CONFIG,
  type PortfolioConfig,
  type PortfolioDecorations,
} from '../lib/portfolio';

/**
 * Portfolio tab — takes the CV data already in the editor, lets the user pick
 * sections + accent + (optionally) enrich from GitHub, previews the result in
 * an iframe, and exports a single self-contained index.html file on demand.
 * Consumes 1 `portfolio_export` credit per export (server-authoritative).
 */
export default function PortfolioBuilder({
  cvId,
  profile,
  experience,
  projects,
  skills,
}: {
  cvId: string | undefined;
  profile: Partial<CVProfile>;
  experience: CVExperience[];
  projects: CVProject[];
  skills: CVSkill[];
}) {
  const { credits, hasCredits, costOf, refreshCredits } = useApp();
  const { toast } = useToast();

  const [config, setConfig] = useState<PortfolioConfig>(DEFAULT_PORTFOLIO_CONFIG);
  const [decorations, setDecorations] = useState<PortfolioDecorations>({});
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportedAt, setExportedAt] = useState<number | null>(null);
  /** Where the user plans to host the portfolio (e.g. https://user.github.io).
   *  Optional — when filled, populates og:url + canonical for share-link
   *  previews; when empty those tags are omitted (still SEO-valid). */
  const [deployUrl, setDeployUrl] = useState('');
  /** Pre-rendered OG share card as a data: URL. Regenerated on a debounce
   *  whenever name/role/tagline/accent change so we don't burn cycles on
   *  every keystroke in unrelated fields. */
  const [ogImage, setOgImage] = useState<string | null>(null);

  // Debounced OG image regen — only the fields the canvas actually reads.
  // 600ms is long enough to avoid mid-typing thrash but short enough that
  // a paste-then-export flow gets the up-to-date image.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setOgImage(generateOgImage(profile, config));
      } catch {
        setOgImage(null);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [
    profile.full_name,
    profile.target_role,
    profile.job_title,
    profile.summary,
    config.taglineOverride,
    config.accentColor,
  ]);

  // Live HTML regenerates on every config / content change. Computation is
  // fast enough (a few KB of template output) that we don't need debouncing.
  const html = useMemo(
    () => generatePortfolioHtml(profile, experience, projects, skills, config, decorations, { deployUrl, ogImage }),
    [profile, experience, projects, skills, config, decorations, deployUrl, ogImage],
  );

  // Fetching GitHub decorations is async + opt-in: a user with 10 GitHub
  // projects would burn ~10 requests out of the 60/hr public quota, so we
  // only trigger on demand via the toggle.
  useEffect(() => {
    if (!config.enhanceWithGithub) { setDecorations({}); return; }
    let cancelled = false;
    setLoadingGithub(true);
    fetchGithubDecorations(projects)
      .then(d => { if (!cancelled) setDecorations(d); })
      .catch(() => { if (!cancelled) toast('Could not fetch GitHub metadata — rate-limit or offline.', 'error'); })
      .finally(() => { if (!cancelled) setLoadingGithub(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enhanceWithGithub, projects.length]);

  const handleExport = async () => {
    if (exporting) return;
    if (!hasCredits('portfolio_export')) {
      toast(`Exporting a portfolio costs ${costOf('portfolio_export')} credits — top up to continue.`, 'error');
      return;
    }
    if (!(profile.full_name || '').trim()) {
      toast('Add your name in Personal Information before exporting.', 'error');
      return;
    }
    setExporting(true);
    try {
      // Deduct server-side first so closing the tab mid-download can't
      // reward a free export. Mirror the PDF export flow exactly.
      const { error: chargeErr } = await supabase.rpc('consume_credits', {
        p_action: 'portfolio_export',
        p_reference: cvId && cvId !== 'new' ? cvId : null,
        p_metadata: { theme: config.theme, sections: config.sections, enhanceWithGithub: config.enhanceWithGithub },
      });
      if (chargeErr) {
        if (chargeErr.message?.toLowerCase().includes('insufficient_credits')) {
          toast('Not enough credits to export.', 'error');
        } else {
          toast('Could not charge credits for export.', 'error');
        }
        return;
      }
      refreshCredits();
      const filename = `${slugifyName(profile.full_name || 'portfolio')}-portfolio.html`;
      downloadPortfolioHtml(html, filename);
      setExportedAt(Date.now());
    } catch (err) {
      console.error(err);
      toast('Portfolio export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const setSection = (key: keyof PortfolioConfig['sections'], value: boolean) => {
    setConfig(c => ({ ...c, sections: { ...c.sections, [key]: value } }));
  };

  const minRequirementsOk = !!(profile.full_name || '').trim();
  const cost = costOf('portfolio_export');

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      {/* ── Config panel ── */}
      <div className="xl:w-80 shrink-0 space-y-3">
        <div className="neo-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-light" />
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-white">Portfolio</h3>
          </div>
          <p className="text-xs text-muted leading-snug">
            Turns your CV into a self-contained HTML file you can drop into a{' '}
            <code className="px-1 bg-surface-light rounded text-brand-light">username.github.io</code> repo.
            Deploy instructions are baked into the file's opening comment.
          </p>

          {/* Accent */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1">Accent colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.accentColor}
                onChange={e => setConfig(c => ({ ...c, accentColor: e.target.value }))}
                className="w-10 h-8 rounded border-2 border-neo-border bg-surface p-0 cursor-pointer"
                aria-label="Accent colour"
              />
              <input
                type="text"
                value={config.accentColor}
                onChange={e => setConfig(c => ({ ...c, accentColor: e.target.value }))}
                className="flex-1 min-w-0 neo-input px-2 py-1.5 text-xs font-mono"
                placeholder="#0d9668"
              />
              <button
                type="button"
                onClick={() => setConfig(c => ({ ...c, accentColor: '#0d9668' }))}
                className="text-[10px] text-muted hover:text-white"
                title="Reset to brand emerald"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Section toggles */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1.5">Sections</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['hero', 'projects', 'experience', 'skills', 'contact'] as const).map(key => (
                <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.sections[key]}
                    onChange={e => setSection(key, e.target.checked)}
                    className="w-3.5 h-3.5 accent-brand cursor-pointer"
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Tagline override */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1">
              Tagline <span className="text-subtle font-normal normal-case">(optional, overrides summary)</span>
            </label>
            <textarea
              value={config.taglineOverride || ''}
              onChange={e => setConfig(c => ({ ...c, taglineOverride: e.target.value }))}
              rows={2}
              placeholder="Ex: Full-stack engineer shipping gameplay tools for indie studios."
              className="w-full neo-input px-2.5 py-1.5 text-sm resize-none"
            />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1">
              Avatar URL <span className="text-subtle font-normal normal-case">(optional — defaults to initials)</span>
            </label>
            <input
              type="url"
              value={config.avatarUrl || ''}
              onChange={e => setConfig(c => ({ ...c, avatarUrl: e.target.value }))}
              placeholder="https://…/your-photo.jpg"
              className="w-full neo-input px-2.5 py-1.5 text-sm"
            />
          </div>

          {/* Deployment URL — populates og:url + canonical so social-share
              previews and Google indexing point at the live page instead of
              the raw blob. Optional; SEO is still valid when omitted. */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-muted block mb-1">
              Deployment URL <span className="text-subtle font-normal normal-case">(optional — for share previews & SEO)</span>
            </label>
            <input
              type="url"
              value={deployUrl}
              onChange={e => setDeployUrl(e.target.value)}
              placeholder="https://your-username.github.io"
              className="w-full neo-input px-2.5 py-1.5 text-sm"
            />
            <p className="text-[10px] text-subtle mt-1 leading-snug">
              Where you'll host this file. Sets canonical link + Open Graph URL so Slack, LinkedIn, Twitter previews link back here.
            </p>
          </div>

          {/* GitHub enhance toggle */}
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={config.enhanceWithGithub}
              onChange={e => setConfig(c => ({ ...c, enhanceWithGithub: e.target.checked }))}
              className="w-3.5 h-3.5 accent-brand cursor-pointer mt-0.5"
            />
            <span>
              <span className="inline-flex items-center gap-1 text-white font-medium">
                <Github className="w-3 h-3" /> Decorate from GitHub
                {loadingGithub && <Loader2 className="w-3 h-3 animate-spin text-brand-light" />}
              </span>
              <span className="block text-[10px] text-muted">Adds stars and primary language to project cards. Uses public API (free).</span>
            </span>
          </label>

          {/* Attribution toggle — opt-out is free, default ON so we still get
              light marketing from portfolios that don't actively disable it. */}
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={config.showAttribution}
              onChange={e => setConfig(c => ({ ...c, showAttribution: e.target.checked }))}
              className="w-3.5 h-3.5 accent-brand cursor-pointer mt-0.5"
            />
            <span>
              <span className="text-white font-medium">Show "Built with TheDevCV" footer</span>
              <span className="block text-[10px] text-muted">Free either way. Keeping it on helps other devs discover the tool.</span>
            </span>
          </label>
        </div>

        {/* Export */}
        <div className="neo-card p-4 space-y-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !minRequirementsOk || !hasCredits('portfolio_export')}
            title={
              !minRequirementsOk ? 'Add your name in Personal Information first'
                : !hasCredits('portfolio_export') ? `Not enough credits (need ${cost})`
                  : 'Download index.html'
            }
            className="w-full neo-btn neo-btn-primary px-4 py-2.5 text-xs inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {exporting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
            ) : (
              <>
                <Download className="w-4 h-4" /> Export portfolio HTML
                <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80">
                  <Coins className="w-3 h-3" />{cost}
                </span>
              </>
            )}
          </button>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>Balance: {credits}</span>
            {exportedAt && (
              <span className="inline-flex items-center gap-1 text-brand-light">
                <RefreshCw className="w-3 h-3" /> Exported · {new Date(exportedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Deploy instructions cheat sheet */}
        <details className="neo-card p-4 group" open={exportedAt != null}>
          <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-white">
            <Info className="w-3.5 h-3.5 text-brand-light" /> Deploy to GitHub Pages
            <span className="ml-auto text-muted group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <ol className="mt-3 space-y-1.5 text-[11px] text-muted leading-snug list-decimal list-inside">
            <li>Rename the downloaded file to <code className="text-brand-light">index.html</code>.</li>
            <li>Create a public repo named <code className="text-brand-light">&lt;your-username&gt;.github.io</code>.</li>
            <li>In the repo folder: <code className="text-brand-light block my-1 p-1.5 bg-surface-light rounded">git init &amp;&amp; git add index.html</code></li>
            <li><code className="text-brand-light block my-1 p-1.5 bg-surface-light rounded">git commit -m "initial portfolio"</code></li>
            <li><code className="text-brand-light block my-1 p-1.5 bg-surface-light rounded">git branch -M main</code></li>
            <li><code className="text-brand-light block my-1 p-1.5 bg-surface-light rounded">git remote add origin https://github.com/&lt;user&gt;/&lt;user&gt;.github.io.git</code></li>
            <li><code className="text-brand-light block my-1 p-1.5 bg-surface-light rounded">git push -u origin main</code></li>
            <li>Open <code className="text-brand-light">https://&lt;your-username&gt;.github.io</code> after ~60 seconds.</li>
          </ol>
        </details>
      </div>

      {/* ── Live preview ── */}
      <div className="flex-1 min-w-0">
        <div className="neo-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b-2 border-neo-border bg-surface-light/40">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Live preview</div>
            <div className="text-[10px] text-subtle">No credits spent until you export</div>
          </div>
          <iframe
            title="Portfolio preview"
            srcDoc={html}
            sandbox=""
            className="w-full h-[calc(100vh-260px)] min-h-125 bg-[#080d19]"
          />
        </div>
      </div>
    </div>
  );
}
