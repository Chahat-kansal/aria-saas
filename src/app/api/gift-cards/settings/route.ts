export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses')
    .select('id').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data } = await supabaseAdmin.from('gift_card_settings')
    .select('*').eq('business_id', biz.id).maybeSingle()

  return NextResponse.json({
    settings: data ?? {
      business_id: biz.id,
      enabled: true, expiry_months: 36, min_load: 10, max_load: 500,
      max_balance: 1000, allow_topup: true, allow_partial_redeem: true,
      prefix: 'GC', brand_color: '#2D5240', terms_text: null,
    },
  })
}

async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json()
  const updates = {
    business_id: biz.id,
    enabled: body.enabled ?? true,
    expiry_months: Number(body.expiry_months ?? 36),
    min_load: Number(body.min_load ?? 10),
    max_load: Number(body.max_load ?? 500),
    max_balance: Number(body.max_balance ?? 1000),
    allow_topup: body.allow_topup ?? true,
    allow_partial_redeem: body.allow_partial_redeem ?? true,
    prefix: String(body.prefix ?? 'GC').toUpperCase().slice(0, 8),
    brand_color: body.brand_color ?? '#2D5240',
    terms_text: body.terms_text ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin.from('gift_card_settings')
    .upsert(updates, { onConflict: 'business_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}

export const GET = withErrorCapture('gift-cards/settings', _GET)
export const PUT = withErrorCapture('gift-cards/settings', _PUT)
