import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Upload, Loader2, CheckCircle, AlertCircle, FileText, Brain, Eye, Linkedin, Github, Star, ExternalLink, Info } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext';
import { useCV } from '../hooks/useCV';
import { supabase } from '../../../lib/supabase';
import { performOCR } from '../../../lib/ocr';
import { aiExtractCV, type ExtractedCV, type ExtractSource } from '../lib/import';
import { fetchGitHubPreview, githubPreviewToExtracted, type GitHubPreview } from '../lib/githubImport';
import CVTemplate from '../components/CVTemplateModern';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

type Tab = 'file' | 'linkedin' | 'github';
type Step = 'input' | 'ocr' | 'extracting' | 'review' | 'saving' | 'done' | 'error';

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: 'file',     label: 'Upload file',    icon: Upload },
  { id: 'linkedin', label: 'From LinkedIn',  icon: Linkedin },
  { id: 'github',   label: 'From GitHub',    icon: Github },
];

export default function CVImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useApp();
  useCV(); // keeps the hook warm for any downstream refetch

  const initialTab = (searchParams.get('source') as Tab) || 'file';
  const [tab, setTab] = useState<Tab>(TABS.some(t => t.id === initialTab) ? initialTab : 'file');

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [ghInput, setGhInput] = useState('');
  const [ghPreview, setGhPreview] = useState<GitHubPreview | null>(null);
  const [ghLoading, setGhLoading] = useState(false);

  const [step, setStep] = useState<Step>('input');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [extracted, setExtracted] = useState<ExtractedCV | null>(null);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Reset transient state when tab changes
  useEffect(() => {
    setStep('input');
    setError('');
    setExtracted(null);
    setShowPreview(false);
  }, [tab]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif', 'pdf'].includes(ext)) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(null);
    }
  };

  const processFile = async (source: ExtractSource) => {
    if (!file || !settings) return;
    if (!settings.encrypted_api_key) {
      setError('Configure an AI API key in Settings first.');
      setStep('error');
      return;
    }

    setError('');
    let text = '';
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (['txt', 'csv', 'md'].includes(ext)) {
      setStep('ocr');
      text = await file.text();
    } else if (['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp', 'bmp'].includes(ext)) {
      setStep('ocr');
      try {
        const result = await performOCR(file, (p) => setOcrProgress(Math.round(p * 100)));
        text = result.text;
      } catch (err: any) {
        setError(`OCR failed: ${err.message}`);
        setStep('error');
        return;
      }
    } else {
      setStep('ocr');
      try { text = await file.text(); }
      catch { setError(`Unsupported file type: .${ext}`); setStep('error'); return; }
    }

    if (!text.trim()) {
      setError('No text could be extracted from this file.');
      setStep('error');
      return;
    }

    setStep('extracting');
    try {
      const result = await aiExtractCV(text, settings, { source });
      setExtracted(result);
      setStep('review');
    } catch (err: any) {
      setError(`AI extraction failed: ${err.message}`);
      setStep('error');
    }
  };

  const loadGitHub = async () => {
    setError('');
    setGhLoading(true);
    try {
      const preview = await fetchGitHubPreview(ghInput);
      setGhPreview(preview);
    } catch (err: any) {
      setError(err.message || 'GitHub fetch failed');
      setGhPreview(null);
    } finally {
      setGhLoading(false);
    }
  };

  const useGitHubPreview = () => {
    if (!ghPreview) return;
    setExtracted(githubPreviewToExtracted(ghPreview));
    setStep('review');
  };

  const handleSave = async () => {
    if (!extracted) return;
    setStep('saving');

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated. Please log in again.');
      const uid = user.user.id;

      const profileData: Record<string, unknown> = { user_id: uid };
      const profileFields = ['version_name', 'is_default', 'full_name', 'job_title', 'email', 'phone',
        'location', 'website', 'linkedin', 'github', 'portfolio', 'summary', 'target_role', 'keywords'];
      for (const f of profileFields) {
        const val = (extracted.profile as any)[f];
        if (val !== undefined && val !== null) profileData[f] = val;
      }

      const { data: profile, error: profileError } = await supabase.from('cv_profiles')
        .insert(profileData)
        .select('id')
        .single();

      if (profileError) throw new Error(`Profile save failed: ${profileError.message}`);
      if (!profile?.id) throw new Error('Profile was not created — check your permissions.');
      const pid = profile.id;

      const cleanItems = (items: any[]) => items.map(item => {
        const { id, created_at, profile_id, ...rest } = item;
        return { ...rest, profile_id: pid };
      });

      const results = await Promise.allSettled([
        extracted.experience.length > 0 ? supabase.from('cv_experience').insert(cleanItems(extracted.experience)) : Promise.resolve(),
        extracted.education.length > 0 ? supabase.from('cv_education').insert(cleanItems(extracted.education)) : Promise.resolve(),
        extracted.skills.length > 0 ? supabase.from('cv_skills').insert(cleanItems(extracted.skills)) : Promise.resolve(),
        extracted.certifications.length > 0 ? supabase.from('cv_certifications').insert(cleanItems(extracted.certifications)) : Promise.resolve(),
        extracted.projects.length > 0 ? supabase.from('cv_projects').insert(cleanItems(extracted.projects)) : Promise.resolve(),
        extracted.languages.length > 0 ? supabase.from('cv_languages').insert(cleanItems(extracted.languages)) : Promise.resolve(),
      ]);

      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`Section ${i} save failed:`, r.reason);
      });

      setStep('done');
      setTimeout(() => navigate(`/cv/${pid}`), 1500);
    } catch (err: any) {
      setError(err.message || 'Save failed');
      setStep('error');
    }
  };

  const resetAll = () => {
    setStep('input');
    setExtracted(null);
    setFile(null);
    setFilePreview(null);
    setGhPreview(null);
    setGhInput('');
    setShowPreview(false);
    setError('');
  };

  const counts = extracted ? {
    exp: extracted.experience.length,
    edu: extracted.education.length,
    skills: extracted.skills.length,
    certs: extracted.certifications.length,
    projects: extracted.projects.length,
    langs: extracted.languages.length,
  } : null;

  const showTabs = step === 'input';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cv" className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold">Import CV</h1>
      </div>

      {/* Tab bar — only on input step */}
      {showTabs && (
        <div className="flex gap-1 p-1 neo-card mb-5">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`neo-toggle-btn flex-1 flex items-center justify-center gap-2 ${
                  active ? 'neo-toggle-btn-active' : ''
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ─── FILE TAB ─── */}
      {showTabs && tab === 'file' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Upload an existing CV/resume in any format. AI will extract all information and create an editable profile.
          </p>
          <div className={file && filePreview ? 'grid grid-cols-2 gap-4' : ''}>
            <label className="flex flex-col items-center justify-center p-10 rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-emerald-400/50 cursor-pointer transition-colors bg-[var(--color-surface)]">
              {file ? (
                <>
                  <FileText className="w-10 h-10 text-emerald-400 mb-2" />
                  <p className="text-sm font-medium text-center">{file.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  <p className="text-xs text-emerald-400 mt-2">Click to change file</p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-[var(--color-text-secondary)] mb-2" />
                  <p className="text-sm font-medium">Drop your CV or click to browse</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                    PDF, PNG, JPG, TIFF, TXT, DOCX
                  </p>
                </>
              )}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.txt,.csv,.md,.doc,.docx,.webp,.bmp" onChange={handleFile} className="hidden" />
            </label>
            {file && filePreview && (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
                {file.type === 'application/pdf' ? (
                  <iframe src={filePreview} className="w-full h-full min-h-[300px]" title="CV Preview" />
                ) : (
                  <img src={filePreview} alt="CV Preview" className="w-full h-full object-contain max-h-[400px]" />
                )}
              </div>
            )}
          </div>
          {file && (
            <button onClick={() => processFile('generic')}
              className="neo-btn neo-btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" /> Extract with AI
            </button>
          )}
        </div>
      )}

      {/* ─── LINKEDIN TAB ─── */}
      {showTabs && tab === 'linkedin' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-start gap-2 mb-3">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">How to export your LinkedIn profile as PDF</p>
                <ol className="text-xs text-[var(--color-text-secondary)] space-y-1 list-decimal pl-4">
                  <li>Open your LinkedIn profile — <a href="https://www.linkedin.com/in/me/" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">linkedin.com/in/me <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Click the <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-white font-mono text-[10px]">More</span> button under your headline</li>
                  <li>Select <span className="text-white font-medium">"Save to PDF"</span> — LinkedIn generates the file instantly</li>
                  <li>Upload the downloaded PDF below</li>
                </ol>
                <p className="text-xs text-[var(--color-text-secondary)] mt-2 italic">
                  We never connect to LinkedIn directly. Your PDF stays in your browser until you save.
                </p>
              </div>
            </div>
          </div>

          <div className={file && filePreview ? 'grid grid-cols-2 gap-4' : ''}>
            <label className="flex flex-col items-center justify-center p-10 rounded-xl border-2 border-dashed border-[var(--color-border)] hover:border-sky-400/50 cursor-pointer transition-colors bg-[var(--color-surface)]">
              {file ? (
                <>
                  <FileText className="w-10 h-10 text-sky-400 mb-2" />
                  <p className="text-sm font-medium text-center">{file.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  <p className="text-xs text-sky-400 mt-2">Click to change file</p>
                </>
              ) : (
                <>
                  <Linkedin className="w-10 h-10 text-sky-400 mb-2" />
                  <p className="text-sm font-medium">Drop your LinkedIn PDF</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-2">PDF only — exported from LinkedIn</p>
                </>
              )}
              <input type="file" accept=".pdf" onChange={handleFile} className="hidden" />
            </label>
            {file && filePreview && (
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-white">
                <iframe src={filePreview} className="w-full h-full min-h-[300px]" title="LinkedIn PDF Preview" />
              </div>
            )}
          </div>

          {file && (
            <button onClick={() => processFile('linkedin')}
              className="w-full py-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2">
              <Brain className="w-4 h-4" /> Extract from LinkedIn with AI
            </button>
          )}
        </div>
      )}

      {/* ─── GITHUB TAB ─── */}
      {showTabs && tab === 'github' && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Paste your GitHub username to auto-import your top public repos as Projects and your top languages as Skills. No AI credits used.
          </p>

          <div className="flex gap-2">
            <div className="flex-1 flex items-center rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] focus-within:border-emerald-400/50 transition-colors">
              <span className="pl-3 pr-1 text-sm text-[var(--color-text-secondary)] select-none">github.com/</span>
              <input
                type="text"
                value={ghInput}
                onChange={(e) => setGhInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && ghInput.trim()) loadGitHub(); }}
                placeholder="octocat"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent py-2.5 pr-3 text-sm outline-none placeholder:text-[var(--color-text-secondary)]/60"
              />
            </div>
            <button
              onClick={loadGitHub}
              disabled={!ghInput.trim() || ghLoading}
              className="neo-btn neo-btn-primary px-5 py-2.5 text-sm flex items-center gap-2"
            >
              {ghLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              {ghLoading ? 'Fetching…' : 'Fetch'}
            </button>
          </div>

          {error && !ghPreview && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {ghPreview && (
            <div className="space-y-3">
              {/* Profile card */}
              <div className="flex items-center gap-3 p-4 neo-card">
                <img src={ghPreview.user.avatar_url} alt="" className="w-14 h-14 rounded-full border border-[var(--color-border)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{ghPreview.user.name || ghPreview.user.login}</p>
                    <a href={ghPreview.user.html_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1">
                      @{ghPreview.user.login} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {ghPreview.user.bio && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{ghPreview.user.bio}</p>}
                  <div className="flex gap-3 mt-1 text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wider">
                    <span>{ghPreview.user.public_repos} repos</span>
                    <span>{ghPreview.user.followers} followers</span>
                    {ghPreview.user.location && <span>· {ghPreview.user.location}</span>}
                  </div>
                </div>
              </div>

              {/* Repos */}
              <div className="neo-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                  Top {ghPreview.repos.length} repos → Projects
                </h3>
                {ghPreview.repos.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-secondary)]">No public non-fork repos found.</p>
                ) : (
                  <div className="space-y-2">
                    {ghPreview.repos.map(r => (
                      <div key={r.id} className="flex items-start gap-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{r.name}</span>
                            {r.stargazers_count > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400">
                                <Star className="w-3 h-3" /> {r.stargazers_count}
                              </span>
                            )}
                            {r.language && (
                              <span className="text-[10px] px-1.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">{r.language}</span>
                            )}
                          </div>
                          {r.description && <p className="text-xs text-[var(--color-text-secondary)] line-clamp-1">{r.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Languages */}
              {ghPreview.topLanguages.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                    Top languages → Skills
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {ghPreview.topLanguages.map(lang => (
                      <span key={lang} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border-2 border-brand bg-brand/10 text-brand-light">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={useGitHubPreview}
                className="neo-btn neo-btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Use this — create CV
              </button>
            </div>
          )}
        </div>
      )}

      {/* OCR Progress */}
      {step === 'ocr' && (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-sm font-medium">Extracting text from your file…</p>
          {ocrProgress > 0 && (
            <div className="w-48 mt-3">
              <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
                <div className="h-full bg-brand transition-all" style={{ width: `${ocrProgress}%` }} />
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1 text-center">{ocrProgress}%</p>
            </div>
          )}
        </div>
      )}

      {/* AI Extracting */}
      {step === 'extracting' && (
        <div className="flex flex-col items-center py-16">
          <div className="relative mb-6">
            <Brain className="w-12 h-12 text-emerald-400" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
          <p className="text-base font-semibold mb-2">AI is parsing your CV…</p>
          <div className="text-xs text-[var(--color-text-secondary)] space-y-1 text-center">
            <p>Extracting personal information, work experience,</p>
            <p>education, skills, certifications, and more.</p>
            <p className="mt-3 text-emerald-400/60">This may take 10–30 seconds depending on the CV length.</p>
          </div>
        </div>
      )}

      {/* Review */}
      {step === 'review' && extracted && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review Extracted Data</h2>
            <button onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs hover:border-emerald-400/50 transition-colors">
              <Eye className="w-3.5 h-3.5" /> {showPreview ? 'Summary' : 'Preview CV'}
            </button>
          </div>

          {showPreview ? (
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <CVTemplate
                profile={extracted.profile as CVProfile}
                experience={extracted.experience as CVExperience[]}
                education={extracted.education as CVEducation[]}
                skills={extracted.skills as CVSkill[]}
                certifications={extracted.certifications as CVCertification[]}
                projects={extracted.projects as CVProject[]}
                languages={extracted.languages as CVLanguage[]}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {counts!.exp > 0 && <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light">{counts!.exp} experience</span>}
                {counts!.edu > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400">{counts!.edu} education</span>}
                {counts!.skills > 0 && <span className="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light">{counts!.skills} skills</span>}
                {counts!.certs > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400">{counts!.certs} certifications</span>}
                {counts!.projects > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400">{counts!.projects} projects</span>}
                {counts!.langs > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-400">{counts!.langs} languages</span>}
              </div>

              <div className="neo-card p-4">
                <h3 className="text-sm font-semibold mb-2">Profile</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-[var(--color-text-secondary)]">Name:</span> {extracted.profile.full_name}</div>
                  <div><span className="text-[var(--color-text-secondary)]">Title:</span> {extracted.profile.job_title || '—'}</div>
                  <div><span className="text-[var(--color-text-secondary)]">Email:</span> {extracted.profile.email || '—'}</div>
                  <div><span className="text-[var(--color-text-secondary)]">Phone:</span> {extracted.profile.phone || '—'}</div>
                  <div className="col-span-2"><span className="text-[var(--color-text-secondary)]">Location:</span> {extracted.profile.location || '—'}</div>
                </div>
                {extracted.profile.summary && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-2 leading-relaxed">{extracted.profile.summary}</p>
                )}
              </div>

              {extracted.experience.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-sm font-semibold mb-2">Experience</h3>
                  <div className="space-y-3">
                    {extracted.experience.map((e, i) => (
                      <div key={i} className="text-sm">
                        <div className="font-medium">{e.role} <span className="text-[var(--color-text-secondary)] font-normal">at {e.company}</span></div>
                        <div className="text-xs text-[var(--color-text-secondary)]">{e.start_date} — {e.is_current ? 'Present' : e.end_date}</div>
                        {e.achievements && e.achievements.length > 0 && (
                          <ul className="mt-1 text-xs text-[var(--color-text-secondary)] list-disc pl-4 space-y-0.5">
                            {e.achievements.slice(0, 3).map((a, j) => <li key={j}>{a}</li>)}
                            {e.achievements.length > 3 && <li>+{e.achievements.length - 3} more…</li>}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extracted.projects.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-sm font-semibold mb-2">Projects</h3>
                  <div className="space-y-2">
                    {extracted.projects.map((p, i) => (
                      <div key={i} className="text-sm">
                        <div className="font-medium flex items-center gap-2">
                          {p.name}
                          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline"><ExternalLink className="w-3 h-3" /></a>}
                        </div>
                        {p.description && <p className="text-xs text-[var(--color-text-secondary)]">{p.description}</p>}
                        {p.technologies && p.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.technologies.slice(0, 6).map((t, j) => (
                              <span key={j} className="text-[10px] px-1.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)]">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extracted.skills.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-sm font-semibold mb-2">Skills</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {extracted.skills.map((s, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]">
                        {s.name} <span className="text-[var(--color-text-secondary)]">({s.proficiency})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3">
            <button onClick={resetAll}
              className="flex-1 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm">
              Start Over
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Save & Edit CV
            </button>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="flex flex-col items-center py-16">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-base font-semibold mb-1">Saving your CV…</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Creating profile and saving all sections to database</p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-16">
          <CheckCircle className="w-14 h-14 text-emerald-400 mb-4" />
          <p className="text-lg font-semibold">CV Imported!</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Redirecting to editor…</p>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="w-14 h-14 text-red-400 mb-4" />
          <p className="text-lg font-semibold mb-1">Import Failed</p>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-md">{error}</p>
          <button onClick={resetAll}
            className="mt-6 px-6 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm">
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
