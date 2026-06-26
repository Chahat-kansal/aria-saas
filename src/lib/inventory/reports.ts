import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStockValue } from '@/lib/inventory/stock-value'
import { computeParReadonly } from '@/lib/inventory/par-levels'
import { getVisibleTiles, type InvCapability, type InvCapabilities } from '@/lib/inventory/tile-manifest'
import { computeAvT } from '@/lib/inventory/avt'

// INV-REPORTS — the inventory reporting spine. Deterministic, GROUNDED generators (NO LLM for any number —
// pure computed data from the live tables). Each report returns structured sections for a period/outlet, and
// handles no-data honestly (a café with no waste shows "No waste this period", never a fabricated row).
// Canonical stock = pos_outlet_inventory.items_on_hand. Dollars everywhere except pos_waste_log.cost_cents (/100).

export type ReportType =
  | 'sold_vs_stock' | 'stock_value' | 'shrinkage_waste' | 'dead_stock' | 'reorder'
  | 'days_cover' | 'count_accuracy' | 'received_vs_ordered' | 'expiring' | 'movement_audit'
  | 'transfers' | 'top_sellers' | 'margin' | 'food_cost_variance'
export type Period = 'daily' | 'weekly'

// Each entry may carry capability gates (AND): a report only lists for a business that has ALL of them.
// INV-3 gating: Transfers needs >1 outlet (multiOutlet); Expiring needs a perishable industry. The gate hides
// a report from the LIBRARY list — it never blocks generation if requested directly (so a deep link still works).
export const REPORT_LIBRARY: Array<{ type: ReportType; title: string; blurb: string; capabilities?: InvCapability[] }> = [
  { type: 'sold_vs_stock', title: 'Sold vs in-stock', blurb: 'Units sold this period against current on-hand + variances' },
  { type: 'stock_value', title: 'Stock value', blurb: 'Inventory at cost and retail, margin and completeness' },
  { type: 'margin', title: 'Margin by product & category', blurb: 'Cost vs retail vs realised sold margin; flags thin margins' },
  { type: 'top_sellers', title: 'Top sellers & velocity', blurb: 'Units + revenue by product with ABC velocity class' },
  { type: 'shrinkage_waste', title: 'Shrinkage & waste', blurb: 'Waste $ and negative adjustments by product and staff' },
  { type: 'dead_stock', title: 'Dead stock', blurb: 'Slow/zero movers and the value tied up in them' },
  { type: 'reorder', title: 'Low stock & reorder', blurb: 'Below reorder point with days-of-cover + suggested qty' },
  { type: 'days_cover', title: 'Days of cover', blurb: 'On-hand ÷ velocity, fastest-to-run-out first' },
  { type: 'count_accuracy', title: 'Count accuracy', blurb: 'Stocktake accuracy by staff member' },
  { type: 'received_vs_ordered', title: 'Received vs ordered', blurb: 'Purchase orders received against ordered' },
  { type: 'transfers', title: 'Transfers', blurb: 'Inter-outlet stock movements in the period', capabilities: ['multiOutlet'] },
  { type: 'expiring', title: 'Expiring stock', blurb: 'Items nearing expiry → markdown candidates', capabilities: ['perishable'] },
  { type: 'movement_audit', title: 'Stock movement audit', blurb: 'The adjustment + waste ledger for the period' },
  { type: 'food_cost_variance', title: 'Food cost variance (AvT)', blurb: 'Theoretical ingredient usage (recipe × sold) vs actual depletion — the $ gap reveals over-portioning, waste or untracked loss' },
]

/**
 * Industry/capability-gated report list for a business — single-outlet hides Transfers, non-perishable hides
 * Expiring. Reuses the INV-1 manifest's capability resolution (getVisibleTiles) so the gate stays in one place.
 * Falls back to the full library if capability resolution fails (never hides a report on an error).
 */
export async function visibleReportLibrary(businessId: string): Promise<typeof REPORT_LIBRARY> {
  let caps: InvCapabilities | null = null
  try { caps = (await getVisibleTiles(businessId)).capabilities } catch { caps = null }
  if (!caps) return REPORT_LIBRARY
  return REPORT_LIBRARY.filter(r => (r.capabilities ?? []).every(c => caps![c] === true))
}

export interface ReportSection { title: string; columns: string[]; rows: Array<Array<string | number>>; empty?: string; total_row?: Array<string | number> }
export interface ReportKpis { stock_at_cost: number; stock_at_retail: number; units_sold: number; shrinkage_dollars: number }
export interface ReportData {
  type: ReportType; title: string; period: Period; period_label: string
  business_name: string; outlet_id: string | null; generated_at: string
  kpis: ReportKpis | null; sections: ReportSection[]; note: string | null
}

