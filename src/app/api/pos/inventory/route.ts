export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ ok: true, data: [] })

  const { searchParams } = new URL(req.url)
  const outletId = searchParams.get('outlet_id')

  let q = supabase
    .from('pos_outlet_inventory')
    .select('*, pos_products!inner(name, sku, price, low_stock_threshold)')
    .eq('business_id', bid)

  if (outletId) q = q.eq('outlet_id', outletId)

  const { data, error } = await q.order('stock_quantity', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { product_id, outlet_id, adjustment, reason } = await req.json()
  if (!product_id || !outlet_id || adjustment === undefined) {
    return NextResponse.json({ error: 'product_id, outlet_id, adjustment required' }, { status: 400 })
  }

  const { data: current } = await supabase
    .from('pos_outlet_inventory')
    .select('stock_quantity')
    .eq('business_id', bid)
    .eq('product_id', product_id)
    .eq('outlet_id', outlet_id)
    .maybeSingle()

  const newQty = (current?.stock_quantity ?? 0) + adjustment

  const { data, error } = await supabase
    .from('pos_outlet_inventory')
    .upsert({
      business_id: bid, product_id, outlet_id,
      stock_quantity: newQty,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,product_id,outlet_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log the adjustment (table may not exist yet — ignore errors)
  try {
    await supabase.from('pos_stock_adjustments').insert({
      business_id: bid, product_id, outlet_id,
      adjustment_quantity: adjustment,
      reason: reason ?? null,
      adjusted_by: user.id,
      created_at: new Date().toISOString(),
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, data })
}

export const GET   = withErrorCapture('pos/inventory', _GET)
export const PATCH = withErrorCapture('pos/inventory', _PATCH)