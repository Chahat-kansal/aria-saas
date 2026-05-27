export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  let { data: config } = await supabaseAdmin.from('instore_kiosk_configs').select('*').eq('business_id', bid).maybeSingle()
  if (!config) {
    const { data: created } = await supabaseAdmin.from('instore_kiosk_configs').insert({ business_id: bid }).select('*').single()
    config = created
  }
  return NextResponse.json({ config, business_id: bid })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>
  const SAFE = ['kiosk_name', 'greeting', 'personality', 'voice_enabled', 'loyalty_enabled', 'recipe_suggestions', 'enabled'] as const
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

export const GET = withErrorCapture('instore/config', _GET)
export const POST = withErrorCapture('instore/config', _POST)
