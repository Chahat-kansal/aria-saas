export interface SaleRow {
  id: string
  sale_number: string
  total_amount: number
  subtotal: number
  tax_amount: number
  discount_amount: number
  payment_method: string | null
  status: string
  created_at: string
  pos_user_id?: string | null
  served_by?: string | null
}

export interface SaleItemRow {
  sale_id: string
  product_id: string | null
  product_name: string
  quantity: number
  line_total: number
}

export interface DailyTotals {
  count: number
  gross_revenue: number
  net_revenue: number
  tax_collected: number
  discounts_given: number
  avg_ticket: number
}

export function computeDailyTotals(sales: SaleRow[]): DailyTotals {
  const completed = sales.filter(s => s.status === 'completed')
  const gross = completed.reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const net = completed.reduce((s, r) => s + (Number(r.subtotal) || 0) - (Number(r.discount_amount) || 0), 0)
  const tax = completed.reduce((s, r) => s + (Number(r.tax_amount) || 0), 0)
  const disc = completed.reduce((s, r) => s + (Number(r.discount_amount) || 0), 0)
  return {
    count: completed.length,
    gross_revenue: +gross.toFixed(2),
    net_revenue: +net.toFixed(2),
    tax_collected: +tax.toFixed(2),
    discounts_given: +disc.toFixed(2),
    avg_ticket: completed.length > 0 ? +(gross / completed.length).toFixed(2) : 0,
  }
}

export function paymentBreakdown(sales: SaleRow[]): Record<string, { count: number; total: number }> {
  const out: Record<string, { count: number; total: number }> = {}
  for (const s of sales) {
    if (s.status !== 'completed') continue
    const k = s.payment_method ?? 'unknown'
    if (!out[k]) out[k] = { count: 0, total: 0 }
    out[k].count++
    out[k].total += Number(s.total_amount) || 0
  }
  for (const k of Object.keys(out)) out[k].total = +out[k].total.toFixed(2)
  return out
}

export function hourlyHistogram(sales: SaleRow[]): Array<{ hour: number; count: number; revenue: number }> {
  const buckets: Array<{ hour: number; count: number; revenue: number }> = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }))
  for (const s of sales) {
    if (s.status !== 'completed') continue
    const h = new Date(s.created_at).getHours()
    buckets[h].count++
    buckets[h].revenue += Number(s.total_amount) || 0
  }
  return buckets.map(b => ({ ...b, revenue: +b.revenue.toFixed(2) }))
}

export function topProducts(items: SaleItemRow[], limit = 10): Array<{ product_id: string | null; product_name: string; units: number; revenue: number }> {
  const map = new Map<string, { product_id: string | null; product_name: string; units: number; revenue: number }>()
  for (const it of items) {
    const k = it.product_id ?? `name:${it.product_name}`
    const cur = map.get(k) ?? { product_id: it.product_id, product_name: it.product_name, units: 0, revenue: 0 }
    cur.units += Number(it.quantity) || 0
    cur.revenue += Number(it.line_total) || 0
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit).map(r => ({ ...r, revenue: +r.revenue.toFixed(2) }))
}

export function compareToBaseline(today: DailyTotals, baseline: DailyTotals): { revenue_delta_pct: number; ticket_delta_pct: number; count_delta_pct: number } {
  function pct(a: number, b: number) { return b > 0 ? +(((a - b) / b) * 100).toFixed(1) : 0 }
  return {
    revenue_delta_pct: pct(today.gross_revenue, baseline.gross_revenue),
    ticket_delta_pct: pct(today.avg_ticket, baseline.avg_ticket),
    count_delta_pct: pct(today.count, baseline.count),
  }
}
