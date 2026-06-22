export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { creditLoad } from '@/lib/loyalty/preload'

// LOY-PRELOAD webhook — credits a stored-value load only after Stripe confirms payment. Idempotent: the
// credit RPC is keyed on the payment_intent, so a webhook retry/replay can never double-credit. Requires
// STRIPE_WEBHOOK_SECRET_PRELOAD (founder-console TODO: add this signing secret for the preload endpoint).

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

async function handle(meta: Record<string, string>, paymentIntentId: string | null) {
  if (meta.kind !== 'loyalty_preload') return
  const businessId = meta.business_id, customerId = meta.customer_id
  const amount = Number(meta.amount), bonus = Number(meta.bonus || '0')
  if (!businessId || !customerId || !(amount > 0) || !paymentIntentId) return
  await creditLoad(businessId, customerId, amount, bonus, paymentIntentId)
}

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  const secret = process.env.STRIPE_WEBHOOK_SECRET_PRELOAD
  if (!secret) return NextResponse.json({ error: 'preload webhook not configured' }, { status: 503 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'bad signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session
      if (s.payment_status === 'paid') {
        const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
        await handle((s.metadata ?? {}) as Record<string, string>, pi)
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent
      await handle((pi.metadata ?? {}) as Record<string, string>, pi.id)
    }
  } catch (e) {
    console.error('[preload webhook] handler failed:', (e as Error).message)
    // Return 200 so Stripe doesn't hammer retries on a transient handler error; the credit RPC is
    // idempotent, so a later retry that does succeed will not double-credit.
  }
  return NextResponse.json({ ok: true })
}
