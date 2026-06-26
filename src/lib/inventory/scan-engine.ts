import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupBarcode } from '@/lib/external-apis'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

// INV-1 — Scan engine. A barcode resolves to a product (pos_products, via pos_product_barcodes OR the product's
// own barcode/sku) + its LIVE per-outlet stock (pos_outlet_inventory.items_on_hand — canonical, never the
// pos_products.stock_quantity cache). Two zero-friction outcomes: PRICE-CHECK (name/retail/cost/margin/on-hand)
// and STOCK-LOCATE (which outlet(s) hold it + qty, multi-outlet aware). A miss falls through to the existing
// barcode waterfall (lookupBarcode → Open Food Facts) to PREFILL an add-to-catalogue (reuses the add API).

export interface ScanLocate { outlet_id: string; outlet_name: string; items_on_hand: number }

export interface ScanProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  retail: number
  cost: number | null
  cost_source: string
  margin_pct: number | null
  /** on-hand at the requested outlet (or total across outlets when no outlet given). */
  on_hand: number
}

export type ScanResult =
  | { found: true; product: ScanProduct; locate: ScanLocate[]; total_on_hand: number }
  | { found: false; barcode: string; external: { name: string; brand: string | null; category: string | null; image_url: string | null; barcode: string } | null }

function margin(retail: number, cost: number | null): number | null {
  if (cost == null || !(retail > 0)) return null
  return Math.round(((retail - cost) / retail) * 1000) / 10  // one-decimal %
}

/** Resolve a barcode to the owning product id (own barcode table → product's own barcode/sku column). */
async function resolveProductId(sb: SupabaseClient, businessId: string, barcode: string): Promise<string | null> {
  const { data: bc } = await sb.from('pos_product_barcodes')
    .select('product_id').eq('business_id', businessId).eq('barcode', barcode).limit(1).maybeSingle()
  if (bc?.product_id) return bc.product_id as string
  const { data: p } = await sb.from('pos_products')
    .select('id').eq('business_id', businessId).eq('is_active', true)
    .or(`barcode.eq.${barcode},sku.eq.${barcode}`).limit(1).maybeSingle()
  return (p?.id as string | undefined) ?? null
}

/** Per-outlet on-hand for a product (canonical items_on_hand) + outlet names. Exported so the staff scan route's
 *  enrichOne (search→pick) path can carry the SAME breakdown the barcode path already has (INV-1-FINISH). */
export async function locateStock(sb: SupabaseClient, businessId: string, productId: string): Promise<ScanLocate[]> {
  const { data: inv } = await sb.from('pos_outlet_inventory')
    .select('outlet_id, items_on_hand').eq('business_id', businessId).eq('product_id', productId)
  const oIds = [...new Set((inv ?? []).map(r => r.outlet_id as string).filter(Boolean))]
  const { data: outlets } = oIds.length
    ? await sb.from('pos_outlets').select('id, name').in('id', oIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const name = new Map((outlets ?? []).map(o => [o.id as string, o.name as string]))
  return (inv ?? []).map(r => ({
    outlet_id: r.outlet_id as string,
    outlet_name: name.get(r.outlet_id as string) ?? '—',
    items_on_hand: Number(r.items_on_hand) || 0,
  })).sort((a, b) => b.items_on_hand - a.items_on_hand)
}

/**
 * The scan-lookup core the Scan FAB uses. outletId optional: when the business has >1 outlet the caller passes
 * the selected outlet (on_hand is that outlet's); single-outlet auto-resolves to the only outlet's stock; no
 * outlet → on_hand is the total across outlets. locate[] is ALWAYS the full per-outlet breakdown.
 */
export async function scanLookup(
  sb: SupabaseClient, businessId: string, barcode: string, outletId?: string | null,
): Promise<ScanResult> {
  const code = (barcode ?? '').trim()
  if (!code) return { found: false, barcode: '', external: null }

  const productId = await resolveProductId(sb, businessId, code)

  if (!productId) {
    // Miss → external waterfall (own catalog already checked) → prefill for add-to-catalogue.
    let external: { name: string; brand: string | null; category: string | null; image_url: string | null; barcode: string } | null = null
    try {
      const ext = await lookupBarcode(code)
      if (ext.found && ext.name) {
        external = { name: ext.name, brand: ext.brand ?? null, category: ext.category ?? null, image_url: ext.image_url ?? null, barcode: code }
      }
    } catch { /* external offline → null prefill (manual add) */ }
    return { found: false, barcode: code, external }
  }

  const { data: p } = await sb.from('pos_products')
    .select('id, name, sku, barcode, price').eq('id', productId).eq('business_id', businessId).maybeSingle()
  if (!p) return { found: false, barcode: code, external: null }

  const locate = await locateStock(sb, businessId, productId)
  const total = locate.reduce((s, l) => s + l.items_on_hand, 0)
  const onHand = outletId ? (locate.find(l => l.outlet_id === outletId)?.items_on_hand ?? 0) : total

  let cost: number | null = null, costSource = 'unknown'
  try { const rc = await resolveCostFor(sb, businessId, productId, outletId ?? null); cost = rc.cost; costSource = rc.source } catch { /* unknown */ }
  const retail = Number(p.price) || 0

  return {
    found: true,
    product: {
      id: p.id as string, name: p.name as string, sku: (p.sku as string | null) ?? null,
      barcode: (p.barcode as string | null) ?? code, retail, cost, cost_source: costSource,
      margin_pct: margin(retail, cost), on_hand: onHand,
    },
    locate,
    total_on_hand: total,
  }
}