const money = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function aestDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
/** Period window in ISO (UTC) with an AEST-day basis. daily = the given date (default today); weekly = 7 days back. */
export function periodRange(period: Period, dateStr?: string): { start: string; end: string; label: string } {
  const day = dateStr || aestDate()
  if (period === 'weekly') {
    const endD = new Date(`${day}T23:59:59+10:00`)
    const startD = new Date(endD.getTime() - 7 * 86400_000 + 1000)
    const startDay = aestDate(startD)
    return { start: new Date(`${startDay}T00:00:00+10:00`).toISOString(), end: endD.toISOString(), label: `${startDay} → ${day} (7 days)` }
  }
  return { start: new Date(`${day}T00:00:00+10:00`).toISOString(), end: new Date(`${day}T23:59:59+10:00`).toISOString(), label: day }
}

/** Net units sold per product in the window (completed sales, quantity − returned_quantity). */
async function soldByProduct(sb: SupabaseClient, bid: string, start: string, end: string): Promise<Map<string, { name: string; sold: number }>> {
  const { data } = await sb.from('pos_sale_items')
    .select('product_id, product_name, quantity, returned_quantity, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid).neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', start).lte('pos_sales.created_at', end).limit(40000)
  const m = new Map<string, { name: string; sold: number }>()
  for (const r of (data ?? []) as Array<{ product_id: string | null; product_name: string | null; quantity: number | null; returned_quantity: number | null }>) {
    if (!r.product_id) continue
    const net = (Number(r.quantity) || 0) - (Number(r.returned_quantity) || 0)
    const cur = m.get(r.product_id) ?? { name: r.product_name ?? 'Item', sold: 0 }
    cur.sold += net
    m.set(r.product_id, cur)
  }
  return m
}

/** Net units + revenue + realised cost per product (completed sales). Revenue = line_total pro-rated for returns.
 *  GROUNDING-TEETH: a line with NO recorded cost_price is unknown-cost, NOT $0 — it's excluded from `cost` and
 *  `costed_revenue`, so realised margin reflects only the costed portion (never a fabricated 100%). Used by Top
 *  sellers (ABC) and Margin. */
async function soldDetailByProduct(sb: SupabaseClient, bid: string, start: string, end: string): Promise<Map<string, { name: string; units: number; revenue: number; cost: number; costed_revenue: number }>> {
  const { data } = await sb.from('pos_sale_items')
    .select('product_id, product_name, quantity, returned_quantity, line_total, unit_price, cost_price, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid).neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', start).lte('pos_sales.created_at', end).limit(40000)
  const m = new Map<string, { name: string; units: number; revenue: number; cost: number; costed_revenue: number }>()
  for (const r of (data ?? []) as Array<{ product_id: string | null; product_name: string | null; quantity: number | null; returned_quantity: number | null; line_total: number | null; unit_price: number | null; cost_price: number | null }>) {
    if (!r.product_id) continue
    const qty = Number(r.quantity) || 0
    const net = qty - (Number(r.returned_quantity) || 0)
    if (net <= 0) continue
    const unitRev = qty > 0 ? (Number(r.line_total) || 0) / qty : (Number(r.unit_price) || 0)
    const lineRev = unitRev * net
    const cur = m.get(r.product_id) ?? { name: r.product_name ?? 'Item', units: 0, revenue: 0, cost: 0, costed_revenue: 0 }
    cur.units += net
    cur.revenue += lineRev
    if (r.cost_price != null && Number(r.cost_price) > 0) { cur.cost += Number(r.cost_price) * net; cur.costed_revenue += lineRev } // known cost only (0/null = not recorded, not free)
    m.set(r.product_id, cur)
  }
  return m
}

/** product_id → category (null → 'Uncategorised'). One query; used by the Margin report's category roll-up. */
async function productCategories(sb: SupabaseClient, bid: string): Promise<Map<string, string>> {
  const { data } = await sb.from('pos_products').select('id, category').eq('business_id', bid).limit(20000)
  const m = new Map<string, string>()
  for (const p of (data ?? []) as Array<{ id: string; category: string | null }>) m.set(p.id, (p.category ?? '').trim() || 'Uncategorised')
  return m
}

async function businessName(sb: SupabaseClient, bid: string): Promise<string> {
  const { data } = await sb.from('businesses').select('name, trading_name').eq('id', bid).maybeSingle()
  return (data?.trading_name as string) || (data?.name as string) || 'Your business'
}

/** The 4 headline KPIs (all live). */
export async function reportKpis(sb: SupabaseClient, bid: string, outletId: string | null, range: { start: string; end: string }): Promise<ReportKpis> {
  const [sv, sold] = await Promise.all([computeStockValue(sb, bid, outletId), soldByProduct(sb, bid, range.start, range.end)])
  let unitsSold = 0; for (const v of sold.values()) unitsSold += v.sold
  // shrinkage = waste $ (cents→$) + |negative adjustments × cost|
  const { data: waste } = await sb.from('pos_waste_log').select('cost_cents').eq('business_id', bid).gte('recorded_at', range.start).lte('recorded_at', range.end)
  const wasteDollars = (waste ?? []).reduce((s, r) => s + (Number(r.cost_cents) || 0), 0) / 100
  const { data: adj } = await sb.from('pos_stock_adjustments').select('product_id, adjustment_qty').eq('business_id', bid).lt('adjustment_qty', 0).gte('created_at', range.start).lte('created_at', range.end)
  let adjDollars = 0
  if ((adj ?? []).length) {
    const sv2 = sv.products
    const costMap = new Map(sv2.map(p => [p.id, p.unit_cost ?? 0]))
    for (const a of adj!) adjDollars += Math.abs(Number(a.adjustment_qty) || 0) * (Number(costMap.get(a.product_id as string)) || 0)
  }
  return { stock_at_cost: sv.at_cost, stock_at_retail: sv.at_retail, units_sold: unitsSold, shrinkage_dollars: Math.round((wasteDollars + adjDollars) * 100) / 100 }
}

