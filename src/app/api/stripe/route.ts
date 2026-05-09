export const maxDuration = 30
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { headers } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

function priceToTier(priceId: string | undefined): string {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'growth'
  if (priceId === process.env.STRIPE_PRICE_AUTONOMOUS) return 'autonomous'
  return 'starter'
}

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ subscription: null })

  const { data: sub } = await supabase
    .from('business_subscriptions')
    .select('tier, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, cancelled_at')
    .eq('business_id', bid)
    .maybeSingle()

  return NextResponse.json({ subscription: sub ?? null })
}

export async function POST(request: NextRequest) {
  const action = new URL(request.url).searchParams.get('action')

  if (action === 'webhook') {
    const body = await request.text()
    const sig = (await headers()).get('stripe-signature')
    if (!sig) return new NextResponse('Missing signature', { status: 400 })

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    } catch (err) {
      return new NextResponse(`Webhook Error: ${(err as Error).message}`, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    const { data: existing } = await supabase
      .from('stripe_events')
      .select('processed')
      .eq('id', event.id)
      .maybeSingle()

    if (existing?.processed) return NextResponse.json({ received: true })

    await supabase.from('stripe_events').insert({
      id: event.id,
      type: event.type,
      payload: event.data.object as unknown as Record<string, unknown>,
    })

    try {
      if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const priceId = sub.items.data[0]?.price.id
        const tier = priceToTier(priceId)

        const { data: bSub } = await supabase
          .from('business_subscriptions')
          .select('business_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (bSub) {
          await supabase.from('business_subscriptions').update({
            stripe_subscription_id: sub.id,
            tier,
            status: sub.status,
            trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq('business_id', bSub.business_id)
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        await supabase.from('business_subscriptions').update({
          status: 'canceled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)
      }

      await supabase.from('stripe_events').update({ processed: true }).eq('id', event.id)
    } catch (err) {
      console.error('[stripe/webhook] processing error:', err)
    }

    return NextResponse.json({ received: true })
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  if (action === 'create_checkout') {
    const { tier } = await request.json() as { tier: string }

    const priceMap: Record<string, string | undefined> = {
      starter: process.env.STRIPE_PRICE_STARTER,
      growth: process.env.STRIPE_PRICE_GROWTH,
      autonomous: process.env.STRIPE_PRICE_AUTONOMOUS,
    }
    const priceId = priceMap[tier]
    if (!priceId) return NextResponse.json({ error: 'invalid_tier' }, { status: 400 })

    const { data: existingSub } = await supabase
      .from('business_subscriptions')
      .select('stripe_customer_id')
      .eq('business_id', bid)
      .maybeSingle()

    let customerId: string
    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { business_id: bid, user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('business_subscriptions').upsert(
        { business_id: bid, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'business_id' }
      )
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://ariaos.site'
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${base}/pos/settings/billing?success=true`,
      cancel_url: `${base}/pos/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  }

  if (action === 'create_portal') {
    const { data: sub } = await supabase
      .from('business_subscriptions')
      .select('stripe_customer_id')
      .eq('business_id', bid)
      .maybeSingle()

    if (!sub?.stripe_customer_id) return NextResponse.json({ error: 'no_customer' }, { status: 404 })

    const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://ariaos.site'
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${base}/pos/settings/billing`,
    })

    return NextResponse.json({ url: session.url })
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}
