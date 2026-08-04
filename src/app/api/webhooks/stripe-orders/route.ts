export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { fireKdsForOrder } from '@/lib/online-orders/fireKdsForOrder'
import {
  linkCardToIdentity, resolveIdentityByCardFingerprint,
  sendCardLinkedNotice, logCardLinkEvent,
} from '@/lib/loyalty/card-link'
import { promoteOnlineSaleToCompleted } from '@/lib/pos/promote-online-sale'

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
    // Fail closed: returning 200 when unset would let unsigned payloads auto-accept orders.
    console.error('[stripe-orders] STRIPE_WEBHOOK_SECRET_ORDERS not set — rejecting all requests')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
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

  // FIX-ONLINE-PAY-1 A3 — money has arrived, so the sale becomes revenue HERE and nowhere earlier.
  // Guarded .eq('status','pending') so a replayed webhook can never resurrect a sale that has since
  // been voided or refunded — Stripe retries, and this endpoint is signature-verified but not
  // once-only. Awaited (not waitUntil) because it is the money write: if it fails we return non-200
  // and let Stripe retry, exactly as the order update above does.
  await promoteOnlineSaleToCompleted(orderId, businessId)

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

  // LOYALTY-LOOP-2 — card-linked auto-earn. Non-blocking: a linking failure
  // must never hold up order acceptance/KDS. Only ever runs for a real
  // Stripe card payment (this route only exists for online orders, and we
  // additionally confirm pm.type === 'card' below — PayID/other rails never
  // reach this branch).
  waitUntil((async () => {
    try {
      await linkOrAutoAttachCard(pi, bid, orderId, meta)
    } catch (linkErr) {
      void supabaseAdmin.from('activity_log').insert({
        business_id: bid,
        action_type: 'loyalty_card_link_error',
        description: '[stripe-orders] card link/auto-attach failed: ' + (linkErr as Error).message,
        metadata: { order_id: orderId, stripe_event_id: eid, pi_id: pi.id },
        created_at: now,
      })
    }
  })())

  return NextResponse.json({ ok: true })
}

/**
 * LOYALTY-LOOP-2 — the payment card becomes the loyalty key.
 *
 * LINK: a customer IS already attached (place-order requires a cx_session —
 * guest checkout is disabled, so customer_id is resolved for every online
 * order today). Every card-paid order therefore links the card to that
 * customer's loyalty identity (idempotent — re-linking the same card is a
 * no-op). First-ever link for an identity fires the one-time consent notice.
 *
 * AUTO-ATTACH: defensive/forward-compatible. Under today's mandatory-login
 * online-order flow this branch never actually fires (customer_id is always
 * already resolved before Stripe is even invoked) — it exists so this
 * exact mechanism works immediately the day either guest checkout is
 * re-enabled, or an in-person Stripe Terminal integration is added (neither
 * exists yet — see PRE-FLIGHT). Scope boundary: if no pos_customers row
 * exists yet for the resolved identity at this business, auto-attach is
 * skipped rather than fabricating one with no identifying info — sale-row
 * backfill for a saleless paid order is intentionally not implemented here.
 */
async function linkOrAutoAttachCard(
  pi: Stripe.PaymentIntent,
  businessId: string,
  orderId: string,
  meta: Record<string, string>,
): Promise<void> {
  const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id
  if (!pmId) return

  const pm = await stripe.paymentMethods.retrieve(pmId)
  if (pm.type !== 'card' || !pm.card?.fingerprint) return // guardrail: card payments only

  const fingerprint = pm.card.fingerprint
  const brand = pm.card.brand ?? null
  const last4 = pm.card.last4 ?? null

  const customerId = meta.customer_id || null

  if (customerId) {
    const { data: cust } = await supabaseAdmin
      .from('pos_customers')
      .select('loyalty_identity_id')
      .eq('id', customerId)
      .eq('business_id', businessId)
      .maybeSingle()
    const identityId = (cust as { loyalty_identity_id: string | null } | null)?.loyalty_identity_id
    if (!identityId) return // no loyalty identity on this customer — nothing to link

    const result = await linkCardToIdentity({ businessId, identityId, fingerprint, brand, last4 })
    if (result.isNewLink) {
      await sendCardLinkedNotice({ businessId, customerId })
      await logCardLinkEvent({
        businessId, actionType: 'loyalty_card_link_created',
        description: 'Card linked for automatic future earn',
        metadata: { order_id: orderId, customer_id: customerId, brand, last4 },
      })
    }
    return
  }

  // Auto-attach branch — see function header comment for why this is currently unreachable.
  const { data: order } = await supabaseAdmin
    .from('pos_online_orders')
    .select('customer_id')
    .eq('id', orderId)
    .maybeSingle()
  if ((order as { customer_id: string | null } | null)?.customer_id) return // already attached — never override

  const match = await resolveIdentityByCardFingerprint({ businessId, fingerprint })
  if (!match) return

  const { data: existingCust } = await supabaseAdmin
    .from('pos_customers')
    .select('id')
    .eq('business_id', businessId)
    .eq('loyalty_identity_id', match.identityId)
    .is('deleted_at', null)
    .maybeSingle()
  const matchedCustomerId = (existingCust as { id: string } | null)?.id
  if (!matchedCustomerId) return // no existing membership at this business to attach to

  await supabaseAdmin.from('pos_online_orders').update({ customer_id: matchedCustomerId }).eq('id', orderId)
  await logCardLinkEvent({
    businessId, actionType: 'loyalty_card_auto_attach',
    description: 'Customer auto-attached via linked card — no scan, no sign-in',
    metadata: { order_id: orderId, customer_id: matchedCustomerId, brand, last4 },
  })
}