export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'
import { computeItemImpact, type ItemInput } from '@/lib/aria/compute/item-card-impact'
import type { CardCostTier } from '@/lib/aria/compute/card-cost'

/**
 * M14 PHASE 2 — the per-item table, built from real sales and the CANONICAL cost resolver.
 *
 * ⚠️ `pos_products.cost_price` is never read here. `resolveCostBatch()` is the one place that ranks
 * a real supplier transaction above the catalogue column and reports unknown as null — and
 * `isCostUsableForMargin()` then throws out the catalogue values that carry the price × 0.4
 * signature. For Sip that is all 72 of them, and a route that read the column would have returned
 * 72 confident, fabricated margins.
 *
 * Reads only. The price PROPOSAL is phase 3 and goes through `bulk_price_update`.
 */
async function _GET(req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 90), 1), 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  // ── the venue's surcharge position, the same read phase 1 makes ───────────────────────────────
  const { data: settings, error: settingsErr } = await supabase
    .from('pos_settings')
    .select('surcharge_enabled, surcharge_type, surcharge_value, card_surcharge_percent')
    .eq('business_id', businessId)
    .maybeSingle()
  if (settingsErr) console.error('[item-impact] pos_settings read failed:', settingsErr.message)

  const isPercent = (settings?.surcharge_type ?? 'percent') === 'percent'
  const rawRate = Number(settings?.surcharge_value ?? settings?.card_surcharge_percent ?? 0)
  const surchargePct = settings?.surcharge_enabled && isPercent ? rawRate : (settings?.surcharge_enabled ? null : 0)

  // ── card share, from payment rows, with its coverage ───────────────────────────────────────────
  const { data: payRows, error: payErr } = await supabase
    .from('pos_sale_payments')
    .select('method, amount_cents, pos_sales!inner(business_id, status)')
    .eq('pos_sales.business_id', businessId)
    .eq('pos_sales.status', 'completed')
    .limit(20000)
  if (payErr) console.error('[item-impact] pos_sale_payments read failed:', payErr.message)

  const rows = payRows ?? []
  const cardCents = rows.filter(r => r.method === 'card').reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
  const allCents = rows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
  const cardSharePct = allCents > 0 ? Math.round((cardCents / allCents) * 1000) / 10 : null

  const { count: completedCount, error: countErr } = await supabase
    .from('pos_sales').select('id', { count: 'exact', head: true })
    .eq('business_id', businessId).eq('status', 'completed')
  if (countErr) console.error('[item-impact] pos_sales count failed:', countErr.message)

  const coverage = completedCount && completedCount > 0 ? rows.length / completedCount : 0
  const cardShareTier: CardCostTier = cardSharePct == null ? 'not_connected' : (coverage >= 0.8 ? 'verified' : 'estimated')

  // ── products ──────────────────────────────────────────────────────────────────────────────────
  const { data: products, error: prodErr } = await supabase
    .from('pos_products')
    .select('id, name, price')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(2000)
  if (prodErr) console.error('[item-impact] pos_products read failed:', prodErr.message)

  // ── units sold in the window, from completed sales only ───────────────────────────────────────
  const { data: saleItems, error: itemsErr } = await supabase
    .from('pos_sale_items')
    .select('product_id, quantity, returned_quantity, pos_sales!inner(business_id, status, created_at)')
    .eq('pos_sales.business_id', businessId)
    .eq('pos_sales.status', 'completed')
    .gte('pos_sales.created_at', since)
    .limit(50000)
  if (itemsErr) console.error('[item-impact] pos_sale_items read failed:', itemsErr.message)

  const unitsByProduct = new Map<string, number>()
  for (const li of saleItems ?? []) {
    if (!li.product_id) continue
    // Net of returns — a returned unit was not sold, and counting it would overstate the item.
    const net = (Number(li.quantity) || 0) - (Number(li.returned_quantity) || 0)
    unitsByProduct.set(li.product_id, (unitsByProduct.get(li.product_id) ?? 0) + Math.max(0, net))
  }
  // A product with no line at all in the window sold zero — that is a real answer, not a gap.
  const sawAnySales = (saleItems ?? []).length > 0

  // ── the canonical cost resolver, never the raw column ─────────────────────────────────────────
  const costs = await resolveCostBatch(supabase, businessId, null)

  const items: ItemInput[] = (products ?? []).map(p => ({
    id: p.id as string,
    name: (p.name as string) ?? 'Unnamed',
    price: Number(p.price) || 0,
    units_sold: sawAnySales ? (unitsByProduct.get(p.id as string) ?? 0) : null,
    resolved_cost: costs.get(p.id as string) ?? null,
  }))

  const result = computeItemImpact({
    items,
    surcharge_pct: surchargePct,
    card_share_pct: cardSharePct,
    card_share_tier: cardShareTier,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, provenance: result.provenance })
  }

  return NextResponse.json({
    ok: true,
    window_days: days,
    summary: {
      recovery_pct: result.data.recovery_pct,
      recovery_tier: result.data.recovery_tier,
      total_surcharge_lost: result.data.total_surcharge_lost,
      cost_quality: result.data.cost_quality,
      unknowns: result.data.unknowns,
    },
    // Heaviest sellers first — that is the order an owner re-prices in.
    items: result.data.items.slice().sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1)),
    provenance: result.provenance,
  })
}

export const GET = withBusinessContext('pricing/item-impact', _GET)
