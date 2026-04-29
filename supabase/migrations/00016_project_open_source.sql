-- ============================================================
-- The Dev CV — Open-source flag + repo URL on projects
--
-- Lets users mark projects as open source and provide a repo URL
-- that's separate from the existing `url` field (which is the live
-- demo / canonical link). The portfolio renderer surfaces an
-- "OPEN SOURCE" pill on flagged projects with a direct GitHub link
-- so recruiters can jump straight to the source without hunting for
-- it in the description.
--
-- Both columns are additive and default to FALSE / NULL so existing
-- rows behave exactly as before until the user opts in.
-- ============================================================

ALTER TABLE public.cv_projects
    ADD COLUMN IF NOT EXISTS is_open_source BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS repo_url       TEXT;

COMMENT ON COLUMN public.cv_projects.is_open_source IS
    'When TRUE the portfolio renderer adds an "OPEN SOURCE" pill to the project card and (when enhanceWithGithub is on) pulls license / stars / language from the repo URL.';
COMMENT ON COLUMN public.cv_projects.repo_url IS
    'Source repository URL (typically GitHub). Distinct from `url` so a project can have both a live demo link and a separate repo link.';
