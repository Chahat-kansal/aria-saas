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

    const { data: existing } = await supabase
      .from('pos_image_credits').select('paid_credits').eq('business_id', business_id).maybeSingle()

    if (existing) {
      await supabase
        .from('pos_image_credits')
        .update({ paid_credits: existing.paid_credits + creditsNum, updated_at: new Date().toISOString() })
        .eq('business_id', business_id)
    } else {
      await supabase.from('pos_image_credits').insert({ business_id, paid_credits: creditsNum })
    }

    await supabase.from('pos_image_transactions').insert({
      business_id,
      type: pack === 'single' ? 'paid_single' : 'paid_pack',
      pack_size: creditsNum,
      amount_charged: pi.amount / 100,
      stripe_payment_intent_id: pi.id,
    })
  }

  return NextResponse.json({ ok: true })
}