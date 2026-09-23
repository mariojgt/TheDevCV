import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, ArrowLeft, Image as ImageIcon, Coins, AlertCircle, RefreshCw, Download, Palette } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext';
import { useCV } from '../hooks/useCV';
import { supabase } from '../../../lib/supabase';
import { generateLinkedInBanner, buildBannerSvg, BANNER_PRESETS, type LinkedInBannerDesign } from '../lib/linkedinBanner';
import { InsufficientCreditsError } from '../../../lib/ai-client';
import type { CVProfile, CVSkill } from '../types';

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function downloadPng(dataUri: string, filename: string) {
  const img = new window.Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1584;
    canvas.height = 396;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 1584, 396);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };
  img.src = dataUri;
}

export default function LinkedInBanner() {
  const { settings, credits, hasCredits, costOf, refreshCredits } = useApp();
  const cv = useCV();
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [skills, setSkills] = useState<CVSkill[]>([]);
  const [loadingCV, setLoadingCV] = useState(true);
  const [design, setDesign] = useState<LinkedInBannerDesign | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      await cv.fetchProfiles();
      const { data: profiles } = await supabase.from('cv_profiles').select('*').order('is_default', { ascending: false }).limit(1);
      if (!profiles?.length) { setLoadingCV(false); return; }
      const p = profiles[0] as CVProfile;
      setProfile(p);
      setSkills(await cv.fetchSkills(p.id));
      setLoadingCV(false);
    };
    load();
  }, []);

  const dataUri = useMemo(() => (design ? svgToDataUri(buildBannerSvg(design)) : null), [design]);

  const handleGenerate = async () => {
    if (!profile || !settings?.encrypted_api_key) return;
    if (!hasCredits('ai_improve')) {
      setError(`Generating a banner costs ${costOf('ai_improve')} credit — you have ${credits}. Top up to continue.`);
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const d = await generateLinkedInBanner(profile, skills, settings);
      setDesign(d);
      refreshCredits();
    } catch (err: any) {
      if (err instanceof InsufficientCreditsError) {
        setError(`Not enough credits — AI banner costs ${err.cost}. Buy a credit pack to continue.`);
      } else {
        setError(err?.message || 'Failed to generate banner');
      }
    } finally {
      setGenerating(false);
    }
  };

  const applyPreset = (hex: { gradient_from: string; gradient_to: string; accent: string }) => {
    setDesign(prev => (prev ? { ...prev, ...hex } : prev));
  };

  if (loadingCV) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cv" className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold">LinkedIn Banner</h1>
      </div>

      {!profile && (
        <div className="max-w-lg mx-auto text-center py-20">
          <ImageIcon className="w-12 h-12 text-[var(--color-text-secondary)] mx-auto mb-4 opacity-40" />
          <p className="text-sm mb-4">Create a CV profile first so the banner can use your real experience and skills.</p>
          <Link to="/cv/new" className="neo-btn neo-btn-primary px-5 py-2.5 text-sm">Create CV</Link>
        </div>
      )}

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          {/* Controls */}
          <div className="space-y-4">
            <div className="neo-card p-4">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Palette className="w-4 h-4 text-violet-400" /> Design</h2>

              <button onClick={handleGenerate} disabled={!settings?.encrypted_api_key || !hasCredits('ai_improve') || generating}
                className="neo-btn neo-btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {design ? 'Regenerate design' : 'Generate with AI'}
                <span className="inline-flex items-center gap-0.5 text-[10px] opacity-90"><Coins className="w-3 h-3" />{costOf('ai_improve')}</span>
              </button>

              {design && (
                <button onClick={handleGenerate} disabled={generating}
                  className="w-full mt-2 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-3 h-3" /> New headline & colors
                </button>
              )}

              {error && (
                <p className="mt-3 text-xs text-red-400 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-[1px]" /> <span>{error}</span></p>
              )}

              {design && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Headline</label>
                    <input type="text" value={design.headline} onChange={(e) => setDesign(d => d && { ...d, headline: e.target.value })}
                      className="neo-input w-full px-2 py-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Tagline</label>
                    <input type="text" value={design.tagline} onChange={(e) => setDesign(d => d && { ...d, tagline: e.target.value })}
                      className="neo-input w-full px-2 py-1.5 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Call to action</label>
                    <input type="text" value={design.cta} onChange={(e) => setDesign(d => d && { ...d, cta: e.target.value })}
                      className="neo-input w-full px-2 py-1.5 text-xs" placeholder="Empty = no pill" />
                  </div>
                </div>
              )}

              {design && (
                <div className="mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1.5">Theme palettes</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BANNER_PRESETS.map((p) => (
                      <button key={p.label} onClick={() => applyPreset(p)}
                        title={p.label}
                        className="h-7 rounded-md border-2 border-neo-border overflow-hidden flex"
                        style={{ background: `linear-gradient(135deg, ${p.gradient_from}, ${p.gradient_to})` }}>
                        <span className="w-1.5" style={{ background: p.accent }} />
                        <span className="flex-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="neo-card p-4">
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-cyan-400" /> Export</h2>
              <p className="text-xs text-muted mb-3">Download a 1584×396 PNG ready for your LinkedIn profile.</p>
              <button onClick={() => design && dataUri && downloadPng(dataUri, `linkedin-banner-${profile.full_name.replace(/\s+/g, '-').toLowerCase()}.png`)}
                disabled={!design}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download PNG
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            {dataUri ? (
              <img src={dataUri} alt="LinkedIn banner preview" className="w-full rounded-xl border-[3px] border-neo-border shadow-[6px_6px_0_#000]" />
            ) : (
              <div className="neo-card p-10 text-center text-sm text-muted flex flex-col items-center gap-3 justify-center min-h-[220px]">
                <ImageIcon className="w-8 h-8 text-[var(--color-text-muted)]" />
                Generate a banner to see the live 1584×396 preview here.
              </div>
            )}
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted">
              Tip: keep the left ~25% spare — your profile photo sits there. Upload as the banner image in your LinkedIn profile settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}