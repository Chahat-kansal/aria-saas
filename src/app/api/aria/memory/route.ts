export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const { data: memories } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id,kind,content,topic,importance,confidence,source_type,created_at,last_referenced_at,reference_count')
    .eq('business_id', bid)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })

  return NextResponse.json({ memories: memories ?? [] })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const reason = url.searchParams.get('reason') ?? 'owner_deleted'

  const { data: mem } = await supabaseAdmin.from('aria_business_memory').select('business_id').eq('id', id).maybeSingle()
  if (!mem) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('user_id').eq('id', mem.business_id).maybeSingle()
  if (!biz || (biz as Record<string, unknown>).user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await supabaseAdmin.from('aria_business_memory').update({
    deleted_at: new Date().toISOString(),
    deleted_reason: reason.slice(0, 200),
    is_active: false,
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('aria/memory', _GET)
export const DELETE = withErrorCapture('aria/memory', _DELETE)
