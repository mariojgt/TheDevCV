-- ============================================================
-- Fix: ensure_share_token() 42883 — "gen_random_bytes does not exist"
--
-- Supabase installs pgcrypto in the `extensions` schema, not `public`.
-- The 00008 migration sets `search_path = public` inside the function, so
-- the unqualified `gen_random_bytes(16)` call can't be resolved at execute
-- time and the RPC 500s with a 42883 error from the PostgREST client.
--
-- Two fixes, applied together for safety:
--   1. Qualify the call as `extensions.gen_random_bytes(...)` so it works
--      regardless of the runtime search_path.
--   2. Expand search_path to include `extensions` so any future pgcrypto /
--      other-extension calls inside the function body Just Work.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_share_token(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    v_token TEXT;
BEGIN
    UPDATE public.cv_profiles
       SET share_token = COALESCE(share_token, encode(extensions.gen_random_bytes(16), 'hex')),
           is_shared   = TRUE,
           shared_at   = COALESCE(shared_at, NOW())
     WHERE id = p_profile_id
    RETURNING share_token INTO v_token;

    RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_share_token(UUID) TO authenticated;
