import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth: process.env.STRIPE_GROWTH_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    // Stripe not configured — return null url so onboarding can skip
    return NextResponse.json({ url: null });
  }

  const { plan } = await req.json();
  const priceId = PRICE_IDS[plan];
  if (!priceId) return NextResponse.json({ url: null });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_customer_id,email,name')
    .eq('user_id', session.user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  let customerId = business.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: business.email || session.user.email || '',
      name: business.name,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await supabase.from('businesses').update({ stripe_customer_id: customerId }).eq('user_id', session.user.id);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    subscription_data: { trial_period_days: 14 },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?onboarded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/plan`,
    metadata: { userId: session.user.id, plan },
  });

  return NextResponse.json({ url: checkoutSession.url });
}