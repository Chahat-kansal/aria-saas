export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { listMissingCosts } from '@/lib/inventory/resolve-cost'
import { computeStockValue } from '@/lib/inventory/stock-value'

// INV-COST-1 — owner cost surface. GET = stock-value-at-cost/retail + the "costs needed" list (products
// with no resolvable cost). POST = owner sets a REAL cost (business-level cost_price and/or per-outlet
// item_cost). getBid-scoped. Costs must be > 0 — we never store a fabricated/zero "real" cost.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))
  const [valuation, missing] = await Promise.all([
    computeStockValue(supabaseAdmin, bid, outletId),
    listMissingCosts(supabaseAdmin, bid, outletId),
  ])
  return NextResponse.json({ outlet_id: outletId, stock_value: valuation, missing_costs: missing })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { product_id?: string; cost_price?: number; item_cost?: number; outlet_id?: string }
  if (!body.product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

  // The product must belong to this business (no cross-business writes).
  const { data: prod } = await supabaseAdmin.from('pos_products').select('id').eq('id', body.product_id).eq('business_id', bid).maybeSingle()
  if (!prod) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const costPrice = body.cost_price != null ? Number(body.cost_price) : null
  const itemCost = body.item_cost != null ? Number(body.item_cost) : null
  if ((costPrice != null && costPrice <= 0) || (itemCost != null && itemCost <= 0)) {
    return NextResponse.json({ error: 'Cost must be greater than 0' }, { status: 400 })
  }
  if (costPrice == null && itemCost == null) return NextResponse.json({ error: 'Provide cost_price or item_cost' }, { status: 400 })

  // Business-level catalogue cost.
  if (costPrice != null) {
    await supabaseAdmin.from('pos_products').update({ cost_price: costPrice }).eq('id', body.product_id).eq('business_id', bid)
  }
  // Per-outlet actual cost.
  if (itemCost != null) {
    const outletId = await resolveOutletId(supabaseAdmin, bid, body.outlet_id ?? null)
    if (outletId) {
      const { data: row } = await supabaseAdmin.from('pos_outlet_inventory').select('id')
        .eq('business_id', bid).eq('product_id', body.product_id).eq('outlet_id', outletId).maybeSingle()
      if (row?.id) {
        await supabaseAdmin.from('pos_outlet_inventory').update({ item_cost: itemCost, last_item_cost: itemCost, updated_at: new Date().toISOString() }).eq('id', row.id)
      } else {
        await supabaseAdmin.from('pos_outlet_inventory').insert({ business_id: bid, outlet_id: outletId, product_id: body.product_id, items_on_hand: 0, item_cost: itemCost, last_item_cost: itemCost, updated_at: new Date().toISOString() })
      }
    }
  }
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/inventory/cost:get', _GET)
export const POST = withErrorCapture('pos/inventory/cost:post', _POST)
