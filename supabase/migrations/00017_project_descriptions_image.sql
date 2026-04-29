-- ============================================================
-- The Dev CV — Per-destination project descriptions + cover image
--
-- Lets users tailor a single project to two audiences without losing
-- the convenience of a shared baseline:
--   • description           — existing column, the shared default
--   • cv_description        — optional override used by the CV / PDF /
--                             plain-text renderers (falls back to
--                             description when NULL/empty)
--   • portfolio_description — optional override used by the Portfolio
--                             HTML renderer (same fallback rule)
--   • image_url             — cover image URL rendered at the top of
--                             each portfolio project card (portfolio
--                             only — CV stays text-only / ATS-safe)
--
-- All three columns are additive and nullable so existing rows behave
-- exactly as before. Renderers do `<override> ?? description`.
-- ============================================================

ALTER TABLE public.cv_projects
    ADD COLUMN IF NOT EXISTS cv_description        TEXT,
    ADD COLUMN IF NOT EXISTS portfolio_description TEXT,
    ADD COLUMN IF NOT EXISTS image_url             TEXT;

COMMENT ON COLUMN public.cv_projects.cv_description IS
    'Optional CV-specific description that overrides `description` on the CV / PDF / plain-text renderers. NULL = use shared description.';
COMMENT ON COLUMN public.cv_projects.portfolio_description IS
    'Optional portfolio-specific description that overrides `description` on the Portfolio HTML renderer. NULL = use shared description.';
COMMENT ON COLUMN public.cv_projects.image_url IS
    'Cover image URL rendered at the top of the project card on the Portfolio HTML export. CV remains text-only for ATS safety.';
