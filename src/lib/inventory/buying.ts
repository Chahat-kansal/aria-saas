import type { SupabaseClient } from '@supabase/supabase-js'
import { computeParReadonly } from '@/lib/inventory/par-levels'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

// INV-5 — buying. Mostly WIRING the LIVE tables (no parallels): pos_purchase_orders (header) + pos_purchase_order_items
// (lines — the SAME shape the INV-2 Receive tile reads, so draft→send→receive closes), pos_suppliers, the
// product→supplier link on pos_products.supplier_id (with PO-history fallback), supplier_product_prices for
// supplier-specific cost. Reorder is INV-PAR (pos_products reorder cols via computeParReadonly). MONEY GATE: a
// PO never sends without an owner/manager (staffCanAdjust); drafting ≠ sending; no stock moves until Receive.
// GROUNDING-TEETH: qty/cost from real reorder_point / cost / velocity; missing supplier/cost is FLAGGED, never faked.

export interface BuyItem {
  product_id: string; name: string; on_hand: number; reorder_point: number; target_stock: number
  suggested_qty: number; abc_tier: string; unit_cost: number | null; cost_source: string
  line_total: number | null; needs_cost: boolean
}
export interface BuyGroup { supplier_id: string | null; supplier_name: string; needs_supplier: boolean; items: BuyItem[]; total: number }

/** Resolve a product→supplier map: pos_products.supplier_id first, else the supplier of the product's most
 *  recent purchase order line (history fallback). Returns Map<product_id, {supplier_id, supplier_name}>. */
async function productSupplierMap(sb: SupabaseClient, businessId: string, productIds: string[], supplierNames: Map<string, string>): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>()
  if (!productIds.length) return map
  const { data: prods } = await sb.from('pos_products').select('id, supplier_id').in('id', productIds).eq('business_id', businessId)
  for (const p of prods ?? []) { const sid = p.supplier_id as string | null; if (sid) map.set(p.id as string, { id: sid, name: supplierNames.get(sid) ?? 'Supplier' }) }
  const missing = productIds.filter(id => !map.has(id))
  if (missing.length) {
    // history fallback: most recent PO line per missing product → that PO's supplier
    const { data: lines } = await sb.from('pos_purchase_order_items')
      .select('product_id, pos_purchase_orders!inner(supplier_id, business_id, created_at)')
      .in('product_id', missing).eq('pos_purchase_orders.business_id', businessId)
      .order('created_at', { ascending: false, foreignTable: 'pos_purchase_orders' }).limit(2000)
    for (const l of lines ?? []) {
      const pid = l.product_id as string
      const sid = (l.pos_purchase_orders as { supplier_id?: string } | null)?.supplier_id ?? null
      if (sid && !map.has(pid)) map.set(pid, { id: sid, name: supplierNames.get(sid) ?? 'Supplier' })
    }
  }
  return map
}

/** Supplier-specific cost for a product (supplier_product_prices), newest first. null if none. */
async function supplierCost(sb: SupabaseClient, businessId: string, supplierId: string | null, productId: string): Promise<number | null> {
  if (!supplierId) return null
  const { data } = await sb.from('supplier_product_prices').select('cost_price')
    .eq('business_id', businessId).eq('supplier_id', supplierId).eq('product_id', productId)
    .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
  return data?.cost_price != null ? Number(data.cost_price) : null
}

/** PART 1 — products at/below reorder_point for an outlet, grouped by supplier. Per-outlet on_hand. */
export async function reorderSuggestions(sb: SupabaseClient, businessId: string, outletIdIn: string | null): Promise<{ outlet_id: string | null; groups: BuyGroup[]; below_count: number; needs_supplier_count: number }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const par = await computeParReadonly(sb, businessId) // reorder_point / target_stock / abc per product (par cols)

  // per-outlet on-hand overlay (stock is per-outlet)
  const onHand = new Map<string, number>()
  if (outletId) {
    const { data: inv } = await sb.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', businessId).eq('outlet_id', outletId).limit(10000)
    for (const r of inv ?? []) onHand.set(r.product_id as string, Number(r.items_on_hand) || 0)
  }
  const below = par.rows
    .filter(r => !r.review && r.reorder_point > 0)
    .map(r => { const oh = onHand.get(r.product_id) ?? 0; return { ...r, on_hand: oh, below: oh <= r.reorder_point, suggested: Math.max(r.target_stock - oh, par.settings.default_reorder_qty) } })
    .filter(r => r.below)
  if (!below.length) return { outlet_id: outletId, groups: [], below_count: 0, needs_supplier_count: 0 }

  const { data: suppliers } = await sb.from('pos_suppliers').select('id, name').eq('business_id', businessId)
  const supNames = new Map((suppliers ?? []).map(s => [s.id as string, s.name as string]))
  const supMap = await productSupplierMap(sb, businessId, below.map(r => r.product_id), supNames)

  const groups = new Map<string, BuyGroup>()
  let needsSupplier = 0
  for (const r of below) {
    const sup = supMap.get(r.product_id) ?? null
    const key = sup?.id ?? 'none'
    if (!groups.has(key)) groups.set(key, { supplier_id: sup?.id ?? null, supplier_name: sup?.name ?? 'Needs a supplier', needs_supplier: !sup, items: [], total: 0 })
    if (!sup) needsSupplier++
    // cost: supplier price → catalogue cost (resolved) → null (flag)
    let cost = await supplierCost(sb, businessId, sup?.id ?? null, r.product_id)
    let source = cost != null ? 'supplier_list' : 'unknown'
    if (cost == null) { try { const rc = await resolveCostFor(sb, businessId, r.product_id, outletId); if (rc.cost != null) { cost = rc.cost; source = rc.source } } catch { /* unknown */ } }
    const lineTotal = cost != null ? Math.round(cost * r.suggested * 100) / 100 : null
    const g = groups.get(key)!
    g.items.push({ product_id: r.product_id, name: r.name, on_hand: r.on_hand, reorder_point: r.reorder_point, target_stock: r.target_stock, suggested_qty: r.suggested, abc_tier: r.abc_tier, unit_cost: cost, cost_source: source, line_total: lineTotal, needs_cost: cost == null })
    if (lineTotal != null) g.total = Math.round((g.total + lineTotal) * 100) / 100
  }
  const ordered = Array.from(groups.values()).sort((a, b) => (a.needs_supplier ? 1 : 0) - (b.needs_supplier ? 1 : 0) || b.total - a.total)
  return { outlet_id: outletId, groups: ordered, below_count: below.length, needs_supplier_count: needsSupplier }
}

