export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

const PACKS = {
  single:  { credits: 1,  amount: 29,  label: '1 transparent image' },
  pack_10: { credits: 10, amount: 249, label: '10 transparent images' },
  pack_25: { credits: 25, amount: 599, label: '25 transparent images' },
  pack_50: { credits: 50, amount: 999, label: '50 transparent images' },
} as const

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, pack } = await req.json()
  if (!business_id || !pack) {
    return NextResponse.json({ error: 'business_id and pack required' }, { status: 400 })
  }
  const packConfig = PACKS[pack as keyof typeof PACKS]
  if (!packConfig) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const paymentIntent = await stripe.paymentIntents.create({
    amount: packConfig.amount,
    currency: 'aud',
    automatic_payment_methods: { enabled: true },
    metadata: {
      business_id,
      user_id: user.id,
      pack,
      credits: String(packConfig.credits),
    },
    description: `Aria OS AI Engine — ${packConfig.label} for ${biz.name}`,
  })

  return NextResponse.json({
    client_secret: paymentIntent.client_secret,
    pack,
    credits: packConfig.credits,
    amount: packConfig.amount,
  })
}

export const POST = withErrorCapture('pos/image-credits/purchase', _POST)