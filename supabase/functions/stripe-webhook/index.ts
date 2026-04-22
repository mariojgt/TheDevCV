/**
 * POST /functions/v1/stripe-webhook
 *
 * Verifies Stripe signature, then grants credits for completed one-time payments.
 * Must run with JWT verification DISABLED (see config.toml) — Stripe authenticates
 * via the signature header.
 *
 * Required env:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Events handled:
 *   checkout.session.completed  — credits granted when payment_status='paid'
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

async function resolveUserId(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromMeta = (session.metadata?.supabase_user_id as string | undefined) ?? null;
  const fromRef  = (session.client_reference_id as string | undefined) ?? null;
  if (fromMeta) return fromMeta;
  if (fromRef)  return fromRef;

  // Fallback: look up by the Stripe customer we recorded at checkout.
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  if (!customerId) return null;
  const { data } = await admin
    .from('user_credits')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function grantFromSession(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  if (session.payment_status !== 'paid') {
    console.log('[stripe-webhook] session not paid, skipping', session.id, session.payment_status);
    return;
  }

  const userId = await resolveUserId(session);
  if (!userId) {
    console.warn('[stripe-webhook] no supabase user for session', session.id);
    return;
  }

  const credits = Number(session.metadata?.credits ?? 0);
  if (!Number.isFinite(credits) || credits <= 0) {
    console.warn('[stripe-webhook] session missing credits metadata', session.id);
    return;
  }

  const pack = session.metadata?.pack ?? 'custom';
  const { error } = await admin.rpc('grant_credits', {
    p_user_id:   userId,
    p_amount:    credits,
    p_action:    `pack_${pack}`,
    p_reference: eventId,
    p_metadata:  {
      stripe_session_id: session.id,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      amount_total: session.amount_total,
      currency: session.currency,
    },
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('missing_signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err);
    return new Response('invalid_signature', { status: 400 });
  }

  // Idempotency guard — grant_credits is not idempotent, so we gate on the event id.
  const { data: seen } = await admin
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (seen) return new Response('already_processed', { status: 200 });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await grantFromSession(session, event.id);
    }
    // All other event types are ignored — we only care about completed payments.

    await admin.from('stripe_events').insert({
      id:      event.id,
      type:    event.type,
      payload: event as unknown as Record<string, unknown>,
    });
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[stripe-webhook] handler error', err);
    return new Response('handler_error', { status: 500 });
  }
});