export interface DraftLineIn { product_id: string; product_name: string; quantity: number; unit_cost: number | null }

/** PART 2 — create a DRAFT PO (status='draft'). Does NOT send, does NOT change stock. Same header+lines shape the
 *  INV-2 Receive tile reads (order_id, product_id, product_name, quantity_ordered, unit_cost, line_total). */
export async function createDraftPO(sb: SupabaseClient, businessId: string, supplierId: string, lines: DraftLineIn[], staffName: string): Promise<{ id: string; order_number: string; status: string; total: number } | null> {
  const clean = lines.filter(l => l.product_id && (Number(l.quantity) || 0) > 0)
  if (!supplierId || !clean.length) return null
  const subtotal = Math.round(clean.reduce((s, l) => s + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0), 0) * 100) / 100
  const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const { data: po, error } = await sb.from('pos_purchase_orders').insert({
    business_id: businessId, supplier_id: supplierId, order_number: orderNumber, status: 'draft',
    subtotal, tax_amount: 0, total: subtotal, created_by: staffName, source: 'inventory_app',
    notes: 'Draft from buying — awaiting owner approval',
  }).select('id, order_number, status, total').single()
  if (error || !po) return null
  const items = clean.map(l => ({
    order_id: po.id, product_id: l.product_id, product_name: l.product_name || 'Item',
    quantity_ordered: Math.round(Number(l.quantity) || 0), unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
    line_total: l.unit_cost != null ? Math.round((Number(l.unit_cost) || 0) * (Number(l.quantity) || 0) * 100) / 100 : null,
    receive_status: 'pending',
  }))
  const { error: le } = await sb.from('pos_purchase_order_items').insert(items)
  if (le) { await sb.from('pos_purchase_orders').delete().eq('id', po.id); return null } // don't leave a header with no lines
  return { id: po.id as string, order_number: po.order_number as string, status: po.status as string, total: Number(po.total) || subtotal }
}

/** PART 2 — OWNER approves → atomic draft→sent + send to the supplier (Resend email; CSV note if no email). The
 *  ONLY transition that "spends". Caller must have already verified the actor is privileged (staffCanAdjust). */
export async function approveAndSendPO(sb: SupabaseClient, businessId: string, poId: string, staffName: string): Promise<{ ok: boolean; idempotent?: boolean; channel?: 'email' | 'none'; order_number?: string; supplier_email?: string | null }> {
  const { data: claimed } = await sb.from('pos_purchase_orders')
    .update({ status: 'sent', notes: `Approved & sent by ${staffName}` })
    .eq('business_id', businessId).eq('id', poId).eq('status', 'draft')
    .select('id, order_number, supplier_id, total').maybeSingle()
  if (!claimed?.id) return { ok: true, idempotent: true }

  const { data: sup } = await sb.from('pos_suppliers').select('name, email, order_email').eq('id', claimed.supplier_id as string).maybeSingle()
  const to = (sup?.order_email as string | null) || (sup?.email as string | null) || null
  const { data: lines } = await sb.from('pos_purchase_order_items').select('product_name, quantity_ordered, unit_cost, line_total').eq('order_id', poId)
  let channel: 'email' | 'none' = 'none'
  if (to && process.env.RESEND_API_KEY) {
    const rowsHtml = (lines ?? []).map(l => `<tr><td>${String(l.product_name ?? '')}</td><td style="text-align:right">${Number(l.quantity_ordered) || 0}</td><td style="text-align:right">$${(Number(l.unit_cost) || 0).toFixed(2)}</td><td style="text-align:right">$${(Number(l.line_total) || 0).toFixed(2)}</td></tr>`).join('')
    const html = `<div style="font-family:Inter,Arial,sans-serif"><h2>Purchase Order ${String(claimed.order_number)}</h2><p>Hi ${String(sup?.name ?? '')}, please supply the following:</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Total</th></tr></thead><tbody>${rowsHtml}</tbody></table><p style="font-weight:700">Total: $${(Number(claimed.total) || 0).toFixed(2)}</p></div>`
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Aria <aria@ariaos.site>', to: [to], subject: `Purchase Order ${String(claimed.order_number)}`, html }),
      })
      if (res.ok) channel = 'email'
    } catch { /* delivery failure → still 'sent' status; channel none (owner can resend / CSV) */ }
  }
  return { ok: true, channel, order_number: claimed.order_number as string, supplier_email: to }
}

