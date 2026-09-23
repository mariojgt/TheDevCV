/**
 * Thin client for the Supabase Edge Function `ai` — proxies Claude API calls so
 * the Anthropic key is never exposed to the browser.
 *
 * Every call consumes credits on the server. If the user's balance is too low
 * the function returns HTTP 402 with:
 *   { error: 'insufficient_credits', action, cost }
 * We surface that as an `InsufficientCreditsError` so UI can show a "buy more"
 * prompt instead of a generic error toast.
 *
 * The Edge Function expects:
 *   { prompt: string, system?: string, max_tokens?: number, action?: CreditAction }
 * and returns:
 *   { text: string }
 */
import { supabase } from './supabase';
import { partialParse } from './partial-json';
import type { CreditAction } from './types';

export class InsufficientCreditsError extends Error {
  constructor(public action: CreditAction, public cost: number) {
    super(`insufficient_credits:${action}`);
    this.name = 'InsufficientCreditsError';
  }
}

export interface AICallOptions {
  system?: string;
  maxTokens?: number;
  /** Billable action — determines how many credits get deducted. */
  action?: CreditAction;
}

export async function aiComplete(prompt: string, opts: AICallOptions = {}): Promise<string> {
  const action: CreditAction = opts.action ?? 'ai_improve';

  const { data, error } = await supabase.functions.invoke('ai', {
    body: {
      prompt,
      system: opts.system,
      max_tokens: opts.maxTokens ?? 2000,
      action,
    },
  });

  // supabase-js surfaces non-2xx responses as `error`. Try to extract the JSON body
  // so we can distinguish 402 insufficient-credits from generic failures.
  if (error) {
    const ctx: any = (error as any).context;
    let payload: any = null;
    try {
      if (ctx && typeof ctx.json === 'function') payload = await ctx.json();
      else if (ctx && typeof ctx.text === 'function') payload = JSON.parse(await ctx.text());
    } catch { /* ignore parse errors */ }

    if (payload?.error === 'insufficient_credits') {
      throw new InsufficientCreditsError(payload.action ?? action, payload.cost ?? 0);
    }
    throw error;
  }

  const text = (data as { text?: string } | null)?.text;
  if (typeof text !== 'string') throw new Error('AI response missing text');
  return text;
}

/** Parse a JSON object out of a Claude response that may be wrapped in markdown/prose or truncated. */
export function extractJSON<T = unknown>(text: string): T | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? text.match(/```\s*([\s\S]*?)```/)?.[1];
  const candidate = (fence ?? text).trim();
  try { return JSON.parse(candidate) as T; } catch { /* fall through */ }
  const first = candidate.indexOf('{');
  const last  = candidate.lastIndexOf('}');
  if (first > -1 && last > first) {
    try { return JSON.parse(candidate.slice(first, last + 1)) as T; } catch { /* fall through */ }
  }
  // Last resort: tolerant parse of a possibly-truncated structure.
  const recovered = partialParse(candidate) as T | null;
  return recovered;
}
