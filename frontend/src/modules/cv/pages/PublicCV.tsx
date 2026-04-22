import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ExternalLink, FileQuestion } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CVTemplateClassic from '../components/CVTemplate';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

/**
 * Read-only public CV view served at /s/:token. Backed by get_shared_cv()
 * RPC (SECURITY DEFINER) so RLS stays closed to anon. The CV sheet itself
 * is deliberately NOT neo-brutalist — it must stay clean white / ATS-safe
 * for recruiters to print or forward.
 */
type SharedCV = {
  profile: CVProfile;
  experience: CVExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  certifications: CVCertification[];
  projects: CVProject[];
  languages: CVLanguage[];
};

export default function PublicCV() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedCV | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data: result, error } = await supabase.rpc('get_shared_cv', { p_token: token });
      if (error || !result) {
        setNotFound(true);
      } else {
        setData(result as SharedCV);
        const p = (result as SharedCV).profile;
        document.title = `${p.full_name}${p.job_title ? ' — ' + p.job_title : ''} · CV`;
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-light" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-white">
        <div className="w-16 h-16 rounded-md border-[3px] border-neo-border bg-surface shadow-md flex items-center justify-center mb-5">
          <FileQuestion className="w-7 h-7 text-subtle" />
        </div>
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide mb-2">CV not available</h1>
        <p className="text-sm text-muted mb-6 text-center max-w-md">
          This link has been revoked, or the CV is no longer shared publicly.
        </p>
        <Link to="/" className="neo-btn neo-btn-primary px-5 py-3 text-sm inline-flex items-center gap-2">
          Build your own CV <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const { profile, experience, education, skills, certifications, projects, languages } = data;

  return (
    <div className="min-h-screen py-8">
      {/* Minimal attribution bar — neo style but understated so the CV stays the focus. */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between px-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Shared via The Dev CV</span>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border-2 border-neo-border text-[10px] font-bold uppercase tracking-wider text-muted hover:text-brand-light hover:border-brand transition-colors"
        >
          Build yours <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* CV sheet — white, 3px black border + hard shadow frame, ATS-safe content. */}
      <div className="max-w-3xl mx-auto bg-white rounded-md border-[3px] border-black shadow-xl overflow-hidden">
        <CVTemplateClassic
          profile={profile}
          experience={experience}
          education={education}
          skills={skills}
          certifications={certifications}
          projects={projects}
          languages={languages}
        />
      </div>
    </div>
  );
}
