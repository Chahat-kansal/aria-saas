export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'

// ORD-PAYMENT webhook — marks online orders paid after Stripe confirms, then earns loyalty.
// Idempotent: update is .eq('stripe_payment_intent_id', pi.id) so replay can't double-update.
// Always returns 200 so Stripe doesn't retry on transient handler errors.
// Requires STRIPE_WEBHOOK_SECRET_ORDERS (founder TODO: register this endpoint in Stripe dashboard).

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET_ORDERS
  if (!secret) {
    // Not configured yet — accept silently so we don't block other webhooks
    return NextResponse.json({ ok: true, note: 'STRIPE_WEBHOOK_SECRET_ORDERS not set' })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'bad signature' }, { status: 400 })
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent
      const meta = (pi.metadata ?? {}) as Record<string, string>
      if (meta.kind !== 'online_order') return NextResponse.json({ ok: true })

      const orderId = meta.order_id
      const businessId = meta.business_id
      const saleId = meta.sale_id || null
      const customerId = meta.customer_id || null
      const now = new Date().toISOString()

      if (!orderId || !businessId) return NextResponse.json({ ok: true })

      await supabaseAdmin
        .from('pos_online_orders')
        .update({ stripe_payment_status: 'succeeded', paid_at: now, updated_at: now })
        .eq('id', orderId)
        .eq('business_id', businessId)
        .eq('stripe_payment_intent_id', pi.id)

      if (saleId && customerId) {
        const totalDollars = pi.amount / 100
        await earnOnSale({ businessId, customerId, saleId, totalAmount: totalDollars })
      }
    }
  } catch (e) {
    console.error('[stripe-orders webhook]', (e as Error).message)
    // Return 200 — earnOnSale is idempotent; a later Stripe retry will not double-earn
  }
  return NextResponse.json({ ok: true })
}