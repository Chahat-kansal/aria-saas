export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'
import { waitUntil } from '@vercel/functions'

// ORD-PAYMENT webhook — marks online orders paid after Stripe confirms, then earns loyalty.
//
// GROUNDING-TEETH — live vs. stubbed:
//   LIVE:    Signature verification, payment_intent.succeeded → stripe_payment_status='succeeded'
//            + paid_at, earnOnSale (via waitUntil so Stripe sees 200 before DB completes).
//   STUBBED: PayID one-tap preferred rail — surfaces automatically in AU if the Stripe account
//            has PayID enabled (Dashboard → Settings → Payment methods). automatic_payment_methods
//            is already set; no code change needed. Pre-Oct-2026 AU surcharge ban: PayID ~0%
//            vs card ~1.5-3% — enable it now.
//   FOUNDER TODO: register https://<domain>/api/webhooks/stripe-orders in Stripe Dashboard
//                 and paste the resulting signing secret as STRIPE_WEBHOOK_SECRET_ORDERS.
//
// Idempotency: guarded on paid_at (skip if already marked paid) + .eq(stripe_payment_intent_id)
// on the update so a Stripe replay of the same event cannot double-earn or double-update.
// DB update returns non-200 on failure so Stripe retries; earnOnSale errors are caught + logged.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET_ORDERS
  if (!secret) {
    // Not yet configured — accept silently so other webhooks on the same account are unaffected
    return NextResponse.json({ ok: true, note: 'STRIPE_WEBHOOK_SECRET_ORDERS not set' })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'bad signature' }, { status: 400 })
  }

  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ ok: true })
  }

  const pi = event.data.object as Stripe.PaymentIntent
  const meta = (pi.metadata ?? {}) as Record<string, string>
  if (meta.kind !== 'online_order') return NextResponse.json({ ok: true })

  const orderId = meta.order_id
  const businessId = meta.business_id
  const saleId = meta.sale_id || null
  const customerId = meta.customer_id || null
  const now = new Date().toISOString()

  if (!orderId || !businessId) return NextResponse.json({ ok: true })

  // Idempotency guard — skip if this order is already marked paid
  const { data: current } = await supabaseAdmin
    .from('pos_online_orders')
    .select('paid_at')
    .eq('id', orderId)
    .maybeSingle()
  if ((current as { paid_at: string | null } | null)?.paid_at) {
    return NextResponse.json({ ok: true, status: 'already_paid' })
  }

  // Mark payment confirmed — critical path; return non-200 on failure so Stripe retries
  const { error: dbErr } = await supabaseAdmin
    .from('pos_online_orders')
    .update({ stripe_payment_status: 'succeeded', paid_at: now, updated_at: now })
    .eq('id', orderId)
    .eq('business_id', businessId)
    .eq('stripe_payment_intent_id', pi.id)

  if (dbErr) {
    console.error('[stripe-orders webhook] DB update failed:', dbErr.message)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  // earnOnSale — non-blocking via waitUntil so Stripe sees 200 within 30 s
  if (saleId && customerId) {
    const totalDollars = pi.amount / 100
    const bid = businessId
    const sid = saleId
    const cid = customerId
    const eid = event.id
    waitUntil((async () => {
      try {
        await earnOnSale({ businessId: bid, customerId: cid, saleId: sid, totalAmount: totalDollars })
      } catch (e) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: bid,
          action_type: 'stripe_webhook_earn_error',
          description: '[stripe-orders] earnOnSale failed: ' + (e as Error).message,
          metadata: { order_id: orderId, sale_id: sid, stripe_event_id: eid, pi_id: pi.id },
          created_at: now,
        })
      }
    })())
  }

  return NextResponse.json({ ok: true })
}