-- ============================================================
-- The Dev CV — profile enrichment (resume-builder skill alignment)
--
-- Adds career-stage + industry context to each CV so AI prompts and the
-- editor's Quality Checks panel can tailor guidance to the candidate's
-- situation (entry-level vs senior, tech vs healthcare, etc.).
--
-- Also adds two fields that the skill calls out specifically for entry-level
-- CVs: relevant_coursework (comma-separated course names) and capstone_project
-- (short project summary). Both are nullable — non-entry-level CVs leave them
-- blank and the UI hides them.
-- ============================================================

ALTER TABLE public.cv_profiles
    ADD COLUMN IF NOT EXISTS career_stage        TEXT,
    ADD COLUMN IF NOT EXISTS industry            TEXT,
    ADD COLUMN IF NOT EXISTS relevant_coursework TEXT,
    ADD COLUMN IF NOT EXISTS capstone_project    TEXT;

-- career_stage is a controlled vocabulary; industry is free text (the UI
-- offers the 11 common industries from the skill but allows custom values for
-- edge cases like defence, education, non-profit subsectors).
ALTER TABLE public.cv_profiles
    DROP CONSTRAINT IF EXISTS cv_profiles_career_stage_check;

ALTER TABLE public.cv_profiles
    ADD CONSTRAINT cv_profiles_career_stage_check
    CHECK (career_stage IS NULL OR career_stage IN (
        'entry_level',
        'mid_career',
        'senior',
        'executive',
        'career_changer'
    ));

COMMENT ON COLUMN public.cv_profiles.career_stage IS
    'One of entry_level / mid_career / senior / executive / career_changer. Drives AI guidance and section ordering (entry_level renders education before experience).';
COMMENT ON COLUMN public.cv_profiles.industry IS
    'Free-text industry label, typically from the UI-suggested list (technology, healthcare, finance, marketing, education, legal, retail, non_profit, government, creative, manufacturing).';
