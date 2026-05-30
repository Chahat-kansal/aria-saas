export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: kw } = await supabase
    .from('seo_keywords')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (!kw) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', kw.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: history } = await supabase
    .from('seo_keyword_history')
    .select('rank, checked_at')
    .eq('keyword_id', params.id)
    .order('checked_at', { ascending: true })
    .limit(30)

  return NextResponse.json({ keyword: kw, history: history ?? [] })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: kw } = await supabase
    .from('seo_keywords')
    .select('id, business_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!kw) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', kw.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabaseAdmin.from('seo_keyword_history').delete().eq('keyword_id', params.id)
  await supabaseAdmin.from('seo_keywords').delete().eq('id', params.id)

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('seo/keywords/[id]', _GET)
export const DELETE = withErrorCapture('seo/keywords/[id]', _DELETE)
