export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBizId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses')
    .select('id').eq('user_id', userId).eq('is_active', true).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bizId = await getBizId(supabase, user.id)
  if (!bizId) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: orders } = await supabaseAdmin
    .from('pos_purchase_orders')
    .select('*, pos_suppliers(name, contact_email)')
    .eq('business_id', bizId)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ orders: orders ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bizId = await getBizId(supabase, user.id)
  if (!bizId) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { supplier_id, notes, expected_date, subtotal, tax_amount, total } = body

  const { data: order, error: err } = await supabaseAdmin
    .from('pos_purchase_orders').insert({
      business_id: bizId,
      supplier_id: supplier_id ?? null,
      notes: notes ?? null,
      status: 'draft',
      expected_date: expected_date ?? null,
      subtotal: subtotal ?? 0,
      tax_amount: tax_amount ?? 0,
      total: total ?? 0,
      created_at: new Date().toISOString(),
      source: 'aria_pos',
    }).select('id').single()

  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: order?.id })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('pos_purchase_orders').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/purchase-orders', _GET)
export const POST = withErrorCapture('pos/purchase-orders', _POST)
export const DELETE = withErrorCapture('pos/purchase-orders', _DELETE)
