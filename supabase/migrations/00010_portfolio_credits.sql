-- ============================================================
-- The Dev CV — Portfolio export credit cost
-- Adds the `portfolio_export` row to credit_costs so the existing
-- consume_credits() RPC can charge users for downloading their
-- self-contained portfolio HTML file.
-- ============================================================

INSERT INTO public.credit_costs (action, cost) VALUES
    ('portfolio_export', 2)
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost;
