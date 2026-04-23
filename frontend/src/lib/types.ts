/** Billable action names — must match `credit_costs.action` rows in the DB. */
export type CreditAction =
  | 'create_cv'
  | 'export_pdf'
  | 'ats_score'
  | 'ai_improve'
  | 'ai_optimize'
  | 'ai_tailor'
  | 'portfolio_export';

/**
 * Default costs used for UI gating before the DB is queried. The server is the
 * source of truth — if you re-price a feature in `credit_costs`, update this map
 * so free users see accurate "needs X credits" hints. Mismatches are safe: the
 * server will still refuse or charge the correct amount.
 */
export const CREDIT_COSTS: Record<CreditAction, number> = {
  create_cv:        1,
  export_pdf:       1,
  ats_score:        2,
  ai_improve:       1,
  ai_optimize:      3,
  ai_tailor:        5,
  portfolio_export: 2,
};

export interface UserCredits {
  balance: number;
  lifetime_granted: number;
  lifetime_consumed: number;
}

/**
 * Shape consumed by the CV module's useApp() hook.
 *
 * `encrypted_api_key` / `ai_provider` / `ai_model` are legacy fields from the
 * original Archiva module. In The Dev CV the Anthropic key lives server-side in
 * the `ai` Edge Function — we set `encrypted_api_key` to a sentinel string
 * ("server") purely so UI guards like `if (!settings.encrypted_api_key)` pass.
 * Never treat this as a real key.
 */
export interface UserSettings {
  user_id: string;
  theme: string;
  ai_enabled: boolean;
  ai_provider: 'anthropic';
  ai_model: string;
  encrypted_api_key: string;
}
