export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

export const GET = withErrorCapture('health/stripe', _GET)
