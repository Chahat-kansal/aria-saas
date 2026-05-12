export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

export async function GET() {
  const check = {
    starter: !!process.env.STRIPE_PRICE_ID_STARTER,
    growth:  !!process.env.STRIPE_PRICE_ID_GROWTH,
    pro:     !!process.env.STRIPE_PRICE_ID_PRO,
    secret:  !!process.env.STRIPE_SECRET_KEY,
    webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
  }
  const allGood = Object.values(check).every(Boolean)
  return NextResponse.json(
    { ok: allGood, vars: check },
    { status: allGood ? 200 : 503 }
  )
}
