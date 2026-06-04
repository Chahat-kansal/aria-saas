import { supabaseAdmin } from '@/lib/supabase-admin'
import { BaseAgent } from './base-agent'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'

interface ReorderEvent {
  product_id: string
  product_name: string
  supplier_name: string
  estimated_cost: number
  payment_week: number
}

interface WeekForecast {
  week_number: number
  forecast_week: string
  predicted_pos_revenue: number
  predicted_supplier_payments: number
  predicted_payroll: number
  predicted_rent_utilities: number
  predicted_other_fixed: number
  opening_cash_position: number
  closing_cash_position: number
  reorder_events: ReorderEvent[]
  reorder_total_cost: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  risk_reason: string
  actions: string[]
}

function addWeeks(d: Date, w: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + w * 7)
  return r
}

function weekStart(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export class InventoryFinancingAgent extends BaseAgent {
  type: AgentType = 'inventory_financing'

  async run(business_id: string): Promise<AgentRunResult> {
    const start = Date.now()
    const errors: Error[] = []
    const decisions: AgentDecisionInput[] = []

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name,industry')
        .eq('id', business_id)
        .maybeSingle()
      if (!biz) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      // STEP 1: Estimate current cash position
      const { currentCash, isEstimated } = await this.estimateCash(business_id)

      // STEP 2: Predict reorder events for next 14 weeks
      const reorderByWeek = await this.predictReorderEvents(business_id)

      // STEP 3: Predict weekly revenue
      const weeklyRevenue = await this.predictWeeklyRevenue(business_id)

      // STEP 4: Predict fixed outflows
      const outflows = await this.predictOutflows(business_id)

      // STEP 5: Build 14-week cash flow
      const weeks = this.buildCashFlow({
        currentCash,
        weeklyRevenue,
        reorderByWeek,
        outflows,
      })

      // STEP 6: Generate financing opportunities
      const opportunities = await this.generateOpportunities(business_id, weeks)

      // STEP 7: Christmas/seasonal alert
      const seasonalOpps = await this.checkSeasonalAlerts(business_id, weeks)
      opportunities.push(...seasonalOpps)

      // STEP 8: Upsert forecasts and opportunities
      await this.saveForecasts(business_id, weeks)
      if (opportunities.length > 0) {
        await this.saveOpportunities(business_id, opportunities)
      }

      // Save decisions for critical/high weeks
      const criticalWeeks = weeks.filter(w => w.risk_level === 'critical' || w.risk_level === 'high')
      if (criticalWeeks.length > 0) {
        const worstWeek = criticalWeeks[0]
        const aiReasoning = await this.claudeStructured<{ reasoning: string; owner_message: string }>({
          system: 'You are a cash flow advisor for Australian small businesses. In 1-2 sentences identify the key risk and the most actionable response the owner should take.',
          user: JSON.stringify({
            current_cash: Math.round(currentCash),
            is_estimated: isEstimated,
            worst_week: worstWeek.week_number,
            worst_week_date: worstWeek.forecast_week,
            closing_cash: Math.round(worstWeek.closing_cash_position),
            risk_reason: worstWeek.risk_reason,
            critical_weeks: criticalWeeks.length,
            opportunities: opportunities.length,
          }),
          maxTokens: 150,
          agent_key: 'inventory_financing',
          role: 'forecast',
          business_id,
        });
        decisions.push({
          business_id,
          agent_type: this.type,
          decision_data: {
            cash_source: isEstimated ? 'pos_estimate' : 'bank_feed',
            current_cash: currentCash,
            worst_week_number: worstWeek.week_number,
            worst_week_date: worstWeek.forecast_week,
            worst_closing_cash: worstWeek.closing_cash_position,
            critical_weeks_count: criticalWeeks.length,
            opportunities_generated: opportunities.length,
            owner_message: aiReasoning?.owner_message,
          },
          reasoning: aiReasoning?.reasoning || worstWeek.risk_reason || ('Cash drops to $' + Math.round(worstWeek.closing_cash_position) + ' in week ' + worstWeek.week_number),
          confidence_score: 0.72,
          projected_impact_cents: Math.round(Math.abs(Math.min(0, worstWeek.closing_cash_position)) * 100),
          expires_at: addWeeks(new Date(), 2).toISOString(),
        })
      }

      const saved = await this.saveDecisions(decisions)
      await this.logRun(business_id, { decisions: saved, errors, duration_ms: Date.now() - start })
      return { decisions: saved, errors, duration_ms: Date.now() - start }

    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      errors.push(err)
      return { decisions: [], errors, duration_ms: Date.now() - start }
    }
  }

  private async estimateCash(business_id: string): Promise<{ currentCash: number; isEstimated: boolean }> {
    // Try Basiq bank balance first
    if (process.env.BASIQ_API_KEY) {
      try {
        const { data: bankRow } = await supabaseAdmin
          .from('basiq_connections')
          .select('access_token,institution_id')
          .eq('business_id', business_id)
          .eq('status', 'active')
          .maybeSingle()
        if (bankRow) {
          const res = await fetch('https://au-api.basiq.io/users/' + business_id + '/accounts', {
            headers: { Authorization: 'Bearer ' + bankRow.access_token, Accept: 'application/json' },
          })
          if (res.ok) {
            const data = await res.json() as { data?: Array<{ balance: string; accountType: string }> }
            const accounts = data.data ?? []
            const totalBalance = accounts
              .filter(a => a.accountType === 'transaction' || a.accountType === 'savings')
              .reduce((sum, a) => sum + Number(a.balance ?? 0), 0)
            if (totalBalance > 0) return { currentCash: totalBalance, isEstimated: false }
          }
        }
      } catch { /* fall through to estimate */ }
    }

    // Estimate from recent POS revenue minus expenses
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const [salesRes, expenseRes] = await Promise.all([
      supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', cutoff.toISOString()),
      supabaseAdmin
        .from('business_expenses')
        .select('amount')
        .eq('business_id', business_id)
        .gte('created_at', cutoff.toISOString()),
    ])
    const revenue30d = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const expenses30d = (expenseRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const estimated = Math.max(0, revenue30d * 0.2 - expenses30d * 0.1)
    return { currentCash: estimated, isEstimated: true }
  }

  private async predictReorderEvents(business_id: string): Promise<Map<number, ReorderEvent[]>> {
    const byWeek = new Map<number, ReorderEvent[]>()

    const { data: products } = await supabaseAdmin
      .from('pos_products')
      .select('id,name,stock_quantity,cost_price,supplier_id,reorder_point,reorder_qty,case_quantity')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .limit(300)

    if (!products?.length) return byWeek

    const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))] as string[]
    const { data: suppliers } = supplierIds.length > 0 ? await supabaseAdmin
      .from('pos_suppliers')
      .select('id,name,lead_time_days')
      .in('id', supplierIds) : { data: [] }
    const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s]))

    // Sales velocity: last 30 days
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: recentSales } = await supabaseAdmin
      .from('pos_sales')
      .select('id')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', cutoff)
      .limit(2000)

    const soldMap = new Map<string, number>()
    if ((recentSales ?? []).length > 0) {
      const ids = (recentSales ?? []).map(s => s.id)
      const { data: items } = await supabaseAdmin
        .from('pos_sale_items')
        .select('product_id,quantity')
        .in('sale_id', ids)
        .in('product_id', products.map(p => p.id))
        .limit(10000)
      for (const item of items ?? []) {
        soldMap.set(item.product_id, (soldMap.get(item.product_id) ?? 0) + Number(item.quantity ?? 0))
      }
    }

    for (const p of products) {
      const avgDailyUnits = (soldMap.get(p.id) ?? 0) / 30
      if (avgDailyUnits < 0.05) continue

      const currentStock = Number(p.stock_quantity ?? 0)
      const reorderPoint = Number(p.reorder_point ?? (avgDailyUnits * 7))
      const daysUntilReorder = currentStock > reorderPoint
        ? Math.round((currentStock - reorderPoint) / Math.max(0.01, avgDailyUnits))
        : 0

      // Only include if reorder needed in next 14 weeks (98 days)
      if (daysUntilReorder > 98) continue

      const weekNum = Math.max(1, Math.ceil(daysUntilReorder / 7))
      const supplier = p.supplier_id ? supplierMap.get(p.supplier_id) : null
      const supplierName = supplier?.name ?? 'Unknown supplier'
      const leadDays = Number(supplier?.lead_time_days ?? 5)

      // Payment week: assume COD (payment week = reorder week)
      const paymentWeek = Math.min(14, weekNum + Math.floor(leadDays / 7))

      const orderQty = Number(p.reorder_qty ?? p.case_quantity ?? Math.ceil(avgDailyUnits * 14))
      const estimatedCost = orderQty * Number(p.cost_price ?? 0)
      if (estimatedCost <= 0) continue

      const event: ReorderEvent = {
        product_id: p.id,
        product_name: p.name ?? 'Unknown product',
        supplier_name: supplierName,
        estimated_cost: estimatedCost,
        payment_week: paymentWeek,
      }

      const wNum = Math.min(14, paymentWeek)
      const existing = byWeek.get(wNum) ?? []
      existing.push(event)
      byWeek.set(wNum, existing)
    }

    return byWeek
  }

  private async predictWeeklyRevenue(business_id: string): Promise<number[]> {
    // For each of next 14 weeks, get average revenue for same week-of-year over last 2 years
    const revenues: number[] = new Array(15).fill(0)

    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    const { data: historicalSales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', cutoff.toISOString())
      .limit(10000)

    if (!historicalSales?.length) {
      // No history — return zeros (will use fallback)
      return revenues
    }

    // Build week-of-year revenue map
    const weekRevMap = new Map<string, number[]>()
    for (const sale of historicalSales) {
      const d = new Date(sale.created_at)
      const ws = weekStart(d)
      const key = (ws.getMonth() * 10 + Math.floor(ws.getDate() / 7)).toString()
      const arr = weekRevMap.get(key) ?? []
      arr.push(Number(sale.total_amount ?? 0))
      weekRevMap.set(key, arr)
    }

    const now = weekStart(new Date())
    // Compute total weekly revenue (not per-sale) by aggregating
    const weeklyTotals = new Map<string, number[]>()
    for (const sale of historicalSales) {
      const d = new Date(sale.created_at)
      const ws = weekStart(d)
      const key = ws.toISOString().slice(0, 10)
      const arr = weeklyTotals.get(key) ?? []
      arr.push(Number(sale.total_amount ?? 0))
      weeklyTotals.set(key, arr)
    }
    // Aggregate to week totals
    const weekRevTotals = new Map<string, number>()
    for (const [k, vals] of weeklyTotals) {
      weekRevTotals.set(k, vals.reduce((s, v) => s + v, 0))
    }

    // For each future week, find matching week-of-year from prior years
    for (let wk = 1; wk <= 14; wk++) {
      const futureWeek = weekStart(addWeeks(now, wk))
      const futureMonth = futureWeek.getMonth()
      const futureWeekOfMonth = Math.floor(futureWeek.getDate() / 7)

      const matches: number[] = []
      for (const [k, total] of weekRevTotals) {
        const kd = new Date(k)
        if (kd.getMonth() === futureMonth && Math.floor(kd.getDate() / 7) === futureWeekOfMonth) {
          matches.push(total)
        }
      }

      if (matches.length > 0) {
        revenues[wk] = matches.reduce((s, v) => s + v, 0) / matches.length
      } else {
        // Fallback: overall weekly average
        const allTotals = [...weekRevTotals.values()]
        revenues[wk] = allTotals.length > 0
          ? allTotals.reduce((s, v) => s + v, 0) / allTotals.length
          : 0
      }
    }

    return revenues
  }

  private async predictOutflows(business_id: string): Promise<{
    weeklyPayroll: number
    weeklyRentUtil: number
    weeklyOther: number
  }> {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)

    // Payroll from timesheets
    const { data: timesheets } = await supabaseAdmin
      .from('pos_timesheets')
      .select('hours_worked,staff_id')
      .eq('business_id', business_id)
      .gte('date', cutoff.toISOString().slice(0, 10))
      .limit(2000)

    let totalPayroll = 0
    if ((timesheets ?? []).length > 0) {
      const staffIds = [...new Set((timesheets ?? []).map(t => t.staff_id).filter(Boolean))] as string[]
      const { data: staffRows } = await supabaseAdmin
        .from('staff_members')
        .select('id,pay_rate_cents')
        .in('id', staffIds)
      const rateMap = new Map((staffRows ?? []).map(s => [s.id, Number(s.pay_rate_cents ?? 0) / 100]))
      for (const t of timesheets ?? []) {
        totalPayroll += Number(t.hours_worked ?? 0) * (rateMap.get(t.staff_id) ?? 0)
      }
    }
    const weeklyPayroll = totalPayroll / 13 // 3 months ≈ 13 weeks

    // Expenses from business_expenses
    const { data: expenses } = await supabaseAdmin
      .from('business_expenses')
      .select('amount,label')
      .eq('business_id', business_id)
      .gte('created_at', cutoff.toISOString())
      .limit(1000)

    let rentUtil = 0
    let other = 0
    const rentKeywords = ['rent', 'utilities', 'electricity', 'gas', 'water', 'rates', 'insurance']
    for (const exp of expenses ?? []) {
      const lbl = String(exp.label ?? '').toLowerCase()
      const amt = Number(exp.amount ?? 0)
      if (rentKeywords.some(kw => lbl.includes(kw))) rentUtil += amt
      else other += amt
    }

    return {
      weeklyPayroll,
      weeklyRentUtil: rentUtil / 13,
      weeklyOther: other / 13,
    }
  }

  private buildCashFlow(params: {
    currentCash: number
    weeklyRevenue: number[]
    reorderByWeek: Map<number, ReorderEvent[]>
    outflows: { weeklyPayroll: number; weeklyRentUtil: number; weeklyOther: number }
  }): WeekForecast[] {
    const { currentCash, weeklyRevenue, reorderByWeek, outflows } = params
    const totalWeeklyOutflow = outflows.weeklyPayroll + outflows.weeklyRentUtil + outflows.weeklyOther
    const avgWeeklyExpenses = Math.max(500, totalWeeklyOutflow)

    const weeks: WeekForecast[] = []
    let openingCash = currentCash
    const now = weekStart(new Date())

    for (let wk = 1; wk <= 14; wk++) {
      const forecastDate = weekStart(addWeeks(now, wk))
      const reorders = reorderByWeek.get(wk) ?? []
      const reorderCost = reorders.reduce((s, r) => s + r.estimated_cost, 0)
      const revenue = weeklyRevenue[wk] ?? 0
      const closingCash = openingCash + revenue - reorderCost - outflows.weeklyPayroll - outflows.weeklyRentUtil - outflows.weeklyOther

      let risk_level: 'low' | 'medium' | 'high' | 'critical' = 'low'
      let risk_reason = ''
      const riskThreshold3x = avgWeeklyExpenses * 3
      const riskThreshold2x = avgWeeklyExpenses * 2

      if (closingCash < 0) {
        risk_level = 'critical'
        risk_reason = 'Cash position drops to $' + Math.round(closingCash) + ' in week ' + wk + ' — negative cash balance'
      } else if (closingCash < riskThreshold2x) {
        risk_level = 'high'
        risk_reason = 'Cash drops to $' + Math.round(closingCash) + ' — below 2 weeks of operating expenses'
      } else if (closingCash < riskThreshold3x) {
        risk_level = 'medium'
        risk_reason = 'Cash buffer narrows to $' + Math.round(closingCash) + ' — below 3 weeks of operating expenses'
      }

      if (reorderCost > 0 && risk_level !== 'low') {
        const topSupplier = reorders[0]?.supplier_name ?? 'supplier'
        risk_reason += '. Reorder for ' + topSupplier + ' ($' + Math.round(reorderCost) + ') is due this week.'
      }

      weeks.push({
        week_number: wk,
        forecast_week: isoDate(forecastDate),
        predicted_pos_revenue: Math.round(revenue * 100) / 100,
        predicted_supplier_payments: Math.round(reorderCost * 100) / 100,
        predicted_payroll: Math.round(outflows.weeklyPayroll * 100) / 100,
        predicted_rent_utilities: Math.round(outflows.weeklyRentUtil * 100) / 100,
        predicted_other_fixed: Math.round(outflows.weeklyOther * 100) / 100,
        opening_cash_position: Math.round(openingCash * 100) / 100,
        closing_cash_position: Math.round(closingCash * 100) / 100,
        reorder_events: reorders,
        reorder_total_cost: Math.round(reorderCost * 100) / 100,
        risk_level,
        risk_reason,
        actions: [],
      })

      openingCash = closingCash
    }

    return weeks
  }

  private async generateOpportunities(business_id: string, weeks: WeekForecast[]): Promise<Array<{
    opportunity_type: string
    description: string
    potential_benefit: number
    effort_level: string
    urgency: string
    trigger_week: string
  }>> {
    const opps: Array<{ opportunity_type: string; description: string; potential_benefit: number; effort_level: string; urgency: string; trigger_week: string }> = []

    const riskWeeks = weeks.filter(w => w.risk_level === 'critical' || w.risk_level === 'high')
    if (riskWeeks.length === 0) return opps

    for (const week of riskWeeks.slice(0, 3)) {
      const gap = Math.abs(Math.min(0, week.closing_cash_position))
      const urgency = week.week_number <= 2 ? 'urgent' : week.week_number <= 4 ? 'this_week' : 'this_month'

      // a) Payment timing shift — delay a supplier payment
      if (week.reorder_total_cost > 0 && week.reorder_events.length > 0) {
        const topReorder = week.reorder_events[0]
        opps.push({
          opportunity_type: 'payment_timing_shift',
          description: 'Delay ' + topReorder.supplier_name + ' reorder payment of $' + Math.round(topReorder.estimated_cost) + ' from week ' + week.week_number + ' to the following week — preserves cash during tight period.',
          potential_benefit: topReorder.estimated_cost,
          effort_level: 'phone_call',
          urgency,
          trigger_week: week.forecast_week,
        })
      }

      // b) Flash promo to bridge the gap
      const flashTarget = gap + 500
      opps.push({
        opportunity_type: 'flash_promo_revenue',
        description: 'Running a 15% flash promotion on your top-margin products this weekend could generate ~$' + Math.round(flashTarget) + ' in additional revenue to cover week ' + week.week_number + ' cash pressure.',
        potential_benefit: flashTarget,
        effort_level: 'one_tap',
        urgency,
        trigger_week: week.forecast_week,
      })

      // c) BNPL for stock
      if (week.reorder_total_cost > 200) {
        const bnplCost = Math.round(week.reorder_total_cost * 0.015)
        opps.push({
          opportunity_type: 'bnpl_stock',
          description: 'Finance the $' + Math.round(week.reorder_total_cost) + ' reorder via Zip Business or Prospa stock finance (~1.5%/month = $' + bnplCost + ' cost). Preserves cash flow while keeping shelves stocked.',
          potential_benefit: week.reorder_total_cost,
          effort_level: 'application',
          urgency,
          trigger_week: week.forecast_week,
        })
      }
    }

    // d) Supplier terms extension — check leverage from negotiation profiles
    try {
      const { data: leverageProfiles } = await supabaseAdmin
        .from('supplier_negotiation_profiles')
        .select('supplier_name,leverage_score,total_spend_12m')
        .eq('business_id', business_id)
        .gte('leverage_score', 60)
        .order('leverage_score', { ascending: false })
        .limit(1)

      if (leverageProfiles && leverageProfiles.length > 0) {
        const profile = leverageProfiles[0]
        opps.push({
          opportunity_type: 'supplier_terms_extension',
          description: 'Your leverage score with ' + profile.supplier_name + ' is ' + profile.leverage_score + '/100 based on $' + Math.round(Number(profile.total_spend_12m) / 1000) + 'k annual spend. Request Net30 payment terms — this can delay significant supplier payments beyond your cash pinch point.',
          potential_benefit: Number(profile.total_spend_12m) / 12,
          effort_level: 'phone_call',
          urgency: 'this_month',
          trigger_week: riskWeeks[0].forecast_week,
        })
      }
    } catch { /* negotiation profiles may not exist yet */ }

    // e) Invoice factoring — check for unpaid wholesale invoices
    try {
      const { data: invoices } = await supabaseAdmin
        .from('wholesale_orders')
        .select('total_amount')
        .eq('business_id', business_id)
        .eq('status', 'invoiced')
        .limit(20)

      if (invoices && invoices.length > 0) {
        const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
        if (totalInvoiced > 500) {
          opps.push({
            opportunity_type: 'invoice_factoring',
            description: 'You have $' + Math.round(totalInvoiced) + ' in outstanding wholesale invoices. Invoice finance providers like Earlytrade or Waddle advance 80-90% immediately for ~2-3% fee — useful for bridging a cash pinch.',
            potential_benefit: totalInvoiced * 0.85,
            effort_level: 'application',
            urgency: 'this_week',
            trigger_week: riskWeeks[0].forecast_week,
          })
        }
      }
    } catch { /* wholesale_orders may not exist */ }

    return opps
  }

  private async checkSeasonalAlerts(business_id: string, weeks: WeekForecast[]): Promise<Array<{
    opportunity_type: string
    description: string
    potential_benefit: number
    effort_level: string
    urgency: string
    trigger_week: string
  }>> {
    const opps: Array<{ opportunity_type: string; description: string; potential_benefit: number; effort_level: string; urgency: string; trigger_week: string }> = []

    const now = new Date()
    const month = now.getMonth() + 1 // 1-12

    // October-November: Christmas stock planning
    if (month === 10 || month === 11) {
      const weeksToChristmas = Math.round((new Date(now.getFullYear(), 11, 25).getTime() - now.getTime()) / (7 * 86400000))

      // Get last December revenue
      const lastDecStart = new Date(now.getFullYear() - 1, 11, 1).toISOString()
      const lastDecEnd = new Date(now.getFullYear() - 1, 11, 31).toISOString()
      const { data: decSales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', lastDecStart)
        .lte('created_at', lastDecEnd)
        .limit(5000)

      const decRevenue = (decSales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
      const avgWeeklyRevenue = weeks.length > 0
        ? weeks.reduce((s, w) => s + w.predicted_pos_revenue, 0) / weeks.length
        : 0
      const decWeeklyRevenue = decRevenue / 4
      const christmasLift = avgWeeklyRevenue > 0 ? Math.round((decWeeklyRevenue / avgWeeklyRevenue - 1) * 100) : 0
      const availableCash = weeks[0]?.opening_cash_position ?? 0

      opps.push({
        opportunity_type: 'flash_promo_revenue',
        description: 'Christmas is ' + weeksToChristmas + ' weeks away. Last December your weekly revenue was ~$' + Math.round(decWeeklyRevenue) + ' (' + (christmasLift > 0 ? '+' + christmasLift + '%' : 'similar') + ' vs average). Start supplier conversations now — you\'ll need additional stock by week 8. Current cash position: $' + Math.round(availableCash) + '.',
        potential_benefit: decWeeklyRevenue * 4,
        effort_level: 'phone_call',
        urgency: 'this_month',
        trigger_week: weeks[0]?.forecast_week ?? isoDate(addWeeks(new Date(), 1)),
      })
    }

    return opps
  }

  private async saveForecasts(business_id: string, weeks: WeekForecast[]): Promise<void> {
    const rows = weeks.map(w => ({
      business_id,
      forecast_week: w.forecast_week,
      week_number: w.week_number,
      predicted_pos_revenue: w.predicted_pos_revenue,
      predicted_online_revenue: 0,
      pending_invoice_payments: 0,
      expected_rebates: 0,
      predicted_supplier_payments: w.predicted_supplier_payments,
      predicted_payroll: w.predicted_payroll,
      predicted_rent_utilities: w.predicted_rent_utilities,
      predicted_other_fixed: w.predicted_other_fixed,
      opening_cash_position: w.opening_cash_position,
      closing_cash_position: w.closing_cash_position,
      reorder_events: w.reorder_events as unknown as Record<string, unknown>[],
      reorder_total_cost: w.reorder_total_cost,
      risk_level: w.risk_level,
      risk_reason: w.risk_reason,
      actions: w.actions as unknown as string[],
    }))

    await supabaseAdmin
      .from('cash_flow_forecasts')
      .upsert(rows, { onConflict: 'business_id,forecast_week,week_number', ignoreDuplicates: false })
  }

  private async saveOpportunities(business_id: string, opps: Array<{
    opportunity_type: string
    description: string
    potential_benefit: number
    effort_level: string
    urgency: string
    trigger_week: string
  }>): Promise<void> {
    // Only insert new open opportunities (avoid duplicates for same type+trigger_week)
    const { data: existing } = await supabaseAdmin
      .from('financing_opportunities')
      .select('opportunity_type,trigger_week')
      .eq('business_id', business_id)
      .eq('status', 'open')

    const existingKeys = new Set(
      (existing ?? []).map(e => e.opportunity_type + '|' + String(e.trigger_week).slice(0, 10))
    )

    const toInsert = opps.filter(o => !existingKeys.has(o.opportunity_type + '|' + o.trigger_week.slice(0, 10)))
    if (!toInsert.length) return

    await supabaseAdmin
      .from('financing_opportunities')
      .insert(toInsert.map(o => ({
        business_id,
        opportunity_type: o.opportunity_type,
        description: o.description,
        potential_benefit: o.potential_benefit,
        effort_level: o.effort_level,
        urgency: o.urgency,
        trigger_week: o.trigger_week,
        expires_at: isoDate(addWeeks(new Date(o.trigger_week), 2)),
        status: 'open',
      })))
  }
}
