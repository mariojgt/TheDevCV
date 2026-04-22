import { useState, useEffect } from 'react';
import { Copy, ChevronDown, Check, Briefcase, GraduationCap, Wrench, Award, Globe } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

interface ImportableData {
  profile: CVProfile;
  experience: CVExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  certifications: CVCertification[];
  projects: CVProject[];
  languages: CVLanguage[];
}

export default function ImportFromCV({
  currentProfileId,
  onImportExperience,
  onImportEducation,
  onImportSkills,
  onImportCertifications,
  onImportLanguages,
  onImportSummary,
}: {
  currentProfileId?: string;
  onImportExperience: (items: CVExperience[]) => void;
  onImportEducation: (items: CVEducation[]) => void;
  onImportSkills: (items: CVSkill[]) => void;
  onImportCertifications: (items: CVCertification[]) => void;
  onImportLanguages: (items: CVLanguage[]) => void;
  onImportSummary: (summary: string) => void;
}) {
  const [profiles, setProfiles] = useState<CVProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState<ImportableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('cv_profiles').select('id, version_name, job_title, full_name')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setProfiles(((data as CVProfile[]) || []).filter(p => p.id !== currentProfileId));
      });
  }, [currentProfileId]);

  const loadProfile = async (id: string) => {
    setSelectedId(id);
    setLoading(true);
    const { data: p } = await supabase.from('cv_profiles').select('*').eq('id', id).single();
    const [exp, edu, sk, cert, proj, lang] = await Promise.all([
      supabase.from('cv_experience').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
      supabase.from('cv_education').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
      supabase.from('cv_skills').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
      supabase.from('cv_certifications').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
      supabase.from('cv_projects').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
      supabase.from('cv_languages').select('*').eq('profile_id', id).order('sort_order').then(r => r.data || []),
    ]);
    setData({ profile: p as CVProfile, experience: exp as CVExperience[], education: edu as CVEducation[], skills: sk as CVSkill[], certifications: cert as CVCertification[], projects: proj as CVProject[], languages: lang as CVLanguage[] });
    setLoading(false);
  };

  const markImported = (key: string) => setImported(prev => new Set([...prev, key]));

  if (profiles.length === 0) return null;

  return (
    <div className="neo-card overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 hover:bg-surface-light transition-colors">
        <Copy className="w-4 h-4 text-brand-light" />
        <span className="text-xs font-extrabold uppercase tracking-wide text-white flex-1 text-left">Import from another CV</span>
        <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t-[3px] border-neo-border pt-3">
          {/* Profile selector */}
          <select value={selectedId} onChange={e => e.target.value && loadProfile(e.target.value)}
            className="neo-select px-2 py-1.5 text-sm mb-3">
            <option value="">Select a CV version…</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.version_name} — {p.job_title || p.full_name}</option>
            ))}
          </select>

          {loading && <p className="text-xs text-muted">Loading…</p>}

          {data && !loading && (
            <div className="space-y-2">
              {/* Summary */}
              {data.profile.summary && (
                <ImportRow icon={Copy} label="Summary" count=""
                  done={imported.has('summary')}
                  onImport={() => { onImportSummary(data.profile.summary!); markImported('summary'); }} />
              )}

              {/* Experience */}
              {data.experience.length > 0 && (
                <ImportRow icon={Briefcase} label="Experience" count={`${data.experience.length} entries`}
                  done={imported.has('experience')}
                  onImport={() => { onImportExperience(data.experience); markImported('experience'); }} />
              )}

              {/* Education */}
              {data.education.length > 0 && (
                <ImportRow icon={GraduationCap} label="Education" count={`${data.education.length} entries`}
                  done={imported.has('education')}
                  onImport={() => { onImportEducation(data.education); markImported('education'); }} />
              )}

              {/* Skills */}
              {data.skills.length > 0 && (
                <ImportRow icon={Wrench} label="Skills" count={`${data.skills.length} skills`}
                  done={imported.has('skills')}
                  onImport={() => { onImportSkills(data.skills); markImported('skills'); }} />
              )}

              {/* Certifications */}
              {data.certifications.length > 0 && (
                <ImportRow icon={Award} label="Certifications" count={`${data.certifications.length}`}
                  done={imported.has('certifications')}
                  onImport={() => { onImportCertifications(data.certifications); markImported('certifications'); }} />
              )}

              {/* Languages */}
              {data.languages.length > 0 && (
                <ImportRow icon={Globe} label="Languages" count={`${data.languages.length}`}
                  done={imported.has('languages')}
                  onImport={() => { onImportLanguages(data.languages); markImported('languages'); }} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportRow({ icon: Icon, label, count, done, onImport }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: string;
  done: boolean;
  onImport: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted" />
        <span className="text-xs font-bold uppercase tracking-wide text-white">{label}</span>
        {count && <span className="text-[10px] text-muted">{count}</span>}
      </div>
      {done ? (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-brand-light"><Check className="w-3 h-3" /> Imported</span>
      ) : (
        <button onClick={onImport}
          className="neo-btn neo-btn-primary text-[10px] px-2 py-1">
          Import
        </button>
      )}
    </div>
  );
}
