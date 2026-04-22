-- ============================================================
-- The Dev CV — Core schema (CV profiles, sections, job tracker)
-- ============================================================

-- 1. CV Profiles
CREATE TABLE IF NOT EXISTS public.cv_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    version_name    TEXT NOT NULL DEFAULT 'Main CV',
    is_default      BOOLEAN DEFAULT FALSE,
    full_name       TEXT NOT NULL,
    job_title       TEXT,
    email           TEXT,
    phone           TEXT,
    location        TEXT,
    website         TEXT,
    linkedin        TEXT,
    github          TEXT,
    portfolio       TEXT,
    summary         TEXT,
    target_role     TEXT,
    keywords        TEXT[] DEFAULT '{}',
    ats_score       INT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_profiles_user ON public.cv_profiles(user_id);
ALTER TABLE public.cv_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv profiles" ON public.cv_profiles;
CREATE POLICY "Users manage own cv profiles" ON public.cv_profiles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Work Experience
CREATE TABLE IF NOT EXISTS public.cv_experience (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    company         TEXT NOT NULL,
    role            TEXT NOT NULL,
    location        TEXT,
    start_date      TEXT NOT NULL,
    end_date        TEXT,
    is_current      BOOLEAN DEFAULT FALSE,
    description     TEXT,
    achievements    TEXT[] DEFAULT '{}',
    technologies    TEXT[] DEFAULT '{}',
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_experience_profile ON public.cv_experience(profile_id);
ALTER TABLE public.cv_experience ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv experience" ON public.cv_experience;
CREATE POLICY "Users manage own cv experience" ON public.cv_experience
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 3. Education
CREATE TABLE IF NOT EXISTS public.cv_education (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    institution     TEXT NOT NULL,
    degree          TEXT NOT NULL,
    field           TEXT,
    location        TEXT,
    start_date      TEXT,
    end_date        TEXT,
    grade           TEXT,
    description     TEXT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_education_profile ON public.cv_education(profile_id);
ALTER TABLE public.cv_education ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv education" ON public.cv_education;
CREATE POLICY "Users manage own cv education" ON public.cv_education
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 4. Skills
CREATE TABLE IF NOT EXISTS public.cv_skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    category        TEXT DEFAULT 'Technical',
    proficiency     TEXT DEFAULT 'intermediate',
    years           INT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_skills_profile ON public.cv_skills(profile_id);
ALTER TABLE public.cv_skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv skills" ON public.cv_skills;
CREATE POLICY "Users manage own cv skills" ON public.cv_skills
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 5. Certifications
CREATE TABLE IF NOT EXISTS public.cv_certifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    issuer          TEXT,
    date_obtained   TEXT,
    expiry_date     TEXT,
    credential_id   TEXT,
    url             TEXT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_certs_profile ON public.cv_certifications(profile_id);
ALTER TABLE public.cv_certifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv certs" ON public.cv_certifications;
CREATE POLICY "Users manage own cv certs" ON public.cv_certifications
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 6. Projects
CREATE TABLE IF NOT EXISTS public.cv_projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    url             TEXT,
    technologies    TEXT[] DEFAULT '{}',
    highlights      TEXT[] DEFAULT '{}',
    start_date      TEXT,
    end_date        TEXT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_projects_profile ON public.cv_projects(profile_id);
ALTER TABLE public.cv_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv projects" ON public.cv_projects;
CREATE POLICY "Users manage own cv projects" ON public.cv_projects
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 7. Languages
CREATE TABLE IF NOT EXISTS public.cv_languages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    language        TEXT NOT NULL,
    proficiency     TEXT DEFAULT 'professional',
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_languages_profile ON public.cv_languages(profile_id);
ALTER TABLE public.cv_languages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv languages" ON public.cv_languages;
CREATE POLICY "Users manage own cv languages" ON public.cv_languages
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 8. Custom Sections
CREATE TABLE IF NOT EXISTS public.cv_custom_sections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    items           JSONB DEFAULT '[]',
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cv_custom_profile ON public.cv_custom_sections(profile_id);
ALTER TABLE public.cv_custom_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cv custom" ON public.cv_custom_sections;
CREATE POLICY "Users manage own cv custom" ON public.cv_custom_sections
    FOR ALL USING (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM cv_profiles WHERE id = profile_id AND user_id = auth.uid()));

-- 9. Job Applications
CREATE TABLE IF NOT EXISTS public.job_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cv_profile_id   UUID REFERENCES public.cv_profiles(id) ON DELETE SET NULL,
    company         TEXT NOT NULL,
    position        TEXT NOT NULL,
    location        TEXT,
    job_type        TEXT DEFAULT 'full_time' CHECK (job_type IN (
                        'full_time', 'part_time', 'contract', 'freelance', 'internship', 'remote'
                    )),
    salary_min      NUMERIC(12,2),
    salary_max      NUMERIC(12,2),
    salary_currency TEXT DEFAULT 'GBP',
    job_url         TEXT,
    job_description TEXT,
    status          TEXT DEFAULT 'saved' CHECK (status IN (
                        'saved', 'applied', 'screening', 'interview', 'technical',
                        'final_round', 'offer', 'accepted', 'rejected', 'withdrawn', 'ghosted'
                    )),
    applied_date    DATE,
    response_date   DATE,
    interview_dates JSONB DEFAULT '[]',
    ats_match_score INT,
    ai_cover_letter TEXT,
    ai_suggestions  JSONB DEFAULT '[]',
    recruiter_name  TEXT,
    recruiter_email TEXT,
    hiring_manager  TEXT,
    notes           TEXT,
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON public.job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.job_applications(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.job_applications(company);
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own jobs" ON public.job_applications;
CREATE POLICY "Users manage own jobs" ON public.job_applications
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Triggers
DROP TRIGGER IF EXISTS update_cv_profiles_updated_at ON public.cv_profiles;
CREATE TRIGGER update_cv_profiles_updated_at
    BEFORE UPDATE ON public.cv_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_job_applications_updated_at ON public.job_applications;
CREATE TRIGGER update_job_applications_updated_at
    BEFORE UPDATE ON public.job_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
