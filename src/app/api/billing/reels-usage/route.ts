export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { business_id, post_id, cost_aud, duration_seconds, provider, reel_mode, reel_style, fal_request_id } = body
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const billing_month = new Date().toISOString().slice(0, 7)

  // Log individual reel usage
  try {
    await supabaseAdmin.from('reel_usage_log').insert({
      business_id,
      post_id: post_id || null,
      cost_aud: cost_aud || 0.56,
      duration_seconds: duration_seconds || 15,
      provider: provider || 'fal-ai/kling-video/v2.1/standard',
      reel_mode: reel_mode || null,
      reel_style: reel_style || null,
      fal_request_id: fal_request_id || null,
    })
  } catch {}

  // Upsert monthly invoice atomically
  try {
    await supabaseAdmin.rpc('increment_reel_invoice', {
      p_business_id: business_id,
      p_billing_month: billing_month,
      p_cost: cost_aud || 0.56,
    })
  } catch {}

  // Stripe metered usage — billing failure never blocks Reel delivery
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

      const { data: bSub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('stripe_subscription_id, reels_stripe_item_id')
        .eq('business_id', business_id)
        .maybeSingle()

      if (bSub?.reels_stripe_item_id) {
        // Existing metered item — record usage
        await stripe.subscriptionItems.createUsageRecord(bSub.reels_stripe_item_id, {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment',
        })
      } else if (bSub?.stripe_subscription_id && process.env.STRIPE_REELS_PRICE_ID) {
        // First Reel for this business — create subscription item then record usage
        const item = await stripe.subscriptionItems.create({
          subscription: bSub.stripe_subscription_id,
          price: process.env.STRIPE_REELS_PRICE_ID,
        })
        try {
          await supabaseAdmin.from('business_subscriptions')
            .update({ reels_stripe_item_id: item.id })
            .eq('business_id', business_id)
        } catch {}
        await stripe.subscriptionItems.createUsageRecord(item.id, {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment',
        })
      }
    } catch (e: any) {
      console.error('[billing/reels-usage] Stripe error (non-fatal):', e?.message)
    }
  }

  return NextResponse.json({ ok: true })
}
