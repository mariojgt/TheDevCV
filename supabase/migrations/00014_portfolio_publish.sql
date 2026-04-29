-- ============================================================
-- The Dev CV — Hosted public portfolio URLs
--
-- Adds /p/<slug> hosting for portfolios. Mirrors the public-CV pattern
-- from migration 00008 but uses human-readable slugs (not opaque tokens)
-- because portfolios are personal-brand artifacts where the URL is part
-- of the product. Auto-suffixes on collision so first-publish never
-- fails on a popular base name.
--
-- Anonymous read goes through get_published_portfolio() — SECURITY
-- DEFINER, narrow filter on portfolio_is_public = TRUE. Owner mutations
-- (publish / unpublish / rename) run SECURITY INVOKER under RLS so the
-- existing ownership policy on cv_profiles is the only gate.
-- ============================================================

ALTER TABLE public.cv_profiles
    ADD COLUMN IF NOT EXISTS portfolio_slug         TEXT,
    ADD COLUMN IF NOT EXISTS portfolio_is_public    BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS portfolio_published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS portfolio_config       JSONB       NOT NULL DEFAULT '{}'::jsonb;

-- Slugs are globally unique across all users so /p/<slug> resolves to a
-- single CV. Partial unique index allows multiple NULLs (unpublished CVs).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cv_profiles_portfolio_slug
    ON public.cv_profiles(portfolio_slug)
    WHERE portfolio_slug IS NOT NULL;

COMMENT ON COLUMN public.cv_profiles.portfolio_slug IS
    'Human-readable URL slug for /p/<slug>. Lowercase a-z, 0-9 and "-", 3-40 chars, no leading/trailing/double dashes. Globally unique. NULL = never published.';
COMMENT ON COLUMN public.cv_profiles.portfolio_is_public IS
    'Master on/off — both portfolio_slug AND portfolio_is_public must be set for get_published_portfolio() to return the row. Lets users unpublish without losing their slug.';
COMMENT ON COLUMN public.cv_profiles.portfolio_published_at IS
    'First-publish timestamp. Stays set on unpublish so we can show "first shipped on…" in analytics later.';
COMMENT ON COLUMN public.cv_profiles.portfolio_config IS
    'Serialised PortfolioBuilder config (theme, accent, sections, tagline, avatarUrl, enhanceWithGithub). Re-applied on every public render so the live page matches the editor preview.';

