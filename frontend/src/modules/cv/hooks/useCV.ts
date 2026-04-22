import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

export function useCV() {
  const [profiles, setProfiles] = useState<CVProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from('cv_profiles').select('*').order('is_default', { ascending: false });
    if (err) setError(err.message);
    setProfiles((data as CVProfile[]) || []);
    setLoading(false);
  }, []);

  const saveProfile = async (profile: Partial<CVProfile>): Promise<{ data: CVProfile | null; error: string | null }> => {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setUserId(uid);
    }
    if (!uid) return { data: null, error: 'Not authenticated' };

    const clean: Record<string, unknown> = {};
    const fields = ['version_name', 'is_default', 'full_name', 'job_title', 'email', 'phone',
      'location', 'website', 'linkedin', 'github', 'portfolio', 'summary', 'target_role', 'keywords', 'ats_score',
      'career_stage', 'industry', 'relevant_coursework', 'capstone_project'];
    for (const f of fields) {
      if ((profile as any)[f] !== undefined) clean[f] = (profile as any)[f];
    }

    if (profile.id) {
      const { data, error: err } = await supabase.from('cv_profiles').update(clean).eq('id', profile.id).select().single();
      if (!err) await fetchProfiles();
      return { data: data as CVProfile | null, error: err?.message || null };
    } else {
      const { data, error: err } = await supabase.from('cv_profiles').insert({ ...clean, user_id: uid }).select().single();
      if (!err) await fetchProfiles();
      return { data: data as CVProfile | null, error: err?.message || null };
    }
  };

  const deleteProfile = async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('cv_profiles').delete().eq('id', id);
    if (!err) await fetchProfiles();
    return { error: err?.message || null };
  };

  const duplicateProfile = async (id: string): Promise<{ data: CVProfile | null; error: string | null }> => {
    let uid = userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setUserId(uid);
    }
    if (!uid) return { data: null, error: 'Not authenticated' };

    // Fetch the source profile
    const { data: src, error: srcErr } = await supabase.from('cv_profiles').select('*').eq('id', id).single();
    if (srcErr || !src) return { data: null, error: srcErr?.message || 'Profile not found' };

    // Create the duplicate profile
    const { id: _id, created_at, updated_at, ...profileFields } = src as CVProfile & { created_at: string; updated_at: string };
    const { data: newProfile, error: profErr } = await supabase.from('cv_profiles').insert({
      ...profileFields,
      user_id: uid,
      version_name: `${src.version_name} (Copy)`,
      is_default: false,
    }).select().single();
    if (profErr || !newProfile) return { data: null, error: profErr?.message || 'Failed to duplicate' };

    const newId = (newProfile as CVProfile).id;

    // Copy all sections in parallel
    const tables = ['cv_experience', 'cv_education', 'cv_skills', 'cv_certifications', 'cv_projects', 'cv_languages'] as const;
    await Promise.all(tables.map(async (table) => {
      const { data: rows } = await supabase.from(table).select('*').eq('profile_id', id).order('sort_order');
      if (!rows?.length) return;
      const copies = rows.map((row: any) => {
        const { id: _rid, created_at: _c, profile_id: _p, ...rest } = row;
        return { ...rest, profile_id: newId };
      });
      await supabase.from(table).insert(copies);
    }));

    await fetchProfiles();
    return { data: newProfile as CVProfile, error: null };
  };

  // ── Section CRUD (generic) ──────────────────
  const fetchSection = async <T>(table: string, profileId: string): Promise<T[]> => {
    const { data } = await supabase.from(table).select('*').eq('profile_id', profileId).order('sort_order');
    return (data as T[]) || [];
  };

  const saveSection = async (table: string, item: any, profileId: string): Promise<{ data: any; error: string | null }> => {
    const { id, created_at, profile_id, ...rest } = item;

    if (id && typeof id === 'string' && id.length > 10) {
      const { data, error: err } = await supabase.from(table).update(rest).eq('id', id).select().single();
      return { data, error: err?.message || null };
    } else {
      const { data, error: err } = await supabase.from(table).insert({ ...rest, profile_id: profileId }).select().single();
      return { data, error: err?.message || null };
    }
  };

  const deleteSection = async (table: string, id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from(table).delete().eq('id', id);
    return { error: err?.message || null };
  };

  const reorderSection = async (table: string, items: { id: string; sort_order: number }[]) => {
    for (const item of items) {
      await supabase.from(table).update({ sort_order: item.sort_order }).eq('id', item.id);
    }
  };

  // ── Typed helpers ───────────────────────────
  const fetchExperience = (pid: string) => fetchSection<CVExperience>('cv_experience', pid);
  const fetchEducation = (pid: string) => fetchSection<CVEducation>('cv_education', pid);
  const fetchSkills = (pid: string) => fetchSection<CVSkill>('cv_skills', pid);
  const fetchCertifications = (pid: string) => fetchSection<CVCertification>('cv_certifications', pid);
  const fetchProjects = (pid: string) => fetchSection<CVProject>('cv_projects', pid);
  const fetchLanguages = (pid: string) => fetchSection<CVLanguage>('cv_languages', pid);

  const saveExperience = (item: any, pid: string) => saveSection('cv_experience', item, pid);
  const saveEducation = (item: any, pid: string) => saveSection('cv_education', item, pid);
  const saveSkill = (item: any, pid: string) => saveSection('cv_skills', item, pid);
  const saveCertification = (item: any, pid: string) => saveSection('cv_certifications', item, pid);
  const saveProject = (item: any, pid: string) => saveSection('cv_projects', item, pid);
  const saveLanguage = (item: any, pid: string) => saveSection('cv_languages', item, pid);

  const deleteExperience = (id: string) => deleteSection('cv_experience', id);
  const deleteEducation = (id: string) => deleteSection('cv_education', id);
  const deleteSkill = (id: string) => deleteSection('cv_skills', id);
  const deleteCertification = (id: string) => deleteSection('cv_certifications', id);
  const deleteProject = (id: string) => deleteSection('cv_projects', id);
  const deleteLanguage = (id: string) => deleteSection('cv_languages', id);

  return {
    profiles, loading, error, fetchProfiles, saveProfile, deleteProfile, duplicateProfile, reorderSection,
    fetchExperience, saveExperience, deleteExperience,
    fetchEducation, saveEducation, deleteEducation,
    fetchSkills, saveSkill, deleteSkill,
    fetchCertifications, saveCertification, deleteCertification,
    fetchProjects, saveProject, deleteProject,
    fetchLanguages, saveLanguage, deleteLanguage,
  };
}
