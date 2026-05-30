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
  if (!bid) return NextResponse.json({ changes: [] })
  const { data } = await supabase.from('pos_scheduled_price_changes')
    .select('*, pos_products(name, price)')
    .eq('business_id', bid).eq('applied', false)
    .order('effective_date', { ascending: true })
  return NextResponse.json({ changes: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const { product_id, new_price, reason } = body
  const effectiveDate = body.effective_date ?? body.effective_at
  if (!product_id || new_price == null || !effectiveDate) return NextResponse.json({ error: 'product_id, new_price, effective_date required' }, { status: 400 })
  const { data, error: e } = await supabase.from('pos_scheduled_price_changes').insert({
    business_id: bid, product_id, new_price,
    effective_date: effectiveDate,
    reason: reason ? String(reason).slice(0, 500) : null,
  }).select().single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ change: data }, { status: 201 })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { id, status } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error: e } = await supabase.from('pos_scheduled_price_changes').update({ status: status ?? 'cancelled' }).eq('id', id).eq('business_id', bid)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  const { id } = await req.json()
  await supabase.from('pos_scheduled_price_changes').delete().eq('id', id).eq('business_id', bid ?? '')
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/scheduled-price-changes', _GET)
export const POST = withErrorCapture('pos/scheduled-price-changes', _POST)
export const PATCH = withErrorCapture('pos/scheduled-price-changes', _PATCH)
export const DELETE = withErrorCapture('pos/scheduled-price-changes', _DELETE)