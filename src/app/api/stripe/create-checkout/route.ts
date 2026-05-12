import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPriceId } from '@/lib/stripe';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ url: null });
  }

  const { plan, type, is_additional, business_id } = await req.json();

  // Additional business seat
  if (type === 'additional_business' || is_additional) {
    const additionalPriceId = process.env.STRIPE_ADDITIONAL_BUSINESS_PRICE_ID;
    if (!additionalPriceId) {
      // Stripe add-on not configured — skip to connect
      return NextResponse.json({ url: null });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    // Reuse existing Stripe customer from any of the user's businesses
    const { data: anyBusiness } = await supabase
      .from('businesses')
      .select('stripe_customer_id, email, name')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .single();

    let customerId = anyBusiness?.stripe_customer_id as string | undefined;

    if (!customerId) {
      // No customer yet — create one from the new business record
      const { data: newBiz } = await supabase
        .from('businesses')
        .select('email, name')
        .eq('id', business_id)
        .eq('user_id', user.id)
        .single();

      if (!newBiz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

      const customer = await stripe.customers.create({
        email: newBiz.email || user.email || '',
        name: newBiz.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      // Store on the new business
      await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', business_id)
        .eq('user_id', user.id);
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: additionalPriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/connect?new=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/plan?new=true`,
      metadata: { userId: user.id, business_id: business_id ?? '', plan: 'additional' },
    });

    return NextResponse.json({ url: checkoutSession.url });
  }

  // First business — standard plan checkout
  let priceId: string;
  try { priceId = getPriceId(plan as 'starter' | 'growth' | 'pro'); }
  catch (err) {
    Sentry.captureException(err, { tags: { route: 'stripe/create-checkout' }, extra: { plan } });
    return NextResponse.json({ url: null });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const { data: business } = await supabase
    .from('businesses')
    .select('id, stripe_customer_id, email, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  let customerId = business.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: business.email || user.email || '',
      name: business.name,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await supabase
      .from('businesses')
      .update({ stripe_customer_id: customerId })
      .eq('id', business.id);
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    subscription_data: { trial_period_days: 14 },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?onboarded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/plan`,
    metadata: { userId: user.id, business_id: business.id, plan },
  });

  return NextResponse.json({ url: checkoutSession.url });
}