// ── individual report builders (each returns ReportSection[] + an optional note) ──

async function rSoldVsStock(sb: SupabaseClient, bid: string, outletId: string | null, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const [sv, sold, reviews] = await Promise.all([
    computeStockValue(sb, bid, outletId),
    soldByProduct(sb, bid, range.start, range.end),
    sb.from('inventory_review_queue').select('product_id, expected_value, actual_value, variance').eq('business_id', bid).eq('flag_type', 'count_variance').gte('created_at', range.start).lte('created_at', range.end),
  ])
  const onHand = new Map(sv.products.map(p => [p.id, p.units]))
  const velMap = new Map<string, number>() // sold/day over the window not computed here; use par days-of-cover separately
  void velMap
  const ids = new Set<string>([...sold.keys(), ...sv.products.map(p => p.id)])
  const rows: Array<Array<string | number>> = []
  for (const id of ids) {
    const s = sold.get(id)
    const oh = onHand.get(id) ?? 0
    const name = s?.name ?? sv.products.find(p => p.id === id)?.name ?? 'Item'
    if ((s?.sold ?? 0) === 0 && oh === 0) continue
    rows.push([name, s?.sold ?? 0, oh])
  }
  rows.sort((a, b) => Number(b[1]) - Number(a[1]))
  const sections: ReportSection[] = [{
    title: 'Sold vs on-hand', columns: ['Product', 'Sold', 'On hand'],
    rows: rows.slice(0, 200), empty: 'No sales or stock for this period yet.',
  }]
  const varRows = (reviews.data ?? []).map(v => [
    sv.products.find(p => p.id === v.product_id)?.name ?? 'Item',
    v.expected_value != null ? Number(v.expected_value) : '—',
    v.actual_value != null ? Number(v.actual_value) : '—',
    v.variance != null ? `${Number(v.variance) > 0 ? '+' : ''}${Number(v.variance)}` : '—',
  ])
  sections.push({ title: 'Count variances raised', columns: ['Product', 'Book', 'Counted', 'Variance'], rows: varRows, empty: 'No count variances raised this period — counts matched the book.' })
  return { sections, note: 'Sold = completed units (qty − returns). On-hand is canonical items_on_hand. Variances never auto-correct stock.' }
}

async function rStockValue(sb: SupabaseClient, bid: string, outletId: string | null): Promise<{ sections: ReportSection[]; note: string | null }> {
  const sv = await computeStockValue(sb, bid, outletId)
  const summary: ReportSection = {
    title: 'Valuation', columns: ['Metric', 'Value'],
    rows: [
      ['At cost', money(sv.at_cost)], ['At retail', money(sv.at_retail)],
      ['Blended margin', sv.margin_pct != null ? `${sv.margin_pct}%` : 'unknown'],
      ['Units on hand', sv.units_on_hand],
      ['Products with stock', sv.products_total], ['Costed', sv.products_valued], ['Missing a cost', sv.products_unknown_cost],
    ],
  }
  const top = sv.products.filter(p => p.value_at_cost != null).slice(0, 25).map(p => [p.name, p.units, money(p.value_at_cost ?? 0), money(p.value_at_retail)])
  return {
    sections: [summary, { title: 'Top products by value (at cost)', columns: ['Product', 'On hand', 'At cost', 'At retail'], rows: top, empty: 'No costed products yet — set costs to value stock.' }],
    note: 'Items with no resolvable cost are excluded from the at-cost total and counted separately (never valued at $0).',
  }
}

