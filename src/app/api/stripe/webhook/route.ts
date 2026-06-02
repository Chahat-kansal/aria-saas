export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

function tierFromPriceId(priceId: string | undefined): string {
  if (!priceId) return 'starter'
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro'
  if (priceId === process.env.STRIPE_PRICE_ID_GROWTH) return 'growth'
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return 'starter'
  return 'starter'
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency — skip already-processed events
  const { data: existing } = await supabaseAdmin
    .from('stripe_events')
    .select('id, processed')
    .eq('id', event.id)
    .maybeSingle()

  if (existing?.processed) {
    return NextResponse.json({ received: true })
  }

  await supabaseAdmin.from('stripe_events').upsert(
    { id: event.id, type: event.type, processed: false, created_at: new Date().toISOString() },
    { onConflict: 'id' }
  )

  try {
    // ── checkout.session.completed ─────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const businessId = session.metadata?.business_id
      const userId = session.metadata?.user_id ?? session.metadata?.userId
      const tier = (session.metadata?.tier ?? session.metadata?.plan ?? 'starter') as string
      const stripeSubId = session.subscription as string
      const customerId = session.customer as string

      if (businessId) {
        await supabaseAdmin.from('business_subscriptions').upsert({
          business_id: businessId,
          stripe_customer_id: customerId,
          stripe_subscription_id: stripeSubId,
          tier,
          status: 'active',
          trial_ends_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id' })

        // Also update businesses.plan for quick access
        if (userId) {
          await supabaseAdmin.from('businesses')
            .update({ plan: tier, stripe_customer_id: customerId, stripe_subscription_id: stripeSubId })
            .eq('id', businessId)
            .eq('user_id', userId)
        }
      }
    }

    // ── customer.subscription.created / updated ────────────────────────────
    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const priceId = sub.items.data[0]?.price.id
      const tier = tierFromPriceId(priceId)

      // Find business by stripe_customer_id
      const { data: bSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('business_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bSub?.business_id) {
        await supabaseAdmin.from('business_subscriptions').update({
          stripe_subscription_id: sub.id,
          tier,
          status: sub.status,
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_start: new Date((sub as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq('business_id', bSub.business_id)

        await supabaseAdmin.from('businesses')
          .update({ plan: tier })
          .eq('id', bSub.business_id)
      }
    }

    // ── customer.subscription.deleted ─────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

      await supabaseAdmin.from('business_subscriptions').update({
        status: 'canceled',
        cancel_at_period_end: false,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId)
    }

    // ── invoice.payment_succeeded ──────────────────────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id
      if (customerId) {
        await supabaseAdmin.from('business_subscriptions').update({
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)
      }
    }

    // ── invoice.payment_failed ─────────────────────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id
      if (customerId) {
        await supabaseAdmin.from('business_subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('stripe_customer_id', customerId)

        // Write a dashboard notification
        const { data: bSub } = await supabaseAdmin
          .from('business_subscriptions')
          .select('business_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (bSub?.business_id) {
          await supabaseAdmin.from('aria_notifications').upsert({
            business_id: bSub.business_id,
            type: 'payment_failed',
            title: 'Payment failed',
            message: 'Your last payment could not be processed. Please update your payment method to keep Aria running.',
            action_url: '/dashboard/billing',
            action_label: 'Update payment',
            read: false,
            created_at: new Date().toISOString(),
          }, { onConflict: 'business_id,type', ignoreDuplicates: false })
        }
      }
    }

    await supabaseAdmin.from('stripe_events').update({ processed: true }).eq('id', event.id)
  } catch (err) {
    console.error('[stripe/webhook] processing error:', err)
    // Don't mark processed — Stripe will retry
  }

  return NextResponse.json({ received: true })
}
