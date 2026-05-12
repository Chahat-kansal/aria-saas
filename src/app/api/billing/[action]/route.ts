export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Params = { params: Promise<{ action: string }> };

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { action } = await params;
  if (action !== 'status') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ subscription: null });

  const { data: sub } = await supabase.from('business_subscriptions').select('*').eq('business_id', bid).maybeSingle();
  return NextResponse.json({ subscription: sub ?? null });
}

export async function POST(req: Request, { params }: Params) {
  const { action } = await params;

  if (action === 'webhook') {
    const rawBody = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: existing } = await supabase.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
    if (existing) return NextResponse.json({ received: true });

    await supabase.from('stripe_events').insert({ id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { business_id, tier } = (session.metadata ?? {}) as { business_id?: string; tier?: string };
      if (business_id) {
        await supabase.from('business_subscriptions').upsert({
          business_id,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          tier: tier ?? 'starter',
          status: 'trialing',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id' });
      }
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from('business_subscriptions').update({
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', sub.id);
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from('business_subscriptions').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', sub.id);
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      await supabase.from('business_subscriptions').update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', invoice.subscription as string);
    }

    await supabase.from('stripe_events').update({ processed: true }).eq('id', event.id);
    return NextResponse.json({ received: true });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  if (action === 'checkout') {
    const { tier } = await req.json() as { tier: string };
    // Normalise 'autonomous' legacy alias → 'pro'
    const normTier = tier === 'autonomous' ? 'pro' : tier;
    let priceId: string;
    try { const { getPriceId } = await import('@/lib/stripe'); priceId = getPriceId(normTier as 'starter' | 'growth' | 'pro'); }
    catch { return NextResponse.json({ error: 'Invalid tier' }, { status: 400 }); }

    const { data: existingSub } = await supabase.from('business_subscriptions').select('stripe_customer_id').eq('business_id', bid).maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_URL ?? 'https://ariaos.site'}/pos?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_URL ?? 'https://ariaos.site'}/pricing`,
      client_reference_id: bid,
      metadata: { business_id: bid, tier },
      subscription_data: { trial_period_days: 14 },
      ...(existingSub?.stripe_customer_id ? { customer: existingSub.stripe_customer_id } : {}),
    });

    return NextResponse.json({ url: session.url });
  }

  if (action === 'portal') {
    const { data: sub } = await supabase.from('business_subscriptions').select('stripe_customer_id').eq('business_id', bid).maybeSingle();
    if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'No subscription found' }, { status: 400 });

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_URL ?? 'https://ariaos.site'}/pos/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