async function rShrinkageWaste(sb: SupabaseClient, bid: string, outletId: string | null, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const sv = await computeStockValue(sb, bid, outletId)
  const costMap = new Map(sv.products.map(p => [p.id, p.unit_cost ?? 0]))
  const nameMap = new Map(sv.products.map(p => [p.id, p.name]))
  const { data: waste } = await sb.from('pos_waste_log').select('product_id, product_name, quantity, reason, recorded_by, cost_cents').eq('business_id', bid).gte('recorded_at', range.start).lte('recorded_at', range.end).limit(2000)
  const { data: adj } = await sb.from('pos_stock_adjustments').select('product_id, adjustment_qty, reason, adjusted_by').eq('business_id', bid).lt('adjustment_qty', 0).gte('created_at', range.start).lte('created_at', range.end).limit(2000)

  const byProduct = new Map<string, { name: string; units: number; dollars: number }>()
  const byStaff = new Map<string, { units: number; dollars: number }>()
  for (const w of waste ?? []) {
    const pid = (w.product_id as string) ?? 'x'; const name = (w.product_name as string) ?? nameMap.get(pid) ?? 'Item'
    const d = (Number(w.cost_cents) || 0) / 100; const u = Number(w.quantity) || 0
    const p = byProduct.get(pid) ?? { name, units: 0, dollars: 0 }; p.units += u; p.dollars += d; byProduct.set(pid, p)
    const who = (w.recorded_by as string) ?? 'Unknown'; const s = byStaff.get(who) ?? { units: 0, dollars: 0 }; s.units += u; s.dollars += d; byStaff.set(who, s)
  }
  for (const a of adj ?? []) {
    const pid = (a.product_id as string) ?? 'x'; const name = nameMap.get(pid) ?? 'Item'
    const u = Math.abs(Number(a.adjustment_qty) || 0); const d = u * (Number(costMap.get(pid)) || 0)
    const p = byProduct.get(pid) ?? { name, units: 0, dollars: 0 }; p.units += u; p.dollars += d; byProduct.set(pid, p)
    const who = (a.adjusted_by as string) ?? 'Unknown'; const s = byStaff.get(who) ?? { units: 0, dollars: 0 }; s.units += u; s.dollars += d; byStaff.set(who, s)
  }
  const prodRows = Array.from(byProduct.values()).sort((a, b) => b.dollars - a.dollars).map(p => [p.name, p.units, money(p.dollars)])
  const staffRows = Array.from(byStaff.entries()).sort((a, b) => b[1].dollars - a[1].dollars).map(([who, s]) => [who, s.units, money(s.dollars)])
  const totalD = Array.from(byProduct.values()).reduce((s, p) => s + p.dollars, 0)
  return {
    sections: [
      { title: 'By product', columns: ['Product', 'Units', 'Value lost'], rows: prodRows, empty: 'No waste or shrinkage this period.', total_row: prodRows.length ? ['Total', '', money(totalD)] : undefined },
      { title: 'By staff (attribution)', columns: ['Staff', 'Units', 'Value lost'], rows: staffRows, empty: 'No attributed loss this period.' },
    ],
    note: 'Waste $ from pos_waste_log (cents → dollars); shrinkage from negative stock adjustments valued at resolved cost.',
  }
}

async function rDeadStock(sb: SupabaseClient, bid: string, outletId: string | null): Promise<{ sections: ReportSection[]; note: string | null }> {
  const [sv, par] = await Promise.all([computeStockValue(sb, bid, outletId), computeParReadonly(sb, bid)])
  const valMap = new Map(sv.products.map(p => [p.id, { value: p.value_at_cost ?? 0, units: p.units }]))
  const dead = par.rows.filter(r => r.units_per_day === 0 && (valMap.get(r.product_id)?.units ?? 0) > 0)
    .map(r => ({ name: r.name, on_hand: valMap.get(r.product_id)?.units ?? 0, value: valMap.get(r.product_id)?.value ?? 0 }))
    .sort((a, b) => b.value - a.value)
  const tied = dead.reduce((s, d) => s + d.value, 0)
  return {
    sections: [{ title: 'Dead stock (no recent sales velocity)', columns: ['Product', 'On hand', 'Value tied up'], rows: dead.slice(0, 100).map(d => [d.name, d.on_hand, money(d.value)]), empty: 'No dead stock — every product on hand is selling.', total_row: dead.length ? ['Total tied up', '', money(tied)] : undefined }],
    note: 'Dead = zero sales velocity (from product_performance_scores) while still holding stock.',
  }
}

async function rReorder(sb: SupabaseClient, bid: string): Promise<{ sections: ReportSection[]; note: string | null }> {
  const par = await computeParReadonly(sb, bid)
  const below = par.rows.filter(r => r.below_reorder).sort((a, b) => (a.days_of_cover ?? 999) - (b.days_of_cover ?? 999))
  return {
    sections: [{ title: 'Below reorder point', columns: ['Product', 'On hand', 'Reorder at', 'Days cover', 'Suggested qty'], rows: below.map(r => [r.name, r.on_hand, r.reorder_point, r.days_of_cover != null ? r.days_of_cover : '—', r.suggested_qty]), empty: 'Nothing below reorder point — stock levels are healthy.' }],
    note: 'Reorder point + suggested qty are velocity-derived (par), not LLM estimates.',
  }
}

async function rDaysCover(sb: SupabaseClient, bid: string): Promise<{ sections: ReportSection[]; note: string | null }> {
  const par = await computeParReadonly(sb, bid)
  const rows = par.rows.filter(r => r.units_per_day > 0).sort((a, b) => (a.days_of_cover ?? 999) - (b.days_of_cover ?? 999))
    .map(r => [r.name, r.on_hand, r.units_per_day, r.days_of_cover != null ? r.days_of_cover : '—'])
  return { sections: [{ title: 'Days of cover (fastest to run out first)', columns: ['Product', 'On hand', 'Sells/day', 'Days cover'], rows: rows.slice(0, 200), empty: 'No sales velocity yet — days of cover needs sales history.' }], note: 'Days of cover = on-hand ÷ daily velocity.' }
}

