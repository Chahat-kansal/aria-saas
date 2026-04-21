import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const plan = (session.metadata?.plan as 'starter' | 'growth' | 'pro') || 'starter';

    if (userId) {
      await supabaseAdmin
        .from('businesses')
        .update({
          plan,
          stripe_subscription_id: session.subscription as string,
        })
        .eq('user_id', userId);
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    await supabaseAdmin
      .from('businesses')
      .update({ plan: sub.metadata?.plan || 'starter' })
      .eq('stripe_subscription_id', sub.id);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    await supabaseAdmin
      .from('businesses')
      .update({ plan: 'starter', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id);
  }

  return NextResponse.json({ received: true });
}
