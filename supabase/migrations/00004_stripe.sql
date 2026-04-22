-- ============================================================
-- The Dev CV — Stripe billing columns + secure plan writer
-- ============================================================

-- Add Stripe tracking columns to user_plans
ALTER TABLE public.user_plans
    ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
    ADD COLUMN IF NOT EXISTS current_period_end       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_plans_stripe_customer    ON public.user_plans(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_stripe_subscription ON public.user_plans(stripe_subscription_id);

-- ============================================================
-- Stripe events log (idempotency guard for webhooks)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stripe_events (
    id          TEXT PRIMARY KEY,              -- Stripe event id (evt_...)
    type        TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    payload     JSONB
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies — only service_role (webhook) touches this table.

-- ============================================================
-- apply_stripe_subscription — called by the webhook Edge Function.
-- SECURITY DEFINER so it can write to user_plans. Must only be called
-- by the service_role (verified Stripe webhook signature).
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stripe_subscription(
    p_user_id                UUID,
    p_stripe_customer_id     TEXT,
    p_stripe_subscription_id TEXT,
    p_plan                   TEXT,
    p_current_period_end     TIMESTAMPTZ,
    p_cancel_at_period_end   BOOLEAN
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_plan NOT IN ('free', 'pro') THEN
        RAISE EXCEPTION 'plan must be free or pro';
    END IF;

    INSERT INTO public.user_plans (
        user_id, plan, stripe_customer_id, stripe_subscription_id,
        current_period_end, cancel_at_period_end, updated_at
    )
    VALUES (
        p_user_id, p_plan, p_stripe_customer_id, p_stripe_subscription_id,
        p_current_period_end, p_cancel_at_period_end, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan                   = EXCLUDED.plan,
        stripe_customer_id     = COALESCE(EXCLUDED.stripe_customer_id, user_plans.stripe_customer_id),
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        current_period_end     = EXCLUDED.current_period_end,
        cancel_at_period_end   = EXCLUDED.cancel_at_period_end,
        updated_at             = NOW();
END;
$$ LANGUAGE plpgsql;

-- Only service_role may execute (webhooks run with service_role).
REVOKE EXECUTE ON FUNCTION public.apply_stripe_subscription FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Convenience: surface billing info to the client
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_billing()
RETURNS TABLE(plan TEXT, current_period_end TIMESTAMPTZ, cancel_at_period_end BOOLEAN)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(p.plan, 'free')::TEXT,
        p.current_period_end,
        COALESCE(p.cancel_at_period_end, false)
    FROM public.user_plans p
    WHERE p.user_id = auth.uid()
    UNION ALL
    SELECT 'free', NULL, false
    WHERE NOT EXISTS (SELECT 1 FROM public.user_plans WHERE user_id = auth.uid())
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_billing() TO authenticated;
