export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getPriceId } from '@/lib/stripe'
import { PLANS } from '@/lib/billing/plans'

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in — tell the client to redirect to login
  if (!user) {
    return NextResponse.json(
      { error: 'unauthenticated', redirect: '/login?redirectTo=/billing' },
      { status: 401 }
    )
  }

  const body = await req.json().catch(() => ({}))
  // MS12 PHASE 3 — the tier is VALIDATED against the registry, not cast. This string reaches
  // Stripe metadata and comes back through the webhook into business_subscriptions.tier — an
  // arbitrary body value here would become a live tier row (exactly how orphan vocabulary is
  // born). Unknown tiers are refused, not defaulted.
  const rawTier = String(body.tier || body.plan || '')
  if (!(rawTier in PLANS)) {
    return NextResponse.json({ error: 'unknown_tier', message: `Tier must be one of: ${Object.keys(PLANS).join(', ')}` }, { status: 400 })
  }
  const tier = rawTier as 'starter' | 'growth' | 'pro'

  let priceId: string
  try { priceId = getPriceId(tier) }
  catch {
    return NextResponse.json(
      { error: 'billing_not_configured', message: `Add STRIPE_PRICE_ID_${(tier ?? '').toUpperCase()} to Vercel env vars` },
      { status: 503 }
    )
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, email')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: sub } = await supabase
    .from('business_subscriptions')
    .select('stripe_customer_id')
    .eq('business_id', business.id)
    .maybeSingle()

  let customerId = sub?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: business.email || user.email || '',
      name: business.name,
      metadata: { business_id: business.id, user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('business_subscriptions').upsert(
      { business_id: business.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
      { onConflict: 'business_id' }
    )
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://ariaos.site'
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    subscription_data: {
      trial_period_days: 14,
      metadata: { business_id: business.id, user_id: user.id, tier },
    },
    success_url: `${base}/dashboard/billing?success=true&plan=${tier}`,
    cancel_url: `${base}/billing`,
    metadata: { business_id: business.id, user_id: user.id, tier, plan: tier },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