async function rCountAccuracy(sb: SupabaseClient, bid: string, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const { data: takes } = await sb.from('pos_stock_takes').select('started_by, items_counted, items_with_variance').eq('business_id', bid).gte('completed_at', range.start).lte('completed_at', range.end).limit(5000)
  const byStaff = new Map<string, { counted: number; variances: number }>()
  for (const t of takes ?? []) { const who = (t.started_by as string) ?? 'Unknown'; const s = byStaff.get(who) ?? { counted: 0, variances: 0 }; s.counted += Number(t.items_counted) || 0; s.variances += Number(t.items_with_variance) || 0; byStaff.set(who, s) }
  // resolve staff names
  const ids = Array.from(byStaff.keys()).filter(k => /^[0-9a-f-]{36}$/.test(k))
  const { data: staff } = ids.length ? await sb.from('pos_staff').select('id, name').in('id', ids) : { data: [] }
  const nameMap = new Map((staff ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))
  const rows = Array.from(byStaff.entries()).map(([who, s]) => [nameMap.get(who) ?? who, s.counted, s.variances, s.counted > 0 ? `${Math.round((1 - s.variances / s.counted) * 100)}%` : '—'])
  return { sections: [{ title: 'Count accuracy by staff', columns: ['Staff', 'Items counted', 'Variances', 'Accuracy'], rows, empty: 'No stocktakes this period.' }], note: 'Accuracy = 1 − variances ÷ items counted, from each staffer’s stocktake history.' }
}

async function rReceivedVsOrdered(sb: SupabaseClient, bid: string, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const { data: pos } = await sb.from('pos_purchase_orders').select('id, po_number, supplier_id, total_amount, status, created_at, received_at').eq('business_id', bid).gte('created_at', range.start).lte('created_at', range.end).limit(500)
  const rows = (pos ?? []).map(p => [String(p.po_number ?? p.id).slice(0, 12), p.status ?? '—', money(Number(p.total_amount) || 0), p.received_at ? 'received' : 'open'])
  return { sections: [{ title: 'Purchase orders this period', columns: ['PO', 'Status', 'Value', 'Received?'], rows, empty: 'No purchase orders this period.' }], note: 'Received vs ordered needs PO/receiving data; honest empty state when none exists.' }
}

async function rExpiring(sb: SupabaseClient, bid: string): Promise<{ sections: ReportSection[]; note: string | null }> {
  let rows: Array<Array<string | number>> = []
  try {
    const { data: exp } = await sb.from('pos_expiry_alerts').select('product_id, days_until_expiry, quantity_at_risk, message').eq('business_id', bid).eq('acknowledged', false).order('days_until_expiry', { ascending: true }).limit(200)
    rows = (exp ?? []).map(e => [String(e.message ?? e.product_id ?? 'Item').slice(0, 40), e.days_until_expiry != null ? `${e.days_until_expiry}d` : '—', e.quantity_at_risk != null ? Number(e.quantity_at_risk) : '—'])
  } catch { /* table absent → empty */ }
  return { sections: [{ title: 'Expiring → markdown candidates', columns: ['Item', 'Days to expiry', 'Units at risk'], rows, empty: 'No items nearing expiry.' }], note: 'From unacknowledged expiry alerts; empty when none.' }
}

async function rMovementAudit(sb: SupabaseClient, bid: string, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const sv = await computeStockValue(sb, bid, null)
  const nameMap = new Map(sv.products.map(p => [p.id, p.name]))
  const [{ data: adj }, { data: waste }] = await Promise.all([
    sb.from('pos_stock_adjustments').select('product_id, adjustment_qty, reason, adjusted_by, created_at').eq('business_id', bid).gte('created_at', range.start).lte('created_at', range.end).order('created_at', { ascending: false }).limit(500),
    sb.from('pos_waste_log').select('product_id, product_name, quantity, reason, recorded_by, recorded_at').eq('business_id', bid).gte('recorded_at', range.start).lte('recorded_at', range.end).order('recorded_at', { ascending: false }).limit(500),
  ])
  const ev: Array<{ at: string; name: string; type: string; qty: string; by: string }> = []
  for (const a of adj ?? []) ev.push({ at: a.created_at as string, name: nameMap.get(a.product_id as string) ?? 'Item', type: (a.reason as string) ?? 'adjust', qty: `${Number(a.adjustment_qty) > 0 ? '+' : ''}${Number(a.adjustment_qty)}`, by: (a.adjusted_by as string) ?? '—' })
  for (const w of waste ?? []) ev.push({ at: w.recorded_at as string, name: (w.product_name as string) ?? nameMap.get(w.product_id as string) ?? 'Item', type: `waste:${(w.reason as string) ?? ''}`, qty: `-${Number(w.quantity) || 0}`, by: (w.recorded_by as string) ?? '—' })
  ev.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const rows = ev.slice(0, 300).map(e => [new Date(e.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), e.name, e.type, e.qty, e.by])
  return { sections: [{ title: 'Stock movement ledger', columns: ['When', 'Product', 'Type', 'Qty', 'By'], rows, empty: 'No stock movements this period.' }], note: 'Adjustment + waste ledger; every movement attributed to a staffer.' }
}

