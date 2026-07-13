export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body, sig, process.env.STRIPE_WEBHOOK_SECRET_IMAGE_CREDITS!
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const { business_id, pack, credits } = pi.metadata
    if (!business_id || !credits) return NextResponse.json({ ok: true })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const creditsNum = parseInt(credits, 10)

    // SECURITY-P2 H-13 — was read-then-write (TOCTOU race on concurrent Stripe retries).
    // Single atomic + idempotent RPC, same shape as loyalty_preload_load: the unique index on
    // pos_image_transactions.idempotency_key is the concurrency guard, not an app-level check.
    const { error: creditErr } = await supabase.rpc('credit_image_credits', {
      p_business: business_id,
      p_credits: creditsNum,
      p_pi: pi.id,
      p_pack: pack ?? 'pack',
      p_amount: pi.amount / 100,
    })
    if (creditErr) console.error('[stripe-image-credits] credit_image_credits rpc failed:', creditErr.message)
  }

  return NextResponse.json({ ok: true })
}