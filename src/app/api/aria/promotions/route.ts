export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await supabaseAdmin
    .from('aria_promotions')
    .select('id,created_at,promotion_name,offer_text,sms_message,target_day,was_successful')
    .eq('business_id', business_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ promotions: data ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, was_successful } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('aria_promotions').update({ was_successful }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET   = withErrorCapture('aria/promotions', _GET)
export const PATCH = withErrorCapture('aria/promotions', _PATCH)
