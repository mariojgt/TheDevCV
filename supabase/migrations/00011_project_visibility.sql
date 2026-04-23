-- ============================================================
-- The Dev CV — Per-destination visibility for Projects
--
-- Lets users keep a single pool of projects on their profile but
-- pick which ones appear on the exported CV PDF vs the exported
-- Portfolio HTML. Defaults to TRUE for both so existing projects
-- keep appearing everywhere on first deploy.
-- ============================================================

ALTER TABLE public.cv_projects
    ADD COLUMN IF NOT EXISTS show_on_cv        BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS show_on_portfolio BOOLEAN NOT NULL DEFAULT TRUE;
