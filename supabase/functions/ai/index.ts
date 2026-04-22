/**
 * POST /functions/v1/ai
 * Body: { prompt: string, system?: string, max_tokens?: number, action?: string }
 *
 * Proxies Claude API calls so the Anthropic key is never exposed to the browser.
 * Requires an authenticated Supabase session (JWT in Authorization header).
 *
 * Credit flow:
 *   1. Parse `action` (defaults to 'ai_improve') and validate against credit_costs.
 *   2. Atomically deduct credits via consume_credits_for (service role).
 *      If insufficient → return 402 with {error:'insufficient_credits', action, cost}.
 *   3. Call Anthropic. On non-2xx, refund via grant_credits.
 *
 * Required env:
 *   ANTHROPIC_API_KEY
 *   AI_MODEL   (optional — defaults to claude-sonnet-4-6)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { handleCors, json } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const AI_MODEL = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-4-6';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const ALLOWED_ACTIONS = new Set(['ai_improve', 'ai_optimize', 'ai_tailor', 'ats_score']);

async function costOf(action: string): Promise<number> {
  const { data } = await admin
    .from('credit_costs')
    .select('cost')
    .eq('action', action)
    .maybeSingle();
  return data?.cost ?? 0;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json()) as {
      prompt?: string;
      system?: string;
      max_tokens?: number;
      action?: string;
    };

    if (!body.prompt || typeof body.prompt !== 'string') {
      return json({ error: 'missing_prompt' }, 400);
    }

    const action = body.action && ALLOWED_ACTIONS.has(body.action) ? body.action : 'ai_improve';
    const cost = await costOf(action);

    // 1. Atomic deduct. insufficient_credits → 402.
    const { error: consumeErr } = await admin.rpc('consume_credits_for', {
      p_user_id:   user.id,
      p_action:    action,
      p_reference: null,
      p_metadata:  { source: 'ai_fn' },
    });
    if (consumeErr) {
      const msg = consumeErr.message ?? '';
      if (msg.includes('insufficient_credits')) {
        return json({ error: 'insufficient_credits', action, cost }, 402);
      }
      console.error('[ai] consume_credits_for failed', consumeErr);
      return json({ error: 'credit_check_failed', detail: msg }, 500);
    }

    // 2. Call Anthropic.
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: Math.min(body.max_tokens ?? 2000, 8192),
        system: body.system,
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[ai] anthropic error', resp.status, text);
      // Refund — user's call didn't succeed.
      if (cost > 0) {
        await admin.rpc('grant_credits', {
          p_user_id:   user.id,
          p_amount:    cost,
          p_action:    `refund_${action}`,
          p_reference: null,
          p_metadata:  { reason: 'anthropic_error', status: resp.status },
        });
      }
      return json({ error: 'ai_upstream_error', detail: text }, 502);
    }

    const data = (await resp.json()) as { content?: { type: string; text: string }[] };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
    return json({ text });
  } catch (err) {
    console.error('[ai]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
