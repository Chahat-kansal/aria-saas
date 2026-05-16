export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ rules: [] })
  const { data } = await supabase.from('pos_surcharge_rules').select('*').eq('business_id', bid).order('created_at')
  return NextResponse.json({ rules: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const { name, payment_type, amount_type, amount } = body
  if (!name || !payment_type || !amount_type || amount == null) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
  const { data, error: e } = await supabase.from('pos_surcharge_rules').insert({ business_id: bid, name, payment_type, amount_type, amount, is_active: true }).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ rule: data }, { status: 201 })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  const { id, ...update } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabase.from('pos_surcharge_rules').update(update).eq('id', id).eq('business_id', bid ?? '')
  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  const { id } = await req.json()
  await supabase.from('pos_surcharge_rules').delete().eq('id', id).eq('business_id', bid ?? '')
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/surcharge-rules', _GET)
export const POST = withErrorCapture('pos/surcharge-rules', _POST)
export const PATCH = withErrorCapture('pos/surcharge-rules', _PATCH)
export const DELETE = withErrorCapture('pos/surcharge-rules', _DELETE)