-- ============================================================
-- The Dev CV — Admin panel
-- Admins can list all users, grant credits, and view per-user ledgers.
-- Admin status is a row in user_admins — SECURITY DEFINER RPCs gate access.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_admins (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT,
    added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_admins ENABLE ROW LEVEL SECURITY;
-- No policies — only SECURITY DEFINER RPCs and service_role may read/write.

-- is_admin — cheap boolean check for the current session.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_admins WHERE user_id = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- admin_list_users — one row per auth user with credit + CV summary.
-- Raises 'forbidden' (42501) if the caller isn't an admin.
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
    user_id            UUID,
    email              TEXT,
    signup_at          TIMESTAMPTZ,
    balance            INT,
    lifetime_granted   INT,
    lifetime_consumed  INT,
    cv_count           BIGINT,
    job_count          BIGINT,
    stripe_customer_id TEXT,
    is_admin           BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT
            u.id                                                              AS user_id,
            u.email::text                                                     AS email,
            u.created_at                                                      AS signup_at,
            COALESCE(c.balance, 0)                                            AS balance,
            COALESCE(c.lifetime_granted, 0)                                   AS lifetime_granted,
            COALESCE(c.lifetime_consumed, 0)                                  AS lifetime_consumed,
            COALESCE((SELECT COUNT(*) FROM public.cv_profiles p WHERE p.user_id = u.id), 0)       AS cv_count,
            COALESCE((SELECT COUNT(*) FROM public.job_applications j WHERE j.user_id = u.id), 0)  AS job_count,
            COALESCE(c.stripe_customer_id, '')                                AS stripe_customer_id,
            EXISTS(SELECT 1 FROM public.user_admins a WHERE a.user_id = u.id) AS is_admin
        FROM auth.users u
        LEFT JOIN public.user_credits c ON c.user_id = u.id
        ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- admin_grant_credits — bump a user's balance. Logs the ledger entry under
-- 'admin_grant' with the admin's user_id + reason for audit.
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
    p_target_user_id UUID,
    p_amount         INT,
    p_reason         TEXT DEFAULT NULL
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    admin_id    UUID := auth.uid();
    new_balance INT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.user_credits (user_id, balance, lifetime_granted)
    VALUES (p_target_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE
    SET balance          = user_credits.balance          + EXCLUDED.balance,
        lifetime_granted = user_credits.lifetime_granted + EXCLUDED.balance,
        updated_at       = NOW()
    RETURNING balance INTO new_balance;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, reference, metadata)
    VALUES (
        p_target_user_id,
        'admin_grant',
        p_amount,
        new_balance,
        admin_id::text,
        jsonb_build_object('granted_by', admin_id, 'reason', p_reason)
    );

    RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_credits(UUID, INT, TEXT) TO authenticated;

-- admin_adjust_credits — allow deducting / refunding. Negative delta cannot
-- push balance below zero (we clamp via UPDATE filter and raise if empty).
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
    p_target_user_id UUID,
    p_delta          INT,
    p_reason         TEXT DEFAULT NULL
)
RETURNS INT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    admin_id    UUID := auth.uid();
    new_balance INT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_delta = 0 THEN
        RAISE EXCEPTION 'delta must not be zero' USING ERRCODE = '22023';
    END IF;

    IF p_delta > 0 THEN
        RETURN public.admin_grant_credits(p_target_user_id, p_delta, p_reason);
    END IF;

    -- Negative delta: deduct but don't go below zero.
    UPDATE public.user_credits
    SET balance    = balance + p_delta,
        updated_at = NOW()
    WHERE user_id = p_target_user_id
      AND balance + p_delta >= 0
    RETURNING balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'insufficient_user_balance' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.credit_transactions (user_id, action, delta, balance_after, reference, metadata)
    VALUES (
        p_target_user_id,
        'admin_adjust',
        p_delta,
        new_balance,
        admin_id::text,
        jsonb_build_object('adjusted_by', admin_id, 'reason', p_reason)
    );

    RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(UUID, INT, TEXT) TO authenticated;

-- admin_list_transactions — ledger for a single user (most recent first).
CREATE OR REPLACE FUNCTION public.admin_list_transactions(
    p_target_user_id UUID,
    p_limit          INT DEFAULT 50
)
RETURNS TABLE (
    id            BIGINT,
    action        TEXT,
    delta         INT,
    balance_after INT,
    reference     TEXT,
    metadata      JSONB,
    created_at    TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
        SELECT t.id, t.action, t.delta, t.balance_after, t.reference, t.metadata, t.created_at
        FROM public.credit_transactions t
        WHERE t.user_id = p_target_user_id
        ORDER BY t.created_at DESC
        LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_transactions(UUID, INT) TO authenticated;

-- admin_toggle_admin — promote / demote another user. Non-destructive; a demoted
-- user keeps their credits and data, just loses admin RPC access.
CREATE OR REPLACE FUNCTION public.admin_toggle_admin(
    p_target_user_id UUID,
    p_make_admin     BOOLEAN
)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    caller_id UUID := auth.uid();
    target_email TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_target_user_id = caller_id AND NOT p_make_admin THEN
        RAISE EXCEPTION 'cannot demote yourself' USING ERRCODE = '22023';
    END IF;

    IF p_make_admin THEN
        SELECT email::text INTO target_email FROM auth.users WHERE id = p_target_user_id;
        INSERT INTO public.user_admins (user_id, email, added_by)
        VALUES (p_target_user_id, target_email, caller_id)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        DELETE FROM public.user_admins WHERE user_id = p_target_user_id;
    END IF;

    RETURN p_make_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_admin(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- Seed: promote mariojgt2@gmail.com as the first admin. Safe to re-run — the
-- ON CONFLICT clause no-ops if they're already in the table.
-- ============================================================
INSERT INTO public.user_admins (user_id, email)
SELECT id, email::text
FROM auth.users
WHERE email = 'mariojgt2@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
