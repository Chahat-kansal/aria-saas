export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'
import { resolveTicketPrice } from '@/lib/tickets/ticket-price'
import { scanLookup, locateStock } from '@/lib/inventory/scan-engine'

// INV-STAFF-APP-3 — scan lookup. A barcode resolves via pos_product_barcodes; Sip has 0 barcodes today, so a
// miss falls back to a name/SKU search (the primary path). A resolved product shows live on-hand
// (items_on_hand for the outlet), price, resolved cost (provenance), and 30-day velocity / days-of-cover.

type Params = { params: Promise<{ slug: string }> }

async function onHand(bid: string, productId: string, outletId: string | null): Promise<number> {
  let q = supabaseAdmin.from('pos_outlet_inventory').select('items_on_hand').eq('business_id', bid).eq('product_id', productId)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data } = await q
  return (data ?? []).reduce((s, r) => s + (Number(r.items_on_hand) || 0), 0)
}

async function enrichOne(bid: string, productId: string, outletId: string | null) {
  const { data: p } = await supabaseAdmin.from('pos_products').select('id, name, sku, price').eq('id', productId).eq('business_id', bid).maybeSingle()
  if (!p) return null
  const stock = await onHand(bid, productId, outletId)
  // INV-1-FINISH — per-outlet locate breakdown (canonical items_on_hand), so the search→pick path carries the
  // same multi-outlet rows the barcode path already returns. Page gates display on outlet count.
  const locate = await locateStock(supabaseAdmin, bid, productId)
  let cost: number | null = null, costSource = 'unknown'
  try { const rc = await resolveCostFor(supabaseAdmin, bid, productId, outletId); cost = rc.cost; costSource = rc.source } catch { /* unknown */ }

  // 30-day velocity → days of cover.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { data: si } = await supabaseAdmin.from('pos_sale_items')
    .select('quantity, pos_sales!inner(business_id, created_at)')
    .eq('product_id', productId).eq('pos_sales.business_id', bid).gte('pos_sales.created_at', since).limit(5000)
  const units30 = (si ?? []).reduce((s, r) => s + (Number((r as { quantity: number | null }).quantity) || 0), 0)
  const perDay = Math.round((units30 / 30) * 100) / 100
  const daysCover = perDay > 0 ? Math.round((stock / perDay) * 10) / 10 : null

  // Ticket price + real promo (for the price-ticket batch flow). Grounded: promo or NULL.
  const tp = await resolveTicketPrice(supabaseAdmin, bid, { id: p.id as string, price: p.price as number | null })

  return {
    id: p.id, name: p.name, sku: (p.sku as string | null) ?? null,
    price: Number(p.price) || 0, on_hand: stock, locate,
    cost, cost_source: costSource,
    units_per_day: perDay, days_of_cover: daysCover,
    ticket_price: tp.price_snapshot, was_price: tp.was_price_snapshot, promo_label: tp.promo_label,
  }
}

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))
  const barcode = (sp.get('barcode') ?? '').trim()
  const productId = (sp.get('product_id') ?? '').trim()
  const query = (sp.get('q') ?? '').trim()

  // Direct detail for a chosen search result.
  if (productId) {
    const product = await enrichOne(bid, productId, outletId)
    return NextResponse.json(product ? { mode: 'product', found: true, product } : { mode: 'product', found: false })
  }

  // INV-1 scan engine — barcode → price-check (name/retail/cost/margin/on-hand) + stock-locate (per-outlet)
  // + external prefill on a catalogue miss (own catalog → Open Food Facts waterfall). Canonical items_on_hand.
  if (barcode) {
    const result = await scanLookup(supabaseAdmin, bid, barcode, outletId)
    if (result.found) {
      // INV-1-FINISH — re-resolve via enrichOne so the barcode path returns the SAME shape as search→pick
      // (price / velocity / days-cover) plus the per-outlet locate, for one consistent result card.
      const product = await enrichOne(bid, result.product.id, outletId)
      return NextResponse.json({ mode: 'barcode', found: true, product })
    }
    return NextResponse.json({ mode: 'barcode', found: false, barcode: result.barcode, external: result.external })
  }

  // Name / SKU search fallback (lightweight list with live on-hand).
  if (query) {
    const like = `%${query.replace(/[%_]/g, '')}%`
    const { data: matches } = await supabaseAdmin.from('pos_products')
      .select('id, name, sku, price').eq('business_id', bid).eq('track_stock', true)
      .or(`name.ilike.${like},sku.ilike.${like}`).order('name').limit(8)
    const ids = (matches ?? []).map(m => m.id as string)
    const ohMap = new Map<string, number>()
    if (ids.length) {
      let iq = supabaseAdmin.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', bid).in('product_id', ids)
      if (outletId) iq = iq.eq('outlet_id', outletId)
      const { data: inv } = await iq
      for (const r of (inv ?? []) as Array<{ product_id: string; items_on_hand: number | null }>) ohMap.set(r.product_id, (ohMap.get(r.product_id) ?? 0) + (Number(r.items_on_hand) || 0))
    }
    return NextResponse.json({
      mode: 'search', query,
      matches: (matches ?? []).map(m => ({ id: m.id, name: m.name, sku: (m.sku as string | null) ?? null, price: Number(m.price) || 0, on_hand: ohMap.get(m.id as string) ?? 0 })),
    })
  }

  return NextResponse.json({ mode: 'idle' })
}

// INV-1 — add-to-catalogue from a barcode miss. Staff-scoped (getActingStaff) reuse of the SAME product-insert
// shape as pos/products/quick-create (we did NOT rebuild the lookup waterfall — scanLookup reuses it). Prefilled
// name/category/price/barcode come from the external waterfall result.
async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { barcode?: string; name?: string; category?: string; price?: number; cost_price?: number }
  if (!body.name || !body.name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: product, error } = await supabaseAdmin.from('pos_products').insert({
    business_id: bid,
    barcode: body.barcode?.trim() || null,
    name: body.name.trim(),
    category: body.category?.trim() || null,
    price: Number(body.price) || 0,
    cost_price: body.cost_price != null ? Number(body.cost_price) : null,
    track_stock: true,
    is_active: true,
  }).select('id, name, barcode, price, category').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, product, added_by: acting.staff_name })
}

export const GET = withErrorCapture('inventory/app/scan', _GET)
export const POST = withErrorCapture('inventory/app/scan:post', _POST)
