import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStockValue } from '@/lib/inventory/stock-value'
import { computeParReadonly } from '@/lib/inventory/par-levels'

// INV-REPORTS — the inventory reporting spine. Deterministic, GROUNDED generators (NO LLM for any number —
// pure computed data from the live tables). Each report returns structured sections for a period/outlet, and
// handles no-data honestly (a café with no waste shows "No waste this period", never a fabricated row).
// Canonical stock = pos_outlet_inventory.items_on_hand. Dollars everywhere except pos_waste_log.cost_cents (/100).

export type ReportType =
  | 'sold_vs_stock' | 'stock_value' | 'shrinkage_waste' | 'dead_stock' | 'reorder'
  | 'days_cover' | 'count_accuracy' | 'received_vs_ordered' | 'expiring' | 'movement_audit'
export type Period = 'daily' | 'weekly'

export const REPORT_LIBRARY: Array<{ type: ReportType; title: string; blurb: string }> = [
  { type: 'sold_vs_stock', title: 'Sold vs in-stock', blurb: 'Units sold this period against current on-hand + variances' },
  { type: 'stock_value', title: 'Stock value', blurb: 'Inventory at cost and retail, margin and completeness' },
  { type: 'shrinkage_waste', title: 'Shrinkage & waste', blurb: 'Waste $ and negative adjustments by product and staff' },
  { type: 'dead_stock', title: 'Dead stock', blurb: 'Slow/zero movers and the value tied up in them' },
  { type: 'reorder', title: 'Low stock & reorder', blurb: 'Below reorder point with days-of-cover + suggested qty' },
  { type: 'days_cover', title: 'Days of cover', blurb: 'On-hand ÷ velocity, fastest-to-run-out first' },
  { type: 'count_accuracy', title: 'Count accuracy', blurb: 'Stocktake accuracy by staff member' },
  { type: 'received_vs_ordered', title: 'Received vs ordered', blurb: 'Purchase orders received against ordered' },
  { type: 'expiring', title: 'Expiring stock', blurb: 'Items nearing expiry → markdown candidates' },
  { type: 'movement_audit', title: 'Stock movement audit', blurb: 'The adjustment + waste ledger for the period' },
]

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
