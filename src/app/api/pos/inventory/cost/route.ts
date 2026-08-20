export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { listMissingCosts, summariseCostQuality } from '@/lib/inventory/resolve-cost'
import { computeStockValue } from '@/lib/inventory/stock-value'

// INV-COST-1 — owner cost surface. GET = stock-value-at-cost/retail + the "costs needed" list (products
// with no resolvable cost). POST = owner sets a REAL cost (business-level cost_price and/or per-outlet
// item_cost). getBid-scoped. Costs must be > 0 — we never store a fabricated/zero "real" cost.

async function _GET(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))
  const [valuation, missing, costQuality] = await Promise.all([
    computeStockValue(supabaseAdmin, bid, outletId),
    listMissingCosts(supabaseAdmin, bid, outletId),
    // MS11 PHASE 3 — the derived-cost disclosure. Live count at request time, never hardcoded.
    summariseCostQuality(supabaseAdmin, bid),
  ])
  return NextResponse.json({ outlet_id: outletId, stock_value: valuation, missing_costs: missing, cost_quality: costQuality })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
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

export const GET = withBusinessContext('pos/inventory/cost:get', _GET)
export const POST = withBusinessContext('pos/inventory/cost:post', _POST)
