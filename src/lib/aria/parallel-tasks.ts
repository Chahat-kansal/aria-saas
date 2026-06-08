import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ParallelTask } from './parallel-orchestrator'

function fmt(n: number | null | undefined) {
  return '$' + (Number(n) || 0).toFixed(2)
}

export function buildBriefingTasks(businessId: string, _industry: string): ParallelTask[] {
  return [
    {
      key: 'sales_summary',
      label: 'Sales summary',
      priority: 'high',
      fn: async () => {
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        const week7 = new Date(Date.now() - 7 * 86400000).toISOString()
        const [todayRes, yestRes, week7Res] = await Promise.all([
          supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', today),
          supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', yesterday).lt('created_at', today),
          supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', week7),
        ])
        const todayRev = (todayRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const yestRev = (yestRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const week7Rev = (week7Res.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const week7Count = week7Res.data?.length ?? 0
        const todayCount = todayRes.data?.length ?? 0
        // GROUNDING: A quiet today must be judged against the 7-day trend, not reported as a closure
        const todayNote = todayRev === 0 && week7Rev > 0
          ? 'Today: $0.00 so far (' + todayCount + ' transactions — in-progress day, 7-day trend is healthy)'
          : 'Today: ' + fmt(todayRev) + ' (' + todayCount + ' transactions)'
        const delta = yestRev > 0 ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) + '% vs yesterday' : 'yesterday data not available'
        return todayNote + '. Yesterday: ' + fmt(yestRev) + '. ' + delta + '. 7-day total: ' + fmt(week7Rev) + ' (' + week7Count + ' transactions).'
      },
    },
    {
      key: 'top_products',
      label: 'Top products',
      priority: 'high',
      fn: async () => {
        const since = new Date(Date.now() - 7 * 86400000).toISOString()
        const { data } = await supabaseAdmin.from('pos_sale_items')
          .select('product_name, quantity, unit_price')
          .eq('business_id', businessId)
          .gte('created_at', since)
        if (!data?.length) return 'No product sales data in the last 7 days.'
        const totals: Record<string, number> = {}
        for (const item of data) {
          const name = String(item.product_name ?? 'Unknown')
          totals[name] = (totals[name] || 0) + Number(item.quantity || 1) * Number(item.unit_price || 0)
        }
        const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3)
        return 'Top 7-day products: ' + top.map(([n, v]) => n + ' (' + fmt(v) + ')').join(', ') + '.'
      },
    },
    {
      key: 'low_stock',
      label: 'Low stock',
      priority: 'high',
      fn: async () => {
        const { data } = await supabaseAdmin.from('pos_products')
          .select('name, stock_quantity, reorder_point')
          .eq('business_id', businessId)
          .eq('is_active', true)
          .not('stock_quantity', 'is', null)
          .not('reorder_point', 'is', null)
        if (!data?.length) return 'Stock data unavailable.'
        const low = data.filter(p => Number(p.stock_quantity) <= Number(p.reorder_point))
        if (!low.length) return 'All products are adequately stocked.'
        return low.length + ' items at or below reorder point: ' + low.slice(0, 4).map(p => p.name + ' (' + p.stock_quantity + ' left)').join(', ') + (low.length > 4 ? ' + ' + (low.length - 4) + ' more' : '') + '.'
      },
    },
    {
      key: 'staff_costs',
      label: 'Staff costs',
      priority: 'medium',
      fn: async () => {
        const weekStart = new Date(Date.now() - 7 * 86400000).toISOString()
        const [staffRes, salesRes] = await Promise.all([
          supabaseAdmin.from('pos_timesheets')
            .select('hours_worked, staff_members(hourly_rate)')
            .eq('business_id', businessId)
            .gte('clock_in', weekStart),
          supabaseAdmin.from('pos_sales')
            .select('total_amount')
            .eq('business_id', businessId)
            .neq('status', 'voided')
            .gte('created_at', weekStart),
        ])
        const timesheetRows = staffRes.data ?? []
        const labourCost = timesheetRows.reduce((s: number, r: Record<string, unknown>) => {
          const members = r.staff_members as Array<{ hourly_rate?: number }> | null
          const rate = Array.isArray(members) && members[0]?.hourly_rate ? Number(members[0].hourly_rate) : 0
          return s + Number(r.hours_worked || 0) * rate
        }, 0)
        const revenue = (salesRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        // GROUNDING: empty timesheets = "not tracked", NOT evidence of impossible/broken cost
        if (timesheetRows.length === 0) {
          return 'Labour costs: not tracked (timesheet system unpopulated — no clock-in data this week). Revenue: ' + fmt(revenue) + '. Labour ratio cannot be calculated.'
        }
        const ratio = revenue > 0 ? ((labourCost / revenue) * 100).toFixed(1) : 'N/A'
        return '7-day labour cost: ' + fmt(labourCost) + '. Revenue: ' + fmt(revenue) + '. Labour ratio: ' + ratio + '%. Target: <35%.'
      },
    },
    {
      key: 'customer_signals',
      label: 'Customer signals',
      priority: 'low',
      fn: async () => {
        const since = new Date(Date.now() - 30 * 86400000).toISOString()
        const { data } = await supabaseAdmin.from('pos_customers')
          .select('id, last_visit_at, loyalty_points')
          .eq('business_id', businessId)
          .gte('created_at', since)
        // GROUNDING: sparse/empty data = "limited data", never "retention collapsed"
        if (!data?.length) return 'Customer data: not available for the last 30 days (table unpopulated or no recent customers tracked).'
        if (data.length < 5) return 'Customer data: limited (' + data.length + ' records in last 30 days — insufficient for retention analysis).'
        const active = data.filter(c => c.last_visit_at && new Date(c.last_visit_at) > new Date(Date.now() - 14 * 86400000)).length
        const retentionPct = ((active / data.length) * 100).toFixed(0)
        return data.length + ' customers in last 30 days. ' + active + ' visited in last 14 days (' + retentionPct + '% retention rate).'
      },
    },
  ]
}
