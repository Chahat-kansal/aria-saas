export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  let { data: config } = await supabaseAdmin.from('instore_kiosk_configs').select('*').eq('business_id', bid).maybeSingle()
  if (!config) {
    const { data: created } = await supabaseAdmin.from('instore_kiosk_configs').insert({ business_id: bid }).select('*').single()
    config = created
  }
  return NextResponse.json({ config, business_id: bid })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as Record<string, unknown>
  const SAFE = ['kiosk_name', 'greeting', 'personality', 'voice_enabled', 'loyalty_enabled', 'recipe_suggestions', 'enabled', 'scan_and_go_enabled'] as const
  const patch: Record<string, unknown> = {}
  for (const k of SAFE) if (k in body) patch[k] = body[k]

  if (patch.personality && !['friendly', 'witty', 'professional'].includes(String(patch.personality))) {
    return NextResponse.json({ error: 'Invalid personality' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin.from('instore_kiosk_configs').select('id').eq('business_id', bid).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('instore_kiosk_configs').update(patch).eq('business_id', bid)
  } else {
    await supabaseAdmin.from('instore_kiosk_configs').insert({ business_id: bid, ...patch })
  }
  return NextResponse.json({ ok: true })
}

export const GET = withBusinessContext('instore/config', _GET)
export const POST = withBusinessContext('instore/config', _POST)
