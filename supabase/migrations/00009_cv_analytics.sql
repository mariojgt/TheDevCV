-- ============================================================
-- The Dev CV — Per-CV analytics
--
-- Adds lightweight event tracking for views (public share link) and
-- downloads (PDF export). Application + response metrics are NOT stored
-- here; they're derived live from job_applications.cv_profile_id so we
-- stay single-source-of-truth.
--
-- View events are written from inside get_shared_cv() (now replaced) so
-- anon visitors get counted without needing a separate tracking call.
-- Download events are written via record_cv_event() from the authed
-- editor after a successful PDF export.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cv_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL CHECK (event_type IN ('view', 'download')),
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_events_profile
    ON public.cv_events(profile_id, event_type, created_at DESC);

ALTER TABLE public.cv_events ENABLE ROW LEVEL SECURITY;

-- Owners can read their own events. No direct insert/update/delete —
-- writes go through record_cv_event() / get_shared_cv() only.
DROP POLICY IF EXISTS "Users read own events" ON public.cv_events;
CREATE POLICY "Users read own events" ON public.cv_events
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.cv_profiles
        WHERE id = profile_id AND user_id = auth.uid()
    ));

-- ─────────────────────────────────────────────────────────────
-- record_cv_event — write gate.
--
-- Validates each write against business rules:
--   - 'view'     : only allowed when the target profile is_shared
--   - 'download' : only allowed when the caller owns the profile
-- SECURITY DEFINER so anon can log views without direct table access.
-- Silently no-ops on invalid calls (never raises — don't break the UX).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_cv_event(
    p_profile_id UUID,
    p_event_type TEXT,
    p_metadata   JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_profile_id IS NULL OR p_event_type IS NULL THEN
        RETURN;
    END IF;

    IF p_event_type = 'view' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.cv_profiles
            WHERE id = p_profile_id AND is_shared = TRUE
        ) THEN
            RETURN;
        END IF;

    ELSIF p_event_type = 'download' THEN
        IF auth.uid() IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.cv_profiles
            WHERE id = p_profile_id AND user_id = auth.uid()
        ) THEN
            RETURN;
        END IF;

    ELSE
        RETURN;
    END IF;

    INSERT INTO public.cv_events (profile_id, event_type, metadata)
    VALUES (p_profile_id, p_event_type, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_cv_event(UUID, TEXT, JSONB) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- get_cv_stats — owner-only aggregated metrics for one CV.
--
-- Derived metrics:
--   views              — total + last 30 days
--   downloads          — total
--   applications       — anything past 'saved'
--   responses          — anything past 'applied' (excluding ghosted)
--   interviews         — at/past interview stage
--   offers             — at/past offer stage
--   response_rate      — responses / applications (integer %)
--   last_view          — most recent view timestamp
--
-- SECURITY INVOKER: relies on RLS on cv_events + job_applications so
-- users can only read their own numbers.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cv_stats(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_views         INT;
    v_views_30d     INT;
    v_downloads     INT;
    v_applications  INT;
    v_responses     INT;
    v_interviews    INT;
    v_offers        INT;
    v_last_view     TIMESTAMPTZ;
BEGIN
    -- RLS on cv_profiles means this returns 0 if the caller doesn't own it.
    IF NOT EXISTS (SELECT 1 FROM public.cv_profiles WHERE id = p_profile_id) THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO v_views         FROM public.cv_events WHERE profile_id = p_profile_id AND event_type = 'view';
    SELECT COUNT(*) INTO v_views_30d     FROM public.cv_events WHERE profile_id = p_profile_id AND event_type = 'view' AND created_at > NOW() - INTERVAL '30 days';
    SELECT COUNT(*) INTO v_downloads     FROM public.cv_events WHERE profile_id = p_profile_id AND event_type = 'download';
    SELECT MAX(created_at) INTO v_last_view FROM public.cv_events WHERE profile_id = p_profile_id AND event_type = 'view';

    SELECT COUNT(*) INTO v_applications  FROM public.job_applications WHERE cv_profile_id = p_profile_id AND status <> 'saved';
    SELECT COUNT(*) INTO v_responses     FROM public.job_applications WHERE cv_profile_id = p_profile_id AND status NOT IN ('saved','applied','ghosted');
    SELECT COUNT(*) INTO v_interviews    FROM public.job_applications WHERE cv_profile_id = p_profile_id AND status IN ('interview','technical','final_round','offer','accepted');
    SELECT COUNT(*) INTO v_offers        FROM public.job_applications WHERE cv_profile_id = p_profile_id AND status IN ('offer','accepted');

    RETURN jsonb_build_object(
        'views',         v_views,
        'views_30d',     v_views_30d,
        'downloads',     v_downloads,
        'applications',  v_applications,
        'responses',     v_responses,
        'interviews',    v_interviews,
        'offers',        v_offers,
        'response_rate', CASE WHEN v_applications > 0 THEN ROUND(100.0 * v_responses / v_applications)::INT ELSE 0 END,
        'last_view',     v_last_view
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cv_stats(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- get_shared_cv — REPLACES the 00008 version.
--
-- Same contract, plus: logs a view event whenever a shared CV is
-- successfully resolved. Anon calls are fine because this function
-- is SECURITY DEFINER (from 00008).
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

    -- Fire-and-forget view event. Intentionally NOT wrapped in a
    -- savepoint: if the insert ever fails (e.g. table missing during
    -- migration rollouts), we still return the CV.
    BEGIN
        INSERT INTO public.cv_events (profile_id, event_type, metadata)
        VALUES (v_profile.id, 'view', '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
        NULL;  -- swallow — analytics must never block a render
    END;

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