-- ─────────────────────────────────────────────────────────────
-- _validate_portfolio_slug()
--
-- Internal helper: trims + lowercases input, enforces format and the
-- reserved-word list. Raises with stable SQLSTATE-friendly error keys
-- so the frontend can map them to user-facing copy without parsing
-- HINT text.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._validate_portfolio_slug(p_slug TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_slug TEXT := lower(trim(coalesce(p_slug, '')));
BEGIN
    IF length(v_slug) = 0 THEN
        RAISE EXCEPTION 'portfolio_slug_empty' USING HINT = 'Slug is required.';
    END IF;
    -- 3–40 chars, must start AND end with [a-z0-9], dashes allowed inside.
    IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' THEN
        RAISE EXCEPTION 'portfolio_slug_invalid'
            USING HINT = 'Use 3–40 chars, lowercase a-z, 0-9 and dashes. Cannot start or end with a dash.';
    END IF;
    IF v_slug LIKE '%--%' THEN
        RAISE EXCEPTION 'portfolio_slug_invalid'
            USING HINT = 'Consecutive dashes are not allowed.';
    END IF;
    -- Reserved: app routes + common subdomains + Supabase paths so /p/api,
    -- /p/admin, etc. don't collide with future routes or look like phishing.
    IF v_slug = ANY (ARRAY[
        'app','api','admin','root','login','signin','signup','signout','logout',
        'pricing','privacy','terms','tos','legal','s','cv','p','auth','billing',
        'landing','settings','setting','dashboard','account','help','support',
        'about','home','contact','public','static','assets','images','img',
        'fonts','functions','rest','rpc','storage','realtime','www','mail',
        'email','blog','docs','doc','status','health','undefined','null',
        'thedevrealm','thedevcv'
    ]) THEN
        RAISE EXCEPTION 'portfolio_slug_reserved'
            USING HINT = 'That slug is reserved. Try a different one.';
    END IF;
    RETURN v_slug;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- publish_portfolio()
--
-- Owner RPC. Validates and claims the requested slug (auto-suffixes a
-- 4-hex-char tail on collision so first publish never fails on a
-- popular base name), persists the builder config, flips
-- portfolio_is_public on, and stamps published_at on first publish.
-- Returns the final slug — caller should use this, not the input,
-- when building the public URL.
--
-- SECURITY INVOKER — RLS on cv_profiles already restricts UPDATE to
-- the owner so unauthorised callers fail at the UPDATE not here.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_portfolio(
    p_profile_id UUID,
    p_slug       TEXT,
    p_config     JSONB DEFAULT '{}'::jsonb
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    v_base    TEXT;
    v_slug    TEXT;
    v_current TEXT;
    v_attempt INT := 0;
BEGIN
    v_base := public._validate_portfolio_slug(p_slug);
    v_slug := v_base;

    -- Skip the collision dance if we already own this exact slug — a
    -- re-publish (e.g. config changes only) shouldn't churn the URL.
    SELECT portfolio_slug INTO v_current
      FROM public.cv_profiles
     WHERE id = p_profile_id;

    IF v_current IS DISTINCT FROM v_slug THEN
        WHILE EXISTS (
            SELECT 1 FROM public.cv_profiles
             WHERE portfolio_slug = v_slug AND id <> p_profile_id
        ) LOOP
            v_attempt := v_attempt + 1;
            IF v_attempt > 10 THEN
                RAISE EXCEPTION 'portfolio_slug_unavailable'
                    USING HINT = 'Base slug and 10 random suffixes are all taken — pick another base.';
            END IF;
            v_slug := v_base || '-' || encode(extensions.gen_random_bytes(2), 'hex');
        END LOOP;
    END IF;

    UPDATE public.cv_profiles
       SET portfolio_slug         = v_slug,
           portfolio_is_public    = TRUE,
           portfolio_published_at = COALESCE(portfolio_published_at, NOW()),
           portfolio_config       = COALESCE(p_config, '{}'::jsonb)
     WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'cv_profile_not_found'
            USING HINT = 'No CV profile with that id, or you do not own it.';
    END IF;

    RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_portfolio(UUID, TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- unpublish_portfolio()
--
-- Flips portfolio_is_public off but keeps the slug claimed so a quick
-- toggle doesn't lose the user's URL. get_published_portfolio() filters
-- on is_public, so /p/<slug> 404s immediately for visitors.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unpublish_portfolio(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    UPDATE public.cv_profiles
       SET portfolio_is_public = FALSE
     WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unpublish_portfolio(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- update_portfolio_slug()
--
-- Renames a portfolio's URL. Same validation as publish_portfolio() but
-- collisions raise instead of auto-suffixing — a rename is an explicit
-- user action so a surprise "-a3f8" suffix on the requested slug would
-- be confusing. UI should call publish_portfolio() for the implicit
-- first-claim path, update_portfolio_slug() for explicit renames.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_portfolio_slug(
    p_profile_id UUID,
    p_slug       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_slug TEXT;
BEGIN
    v_slug := public._validate_portfolio_slug(p_slug);

    IF EXISTS (
        SELECT 1 FROM public.cv_profiles
         WHERE portfolio_slug = v_slug AND id <> p_profile_id
    ) THEN
        RAISE EXCEPTION 'portfolio_slug_taken'
            USING HINT = 'That slug is already in use.';
    END IF;

    UPDATE public.cv_profiles
       SET portfolio_slug = v_slug
     WHERE id = p_profile_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'cv_profile_not_found';
    END IF;

    RETURN v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_portfolio_slug(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- get_published_portfolio(slug)
--
-- Public read RPC. Mirrors get_shared_cv() from migration 00008 but
-- filtered on portfolio_is_public + slug, and returns only the
-- sections the portfolio renderer actually uses (profile, experience,
-- projects, skills, config). Education / certifications / languages
-- are intentionally omitted — PortfolioBuilder doesn't render them
-- and shipping them would be data leakage.
--
-- Project rows respect show_on_portfolio (migration 00011) so users can
-- hide a project from the live page without removing it from their CV.
--
-- SECURITY DEFINER: anon has no RLS access to cv_*. The function
-- filters to a single published row and scrubs user_id before
-- returning so the slug can't be used as an oracle.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_published_portfolio(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.cv_profiles;
    v_result  JSONB;
BEGIN
    IF p_slug IS NULL OR length(p_slug) < 3 THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_profile
      FROM public.cv_profiles
     WHERE portfolio_slug      = lower(p_slug)
       AND portfolio_is_public = TRUE
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_result := jsonb_build_object(
        'profile',    to_jsonb(v_profile) - 'user_id',
        'experience', (SELECT COALESCE(jsonb_agg(e ORDER BY e.sort_order), '[]'::jsonb)
                         FROM public.cv_experience e
                        WHERE e.profile_id = v_profile.id),
        'projects',   (SELECT COALESCE(jsonb_agg(p ORDER BY p.sort_order), '[]'::jsonb)
                         FROM public.cv_projects   p
                        WHERE p.profile_id = v_profile.id
                          AND COALESCE(p.show_on_portfolio, TRUE) = TRUE),
        'skills',     (SELECT COALESCE(jsonb_agg(s ORDER BY s.sort_order), '[]'::jsonb)
                         FROM public.cv_skills     s
                        WHERE s.profile_id = v_profile.id),
        'config',     v_profile.portfolio_config
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_portfolio(TEXT) TO anon, authenticated;
