export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { decideEventAction, priceIdToTier } from '@/lib/billing/webhook-guards'
import { PLANS } from '@/lib/billing/plans'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

// COST-LEDGER-1 — pulls the real Stripe processing fee off the charge's balance_transaction and
// logs it as a payment_fee cost_event. cost_events' (provider, reference_id) unique index makes
// this idempotent against the backfill script (scripts/backfill-stripe-fees.ts) covering the same
// balance_transaction id.
async function logChargeFee(charge: Stripe.Charge): Promise<void> {
  const btId = typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction?.id
  if (!btId) return // e.g. a $0 or not-yet-settled charge — no fee to record yet
  try {
    const bt = await stripe.balanceTransactions.retrieve(btId)
    if (bt.currency !== 'usd') {
      console.warn('[stripe/webhook] balance_transaction currency is not usd, skipping fee log:', bt.currency, btId)
      return
    }
    const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
    let businessId: string | null = null
    if (customerId) {
      const { data: bSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('business_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      businessId = (bSub?.business_id as string | undefined) ?? null
    }
    const { error } = await supabaseAdmin.from('cost_events').insert({
      category: 'payment_fee',
      provider: 'stripe',
      business_id: businessId,
      reference_id: btId,
      amount_usd_cents: bt.fee,
      quantity: 1,
      unit: 'charge',
      metadata: { charge_id: charge.id, gross_usd_cents: bt.amount, net_usd_cents: bt.net, fee_details: bt.fee_details },
    })
    // 23505 = unique_violation on (provider, reference_id) — already logged (webhook redelivery or
    // the backfill script beat this event to it). Not an error.
    if (error && error.code !== '23505') console.error('[stripe/webhook] cost_events insert failed:', error.message)
  } catch (err) {
    console.error('[stripe/webhook] logChargeFee failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

// MS12 PHASE 4 — tier mapping moved to webhook-guards.priceIdToTier: unknown price IDs now
// REFUSE (null) instead of defaulting to 'starter'. The old copy, with unset env vars (true
// today), would have labelled every subscription 'starter' regardless of price paid.

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

  // Idempotency — FAIL CLOSED (MS12 phase 4). If the store can't be read or the marker can't be
  // written, we refuse with 500 so Stripe retries later; processing without a dedupe record is
  // how an event double-applies. The old code discarded both errors (RULE 7).
  const { data: existing, error: idemReadErr } = await supabaseAdmin
    .from('stripe_events')
    .select('id, processed')
    .eq('id', event.id)
    .maybeSingle()

  const decision = decideEventAction(existing, idemReadErr)
  if (decision === 'fail_closed') {
    console.error('[stripe/webhook] idempotency store unreadable — refusing event', event.id, idemReadErr?.message)
    return NextResponse.json({ error: 'idempotency_store_unavailable' }, { status: 500 })
  }
  if (decision === 'skip') {
    return NextResponse.json({ received: true })
  }

  const { error: idemWriteErr } = await supabaseAdmin.from('stripe_events').upsert(
    { id: event.id, type: event.type, processed: false, received_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
  if (idemWriteErr) {
    console.error('[stripe/webhook] idempotency marker write failed — refusing event', event.id, idemWriteErr.message)
    return NextResponse.json({ error: 'idempotency_store_unavailable' }, { status: 500 })
  }

  try {
    // ── checkout.session.completed ─────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const businessId = session.metadata?.business_id
      const userId = session.metadata?.user_id ?? session.metadata?.userId
      // MS12 phase 4 — checkout metadata tier is validated at checkout creation (phase 3), but a
      // webhook must not trust it blind: an unknown label updates LIFECYCLE fields only, never
      // the tier/plan, and logs loudly. Status/period/ids only — nothing here moves money.
      const metaTier = (session.metadata?.tier ?? session.metadata?.plan ?? null) as string | null
      const tierKnown = metaTier !== null && metaTier in PLANS
      if (metaTier !== null && !tierKnown) console.error('[stripe/webhook] unknown tier in checkout metadata — lifecycle updated, tier left alone:', metaTier)
      const stripeSubId = session.subscription as string
      const customerId = session.customer as string

      if (businessId) {
        await supabaseAdmin.from('business_subscriptions').upsert({
          business_id: businessId,
          stripe_customer_id: customerId,
          stripe_subscription_id: stripeSubId,
          ...(tierKnown ? { tier: metaTier } : {}),
          status: 'active',
          trial_ends_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'business_id' })

        // Also update businesses.plan for quick access
        if (userId) {
          await supabaseAdmin.from('businesses')
            .update({ ...(tierKnown ? { plan: metaTier } : {}), stripe_customer_id: customerId, stripe_subscription_id: stripeSubId })
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
      // REFUSE, don't guess: an unrecognised price ID updates lifecycle fields only.
      const tier = priceIdToTier(priceId)
      if (tier === null) console.error('[stripe/webhook] unknown price id — lifecycle updated, tier left alone:', priceId)

      // Find business by stripe_customer_id
      const { data: bSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('business_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      if (bSub?.business_id) {
        await supabaseAdmin.from('business_subscriptions').update({
          stripe_subscription_id: sub.id,
          ...(tier !== null ? { tier } : {}),
          status: sub.status,
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_start: new Date((sub as any).current_period_start * 1000).toISOString(),
          current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq('business_id', bSub.business_id)

        if (tier !== null) {
          await supabaseAdmin.from('businesses')
            .update({ plan: tier })
            .eq('id', bSub.business_id)
        }
      }
    }

    // ── customer.subscription.trial_will_end (MS12 phase 4) ────────────────
    // Stripe sends this ~3 days before a trial converts. Notification only — no money moves.
    if (event.type === 'customer.subscription.trial_will_end') {
      const sub = event.data.object as Stripe.Subscription
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      const { data: bSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('business_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (bSub?.business_id) {
        await supabaseAdmin.from('aria_notifications').upsert({
          business_id: bSub.business_id,
          type: 'trial_ending',
          title: 'Your trial ends soon',
          message: 'Your Aria trial ends in about 3 days. Add a payment method to keep everything running.',
          action_url: '/dashboard/billing',
          action_label: 'Manage billing',
          read: false,
          created_at: new Date().toISOString(),
        }, { onConflict: 'business_id,type', ignoreDuplicates: false })
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

        // Mark current month's Reel invoices as paid
        const { data: bSub } = await supabaseAdmin
          .from('business_subscriptions')
          .select('business_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()
        if (bSub?.business_id) {
          const billingMonth = new Date().toISOString().slice(0, 7)
          await supabaseAdmin.from('reel_monthly_invoices').update({ status: 'paid' })
            .eq('business_id', bSub.business_id)
            .eq('billing_month', billingMonth)
            .eq('status', 'billed')
        }
      }
    }

    // ── charge.succeeded (COST-LEDGER-1) ───────────────────────────────────
    // NOTE: this event type must be enabled on the Stripe dashboard's webhook endpoint config
    // (or via `stripe listen`/API) for this branch to ever fire — code alone can't subscribe a
    // live webhook endpoint to a new event type.
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as Stripe.Charge
      await logChargeFee(charge)
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
