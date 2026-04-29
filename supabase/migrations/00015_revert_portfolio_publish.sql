-- ============================================================
-- The Dev CV — Revert hosted-portfolio slug system (00014)
--
-- We pivoted away from hosted /p/<slug> portfolios in favour of
-- GitHub-Pages export with embedded OG image + SEO meta. The columns
-- and functions added by 00014 are unused, so drop them cleanly to
-- keep the schema honest.
--
-- Safe because nothing in the app reads or writes these yet —
-- 00014 was pushed but never wired into any UI. If a row somehow
-- has portfolio_is_public = TRUE, dropping the column will discard
-- that flag along with the slug; that's fine, the public RPC is
-- being dropped at the same time.
-- ============================================================

-- Drop functions first (they reference the column types).
DROP FUNCTION IF EXISTS public.get_published_portfolio(TEXT);
DROP FUNCTION IF EXISTS public.update_portfolio_slug(UUID, TEXT);
DROP FUNCTION IF EXISTS public.unpublish_portfolio(UUID);
DROP FUNCTION IF EXISTS public.publish_portfolio(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public._validate_portfolio_slug(TEXT);

-- Drop the partial unique index (would auto-drop with the column,
-- but explicit is clearer and order-independent).
DROP INDEX IF EXISTS public.uniq_cv_profiles_portfolio_slug;

ALTER TABLE public.cv_profiles
    DROP COLUMN IF EXISTS portfolio_config,
    DROP COLUMN IF EXISTS portfolio_published_at,
    DROP COLUMN IF EXISTS portfolio_is_public,
    DROP COLUMN IF EXISTS portfolio_slug;