/** PART 3B — delivery accuracy ground truth: 30-day short-delivery count + value + worst supplier by fill rate.
 *  Reads only RECEIVED POs in the window; never fakes missing data — returns 0 counts when no history. */
export async function deliveryAccuracyGroundTruth(
  sb: SupabaseClient, businessId: string
): Promise<{ short_lines_30d: number; short_dollars_30d: number; worst_supplier: string | null; worst_supplier_short_rate: number | null }> {
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: pos } = await sb.from('pos_purchase_orders')
    .select('id, supplier_name')
    .eq('business_id', businessId).eq('status', 'received')
    .gte('received_at', thirtyAgo).limit(500)
  const poIds = (pos ?? []).map(p => p.id as string)
  const supplierOf = new Map((pos ?? []).map(p => [p.id as string, String(p.supplier_name ?? 'Unknown')]))
  if (!poIds.length) return { short_lines_30d: 0, short_dollars_30d: 0, worst_supplier: null, worst_supplier_short_rate: null }
  const { data: lines } = await sb.from('pos_purchase_order_items')
    .select('order_id, quantity_ordered, quantity_received, unit_cost')
    .in('order_id', poIds).in('receive_status', ['received', 'partial']).limit(5000)
  let shortCount = 0
  let shortDollars = 0
  const supplierStats = new Map<string, { total: number; short: number }>()
  for (const l of lines ?? []) {
    const ordered = Number(l.quantity_ordered) || 0
    const received = Number(l.quantity_received) || 0
    const supplier = supplierOf.get(l.order_id as string) ?? 'Unknown'
    const s = supplierStats.get(supplier) ?? { total: 0, short: 0 }
    s.total++
    if (received < ordered) { shortCount++; shortDollars += (ordered - received) * (Number(l.unit_cost) || 0); s.short++ }
    supplierStats.set(supplier, s)
  }
  let worstSupplier: string | null = null
  let worstRate: number | null = null
  for (const [name, s] of supplierStats.entries()) {
    if (s.total >= 2) {
      const rate = s.short / s.total
      if (worstRate === null || rate > worstRate) { worstRate = rate; worstSupplier = name }
    }
  }
  return {
    short_lines_30d: shortCount,
    short_dollars_30d: Math.round(shortDollars * 100) / 100,
    worst_supplier: worstSupplier,
    worst_supplier_short_rate: worstRate !== null ? Math.round(worstRate * 100) : null,
  }
}

/** PART 3 — a supplier's price list (supplier_product_prices), matched to catalogue cost → auto-fill + a grounded
 *  cost-CHANGE signal when the list cost differs from the captured catalogue cost (never auto-applied). */
export async function supplierPriceList(sb: SupabaseClient, businessId: string, supplierId: string): Promise<Array<{ product_id: string; product_name: string; list_cost: number; captured_cost: number | null; changed: boolean; delta_pct: number | null }>> {
  const { data: prices } = await sb.from('supplier_product_prices')
    .select('product_id, product_name, cost_price, recorded_at').eq('business_id', businessId).eq('supplier_id', supplierId)
    .order('recorded_at', { ascending: false }).limit(2000)
  const seen = new Set<string>()
  const out: Array<{ product_id: string; product_name: string; list_cost: number; captured_cost: number | null; changed: boolean; delta_pct: number | null }> = []
  for (const p of prices ?? []) {
    const pid = p.product_id as string
    if (seen.has(pid)) continue
    seen.add(pid)
    const listCost = Number(p.cost_price) || 0
    let captured: number | null = null
    try { const rc = await resolveCostFor(sb, businessId, pid, null); captured = rc.cost } catch { /* unknown */ }
    const changed = captured != null && Math.abs(captured - listCost) > 0.001
    const deltaPct = changed && captured! > 0 ? Math.round(((listCost - captured!) / captured!) * 1000) / 10 : null
    out.push({ product_id: pid, product_name: (p.product_name as string) ?? 'Item', list_cost: listCost, captured_cost: captured, changed, delta_pct: deltaPct })
  }
  return out
}
