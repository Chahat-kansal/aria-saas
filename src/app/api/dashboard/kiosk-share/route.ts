export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { ensureActiveToken, daysUntilExpiry } from '@/lib/kiosk/tokens'

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const token = await ensureActiveToken(supabaseAdmin, bid)
  const daysLeft = await daysUntilExpiry(supabaseAdmin, bid)
  const { data: cfg } = await supabaseAdmin.from('instore_kiosk_configs').select('tablet_api_key').eq('business_id', bid).maybeSingle()

  return NextResponse.json({
    business_id: bid,
    token,
    days_left: daysLeft,
    tablet_api_key: (cfg?.tablet_api_key as string | null) ?? null,
  })
}

// Rotate the counter-tablet key (invalidates the old tablet URL).
async function _POST(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const key = crypto.randomUUID()
  const { data: existing } = await supabaseAdmin.from('instore_kiosk_configs').select('id').eq('business_id', bid).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('instore_kiosk_configs').update({ tablet_api_key: key }).eq('business_id', bid)
  } else {
    await supabaseAdmin.from('instore_kiosk_configs').insert({ business_id: bid, tablet_api_key: key, enabled: true })
  }
  return NextResponse.json({ ok: true, tablet_api_key: key })
}

export const GET = withBusinessContext('dashboard/kiosk-share', _GET)
export const POST = withBusinessContext('dashboard/kiosk-share', _POST)
