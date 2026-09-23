import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, CheckCircle, Sparkles, Target, FileText, Copy, AlertCircle, Briefcase, TrendingUp, AlertTriangle, Award, FolderOpen, Coins, Building2, MessagesSquare, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext';
import { useCV } from '../hooks/useCV';
import { supabase } from '../../../lib/supabase';
import { tailorCVToJob, generateInterviewPrepPack, type TailoredCV, type InterviewPrepPack } from '../lib/ai';
import { InsufficientCreditsError } from '../../../lib/ai-client';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

type Step = 'input' | 'analyzing' | 'review' | 'saving' | 'done' | 'error';

export default function CVJobMatch() {
  const navigate = useNavigate();
  const { settings, credits, hasCredits, costOf, refreshCredits } = useApp();
  const cv = useCV();
  const [step, setStep] = useState<Step>('input');
  const [jobText, setJobText] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [error, setError] = useState('');
  const [tailored, setTailored] = useState<TailoredCV | null>(null);
  const [copiedCL, setCopiedCL] = useState(false);
  const [skillLevels, setSkillLevels] = useState<Record<string, CVSkill['proficiency']>>({});
  const [prep, setPrep] = useState<InterviewPrepPack | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepError, setPrepError] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Load the default CV profile and its sections
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [experience, setExperience] = useState<CVExperience[]>([]);
  const [education, setEducation] = useState<CVEducation[]>([]);
  const [skills, setSkills] = useState<CVSkill[]>([]);
  const [certifications, setCertifications] = useState<CVCertification[]>([]);
  const [projects, setProjects] = useState<CVProject[]>([]);
  const [languages, setLanguages] = useState<CVLanguage[]>([]);
  const [loadingCV, setLoadingCV] = useState(true);

  useEffect(() => {
    const load = async () => {
      await cv.fetchProfiles();
      const { data: profiles } = await supabase.from('cv_profiles').select('*').order('is_default', { ascending: false }).limit(1);
      if (!profiles?.length) { setLoadingCV(false); return; }
      const p = profiles[0] as CVProfile;
      setProfile(p);
      const [exp, edu, sk, cert, proj, lang] = await Promise.all([
        cv.fetchExperience(p.id), cv.fetchEducation(p.id), cv.fetchSkills(p.id),
        cv.fetchCertifications(p.id), cv.fetchProjects(p.id), cv.fetchLanguages(p.id),
      ]);
      setExperience(exp); setEducation(edu); setSkills(sk);
      setCertifications(cert); setProjects(proj); setLanguages(lang);
      setLoadingCV(false);
    };
    load();
  }, []);

  const handleAnalyze = async () => {
    if (!jobText.trim() || !settings?.encrypted_api_key || !profile) return;
    if (!hasCredits('ai_tailor')) {
      setError(`Tailoring a CV costs ${costOf('ai_tailor')} credits — you have ${credits}. Top up to continue.`);
      setStep('error');
      return;
    }
    setStep('analyzing');
    setError('');
    try {
      const result = await tailorCVToJob(profile, experience, education, skills, jobText, settings, certifications, projects, languages);
      setSkillLevels({});
      setTailored(result);
      refreshCredits();
      setStep('review');
    } catch (err: any) {
      if (err instanceof InsufficientCreditsError) {
        setError(`Not enough credits — AI tailor costs ${err.cost}. Buy a credit pack to continue.`);
      } else {
        setError(err?.message || 'AI analysis failed');
      }
      setStep('error');
    }
  };

  const handleSave = async () => {
    if (!tailored || !profile) return;
    if (!hasCredits('create_cv')) {
      setError(`Saving the tailored version costs ${costOf('create_cv')} credit. Top up to continue.`);
      setStep('error');
      return;
    }
    setStep('saving');

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      const uid = user.user.id;

      // 1. Create new CV version
      const versionName = `${tailored.company} - ${tailored.position}`;
      const { data: newProfile, error: profErr } = await supabase.from('cv_profiles').insert({
        user_id: uid,
        version_name: versionName,
        full_name: profile.full_name,
        job_title: tailored.position,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        website: profile.website,
        linkedin: profile.linkedin,
        github: profile.github,
        portfolio: profile.portfolio,
        summary: tailored.summary,
        target_role: tailored.position,
        keywords: tailored.keywords,
        ats_score: tailored.ats_score,
        is_default: false,
      }).select('id').single();

      if (profErr || !newProfile) throw new Error(`Profile save failed: ${profErr?.message}`);
      const pid = newProfile.id;

      // 2. Copy experience with tailored achievements
      for (const exp of experience) {
        const tailoredExp = tailored.experience.find(e => e.id === exp.id);
        await supabase.from('cv_experience').insert({
          profile_id: pid,
          company: exp.company,
          role: exp.role,
          location: exp.location,
          start_date: exp.start_date,
          end_date: exp.end_date,
          is_current: exp.is_current,
          description: exp.description,
          gap_reason: exp.gap_reason,
          departure_reason: exp.departure_reason,
          achievements: tailoredExp?.achievements || exp.achievements,
          technologies: tailoredExp?.technologies || exp.technologies,
          sort_order: exp.sort_order,
        });
      }

      // 3. Copy education
      for (const edu of education) {
        await supabase.from('cv_education').insert({
          profile_id: pid, institution: edu.institution, degree: edu.degree,
          field: edu.field, start_date: edu.start_date, end_date: edu.end_date,
          grade: edu.grade, location: edu.location, description: edu.description, sort_order: edu.sort_order,
        });
      }

      // 4. Highlight relevant skills without changing proficiency; add only selected skills.
      const highlightSet = new Set(tailored.skills_to_highlight.map(s => s.toLowerCase()));
      for (const sk of skills) {
        await supabase.from('cv_skills').insert({
          profile_id: pid, name: sk.name, category: sk.category,
          proficiency: sk.proficiency,
          years: sk.years,
          sort_order: highlightSet.has(sk.name.toLowerCase()) ? -1 : sk.sort_order, // highlighted first
        });
      }
      // Add new skills from job
      for (let i = 0; i < tailored.skills_to_add.length; i++) {
        const s = tailored.skills_to_add[i];
        if (!skillLevels[s.name]) continue;
        await supabase.from('cv_skills').insert({
          profile_id: pid, name: s.name, category: s.category || 'Technical',
          proficiency: skillLevels[s.name], sort_order: skills.length + i,
        });
      }

      // 5. Copy certs, projects, languages
      for (const c of certifications) {
        await supabase.from('cv_certifications').insert({ profile_id: pid, name: c.name, issuer: c.issuer, date_obtained: c.date_obtained, expiry_date: c.expiry_date, credential_id: c.credential_id, url: c.url, sort_order: c.sort_order });
      }
      for (const p of projects) {
        await supabase.from('cv_projects').insert({ profile_id: pid, name: p.name, description: p.description, url: p.url, technologies: p.technologies, highlights: p.highlights, start_date: p.start_date, end_date: p.end_date, show_on_cv: p.show_on_cv, show_on_portfolio: p.show_on_portfolio, cv_description: p.cv_description, portfolio_description: p.portfolio_description, is_open_source: p.is_open_source, repo_url: p.repo_url, image_url: p.image_url, sort_order: p.sort_order });
      }
      for (const l of languages) {
        await supabase.from('cv_languages').insert({ profile_id: pid, language: l.language, proficiency: l.proficiency, sort_order: l.sort_order });
      }

      // 6. Auto-create job application
      await supabase.from('job_applications').insert({
        user_id: uid,
        cv_profile_id: pid,
        company: tailored.company,
        position: tailored.position,
        location: tailored.location,
        job_description: jobText,
        status: alreadyApplied ? 'applied' : 'saved',
        applied_date: alreadyApplied ? new Date().toISOString().split('T')[0] : null,
        ats_match_score: tailored.ats_score,
        ai_cover_letter: tailored.cover_letter,
        ai_suggestions: tailored.keywords,
        job_url: jobUrl || null,
      });

      refreshCredits();
      setStep('done');
      setTimeout(() => navigate(`/cv/${pid}`), 2000);
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('insufficient_credits')) {
        setError('Not enough credits to save the tailored CV. Buy a credit pack to continue.');
      } else {
        setError(err?.message || 'Save failed');
      }
      setStep('error');
    }
  };

  const handleGeneratePrep = async () => {
    if (!profile || !settings?.encrypted_api_key || !tailored) return;
    if (!hasCredits('ai_improve')) {
      setPrepError(`Interview prep costs ${costOf('ai_improve')} credit — you have ${credits}. Top up to continue.`);
      return;
    }
    setPrepLoading(true);
    setPrepError('');
    try {
      const pack = await generateInterviewPrepPack(profile, experience, education, skills, jobText, tailored.company, tailored.position, settings, certifications, projects, languages);
      setPrep(pack);
      refreshCredits();
    } catch (err: any) {
      setPrepError(err?.message || 'Failed to generate interview prep');
    } finally {
      setPrepLoading(false);
    }
  };

  if (loadingCV) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <FileText className="w-12 h-12 text-[var(--color-text-secondary)] mx-auto mb-4 opacity-40" />
        <p className="text-sm mb-4">You need a CV profile first. Create one, then come back to tailor it.</p>
        <Link to="/cv/new" className="neo-btn neo-btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">Create CV</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/cv" className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold">Tailor CV to Job</h1>
      </div>

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="space-y-4">
          <div className="neo-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="font-semibold text-sm">How it works</h2>
            </div>
            <ol className="text-xs text-[var(--color-text-secondary)] space-y-1.5 list-decimal pl-4">
              <li>Paste the job description (or URL) below</li>
              <li>AI analyzes requirements and matches them to your CV: <strong>{profile.version_name}</strong></li>
              <li>AI rewrites your summary, reorders skills, enhances achievements for this role</li>
              <li>AI checks every generated section for ATS compliance (headings, dates, keywords, parseable layout)</li>
              <li>A new CV version is created named after the company + role</li>
              <li>A job application is auto-tracked with ATS score and cover letter</li>
              <li>AI prepares possible interview questions, a likely interview process, and company intel</li>
            </ol>
          </div>

          <div>
            <label className="text-sm text-[var(--color-text-secondary)] mb-1 block">Job URL (optional)</label>
            <input type="text" value={jobUrl} onChange={e => setJobUrl(e.target.value)}
              placeholder="https://jobs.company.com/..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm" />
          </div>

          <div>
            <label className="text-sm text-[var(--color-text-secondary)] mb-1 block">Job Description *</label>
            <textarea value={jobText} onChange={e => setJobText(e.target.value)}
              rows={12} placeholder="Paste the full job description here...&#10;&#10;Include: title, requirements, responsibilities, tech stack, company info"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm resize-none" />
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{jobText.length > 0 ? `${jobText.split(/\s+/).length} words` : 'Paste the complete job posting for best results'}</p>
          </div>

          {/* Already applied toggle */}
          <div className="flex items-center justify-between neo-card p-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-sm font-medium">Already applied for this role?</p>
                <p className="text-xs text-[var(--color-text-secondary)]">Mark as "Applied" in your job tracker</p>
              </div>
            </div>
            <button onClick={() => setAlreadyApplied(!alreadyApplied)}
              className={`relative w-11 h-6 rounded-sm border-2 transition-colors ${alreadyApplied ? 'bg-brand border-black' : 'bg-surface-light border-neo-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${alreadyApplied ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {!hasCredits('ai_tailor') && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 shrink-0" />
                <span>Tailoring needs {costOf('ai_tailor')} credits (+{costOf('create_cv')} to save). You have {credits}.</span>
              </div>
              <Link to="/pricing" className="px-3 py-1.5 rounded bg-amber-500 text-[#0a0e14] font-medium text-xs whitespace-nowrap">Buy credits</Link>
            </div>
          )}

          <button onClick={handleAnalyze} disabled={!jobText.trim() || !settings?.encrypted_api_key || !hasCredits('ai_tailor')}
            className="neo-btn neo-btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
            <Brain className="w-4 h-4" /> Analyze & Tailor CV
            <span className="inline-flex items-center gap-0.5 text-[11px] opacity-90"><Coins className="w-3 h-3" />{costOf('ai_tailor')}</span>
          </button>
        </div>
      )}

      {/* Step 2: Analyzing */}
      {step === 'analyzing' && (
        <div className="flex flex-col items-center py-20">
          <div className="relative mb-6">
            <Brain className="w-14 h-14 text-emerald-400" />
            <div className="absolute inset-0 w-14 h-14 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
          <p className="text-base font-semibold mb-2">AI is tailoring your CV…</p>
          <div className="text-xs text-[var(--color-text-secondary)] space-y-1 text-center">
            <p>Analyzing job requirements against your experience</p>
            <p>Rewriting summary, enhancing achievements, matching skills</p>
            <p>Enforcing ATS-compliant structure, headings, and dates</p>
            <p className="mt-3 text-emerald-400/60">This takes 15–45 seconds</p>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && tailored && (
        <div className="space-y-4">
          {/* Header with score improvement */}
          <div className="neo-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-semibold">{tailored.position}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">{tailored.company}{tailored.location ? ` · ${tailored.location}` : ''}</p>
                {alreadyApplied && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">
                    <Briefcase className="w-3 h-3" /> Applied
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  {tailored.original_score > 0 && (
                    <>
                      <span className="text-lg font-bold text-[var(--color-text-secondary)] line-through opacity-50">{tailored.original_score}%</span>
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </>
                  )}
                  <span className={`text-2xl font-bold ${tailored.ats_score >= 80 ? 'text-emerald-400' : tailored.ats_score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {tailored.ats_score}%
                  </span>
                </div>
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Estimated job match{tailored.original_score > 0 && ` (+${tailored.ats_score - tailored.original_score}pts)`}
                </div>
              </div>
            </div>
            {/* Keywords */}
            <div className="flex flex-wrap gap-1 mt-2">
              {tailored.keywords.slice(0, 15).map((k, i) => (
                <span key={i} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border-2 border-brand bg-brand/10 text-brand-light">{k}</span>
              ))}
            </div>
          </div>

          {/* Match Reasons — why you're a good fit */}
          {tailored.match_reasons.length > 0 && (
            <div className="neo-card p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Why You Match</h3>
              <div className="space-y-2">
                {tailored.match_reasons.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium">{r.strength}</span>
                      <span className="text-xs text-[var(--color-text-secondary)]"> — {r.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps remaining — honest assessment */}
          {tailored.gaps_remaining.length > 0 && (
            <div className="neo-card p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Gaps to Prepare For</h3>
              <div className="space-y-2">
                {tailored.gaps_remaining.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs font-medium">{g.area}</span>
                      <span className="text-xs text-[var(--color-text-secondary)]"> — {g.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ATS compliance */}
          {tailored.ats_compliance.length > 0 && (
            <div className="neo-card p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><ListChecks className="w-4 h-4 text-emerald-400" /> ATS Compliance</h3>
              <p className="text-xs text-muted mb-2">Structure and parseability checks AI verified in this tailored CV — not an employer ATS score.</p>
              <ul className="space-y-1.5">
                {tailored.ats_compliance.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-[var(--color-text-secondary)]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tailored Summary */}
          <div className="neo-card p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" /> Tailored Summary</h3>
            <p className="text-xs text-muted mb-2">Review every claim before saving. Match scores are AI estimates, not employer ATS results.</p>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{tailored.summary}</p>
          </div>

          {/* Enhanced Experience */}
          {tailored.experience.length > 0 && (
            <div className="neo-card p-4">
              <h3 className="text-sm font-semibold mb-2">Enhanced Achievements</h3>
              {tailored.experience.map((te, i) => {
                const orig = experience.find(e => e.id === te.id);
                return (
                  <div key={i} className="mb-3 last:mb-0">
                    <div className="text-xs font-medium text-emerald-400 mb-1">{orig?.role} at {orig?.company}</div>
                    <ul className="text-xs text-[var(--color-text-secondary)] space-y-0.5 list-disc pl-4">
                      {te.achievements.map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* Skills changes */}
          <div className="grid grid-cols-2 gap-4">
            {tailored.skills_to_highlight.length > 0 && (
              <div className="neo-card p-4">
                <h3 className="text-xs font-semibold mb-2 text-emerald-400">Skills Highlighted First</h3>
                <div className="flex flex-wrap gap-1">
                  {tailored.skills_to_highlight.map((s, i) => (
                    <span key={i} className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border-2 border-brand bg-brand/10 text-brand-light">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {tailored.skills_to_add.length > 0 && (
              <div className="neo-card p-4">
                <h3 className="text-xs font-semibold mb-2 text-cyan-400">Suggested Skills — select your level to include</h3>
                <div className="flex flex-wrap gap-1">
                  {tailored.skills_to_add.map((s, i) => (
                    <label key={i} className="flex flex-col gap-1 text-xs text-cyan-400">
                      {s.name}
                      <select aria-label={`Proficiency for ${s.name}`} className="neo-input text-xs p-1" value={skillLevels[s.name] || ''} onChange={e => setSkillLevels(prev => {
                        const next = { ...prev };
                        if (e.target.value) next[s.name] = e.target.value as CVSkill['proficiency']; else delete next[s.name];
                        return next;
                      })}>
                        <option value="">Do not add</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="expert">Expert</option>
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Projects & Certifications to highlight */}
          {(tailored.projects_to_highlight.length > 0 || tailored.certs_to_highlight.length > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {tailored.projects_to_highlight.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-xs font-semibold mb-2 flex items-center gap-1 text-violet-400"><FolderOpen className="w-3.5 h-3.5" /> Relevant Projects</h3>
                  <div className="space-y-1">
                    {tailored.projects_to_highlight.map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-violet-400 font-medium">#{i + 1}</span>
                        <span className="text-xs text-[var(--color-text-secondary)]">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tailored.certs_to_highlight.length > 0 && (
                <div className="neo-card p-4">
                  <h3 className="text-xs font-semibold mb-2 flex items-center gap-1 text-amber-400"><Award className="w-3.5 h-3.5" /> Relevant Certifications</h3>
                  <div className="flex flex-wrap gap-1">
                    {tailored.certs_to_highlight.map((c, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cover Letter */}
          {tailored.cover_letter && (
            <div className="neo-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" /> Cover Letter</h3>
                <button onClick={() => { navigator.clipboard.writeText(tailored.cover_letter); setCopiedCL(true); setTimeout(() => setCopiedCL(false), 2000); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 transition-colors">
                  <Copy className="w-3 h-3" /> {copiedCL ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{tailored.cover_letter}</p>
            </div>
          )}

          {/* Interview prep & company intel */}
          <div className="neo-card p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2"><MessagesSquare className="w-4 h-4 text-violet-400" /> Interview Prep & Company Intel</h3>
                <p className="text-xs text-muted mt-0.5">AI builds possible questions, a likely interview process, and company intel from this posting — answers use your real CV.</p>
              </div>
              {!prep && !prepLoading && (
                <button onClick={handleGeneratePrep} disabled={!settings?.encrypted_api_key || !hasCredits('ai_improve')}
                  className="neo-btn neo-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0">
                  <Sparkles className="w-3.5 h-3.5" /> Generate with AI
                  <span className="inline-flex items-center gap-0.5 opacity-90"><Coins className="w-3 h-3" />{costOf('ai_improve')}</span>
                </button>
              )}
            </div>

            {prepError && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs mb-3">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {prepError}
              </div>
            )}

            {prepLoading && (
              <div className="flex items-center gap-2 py-4 text-xs text-[var(--color-text-secondary)]">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                Drafting company profile, interview process, and questions…
              </div>
            )}

            {prep && (
              <div className="space-y-4">
                {/* Company intel */}
                <div className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold">Company Profile</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <p className="text-[var(--color-text-secondary)]"><span className="font-medium text-[var(--color-text)]">Domain:</span> {prep.company_intel.domain || 'Not stated in the posting'}</p>
                    <p className="text-[var(--color-text-secondary)]"><span className="font-medium text-[var(--color-text)]">Industry:</span> {prep.company_intel.industry || 'Not stated in the posting'}</p>
                    <p className="text-[var(--color-text-secondary)]"><span className="font-medium text-[var(--color-text)]">Mission:</span> {prep.company_intel.mission || 'Not stated in the posting'}</p>
                    {prep.company_intel.team.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1"><span className="font-medium text-[var(--color-text)]">Teams:</span>
                        {prep.company_intel.team.map((t, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">{t}</span>)}
                      </div>
                    )}
                    {prep.company_intel.tech_stack.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1"><span className="font-medium text-[var(--color-text)]">Stack:</span>
                        {prep.company_intel.tech_stack.map((t, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand-light border border-brand/20">{t}</span>)}
                      </div>
                    )}
                    {prep.company_intel.culture.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1"><span className="font-medium text-[var(--color-text)]">Culture:</span>
                        {prep.company_intel.culture.map((t, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">{t}</span>)}
                      </div>
                    )}
                    {prep.company_intel.challenges.length > 0 && (
                      <ul className="space-y-0.5 list-disc pl-4 text-[var(--color-text-secondary)]">
                        {prep.company_intel.challenges.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Interview process */}
                {prep.interview_process.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold">Likely Interview Process</span>
                    </div>
                    <ol className="space-y-1.5">
                      {prep.interview_process.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="w-4 h-4 shrink-0 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                          <div>
                            <span className="text-xs font-medium">{s.step}</span>
                            <span className="text-xs text-[var(--color-text-secondary)]"> — {s.detail}</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Value questions */}
                {prep.value_questions.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">The Questions They Almost Always Ask</span>
                      <button onClick={() => toggleSection('value')} className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-0.5">
                        {openSections.value ? <><ChevronUp className="w-3 h-3" /> Hide answers</> : <><ChevronDown className="w-3 h-3" /> Show answers</>}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {prep.value_questions.map((q, i) => (
                        <div key={i}>
                          <div className="flex items-start gap-1.5">
                            <Target className="w-3 h-3 text-violet-400 mt-1 shrink-0" />
                            <span className="text-xs font-medium">{q.question}</span>
                          </div>
                          {openSections.value && (
                            <div className="ml-4.5 mt-1 text-xs text-[var(--color-text-secondary)]">
                              <p className="text-[10px] text-violet-400/70 mb-0.5">Why they ask: {q.why_asked}</p>
                              <p>{q.suggested_answer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Likely questions */}
                {prep.likely_questions.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">More Likely Questions ({prep.likely_questions.length})</span>
                      <button onClick={() => toggleSection('likely')} className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-0.5">
                        {openSections.likely ? <><ChevronUp className="w-3 h-3" /> Hide</> : <><ChevronDown className="w-3 h-3" /> Show</>}
                      </button>
                    </div>
                    {openSections.likely && (
                      <div className="space-y-2.5">
                        {prep.likely_questions.map((q, i) => (
                          <div key={i}>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium">{q.question}</span>
                              <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface text-[var(--color-text-secondary)] border border-[var(--color-border)] shrink-0">{q.type.replace('_', ' ')}</span>
                            </div>
                            <p className="text-[10px] text-violet-400/70 mt-0.5">Why they ask: {q.why_asked}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{q.suggested_answer}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Questions to ask + talking points + pitch */}
                {(prep.questions_to_ask.length > 0 || prep.talking_points.length > 0 || prep.opening_pitch) && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {prep.questions_to_ask.length > 0 && (
                      <div className="rounded-lg border border-[var(--color-border)] p-3">
                        <span className="text-xs font-semibold block mb-1.5">Questions to Ask Them</span>
                        <ul className="space-y-1.5">
                          {prep.questions_to_ask.map((q, i) => (
                            <li key={i}>
                              <p className="text-xs">{q.question}</p>
                              <p className="text-[10px] text-[var(--color-text-secondary)]">{q.why}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {prep.talking_points.length > 0 && (
                      <div className="rounded-lg border border-[var(--color-border)] p-3">
                        <span className="text-xs font-semibold block mb-1.5">Company Talking Points</span>
                        <ul className="space-y-1 list-disc pl-4">
                          {prep.talking_points.map((t, i) => <li key={i} className="text-xs text-[var(--color-text-secondary)]">{t}</li>)}
                        </ul>
                      </div>
                    )}
                    {prep.opening_pitch && (
                      <div className="rounded-lg border border-[var(--color-border)] p-3 sm:col-span-2">
                        <span className="text-xs font-semibold block mb-1.5">60-Second Opening Pitch</span>
                        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{prep.opening_pitch}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Already applied toggle in review step */}
          <div className="flex items-center justify-between neo-card p-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-[var(--color-text-secondary)]" />
              <p className="text-sm">Track as <strong>{alreadyApplied ? 'Applied' : 'Saved'}</strong></p>
            </div>
            <button onClick={() => setAlreadyApplied(!alreadyApplied)}
              className={`relative w-11 h-6 rounded-sm border-2 transition-colors ${alreadyApplied ? 'bg-brand border-black' : 'bg-surface-light border-neo-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${alreadyApplied ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => { setStep('input'); setTailored(null); setPrep(null); setPrepError(''); setOpenSections({}); }}
              className="flex-1 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm">Start Over</button>
            <button onClick={handleSave} disabled={!hasCredits('create_cv')}
              title={`Saves the tailored CV · ${costOf('create_cv')} credit`}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <CheckCircle className="w-4 h-4" /> Create Tailored CV & Track Job
              <span className="inline-flex items-center gap-0.5 text-[10px] opacity-90"><Coins className="w-3 h-3" />{costOf('create_cv')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Saving */}
      {step === 'saving' && (
        <div className="flex flex-col items-center py-20">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-base font-semibold mb-1">Creating tailored CV version…</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Saving profile, enhanced experience, skills, and job application</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && tailored && (
        <div className="flex flex-col items-center py-20">
          <CheckCircle className="w-14 h-14 text-emerald-400 mb-4" />
          <p className="text-lg font-semibold">CV Tailored!</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Created: <strong>{tailored.company} - {tailored.position}</strong>
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-sm font-bold ${tailored.ats_score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{tailored.ats_score}% ATS match</span>
            <span className="text-xs text-[var(--color-text-secondary)]">
              · {alreadyApplied ? 'Tracked as Applied' : 'Job saved'} · Cover letter saved
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-4">Redirecting to editor…</p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="flex flex-col items-center py-20">
          <AlertCircle className="w-14 h-14 text-red-400 mb-4" />
          <p className="text-lg font-semibold mb-1">Something went wrong</p>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-md">{error}</p>
          <div className="mt-6 flex gap-3">
            {/credits|credit pack|top up/i.test(error) && (
              <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#0a0e14] font-medium text-sm">
                <Coins className="w-4 h-4" /> Buy credits
              </Link>
            )}
            <button onClick={() => setStep('input')} className="px-6 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm">Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