// INV-3 — Transfers summary (multi-outlet). Inter-outlet movements in the period from pos_inventory_transfers
// (canonical transfers table), with a per-lane roll-up. Honest empty state when a business has no transfers.
async function rTransfers(sb: SupabaseClient, bid: string, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const [{ data: outlets }, { data: tx }] = await Promise.all([
    sb.from('pos_outlets').select('id, name').eq('business_id', bid),
    sb.from('pos_inventory_transfers')
      .select('transfer_number, from_outlet_id, to_outlet_id, status, total_cost, total_variance_units, created_at, received_at')
      .eq('business_id', bid).gte('created_at', range.start).lte('created_at', range.end)
      .order('created_at', { ascending: false }).limit(500),
  ])
  const oname = new Map((outlets ?? []).map(o => [o.id as string, o.name as string]))
  const lane = (t: { from_outlet_id: unknown; to_outlet_id: unknown }) => `${oname.get(t.from_outlet_id as string) ?? '—'} → ${oname.get(t.to_outlet_id as string) ?? '—'}`
  const rows = (tx ?? []).map(t => [
    String(t.transfer_number ?? '—'),
    lane(t),
    String(t.status ?? '—'),
    money(Number(t.total_cost) || 0),
    t.received_at ? 'received' : String(t.status ?? 'open'),
  ])
  const byLane = new Map<string, { count: number; value: number }>()
  for (const t of tx ?? []) { const k = lane(t); const c = byLane.get(k) ?? { count: 0, value: 0 }; c.count++; c.value += Number(t.total_cost) || 0; byLane.set(k, c) }
  const laneRows = Array.from(byLane.entries()).sort((a, b) => b[1].value - a[1].value).map(([k, v]) => [k, v.count, money(v.value)])
  const totalVal = (tx ?? []).reduce((s, t) => s + (Number(t.total_cost) || 0), 0)
  return {
    sections: [
      { title: 'Transfers this period', columns: ['Transfer', 'Lane', 'Status', 'Value', 'Received?'], rows, empty: 'No inter-outlet transfers this period.', total_row: rows.length ? ['Total', '', '', money(totalVal), ''] : undefined },
      { title: 'By lane', columns: ['Lane', 'Count', 'Value moved'], rows: laneRows, empty: 'No transfer lanes this period.' },
    ],
    note: 'Inter-outlet movements from pos_inventory_transfers; value at the transfer’s recorded cost. Multi-outlet businesses only.',
  }
}

// INV-3 — Top sellers & velocity with ABC class. Units + revenue per product (completed sales), ranked by
// revenue; ABC by cumulative revenue contribution (A = top 80%, B = next 15%, C = last 5%) — the classic
// inventory ABC. Grounded in real line_total revenue, never an estimate.
async function rTopSellers(sb: SupabaseClient, bid: string, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const detail = await soldDetailByProduct(sb, bid, range.start, range.end)
  const arr = Array.from(detail.values()).filter(d => d.units > 0).sort((a, b) => b.revenue - a.revenue)
  const totalRev = arr.reduce((s, d) => s + d.revenue, 0)
  let cum = 0
  const rows = arr.map(d => {
    cum += d.revenue
    const pct = totalRev > 0 ? cum / totalRev : 1
    const cls = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C'
    return [d.name, d.units, money(d.revenue), cls]
  })
  return {
    sections: [{ title: 'Top sellers by revenue (ABC)', columns: ['Product', 'Units', 'Revenue', 'Class'], rows: rows.slice(0, 200), empty: 'No sales this period.', total_row: rows.length ? ['Total', '', money(totalRev), ''] : undefined }],
    note: 'ABC = cumulative revenue share (A top 80%, B next 15%, C last 5%). Units & revenue from completed sale lines.',
  }
}

