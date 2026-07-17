export const maxDuration = 30
export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ rules: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ rules: [] })
  const { data } = await supabase.from('pos_eod_markdown_rules').select('*').eq('business_id', bid).order('trigger_time')
  return NextResponse.json({ rules: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('pos_eod_markdown_rules').insert({
    business_id: bid,
    name: String(body.name ?? 'End of day discount'),
    trigger_time: body.trigger_time ?? '16:00',
    discount_pct: Number(body.discount_pct ?? 50),
    category_id: body.category_id ?? null,
    days_of_week: body.days_of_week ?? [0,1,2,3,4,5,6],
    is_active: true,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data }, { status: 201 })
}

async function _PATCH(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { id, ...update } = body
  await supabaseAdmin.from('pos_eod_markdown_rules').update(update).eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  const { id } = await req.json()
  await supabaseAdmin.from('pos_eod_markdown_rules').delete().eq('id', id).eq('business_id', bid ?? '')
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/eod-markdown', _GET)
export const POST = withBusinessContext('pos/eod-markdown', _POST)
export const PATCH = withBusinessContext('pos/eod-markdown', _PATCH)
export const DELETE = withErrorCapture('pos/eod-markdown', _DELETE)
