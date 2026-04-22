-- ============================================================
-- The Dev CV — Plans & free-tier gating
-- Free users: 1 CV profile. Pro users: unlimited.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_plans (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own plan" ON public.user_plans;
CREATE POLICY "Users read own plan" ON public.user_plans
    FOR SELECT USING (auth.uid() = user_id);

-- Users can never write their own plan — only service_role (admin)
-- flips free↔pro when billing resolves.

-- Auto-provision a 'free' plan whenever a new auth user is created.
CREATE OR REPLACE FUNCTION public.handle_new_user_plan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_plans (user_id, plan)
    VALUES (NEW.id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created_plan ON auth.users;
CREATE TRIGGER on_auth_user_created_plan
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_plan();

-- Backfill any existing users that don't have a plan row
INSERT INTO public.user_plans (user_id, plan)
SELECT id, 'free' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Free-tier enforcement: block INSERT on cv_profiles past the quota
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_cv_profile_quota()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_plan TEXT;
    profile_count INT;
BEGIN
    SELECT plan INTO current_plan FROM public.user_plans WHERE user_id = NEW.user_id;
    -- Missing plan row = treat as free (safe default)
    IF current_plan IS NULL THEN current_plan := 'free'; END IF;

    IF current_plan = 'free' THEN
        SELECT COUNT(*) INTO profile_count
        FROM public.cv_profiles
        WHERE user_id = NEW.user_id;

        IF profile_count >= 1 THEN
            RAISE EXCEPTION 'Free plan limit reached: upgrade to Pro to create more CV versions.'
                USING ERRCODE = 'P0001', HINT = 'free_plan_limit';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_cv_profile_quota_trg ON public.cv_profiles;
CREATE TRIGGER enforce_cv_profile_quota_trg
    BEFORE INSERT ON public.cv_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cv_profile_quota();

-- Convenience helpers exposed to the client
CREATE OR REPLACE FUNCTION public.get_my_plan()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((SELECT plan FROM public.user_plans WHERE user_id = auth.uid()), 'free')
$$;

GRANT EXECUTE ON FUNCTION public.get_my_plan() TO anon, authenticated;