// INV-3 — Margin by product & category. Catalogue margin (price vs resolved cost on current stock) AND realised
// sold margin (revenue vs line cost) for the period, plus a category roll-up. Thin margins (< 20%) flagged.
async function rMargin(sb: SupabaseClient, bid: string, outletId: string | null, range: { start: string; end: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const [sv, detail, cats] = await Promise.all([
    computeStockValue(sb, bid, outletId),
    soldDetailByProduct(sb, bid, range.start, range.end),
    productCategories(sb, bid),
  ])
  const THIN = 20 // %
  // Per-product: catalogue margin (from stock value) + realised sold margin (this period).
  // Realised sold margin over the COSTED portion only — unknown line costs never inflate it to 100%.
  const soldMarginOf = (sold?: { costed_revenue: number; cost: number }) =>
    sold && sold.costed_revenue > 0 ? Math.round(((sold.costed_revenue - sold.cost) / sold.costed_revenue) * 1000) / 10 : null
  const prodRows: Array<Array<string | number>> = []
  const seen = new Set<string>()
  for (const p of sv.products) {
    seen.add(p.id)
    const soldMargin = soldMarginOf(detail.get(p.id))
    const catMargin = p.margin_pct
    const thin = (catMargin != null && catMargin < THIN) || (soldMargin != null && soldMargin < THIN)
    prodRows.push([p.name, p.unit_cost != null ? money(p.unit_cost) : '—', money(p.price), catMargin != null ? `${catMargin}%` : '—', soldMargin != null ? `${soldMargin}%` : '—', thin ? 'thin' : ''])
  }
  // Products sold this period but not currently in stock-value (no on-hand) — still show realised margin.
  for (const [pid, sold] of detail) {
    if (seen.has(pid) || sold.revenue <= 0) continue
    const soldMargin = soldMarginOf(sold)
    prodRows.push([sold.name, sold.costed_revenue > 0 && sold.units > 0 ? money(sold.cost / sold.units) : '—', '—', '—', soldMargin != null ? `${soldMargin}%` : '—', soldMargin != null && soldMargin < THIN ? 'thin' : ''])
  }
  prodRows.sort((a, b) => {
    const am = parseFloat(String(a[4])) || parseFloat(String(a[3])) || 999
    const bm = parseFloat(String(b[4])) || parseFloat(String(b[3])) || 999
    return am - bm // thinnest margins first (most actionable)
  })
  // Category roll-up: realised revenue + blended sold margin over the COSTED portion (unknown costs → '—').
  const byCat = new Map<string, { revenue: number; costedRevenue: number; cost: number }>()
  for (const [pid, sold] of detail) {
    const cat = cats.get(pid) ?? 'Uncategorised'
    const c = byCat.get(cat) ?? { revenue: 0, costedRevenue: 0, cost: 0 }
    c.revenue += sold.revenue; c.costedRevenue += sold.costed_revenue; c.cost += sold.cost; byCat.set(cat, c)
  }
  const catRows = Array.from(byCat.entries()).sort((a, b) => b[1].revenue - a[1].revenue).map(([cat, c]) => [
    cat, money(c.revenue),
    c.costedRevenue > 0 ? money(c.costedRevenue - c.cost) : '—',
    c.costedRevenue > 0 ? `${Math.round(((c.costedRevenue - c.cost) / c.costedRevenue) * 1000) / 10}%` : '—',
  ])
  return {
    sections: [
      { title: 'Margin by product (thinnest first)', columns: ['Product', 'Cost', 'Retail', 'Catalogue %', 'Sold %', 'Flag'], rows: prodRows.slice(0, 200), empty: 'No costed products or sales this period.' },
      { title: 'Realised margin by category', columns: ['Category', 'Revenue', 'Gross profit', 'Margin %'], rows: catRows, empty: 'No sales this period.' },
    ],
    note: `Catalogue margin = (price − resolved cost) ÷ price on current stock; sold margin = (revenue − line cost) ÷ revenue over lines WITH a recorded cost this period. Margins under ${THIN}% flagged "thin". Lines/products with no recorded cost show "—", never a fabricated 0-cost / 100% margin.`,
  }
}

// INV-AVT — Food cost variance: theoretical (recipe × sold) vs actual (depletion + waste). GROUNDING-TEETH: only
// compute where recipe + sales + depletion history coexist. Delegates to computeAvT; formats results into the
// standard ReportSection[] shape. Honest empty states throughout — no fabricated $/%.
async function rFoodCostVariance(sb: SupabaseClient, bid: string, outletId: string | null, range: { start: string; end: string; label: string }): Promise<{ sections: ReportSection[]; note: string | null }> {
  const avt = await computeAvT(sb, bid, outletId, range.start, range.end, range.label)
  const sections: ReportSection[] = []

  // Section 1: per-product summary
  const unlinkedNote = avt.recipes_unlinked > 0
    ? `${avt.recipes_unlinked} recipe${avt.recipes_unlinked !== 1 ? 's' : ''} exist but are not linked to POS products — link recipes to products to compute theoretical usage.`
    : 'No recipes are linked to POS products yet.'
  const prodRows: Array<Array<string | number>> = avt.product_results.map(r => {
    if (r.status === 'no_sales') return [r.product_name, 0, '—', '—', '—', '— (no sales in period)']
    if (r.status === 'no_linked_ingredients') return [r.product_name, r.units_sold, '—', '—', '—', '— (ingredients not linked to stock)']
    if (r.status === 'depletion_not_tracked') return [r.product_name, r.units_sold, r.theoretical_cost_dollars != null ? money(r.theoretical_cost_dollars) : '—', '— (depletion not tracked)', '—', '—']
    const gapStr = r.gap_dollars != null ? (r.gap_dollars < 0 ? '-' : '+') + money(Math.abs(r.gap_dollars)) + (r.gap_pct != null ? ` (${r.gap_pct > 0 ? '+' : ''}${r.gap_pct}%)` : '') : '—'
    const dirStr = r.gap_dollars == null ? '—' : r.gap_dollars < -0.01 ? 'OVER-USED' : r.gap_dollars > 0.01 ? 'under-used' : 'on-spec'
    return [r.product_name, r.units_sold, r.theoretical_cost_dollars != null ? money(r.theoretical_cost_dollars) : '—', r.actual_cost_dollars != null ? money(r.actual_cost_dollars) : '—', gapStr, r.food_cost_pct != null ? `${r.food_cost_pct}% food cost` : dirStr]
  })
  const totalRow: Array<string | number> | undefined = avt.total_gap_dollars != null
    ? ['Total', '', '', '', (avt.total_gap_dollars < 0 ? '-' : '+') + money(Math.abs(avt.total_gap_dollars)), avt.total_gap_dollars < -0.01 ? 'net over-used' : avt.total_gap_dollars > 0.01 ? 'net under-used' : 'on-spec']
    : undefined
  sections.push({
    title: 'Food cost variance by recipe (AvT)', columns: ['Product', 'Units sold', 'Theoretical cost', 'Actual cost', 'Gap $', 'Direction / Food cost %'],
    rows: prodRows, empty: unlinkedNote, total_row: totalRow,
  })

  // Section 2: per-ingredient breakdown for computed products
  for (const r of avt.product_results.filter(pr => pr.ingredients.length > 0 && pr.status !== 'no_sales' && pr.status !== 'no_linked_ingredients')) {
    const ingRows = r.ingredients.map(i => {
      const gapStr = i.gap_dollars != null ? (i.gap_dollars < 0 ? '-' : '+') + money(Math.abs(i.gap_dollars)) : '—'
      const dirStr = i.direction === 'over' ? 'OVER' : i.direction === 'under' ? 'under' : 'on-spec'
      return [i.ingredient_name, i.unit, i.theoretical_qty, i.actual_qty, i.gap_qty > 0 ? `+${i.gap_qty}` : String(i.gap_qty), gapStr, dirStr] as Array<string | number>
    })
    const thinBadge = r.thin_data && r.thin_reason ? ` ⚠ thin data` : ''
    sections.push({
      title: `${r.product_name} — ingredient variance${thinBadge}`,
      columns: ['Ingredient', 'Unit', 'Theoretical qty', 'Actual qty', 'Gap qty', 'Gap $', 'Direction'],
      rows: ingRows, empty: 'No linked ingredients.',
    })
  }

  // Section 3: data quality flags — always shown when any flag exists
  const flags: Array<Array<string | number>> = []
  if (avt.recipes_unlinked > 0) flags.push([`${avt.recipes_unlinked} recipe${avt.recipes_unlinked !== 1 ? 's' : ''}`, '—', 'Not linked to a POS product — link to enable AvT'])
  for (const r of avt.product_results) {
    if (r.thin_reason) flags.push([r.product_name, r.units_sold, r.thin_reason])
  }
  if (flags.length) {
    sections.push({ title: 'Data quality flags', columns: ['Item', 'Units sold', 'Flag'], rows: flags, empty: 'No data quality flags — all recipes have sufficient history.' })
  }

  return {
    sections,
    note: 'Theoretical = recipe spec × units sold (incl. wastage%). Actual = stock adjustments with reason recipe_depletion + waste log. Gap = theoretical − actual (+ = under-used, − = over-used). Food cost % = actual ingredient cost ÷ revenue. Only stock-linked ingredients tracked. Thin data shown honestly — AvT accuracy grows as depletion history builds. No numbers fabricated: all figures from real rows.',
  }
}

/** Main entry — generate one report's structured data for a period/outlet. */
export async function generateReport(sb: SupabaseClient, bid: string, type: ReportType, period: Period, outletId: string | null, dateStr?: string): Promise<ReportData> {
  const range = periodRange(period, dateStr)
  const title = REPORT_LIBRARY.find(r => r.type === type)?.title ?? type
  const [bizName, built, kpis] = await Promise.all([
    businessName(sb, bid),
    (async () => {
      switch (type) {
        case 'sold_vs_stock': return rSoldVsStock(sb, bid, outletId, range)
        case 'stock_value': return rStockValue(sb, bid, outletId)
        case 'shrinkage_waste': return rShrinkageWaste(sb, bid, outletId, range)
        case 'dead_stock': return rDeadStock(sb, bid, outletId)
        case 'reorder': return rReorder(sb, bid)
        case 'days_cover': return rDaysCover(sb, bid)
        case 'count_accuracy': return rCountAccuracy(sb, bid, range)
        case 'received_vs_ordered': return rReceivedVsOrdered(sb, bid, range)
        case 'expiring': return rExpiring(sb, bid)
        case 'movement_audit': return rMovementAudit(sb, bid, range)
        case 'transfers': return rTransfers(sb, bid, range)
        case 'top_sellers': return rTopSellers(sb, bid, range)
        case 'margin': return rMargin(sb, bid, outletId, range)
        case 'food_cost_variance': return rFoodCostVariance(sb, bid, outletId, range)
        default: return { sections: [], note: null }
      }
    })(),
    reportKpis(sb, bid, outletId, range).catch(() => null),
  ])
  return {
    type, title, period, period_label: range.label, business_name: bizName, outlet_id: outletId,
    generated_at: new Date().toISOString(), kpis, sections: built.sections, note: built.note,
  }
}
