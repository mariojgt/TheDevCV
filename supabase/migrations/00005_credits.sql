-- ============================================================
-- The Dev CV — Credit-based system (replaces plan/subscription)
-- Every AI call, CV creation, and export consumes credits.
-- Users start with 10 free credits at signup and top up via Stripe.
-- ============================================================

-- ------------------------------------------------------------
-- credit_costs — central price list for billable actions.
-- Edit here (or via service_role) to re-price features.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_costs (
    action     TEXT PRIMARY KEY,
    cost       INT  NOT NULL CHECK (cost >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.credit_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read credit costs" ON public.credit_costs;
CREATE POLICY "Anyone can read credit costs" ON public.credit_costs FOR SELECT USING (true);

INSERT INTO public.credit_costs (action, cost) VALUES
    ('create_cv',    1),
    ('export_pdf',   1),
    ('ats_score',    2),
    ('ai_improve',   1),
    ('ai_optimize',  3),
    ('ai_tailor',    5)
ON CONFLICT (action) DO NOTHING;

-- ------------------------------------------------------------
-- user_credits — per-user balance + Stripe mapping.
-- One row per user, provisioned on auth signup.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_credits (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance            INT  NOT NULL DEFAULT 0 CHECK (balance >= 0),
    lifetime_granted   INT  NOT NULL DEFAULT 0,
    lifetime_consumed  INT  NOT NULL DEFAULT 0,
    stripe_customer_id TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_customer ON public.user_credits(stripe_customer_id);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own credits" ON public.user_credits;
CREATE POLICY "Users read own credits" ON public.user_credits
    FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — only service_role and SECURITY DEFINER RPCs mutate.

-- ------------------------------------------------------------
-- credit_transactions — append-only audit log.
-- Every grant (+) and consumption (-) writes a row.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action        TEXT NOT NULL,          -- 'signup_grant' | 'pack_small' | 'ai_tailor' | 'refund_ai_tailor' | ...
    delta         INT  NOT NULL,          -- positive = grant, negative = consumption
    balance_after INT  NOT NULL,
    reference     TEXT,                    -- stripe event id / cv profile id / ...
    metadata      JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON public.credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference   ON public.credit_transactions(reference) WHERE reference IS NOT NULL;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own credit_transactions" ON public.credit_transactions;
CREATE POLICY "Users read own credit_transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- RPCs
-- ============================================================

-- consume_credits — atomic check + decrement, called by the user (RLS).
-- Raises SQLSTATE 'P0002' with HINT = <action> when balance is too low.
CREATE OR REPLACE FUNCTION public.consume_credits(
    p_action    TEXT,
    p_reference TEXT  DEFAULT NULL,
    p_metadata  JSONB DEFAULT NULL
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    uid         UUID := auth.uid();
    action_cost INT;
    new_balance INT;
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    SELECT cost INTO action_cost FROM public.credit_costs WHERE action = p_action;
    IF action_cost IS NULL THEN
        RAISE EXCEPTION 'unknown_action: %', p_action USING ERRCODE = '22023';
    END IF;

    -- Make sure a row exists (defensive — normally the signup trigger already did this).
    INSERT INTO public.user_credits (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.user_credits
    SET balance           = balance - action_cost,
        lifetime_consumed = lifetime_consumed + action_cost,
        updated_at        = NOW()
    WHERE user_id = uid AND balance >= action_cost
    RETURNING balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0002', HINT = p_action;
    END IF;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, reference, metadata)
    VALUES (uid, p_action, -action_cost, new_balance, p_reference, p_metadata);

    RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_credits(TEXT, TEXT, JSONB) TO authenticated;

-- consume_credits_for — service-role variant used by Edge Functions (after JWT verification).
CREATE OR REPLACE FUNCTION public.consume_credits_for(
    p_user_id   UUID,
    p_action    TEXT,
    p_reference TEXT  DEFAULT NULL,
    p_metadata  JSONB DEFAULT NULL
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    action_cost INT;
    new_balance INT;
BEGIN
    SELECT cost INTO action_cost FROM public.credit_costs WHERE action = p_action;
    IF action_cost IS NULL THEN
        RAISE EXCEPTION 'unknown_action: %', p_action USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.user_credits (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.user_credits
    SET balance           = balance - action_cost,
        lifetime_consumed = lifetime_consumed + action_cost,
        updated_at        = NOW()
    WHERE user_id = p_user_id AND balance >= action_cost
    RETURNING balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0002', HINT = p_action;
    END IF;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, reference, metadata)
    VALUES (p_user_id, p_action, -action_cost, new_balance, p_reference, p_metadata);

    RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_credits_for(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- grant_credits — add credits (Stripe purchase success, refund, promo).
CREATE OR REPLACE FUNCTION public.grant_credits(
    p_user_id   UUID,
    p_amount    INT,
    p_action    TEXT,
    p_reference TEXT  DEFAULT NULL,
    p_metadata  JSONB DEFAULT NULL
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    new_balance INT;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'grant amount must be positive';
    END IF;

    INSERT INTO public.user_credits (user_id, balance, lifetime_granted)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance          = user_credits.balance          + EXCLUDED.balance,
        lifetime_granted = user_credits.lifetime_granted + EXCLUDED.balance,
        updated_at       = NOW()
    RETURNING balance INTO new_balance;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, reference, metadata)
    VALUES (p_user_id, p_action, p_amount, new_balance, p_reference, p_metadata);

    RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_credits(UUID, INT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- set_stripe_customer — webhook stores user ↔ stripe customer mapping.
CREATE OR REPLACE FUNCTION public.set_stripe_customer(
    p_user_id            UUID,
    p_stripe_customer_id TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.user_credits (user_id, stripe_customer_id)
    VALUES (p_user_id, p_stripe_customer_id)
    ON CONFLICT (user_id) DO UPDATE
    SET stripe_customer_id = EXCLUDED.stripe_customer_id,
        updated_at         = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_stripe_customer(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- get_my_credits — client-facing read RPC.
CREATE OR REPLACE FUNCTION public.get_my_credits()
RETURNS TABLE(balance INT, lifetime_granted INT, lifetime_consumed INT)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(c.balance, 0), COALESCE(c.lifetime_granted, 0), COALESCE(c.lifetime_consumed, 0)
    FROM public.user_credits c
    WHERE c.user_id = auth.uid()
    UNION ALL
    SELECT 0, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM public.user_credits WHERE user_id = auth.uid())
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_credits() TO authenticated;

-- ============================================================
-- Signup hook — grants 10 credits on new auth.users row.
-- Replaces the old plan-provisioning trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    initial_grant INT := 10;
BEGIN
    INSERT INTO public.user_credits (user_id, balance, lifetime_granted)
    VALUES (NEW.id, initial_grant, initial_grant)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, metadata)
    VALUES (NEW.id, 'signup_grant', initial_grant, initial_grant, jsonb_build_object('reason', 'welcome'));

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_plan    ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- Backfill existing users (anyone without a credits row gets the same welcome grant).
INSERT INTO public.user_credits (user_id, balance, lifetime_granted)
SELECT id, 10, 10 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, metadata)
SELECT u.id, 'signup_grant', 10, 10, jsonb_build_object('reason', 'backfill')
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_transactions t
    WHERE t.user_id = u.id AND t.action = 'signup_grant'
);

-- Preserve Stripe customer ids already collected under the subscription model.
UPDATE public.user_credits uc
SET stripe_customer_id = up.stripe_customer_id
FROM public.user_plans up
WHERE uc.user_id = up.user_id
  AND up.stripe_customer_id IS NOT NULL
  AND uc.stripe_customer_id IS NULL;

-- ============================================================
-- Replace the old free-tier quota trigger with a credit charge
-- on every new CV profile insert. BEFORE INSERT so the row never
-- lands if the charge fails — the transaction rolls back.
-- ============================================================
DROP TRIGGER  IF EXISTS enforce_cv_profile_quota_trg ON public.cv_profiles;
DROP FUNCTION IF EXISTS public.enforce_cv_profile_quota();

CREATE OR REPLACE FUNCTION public.charge_cv_profile_credits()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- consume_credits reads auth.uid(); RLS already guarantees NEW.user_id = auth.uid().
    -- Raises P0002 ('insufficient_credits') on empty balance, rolling the INSERT back.
    PERFORM public.consume_credits(
        'create_cv',
        NEW.id::text,
        jsonb_build_object('version_name', NEW.version_name)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS charge_cv_profile_credits_trg ON public.cv_profiles;
CREATE TRIGGER charge_cv_profile_credits_trg
    BEFORE INSERT ON public.cv_profiles
    FOR EACH ROW EXECUTE FUNCTION public.charge_cv_profile_credits();

-- ============================================================
-- Retire subscription-era RPCs. user_plans is left in place for
-- historical data (stripe_customer_id, past plans) but is no
-- longer read by application code.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_plan();
DROP FUNCTION IF EXISTS public.get_my_billing();
DROP FUNCTION IF EXISTS public.apply_stripe_subscription(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN);

COMMENT ON TABLE public.user_plans IS
    'DEPRECATED: superseded by user_credits in 00005_credits.sql. Kept for historical Stripe customer mapping.';
