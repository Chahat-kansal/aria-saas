export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { readPreloadConfig, computeBonus } from '@/lib/loyalty/preload'

// LOY-PRELOAD — start a stored-value load. Creates a Stripe Checkout Session (hosted) for the chosen
// amount; the load (and any bonus, computed SERVER-SIDE) is credited only by the webhook on success.
// Customer (identity) scoped — a member can only load their OWN membership.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { business_id?: string; amount?: number }
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cfg = await readPreloadConfig(realId)
  if (!cfg.enabled) return NextResponse.json({ error: 'Preload not available' }, { status: 400 })

  const m = await getLoyaltyMembership(realId)
  if (!m) return NextResponse.json({ error: 'Sign in to load your balance' }, { status: 401 })

  // Amount must be one of the owner-configured options (don't trust an arbitrary client amount).
  const amount = Math.round(Number(body.amount) || 0)
  if (!cfg.amounts.includes(amount)) return NextResponse.json({ error: 'Invalid load amount' }, { status: 400 })
  const bonus = computeBonus(amount, cfg)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? 'https://www.ariaos.site'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'aud',
        unit_amount: amount * 100, // dollars → cents
        product_data: { name: `Top up $${amount.toFixed(2)}${bonus > 0 ? ` (+ $${bonus.toFixed(2)} bonus)` : ''}` },
      },
    }],
    metadata: { kind: 'loyalty_preload', business_id: realId, customer_id: m.customer_id, amount: String(amount), bonus: String(bonus) },
    payment_intent_data: { metadata: { kind: 'loyalty_preload', business_id: realId, customer_id: m.customer_id, amount: String(amount), bonus: String(bonus) } },
    success_url: `${appUrl}/loyalty/${realId}/signin?preload=success`,
    cancel_url: `${appUrl}/loyalty/${realId}/signin?preload=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}

export const POST = withErrorCapture('loyalty/preload/load', _POST)
