export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Daily: expire finished carts past their 15-min window that were never redeemed.
// Kept (not deleted) for abandonment analytics.
async function _GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabaseAdmin.from('pos_self_checkout_carts')
    .update({ status: 'expired' }).eq('status', 'finished').lt('expires_at', new Date().toISOString()).select('id')

  return NextResponse.json({ ok: true, expired: (data ?? []).length })
}

export const GET = withErrorCapture('cron/expire-checkout-carts', _GET)
