-- ============================================================
-- The Dev CV — Public shareable CV links
--
-- Adds an opt-in share mechanism so a CV can be viewed via a tokenised URL
-- by anyone (no login, no account) without exposing the user's full list of
-- CVs. Token-by-token access only: RLS stays closed, and a SECURITY DEFINER
-- function returns profile + sections for one matching token.
--
-- Authed users toggle `is_shared` / rotate `share_token` through the normal
-- RLS-protected UPDATE path. Tokens are 32 hex chars (16 random bytes).
-- ============================================================

ALTER TABLE public.cv_profiles
    ADD COLUMN IF NOT EXISTS share_token TEXT,
    ADD COLUMN IF NOT EXISTS is_shared   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shared_at   TIMESTAMPTZ;

-- Tokens are globally unique across all users; a collision would let a
-- different account's CV resolve to the same URL. Partial unique index
-- allows multiple NULLs for unshared CVs.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cv_profiles_share_token
    ON public.cv_profiles(share_token)
    WHERE share_token IS NOT NULL;

COMMENT ON COLUMN public.cv_profiles.share_token IS
    'Opaque 32-hex-char token used in public /s/:token URLs. Rotated to revoke old links.';
COMMENT ON COLUMN public.cv_profiles.is_shared IS
    'User-controlled master switch. Token alone is insufficient — is_shared must also be true for get_shared_cv to return the row.';

-- ─────────────────────────────────────────────────────────────
-- get_shared_cv(token)
--
-- Public read RPC. Returns the CV + all sections as a single JSONB blob
-- when the token matches an actively-shared profile, else NULL.
--
-- SECURITY DEFINER is required because anon has no RLS access to cv_*.
-- The function is deliberately narrow: it only returns data for profiles
-- where both is_shared = true AND share_token = p_token. It never exposes
-- user_id, billing fields, or other rows.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_shared_cv(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.cv_profiles;
    v_result  JSONB;
BEGIN
    IF p_token IS NULL OR length(p_token) < 16 THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_profile
    FROM public.cv_profiles
    WHERE share_token = p_token AND is_shared = TRUE
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Scrub fields that are useful in the editor but not meant for public
    -- eyes: internal IDs stay, but we strip user_id so the share link can't
    -- be used as an oracle to enumerate other CVs.
    v_result := jsonb_build_object(
        'profile', to_jsonb(v_profile) - 'user_id',
        'experience',     (SELECT COALESCE(jsonb_agg(e ORDER BY e.sort_order), '[]'::jsonb) FROM public.cv_experience    e WHERE e.profile_id = v_profile.id),
        'education',      (SELECT COALESCE(jsonb_agg(e ORDER BY e.sort_order), '[]'::jsonb) FROM public.cv_education     e WHERE e.profile_id = v_profile.id),
        'skills',         (SELECT COALESCE(jsonb_agg(s ORDER BY s.sort_order), '[]'::jsonb) FROM public.cv_skills        s WHERE s.profile_id = v_profile.id),
        'certifications', (SELECT COALESCE(jsonb_agg(c ORDER BY c.sort_order), '[]'::jsonb) FROM public.cv_certifications c WHERE c.profile_id = v_profile.id),
        'projects',       (SELECT COALESCE(jsonb_agg(p ORDER BY p.sort_order), '[]'::jsonb) FROM public.cv_projects      p WHERE p.profile_id = v_profile.id),
        'languages',      (SELECT COALESCE(jsonb_agg(l ORDER BY l.sort_order), '[]'::jsonb) FROM public.cv_languages     l WHERE l.profile_id = v_profile.id)
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_cv(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- ensure_share_token()
--
-- Convenience RPC for the owner: turns sharing on, generates a token if
-- missing, stamps shared_at, and returns the resulting token. Runs as the
-- caller (RLS enforces they own the row).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_share_token(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
BEGIN
    UPDATE public.cv_profiles
       SET share_token = COALESCE(share_token, encode(gen_random_bytes(16), 'hex')),
           is_shared   = TRUE,
           shared_at   = COALESCE(shared_at, NOW())
     WHERE id = p_profile_id
    RETURNING share_token INTO v_token;

    RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_share_token(UUID) TO authenticated;
