export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { computePar, computeParReadonly, getOrSeedReorderSettings, setProductPar } from '@/lib/inventory/par-levels'
import { reorderSuggestions, createDraftPO } from '@/lib/inventory/buying'

// INV-PAR-1 — owner reorder surface. GET reads par + below-reorder (bootstraps a compute on first use);
// POST { action } recomputes, saves settings, or applies a per-product override. getBid-scoped.

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  // If no par computed yet (all zero), bootstrap a compute; else read stored.
  const { count: anyPar } = await supabaseAdmin.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).gt('reorder_point', 0)
  const result = (anyPar ?? 0) > 0 ? await computeParReadonly(supabaseAdmin, bid) : await computePar(supabaseAdmin, bid)
  return NextResponse.json(result)
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { action?: string; lead_time_days?: number; buffer_weeks?: number; review_cycle_days?: number; default_reorder_qty?: number; product_id?: string; reorder_point?: number; target_stock?: number; reorder_qty?: number }

  if (body.action === 'settings') {
    await getOrSeedReorderSettings(supabaseAdmin, bid) // ensure the row exists
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.lead_time_days != null) patch.lead_time_days = Math.max(0, Number(body.lead_time_days))
    if (body.buffer_weeks != null) patch.buffer_weeks = Math.max(0, Number(body.buffer_weeks))
    if (body.review_cycle_days != null) patch.review_cycle_days = Math.max(0, Number(body.review_cycle_days))
    if (body.default_reorder_qty != null) patch.default_reorder_qty = Math.max(1, Math.round(Number(body.default_reorder_qty)))
    await supabaseAdmin.from('reorder_settings').update(patch).eq('business_id', bid)
    const result = await computePar(supabaseAdmin, bid) // re-derive with the new knobs
    return NextResponse.json({ ok: true, ...result })
  }

  // MS10 PHASE 4/5 — DRAFT, DON'T SEND. The dashboard's runs-out list drafts purchase orders
  // through the SAME engine the staff app uses (reorderSuggestions → createDraftPO): grouped by
  // supplier, quantities from par and velocity, per-line cost with its provenance tier, status
  // 'draft'. NOTHING IS SENT: this action never touches the approve-and-send path, never contacts a
  // supplier, never spends. Approval stays where it lives — the money-gated approve in the buying
  // flow. Items whose product has no supplier cannot be drafted and are reported, not dropped.
  if (body.action === 'draft') {
    const suggestions = await reorderSuggestions(supabaseAdmin, bid, null)
    const drafts: Array<{ id: string; order_number: string; supplier_name: string; lines: number; total: number; unpriced_lines: number }> = []
    let failed = 0
    for (const g of suggestions.groups) {
      if (!g.supplier_id) continue // needs a supplier — counted below, never silently dropped
      const po = await createDraftPO(supabaseAdmin, bid, g.supplier_id, g.items.map(i => ({
        product_id: i.product_id, product_name: i.name, quantity: i.suggested_qty, unit_cost: i.unit_cost,
      })), 'Owner')
      if (po) drafts.push({ id: po.id, order_number: po.order_number, supplier_name: g.supplier_name, lines: g.items.length, total: po.total, unpriced_lines: po.unpriced_lines })
      else failed++
    }
    const needsSupplier = suggestions.groups.filter(g => !g.supplier_id).reduce((n, g) => n + g.items.length, 0)
    return NextResponse.json({ ok: true, drafts, drafts_failed: failed, items_needing_supplier: needsSupplier, below_count: suggestions.below_count })
  }

  if (body.action === 'override' && body.product_id) {
    await setProductPar(supabaseAdmin, bid, body.product_id, { reorder_point: body.reorder_point, target_stock: body.target_stock, reorder_qty: body.reorder_qty })
    return NextResponse.json({ ok: true })
  }

  // default: recompute
  const result = await computePar(supabaseAdmin, bid)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withBusinessContext('pos/inventory/reorder:get', _GET)
export const POST = withBusinessContext('pos/inventory/reorder:post', _POST)
