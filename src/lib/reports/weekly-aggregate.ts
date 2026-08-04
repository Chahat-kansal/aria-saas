import { supabaseAdmin } from '@/lib/supabase-admin'
import { REPORTABLE_STATUSES } from '@/lib/pos/revenue'

// WBI-1 — weekly report AGGREGATION (write to pos_weekly_reports). Every figure comes from a real
// query against the canonical sources — revenue from pos_sales status='completed' (DOLLARS), labour
// from pos_timesheets (the WIRE-3 approach), top products from pos_sale_items, customer movement from
// pos_customers. Nothing is invented. Aggregation only — no AI, no rendering, no email (WBI-2/WBI-3).

export interface WeeklyAggregate {
  week_start: string // YYYY-MM-DD (Monday)
  week_end: string   // YYYY-MM-DD (Sunday)
  revenue: number
  transactions: number
  avg_ticket: number
  prior_week_revenue: number
  revenue_change_pct: number | null
  labour_cost: number
  labour_pct: number | null
  top_products: Array<{ name: string; units: number; revenue: number }>
  new_customers: number
  active_customers: number
  generated_at: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

// weekStart is the Monday 00:00 (as a UTC instant). The week spans [weekStart, weekStart+7d).
export async function aggregateWeeklyReport(businessId: string, weekStart: Date): Promise<WeeklyAggregate> {
  const weekStartUtc = weekStart.toISOString()
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
  const weekEndUtc = weekEnd.toISOString()
  const priorStartUtc = new Date(weekStart.getTime() - 7 * 86400000).toISOString()

  const [salesRes, priorRes, tsRes, newCustRes] = await Promise.all([
    // Revenue = pos_sales WHERE status='completed' (DOLLARS)
    supabaseAdmin.from('pos_sales')
      .select('id, total_amount, customer_id')
      .eq('business_id', businessId).in('status', REPORTABLE_STATUSES)
      .gte('created_at', weekStartUtc).lt('created_at', weekEndUtc),
    // Prior week completed revenue (for the change %)
    supabaseAdmin.from('pos_sales')
      .select('total_amount')
      .eq('business_id', businessId).in('status', REPORTABLE_STATUSES)
      .gte('created_at', priorStartUtc).lt('created_at', weekStartUtc),
    // WIRE-3 labour: pos_timesheets in the week
    supabaseAdmin.from('pos_timesheets')
      .select('hours_worked, total_pay_cents, pay_rate_cents')
      .eq('business_id', businessId)
      .gte('clock_in', weekStartUtc).lt('clock_in', weekEndUtc).limit(5000),
    // Customer movement: new pos_customers created in the week
    supabaseAdmin.from('pos_customers')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).is('deleted_at', null)
      .gte('created_at', weekStartUtc).lt('created_at', weekEndUtc),
  ])

  const sales = (salesRes.data ?? []) as Array<{ id: string; total_amount: number | null; customer_id: string | null }>
  const revenue = sales.reduce((s, x) => s + (Number(x.total_amount) || 0), 0)
  const transactions = sales.length
  const avg_ticket = transactions > 0 ? revenue / transactions : 0
  const active_customers = new Set(sales.map(s => s.customer_id).filter((c): c is string => !!c)).size

  const priorRevenue = (priorRes.data ?? []).reduce((s, x) => s + (Number((x as { total_amount: number | null }).total_amount) || 0), 0)
  const revenue_change_pct = priorRevenue > 0 ? r2(((revenue - priorRevenue) / priorRevenue) * 100) : null

  // WIRE-3: labour cost from total_pay_cents, falling back to pay_rate_cents * hours_worked
  const ts = (tsRes.data ?? []) as Array<{ hours_worked: number | null; total_pay_cents: number | null; pay_rate_cents: number | null }>
  const labourCents = ts.reduce((s, t) => s + Number(t.total_pay_cents ?? (Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0))), 0)
  const labour_cost = Math.round(labourCents) / 100
  const labour_pct = revenue > 0 ? r2((labour_cost / revenue) * 100) : null

  // Top products from this week's completed sales (pos_sale_items has no business_id → join via sale_id)
  const saleIds = sales.map(s => s.id)
  const productMap = new Map<string, { units: number; revenue: number }>()
  if (saleIds.length > 0) {
    // chunk the IN list to stay well under URL/row limits
    for (let i = 0; i < saleIds.length; i += 200) {
      const chunk = saleIds.slice(i, i + 200)
      const { data: items } = await supabaseAdmin.from('pos_sale_items')
        .select('product_name, quantity, line_total').in('sale_id', chunk)
      for (const it of (items ?? []) as Array<{ product_name: string | null; quantity: number | null; line_total: number | null }>) {
        const name = it.product_name ?? 'Unknown'
        const cur = productMap.get(name) ?? { units: 0, revenue: 0 }
        cur.units += Number(it.quantity) || 0
        cur.revenue += Number(it.line_total) || 0
        productMap.set(name, cur)
      }
    }
  }
  const top_products = [...productMap.entries()]
    .map(([name, v]) => ({ name, units: v.units, revenue: r2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const dateStr = (d: Date) => d.toISOString().slice(0, 10)
  return {
    week_start: dateStr(weekStart),
    week_end: dateStr(new Date(weekStart.getTime() + 6 * 86400000)),
    revenue: r2(revenue),
    transactions,
    avg_ticket: r2(avg_ticket),
    prior_week_revenue: r2(priorRevenue),
    revenue_change_pct,
    labour_cost,
    labour_pct,
    top_products,
    new_customers: newCustRes.count ?? 0,
    active_customers,
    generated_at: new Date().toISOString(),
  }
}
