export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { fireKdsForOrder } from '@/lib/online-orders/fireKdsForOrder'

// ORD-PAYMENT webhook — on payment_intent.succeeded:
//   1. Mark order paid (stripe_payment_status='succeeded', paid_at)
//   2. Auto-accept (status='accepted', accepted_at) — owner sees it ready in POS
//   3. Fire KDS (pos_kds_orders insert via shared helper, idempotent on sale_id)
//   4. earnOnSale (loyalty points, non-blocking)
//
// GROUNDING-TEETH — live vs. stubbed:
//   LIVE:    Signature verification, PI succeeded → paid + accepted + KDS + earnOnSale.
//   STUBBED: PayID one-tap preferred rail — surfaces automatically in AU if the Stripe account
//            has PayID enabled (Dashboard → Settings → Payment methods). automatic_payment_methods
//            is already set; no code change needed. Pre-Oct-2026 AU surcharge ban: PayID ~0%
//            vs card ~1.5-3% — enable it now.
//   FOUNDER TODO: register https://<domain>/api/webhooks/stripe-orders in Stripe Dashboard
//                 and paste the resulting signing secret as STRIPE_WEBHOOK_SECRET_ORDERS.
//
// Idempotency: guarded on paid_at (skip if already marked paid) so Stripe event replays
// cannot double-accept or double-earn. DB update returns non-200 on failure → Stripe retries.

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

  // Mark payment confirmed + auto-accept — critical path; return non-200 on failure so Stripe retries
  const { error: dbErr } = await supabaseAdmin
    .from('pos_online_orders')
    .update({
      stripe_payment_status: 'succeeded',
      paid_at: now,
      status: 'accepted',
      accepted_at: now,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('business_id', businessId)
    .eq('stripe_payment_intent_id', pi.id)

  if (dbErr) {
    console.error('[stripe-orders webhook] DB update failed:', dbErr.message)
    return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
  }

  // KDS fire — non-blocking via waitUntil so Stripe sees 200 within 30 s.
  // Loyalty earn fires on pickup (status → completed) via online-orders/[id] PATCH.
  const bid = businessId
  const eid = event.id

  waitUntil((async () => {
    try {
      await fireKdsForOrder(orderId, bid)
    } catch (kdsErr) {
      void supabaseAdmin.from('activity_log').insert({
        business_id: bid,
        action_type: 'stripe_webhook_kds_error',
        description: '[stripe-orders] KDS fire failed: ' + (kdsErr as Error).message,
        metadata: { order_id: orderId, stripe_event_id: eid, pi_id: pi.id },
        created_at: now,
      })
    }
  })())

  return NextResponse.json({ ok: true })
}