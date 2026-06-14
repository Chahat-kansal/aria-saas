export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'


// Daily: expire finished carts past their 15-min window that were never redeemed.
// Kept (not deleted) for abandonment analytics.
async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data } = await supabaseAdmin.from('pos_self_checkout_carts')
    .update({ status: 'expired' }).eq('status', 'finished').lt('expires_at', new Date().toISOString()).select('id')

  return NextResponse.json({ ok: true, expired: (data ?? []).length })
}

export const GET = withErrorCapture('cron/expire-checkout-carts', _GET)
