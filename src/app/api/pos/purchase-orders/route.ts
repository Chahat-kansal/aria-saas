export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: orders } = await supabaseAdmin
    .from('pos_purchase_orders')
    .select('*')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ orders: orders ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { supplier_id, supplier_name, items, notes, expected_delivery } = body

  const { data: order, error: insertErr } = await supabaseAdmin
    .from('pos_purchase_orders').insert({
      business_id: biz.id,
      supplier_id: supplier_id ?? null,
      supplier_name: supplier_name ?? 'Unknown supplier',
      items: items ?? [],
      notes: notes ?? null,
      status: 'draft',
      expected_delivery: expected_delivery ?? null,
      created_at: new Date().toISOString(),
    }).select('id').single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: order?.id })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') ?? req.url.split('/').pop()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabaseAdmin.from('pos_purchase_orders').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/purchase-orders', _GET)
export const POST = withErrorCapture('pos/purchase-orders', _POST)
export const DELETE = withErrorCapture('pos/purchase-orders', _DELETE)
