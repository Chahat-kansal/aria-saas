export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifySupplier(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, supplierId: string) {
  const { data } = await supabase
    .from('pos_suppliers')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', supplierId)
    .single()
  if (!data || (data.businesses as any).user_id !== userId) return null
  return data
}

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rec = await verifySupplier(supabase, user.id, params.id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString()
  const { data: prices } = await supabaseAdmin
    .from('supplier_product_prices')
    .select('id, product_id, product_name, supplier_code, cost_price, recorded_at, source')
    .eq('supplier_id', params.id)
    .gte('recorded_at', sixMonthsAgo)
    .order('recorded_at', { ascending: true })

  // Group by product_id / product_name
  const byProduct = new Map<string, { product_id: string | null; product_name: string; supplier_code: string | null; history: { date: string; price: number }[] }>()
  for (const p of prices ?? []) {
    const key = p.product_id ?? p.product_name
    if (!byProduct.has(key)) {
      byProduct.set(key, { product_id: p.product_id, product_name: p.product_name, supplier_code: p.supplier_code, history: [] })
    }
    byProduct.get(key)!.history.push({ date: p.recorded_at, price: Number(p.cost_price) })
  }

  const result = Array.from(byProduct.values()).map(p => {
    const history = p.history
    const current = history[history.length - 1]?.price ?? 0
    const old = history[0]?.price ?? current
    const price_change_pct = old > 0 ? ((current - old) / old) * 100 : 0
    return { ...p, current_price: current, price_change_pct: Math.round(price_change_pct * 10) / 10 }
  })

  return NextResponse.json({ prices: result })
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rec = await verifySupplier(supabase, user.id, params.id)
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { business_id, product_id, product_name, supplier_code, cost_price, source } = body
  if (!product_name || cost_price === undefined) {
    return NextResponse.json({ error: 'product_name and cost_price required' }, { status: 400 })
  }

  const { data, error: e } = await supabaseAdmin.from('supplier_product_prices').insert({
    business_id: business_id ?? rec.business_id,
    supplier_id: params.id,
    product_id: product_id ?? null,
    product_name,
    supplier_code: supplier_code ?? null,
    cost_price: Number(cost_price),
    source: source ?? 'manual',
  }).select().single()

  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ price: data })
}

export const GET = withErrorCapture('warehouse/suppliers/[id]/prices', _GET)
export const POST = withErrorCapture('warehouse/suppliers/[id]/prices', _POST)
