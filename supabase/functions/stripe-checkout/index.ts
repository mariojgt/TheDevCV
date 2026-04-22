/**
 * POST /functions/v1/stripe-checkout
 * Body: { pack: 'small' | 'medium' | 'large' }
 *
 * Creates (or reuses) a Stripe customer for the authenticated user and returns a
 * one-time Checkout Session URL that credits the user's account on completion.
 * The webhook reads `credits` out of session metadata and calls grant_credits.
 *
 * Success → /billing/success, Cancel → /pricing.
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_PACK_SMALL      (one-time price, e.g. £5 for 50 credits)
 *   STRIPE_PRICE_PACK_MEDIUM     (one-time price, e.g. £15 for 200 credits)
 *   STRIPE_PRICE_PACK_LARGE      (one-time price, e.g. £30 for 500 credits)
 *   APP_URL                      (e.g. https://thedevcv.com)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';
import { handleCors, json } from '../_shared/cors.ts';
import { getUserFromRequest } from '../_shared/auth.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5174';

type PackId = 'small' | 'medium' | 'large';

/** Keep in sync with Pricing.tsx. Credits granted per pack are authoritative here. */
const PACKS: Record<PackId, { envPrice: string; credits: number; label: string }> = {
  small:  { envPrice: 'STRIPE_PRICE_PACK_SMALL',  credits: 50,  label: '50 credits'  },
  medium: { envPrice: 'STRIPE_PRICE_PACK_MEDIUM', credits: 200, label: '200 credits' },
  large:  { envPrice: 'STRIPE_PRICE_PACK_LARGE',  credits: 500, label: '500 credits' },
};

async function resolveStripeCustomerId(userId: string, email: string | null): Promise<string> {
  const { data: existing } = await admin
    .from('user_credits')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  await admin.rpc('set_stripe_customer', {
    p_user_id: userId,
    p_stripe_customer_id: customer.id,
  });

  return customer.id;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { pack } = (await req.json()) as { pack?: PackId };
    if (!pack || !(pack in PACKS)) return json({ error: 'invalid_pack' }, 400);

    const { envPrice, credits, label } = PACKS[pack];
    const priceId = Deno.env.get(envPrice);
    if (!priceId) return json({ error: 'missing_price_config', detail: envPrice }, 500);

    const customerId = await resolveStripeCustomerId(user.id, user.email);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      metadata: {
        supabase_user_id: user.id,
        credits: String(credits),
        pack,
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          credits: String(credits),
          pack,
        },
        description: `${label} — The Dev CV`,
      },
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/pricing`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[stripe-checkout]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
