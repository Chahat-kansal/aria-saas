import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/observability/logger';
import { setSentryContext } from '@/lib/api/with-error-capture';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

async function syncSubscription(
  stripeSubId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await supabaseAdmin
    .from('business_subscriptions')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('stripe_subscription_id', stripeSubId)
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check — Stripe retries on non-200, deduplicate by event.id
  const { data: existing } = await supabaseAdmin
    .from('stripe_events')
    .select('id, processed')
    .eq('id', event.id)
    .maybeSingle();
  if (existing?.processed) {
    return NextResponse.json({ received: true }); // already processed
  }
  // Record event as seen (processed=false) before doing any work
  await supabaseAdmin
    .from('stripe_events')
    .upsert({ id: event.id, type: event.type, processed: false, created_at: new Date().toISOString() }, { onConflict: 'id' });

  setSentryContext({ operation: event.type, route: 'stripe/webhook' })
  logger.info('stripe webhook received', { route: 'stripe/webhook', eventType: event.type, eventId: event.id })

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const businessId = session.metadata?.business_id;
    const plan = (session.metadata?.plan as 'starter' | 'growth' | 'pro') || 'starter';
    const stripeSubId = session.subscription as string;
    const customerId = session.customer as string;

    if (userId && businessId) {
      await supabaseAdmin
        .from('businesses')
        .update({ plan, stripe_subscription_id: stripeSubId, stripe_customer_id: customerId })
        .eq('id', businessId)
        .eq('user_id', userId);

      // Sync business_subscriptions — clear trial, set active
      await supabaseAdmin
        .from('business_subscriptions')
        .upsert({
          business_id: businessId,
          stripe_subscription_id: stripeSubId,
          stripe_customer_id: customerId,
          tier: plan,
          status: 'active',
          trial_ends_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id' })
    } else if (userId) {
      if (customerId) {
        await supabaseAdmin
          .from('businesses')
          .update({ plan, stripe_subscription_id: stripeSubId })
          .eq('stripe_customer_id', customerId)
          .eq('user_id', userId);
      }
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const plan = (sub.metadata?.plan as string) || 'starter';
    await supabaseAdmin
      .from('businesses')
      .update({ plan })
      .eq('stripe_subscription_id', sub.id);

    await syncSubscription(sub.id, sub.status, {
      tier: plan,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
    })
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await supabaseAdmin
      .from('businesses')
      .update({ plan: 'starter', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id);

    await syncSubscription(sub.id, 'canceled', {
      cancelled_at: new Date().toISOString(),
    })
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : null
    if (stripeSubId) {
      await syncSubscription(stripeSubId, 'past_due')
      logger.warn('stripe invoice payment failed — subscription set past_due', {
        route: 'stripe/webhook', subscriptionId: stripeSubId,
      })
    }
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice;
    const stripeSubId = typeof invoice.subscription === 'string' ? invoice.subscription : null
    if (stripeSubId) {
      await syncSubscription(stripeSubId, 'active')
    }
  }

  // Mark event as processed after all handlers complete
  try {
    await supabaseAdmin
      .from('stripe_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', event.id);
    logger.info('stripe webhook processed', { route: 'stripe/webhook', eventType: event.type, eventId: event.id })
  } catch (err) {
    logger.error('stripe webhook mark-processed failed', { route: 'stripe/webhook', eventType: event.type, eventId: event.id, error: (err as Error).message })
    Sentry.captureException(err, { tags: { route: 'stripe/webhook' }, extra: { event_id: event.id, event_type: event.type } });
  }

  return NextResponse.json({ received: true });
}
