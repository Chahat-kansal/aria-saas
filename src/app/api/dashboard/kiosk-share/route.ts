export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ensureActiveToken, daysUntilExpiry } from '@/lib/kiosk/tokens'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

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
async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const key = crypto.randomUUID()
  const { data: existing } = await supabaseAdmin.from('instore_kiosk_configs').select('id').eq('business_id', bid).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('instore_kiosk_configs').update({ tablet_api_key: key }).eq('business_id', bid)
  } else {
    await supabaseAdmin.from('instore_kiosk_configs').insert({ business_id: bid, tablet_api_key: key, enabled: true })
  }
  return NextResponse.json({ ok: true, tablet_api_key: key })
}

export const GET = withErrorCapture('dashboard/kiosk-share', _GET)
export const POST = withErrorCapture('dashboard/kiosk-share', _POST)
