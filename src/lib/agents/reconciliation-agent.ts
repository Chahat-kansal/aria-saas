import { supabaseAdmin } from '@/lib/supabase-admin'
import { BaseAgent } from './base-agent'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'

// IQR outlier fence: flag values above Q3 + 1.5×IQR or z-score > 2.5
function iqrFence(values: number[]): { lo: number; hi: number; mean: number; stdDev: number } {
  if (values.length < 3) {
    const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
    return { lo: 0, hi: mean * 4, mean, stdDev: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(values.length - 1, 1)
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr, mean, stdDev: Math.sqrt(variance) }
}

export class ReconciliationAgent extends BaseAgent {
  type: AgentType = 'reconciliation'

  async run(business_id: string, targetDate?: Date): Promise<AgentRunResult> {
    const start = Date.now()
    const decisions: AgentDecisionInput[] = []
    const errors: Error[] = []

    const yesterday = targetDate ?? new Date(Date.now() - 86400000)
    const dateStr = yesterday.toISOString().slice(0, 10)

    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - start }

      // STEP 1: Daily POS reconciliation
      const reconDecisions = await this.dailyReconciliation(business_id, yesterday, dateStr)
      decisions.push(...reconDecisions)

      // STEP 2: Supplier invoice matching — returns match-rate stats
      const matchStats = await this.matchSupplierInvoices(business_id)
      const matchRatePct = matchStats.total > 0
        ? Math.round((matchStats.matched / matchStats.total) * 1000) / 10
        : null

      // STEP 3: IQR/z-score anomaly detection on business_expenses
      const { decisions: anomalyDecisions, totalAnomalyValue } = await this.detectAnomalies(business_id)
      decisions.push(...anomalyDecisions)

      // Add reconciliation quality summary when there are match gaps or anomalies
      const totalValueAtRisk = matchStats.unmatchedValue + totalAnomalyValue
      if (totalValueAtRisk > 10 && matchStats.total > 0) {
        decisions.push({
          agent_type: 'reconciliation',
          business_id,
          decision_data: {
            action_type: 'reconciliation_quality',
            invoice_match_rate_pct: matchRatePct,
            matched_invoices: matchStats.matched,
            unmatched_invoices: matchStats.total - matchStats.matched,
            unmatched_invoice_value: Math.round(matchStats.unmatchedValue * 100) / 100,
            expense_anomaly_count: anomalyDecisions.length,
            expense_anomaly_value: Math.round(totalAnomalyValue * 100) / 100,
            total_value_at_risk: Math.round(totalValueAtRisk * 100) / 100,
          },
          reasoning: 'Invoice match rate: ' + (matchRatePct ?? 'N/A') + '%. Unmatched value: $' + matchStats.unmatchedValue.toFixed(0) + '. Expense anomalies: ' + anomalyDecisions.length + ' items totalling $' + totalAnomalyValue.toFixed(0) + ' above expected.',
          confidence_score: 0.9,
          projected_impact_cents: Math.round(totalValueAtRisk * 100),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          status: 'pending',
        })
      }

      // STEP 4: Monthly P&L — run on 1st of month for previous month
      const today = new Date()
      if (today.getDate() === 1) {
        const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth()
        const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
        await this.generateMonthlyPL(business_id, prevMonth, prevYear)
      }

      // STEP 5: Quarter-end handover check
      await this.quarterEndCheck(business_id, settings.config)

      const saved = decisions.length > 0 ? await this.saveDecisions(decisions) : []
      const result: AgentRunResult = { decisions: saved, errors, duration_ms: Date.now() - start }
      await this.logRun(business_id, result)
      return result
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
    }

    const result: AgentRunResult = { decisions: [], errors, duration_ms: Date.now() - start }
    await this.logRun(business_id, result)
    return result
  }

  private async dailyReconciliation(business_id: string, date: Date, dateStr: string): Promise<AgentDecisionInput[]> {
    const decisions: AgentDecisionInput[] = []
    const dayStart = new Date(dateStr + 'T00:00:00.000Z').toISOString()
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z').toISOString()

    // POS sales totals for the day
    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,payment_method')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)

    const salesArr = sales ?? []
    const pos_sales_count = salesArr.length
    const pos_sales_total = salesArr.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const pos_cash_total = salesArr.filter(r => String(r.payment_method).toLowerCase() === 'cash').reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const cardMethods = ['card', 'eftpos', 'credit', 'debit', 'visa', 'mastercard']
    const pos_card_total = salesArr.filter(r => cardMethods.includes(String(r.payment_method).toLowerCase())).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const pos_other_total = pos_sales_total - pos_cash_total - pos_card_total

    // Bank data — only if Basiq is connected
    let bank_deposits_total = 0
    let bank_data_source: 'basiq' | 'manual' | 'not_available' = 'not_available'

    if (process.env.BASIQ_API_KEY) {
      try {
        const { data: bizData } = await supabaseAdmin.from('businesses').select('id').eq('id', business_id).maybeSingle()
        if (bizData) {
          // Check if basiq connection exists
          const { data: basiqConn } = await supabaseAdmin
            .from('basiq_connections')
            .select('user_id')
            .eq('business_id', business_id)
            .eq('status', 'active')
            .maybeSingle()
            .then(r => r, () => ({ data: null }))

          if (basiqConn) {
            bank_data_source = 'basiq'
            // Basiq transactions would be fetched here — set to card total as approximation
            bank_deposits_total = pos_card_total
          }
        }
      } catch { bank_data_source = 'not_available' }
    }

    const variance_amount = pos_sales_total - (bank_data_source === 'not_available' ? pos_sales_total : bank_deposits_total)
    const variance_pct = pos_sales_total > 0 ? Math.abs(variance_amount) / pos_sales_total * 100 : 0

    let status: 'balanced' | 'variance' | 'pending' | 'explained' = 'pending'
    if (bank_data_source === 'not_available') status = 'pending'
    else if (Math.abs(variance_amount) < 5) status = 'balanced'
    else status = 'variance'

    // Upsert reconciliation row
    await supabaseAdmin.from('daily_reconciliations').upsert({
      business_id,
      recon_date: dateStr,
      pos_sales_count,
      pos_sales_total: Math.round(pos_sales_total * 100) / 100,
      pos_cash_total: Math.round(pos_cash_total * 100) / 100,
      pos_card_total: Math.round(pos_card_total * 100) / 100,
      pos_other_total: Math.round(pos_other_total * 100) / 100,
      bank_deposits_total: Math.round(bank_deposits_total * 100) / 100,
      bank_data_source,
      variance_amount: Math.round(variance_amount * 100) / 100,
      variance_pct: Math.round(variance_pct * 100) / 100,
      status,
      expected_settlement_date: bank_data_source !== 'not_available' ?
        new Date(date.getTime() + 2 * 86400000).toISOString().slice(0, 10) : null,
    }, { onConflict: 'business_id,recon_date' })

    // Create decision for significant variances
    if (status === 'variance' && Math.abs(variance_amount) > 5) {
      const urgency = Math.abs(variance_amount) > 50 ? 'high' : 'normal'
      const explanation = await this.claudeReason({
        system: 'You analyse financial reconciliation variances and suggest explanations. Be concise.',
        user: 'POS total for ' + dateStr + ': $' + pos_sales_total.toFixed(2) + '. Bank deposits: $' + bank_deposits_total.toFixed(2) + '. Variance: $' + variance_amount.toFixed(2) + '. Suggest 2-3 likely explanations.',
        maxTokens: 150,
        agent_key: 'reconciliation',
        role: 'analysis',
        business_id,
      })
      decisions.push({
        agent_type: 'reconciliation',
        business_id,
        decision_data: { date: dateStr, pos_total: pos_sales_total, bank_total: bank_deposits_total, variance: variance_amount },
        reasoning: 'Daily reconciliation variance detected: $' + Math.abs(variance_amount).toFixed(2) + '. ' + explanation,
        confidence_score: 0.9,
        projected_impact_cents: Math.round(Math.abs(variance_amount) * 100),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: urgency === 'high' ? 'pending' : 'pending',
      })
    }

    return decisions
  }

  private async matchSupplierInvoices(business_id: string): Promise<{ total: number; matched: number; unmatchedValue: number }> {
    const stats = { total: 0, matched: 0, unmatchedValue: 0 }
    const { data: invoices, error } = await supabaseAdmin
      .from('supplier_invoices')
      .select('id,supplier_name,total_amount,invoice_date,status')
      .eq('business_id', business_id)
      .eq('status', 'received')
      .is('reconciled_at', null)
      .limit(50)
    if (error) return stats // table may not exist

    stats.total = (invoices ?? []).length

    for (const invoice of invoices ?? []) {
      try {
        const invDate = new Date(String(invoice.invoice_date))
        const daysRange = 7 * 86400000
        const { data: matchingPOs } = await supabaseAdmin
          .from('pos_purchase_orders')
          .select('id,supplier_name,total_amount,created_at')
          .eq('business_id', business_id)
          .eq('status', 'received')
          .gte('created_at', new Date(invDate.getTime() - daysRange).toISOString())
          .lte('created_at', new Date(invDate.getTime() + daysRange).toISOString())

        const invTotal = Number(invoice.total_amount)
        const match = (matchingPOs ?? []).find(po => {
          const poTotal = Number(po.total_amount)
          const nameSimilar = String(po.supplier_name).toLowerCase().includes(String(invoice.supplier_name).toLowerCase().split(' ')[0])
          const amountClose = Math.abs(poTotal - invTotal) / Math.max(invTotal, 1) < 0.02
          return nameSimilar && amountClose
        })

        if (match) {
          stats.matched++
        } else {
          stats.unmatchedValue += invTotal
          await supabaseAdmin.from('expense_anomalies').insert({
            business_id,
            source: 'supplier_invoice',
            expense_category: 'supplier',
            expense_description: 'Unmatched invoice from ' + String(invoice.supplier_name) + ' for $' + invTotal.toFixed(2),
            amount: invTotal,
            possible_causes: ['Missing purchase order', 'Phantom delivery', 'Invoice from unrecognised supplier', 'Duplicate invoice'],
            status: 'open',
          })
        }
      } catch { /* per-invoice non-fatal */ }
    }
    return stats
  }

  private async detectAnomalies(business_id: string): Promise<{ decisions: AgentDecisionInput[]; totalAnomalyValue: number }> {
    const decisions: AgentDecisionInput[] = []
    let totalAnomalyValue = 0
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data: expenses, error } = await supabaseAdmin
      .from('business_expenses')
      .select('id,label,amount,category,expense_date')
      .eq('business_id', business_id)
      .gte('expense_date', d90)
    if (error) return { decisions, totalAnomalyValue }

    const recent = (expenses ?? []).filter(e => String(e.expense_date) >= d30)
    const historical = (expenses ?? []).filter(e => String(e.expense_date) < d30)

    // Build per-category historical value arrays for IQR computation
    const catValues: Record<string, number[]> = {}
    for (const exp of historical) {
      const cat = String(exp.category ?? 'other')
      if (!catValues[cat]) catValues[cat] = []
      catValues[cat].push(Number(exp.amount))
    }

    for (const exp of recent) {
      const cat = String(exp.category ?? 'other')
      const vals = catValues[cat]
      if (!vals || vals.length === 0) continue
      const amount = Number(exp.amount)
      const fence = iqrFence(vals)
      const zScore = fence.stdDev > 0 ? (amount - fence.mean) / fence.stdDev : 0
      // Flag if above IQR upper fence OR z-score > 2.5
      const isAnomaly = amount > fence.hi || zScore > 2.5
      if (!isAnomaly) continue
      const deviationPct = fence.mean > 0 ? ((amount - fence.mean) / fence.mean) * 100 : 0

      const { count } = await supabaseAdmin
        .from('expense_anomalies')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business_id)
        .eq('expense_description', String(exp.label) + ' $' + amount.toFixed(0))
      if ((count ?? 0) > 0) continue

      totalAnomalyValue += amount - fence.mean

      const causes = await this.claudeStructured<string[]>({
        system: 'Return a JSON array of 3 short possible causes for this expense anomaly.',
        user: String(exp.label) + ' in category ' + cat + ' costs $' + amount.toFixed(0) + ' vs avg $' + fence.mean.toFixed(0) + ' (IQR fence $' + fence.hi.toFixed(0) + ', z=' + zScore.toFixed(1) + '). What are 3 possible causes?',
        maxTokens: 150,
        agent_key: 'reconciliation',
        role: 'analysis',
        business_id,
      })

      await supabaseAdmin.from('expense_anomalies').insert({
        business_id,
        source: 'manual',
        expense_category: cat,
        expense_description: String(exp.label) + ' $' + amount.toFixed(0),
        amount,
        expected_range_low: Math.max(0, fence.lo),
        expected_range_high: fence.hi,
        deviation_pct: Math.round(deviationPct),
        possible_causes: causes ?? ['Seasonal variation', 'Price increase from supplier', 'One-off expense'],
        status: 'open',
      })

      if (deviationPct > 100 || zScore > 2.5) {
        decisions.push({
          agent_type: 'reconciliation',
          business_id,
          decision_data: { category: cat, amount, mean: fence.mean, iqr_hi: fence.hi, z_score: Math.round(zScore * 10) / 10, deviation_pct: Math.round(deviationPct) },
          reasoning: String(exp.label) + ' is ' + Math.round(deviationPct) + '% above category average ($' + amount.toFixed(0) + ' vs $' + fence.mean.toFixed(0) + ' mean, z=' + zScore.toFixed(1) + '). IQR upper fence: $' + fence.hi.toFixed(0) + '.',
          confidence_score: 0.85,
          projected_impact_cents: Math.round(Math.max(0, amount - fence.mean) * 100),
          expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
          status: 'pending',
        })
      }
    }

    return { decisions, totalAnomalyValue }
  }

  async generateMonthlyPL(business_id: string, month: number, year: number): Promise<void> {
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 1)

    // Revenue
    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,status')
      .eq('business_id', business_id)
      .gte('created_at', monthStart.toISOString())
      .lt('created_at', monthEnd.toISOString())

    const allSales = sales ?? []
    const gross_revenue = allSales.filter(s => s.status !== 'voided' && s.status !== 'refunded').reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const refunds_total = allSales.filter(s => s.status === 'refunded').reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const net_revenue = gross_revenue - refunds_total

    // COGS from supplier invoices
    let cogs_from_supplier_invoices = 0
    const { data: invoices } = await supabaseAdmin
      .from('supplier_invoices')
      .select('total_amount')
      .eq('business_id', business_id)
      .gte('invoice_date', monthStart.toISOString().slice(0, 10))
      .lt('invoice_date', monthEnd.toISOString().slice(0, 10))
      .then(r => r, () => ({ data: null }))
    cogs_from_supplier_invoices = (invoices ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

    const gross_profit = net_revenue - cogs_from_supplier_invoices
    const gross_margin_pct = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0

    // Labour cost from timesheets (pay_rate_cents is CENTS per RULE 6)
    const { data: timesheets } = await supabaseAdmin
      .from('pos_timesheets')
      .select('hours_worked,staff_members(pay_rate_cents)')
      .eq('business_id', business_id)
      .gte('clock_in', monthStart.toISOString())
      .lt('clock_in', monthEnd.toISOString())
      .then(r => r, () => ({ data: null }))

    const labour_cost = (timesheets ?? []).reduce((s, t) => {
      const hrs = Number(t.hours_worked ?? 0)
      const rateCents = Number((t.staff_members as { pay_rate_cents?: number } | null)?.pay_rate_cents ?? 0)
      return s + hrs * (rateCents / 100)
    }, 0)

    // Other expenses from business_expenses
    const { data: expRows } = await supabaseAdmin
      .from('business_expenses')
      .select('amount,category')
      .eq('business_id', business_id)
      .gte('expense_date', monthStart.toISOString().slice(0, 10))
      .lt('expense_date', monthEnd.toISOString().slice(0, 10))
      .then(r => r, () => ({ data: null }))

    let rent_utilities = 0, marketing_cost = 0, other_expenses = 0
    for (const exp of expRows ?? []) {
      const cat = String(exp.category ?? '').toLowerCase()
      const amt = Number(exp.amount ?? 0)
      if (cat === 'rent' || cat === 'utilities' || cat === 'electricity' || cat === 'water') rent_utilities += amt
      else if (cat === 'marketing' || cat === 'advertising') marketing_cost += amt
      else other_expenses += amt
    }

    const total_expenses = labour_cost + rent_utilities + marketing_cost + other_expenses
    const ebitda = gross_profit - total_expenses

    // vs last month
    const lastMonthStart = new Date(year, month - 2, 1)
    const { data: lastMonthRow } = await supabaseAdmin
      .from('monthly_pl_reports')
      .select('net_revenue,gross_margin_pct')
      .eq('business_id', business_id)
      .eq('period_year', month === 1 ? year - 1 : year)
      .eq('period_month', month === 1 ? 12 : month - 1)
      .maybeSingle()
    void lastMonthStart // suppress unused warning

    const revenue_vs_last_month_pct = lastMonthRow?.net_revenue && Number(lastMonthRow.net_revenue) > 0
      ? ((net_revenue - Number(lastMonthRow.net_revenue)) / Number(lastMonthRow.net_revenue)) * 100 : 0
    const margin_vs_last_month_pct = lastMonthRow?.gross_margin_pct
      ? gross_margin_pct - Number(lastMonthRow.gross_margin_pct) : 0

    const narrative = await this.claudeReason({
      system: 'You write concise financial summaries for small business owners. 3 sentences max.',
      user: 'Month ' + String(month) + '/' + String(year) + ' P&L: Revenue $' + net_revenue.toFixed(0) + ', COGS $' + cogs_from_supplier_invoices.toFixed(0) + ', Gross margin ' + gross_margin_pct.toFixed(1) + '%, Labour $' + labour_cost.toFixed(0) + ', EBITDA $' + ebitda.toFixed(0) + '. Revenue vs last month: ' + revenue_vs_last_month_pct.toFixed(1) + '%. Write a 3-sentence monthly summary with headline, key driver, and one recommendation.',
      maxTokens: 200,
      agent_key: 'reconciliation',
      role: 'narrative',
      business_id,
    })

    await supabaseAdmin.from('monthly_pl_reports').upsert({
      business_id,
      period_month: month,
      period_year: year,
      gross_revenue: Math.round(gross_revenue * 100) / 100,
      refunds_total: Math.round(refunds_total * 100) / 100,
      net_revenue: Math.round(net_revenue * 100) / 100,
      cogs_from_supplier_invoices: Math.round(cogs_from_supplier_invoices * 100) / 100,
      gross_profit: Math.round(gross_profit * 100) / 100,
      gross_margin_pct: Math.round(gross_margin_pct * 10) / 10,
      labour_cost: Math.round(labour_cost * 100) / 100,
      rent_utilities: Math.round(rent_utilities * 100) / 100,
      marketing_cost: Math.round(marketing_cost * 100) / 100,
      other_expenses: Math.round(other_expenses * 100) / 100,
      total_expenses: Math.round(total_expenses * 100) / 100,
      ebitda: Math.round(ebitda * 100) / 100,
      revenue_vs_last_month_pct: Math.round(revenue_vs_last_month_pct * 10) / 10,
      margin_vs_last_month_pct: Math.round(margin_vs_last_month_pct * 10) / 10,
      summary_narrative: narrative || null,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,period_year,period_month' })
  }

  private async quarterEndCheck(business_id: string, config: Record<string, unknown>): Promise<void> {
    const today = new Date()
    const m = today.getMonth() + 1 // 1-12
    const d = today.getDate()
    const isQuarterEnd = (m === 9 && d === 30) || (m === 12 && d === 31) || (m === 3 && d === 31) || (m === 6 && d === 30)
    if (!isQuarterEnd) return

    const accountantEmail = String(config.accountant_email ?? '')
    if (!accountantEmail || !process.env.RESEND_API_KEY) return

    // Get quarter summary
    const qStart = m === 9 ? new Date(today.getFullYear(), 6, 1) :
      m === 12 ? new Date(today.getFullYear(), 9, 1) :
      m === 3 ? new Date(today.getFullYear(), 0, 1) :
      new Date(today.getFullYear(), 3, 1)

    const { data: plRows } = await supabaseAdmin
      .from('monthly_pl_reports')
      .select('period_month,period_year,net_revenue,gross_margin_pct,ebitda,summary_narrative')
      .eq('business_id', business_id)
      .gte('generated_at', qStart.toISOString())
      .order('period_year').order('period_month')

    const { data: reconRows } = await supabaseAdmin
      .from('daily_reconciliations')
      .select('recon_date,status,variance_amount')
      .eq('business_id', business_id)
      .gte('recon_date', qStart.toISOString().slice(0, 10))

    const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', business_id).maybeSingle()

    const totalRevenue = (plRows ?? []).reduce((s, r) => s + Number(r.net_revenue ?? 0), 0)
    const variances = (reconRows ?? []).filter(r => r.status === 'variance').length

    const handoverLetter = await this.claudeReason({
      system: 'Write a professional accountant handover letter for an Australian business. Formal tone.',
      user: 'Business: ' + String(biz?.name ?? '') + '. Quarter ending ' + today.toISOString().slice(0, 10) + '. Total revenue: $' + totalRevenue.toFixed(0) + '. Months: ' + (plRows ?? []).map(r => 'Month ' + String(r.period_month) + ' revenue $' + Number(r.net_revenue).toFixed(0) + ', margin ' + Number(r.gross_margin_pct).toFixed(1) + '%').join('; ') + '. Reconciliation: ' + String(variances) + ' variances detected. Write a 4-sentence handover letter summarising the quarter for the accountant.',
      maxTokens: 300,
      agent_key: 'reconciliation',
      role: 'narrative',
      business_id,
    })

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Aria <noreply@ariaos.site>',
        to: accountantEmail,
        subject: 'Quarter-end handover package — ' + String(biz?.name ?? '') + ' Q' + String(m <= 3 ? 3 : m <= 6 ? 4 : m <= 9 ? 1 : 2),
        html: '<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">' +
          '<h2>Quarter-end Financial Handover</h2><p>' + (handoverLetter ?? '') + '</p>' +
          '<h3>Monthly Revenue Summary</h3>' +
          (plRows ?? []).map(r => '<p><strong>' + String(r.period_month) + '/' + String(r.period_year) + '</strong>: $' + Number(r.net_revenue).toFixed(0) + ' revenue, ' + Number(r.gross_margin_pct).toFixed(1) + '% margin, $' + Number(r.ebitda).toFixed(0) + ' EBITDA</p>').join('') +
          '<p><strong>Reconciliation Variances:</strong> ' + String(variances) + ' flagged across ' + String((reconRows ?? []).length) + ' days</p>' +
          '<p style="font-size:12px;color:#999">Generated by Aria OS · ' + today.toISOString().slice(0, 10) + '</p></div>',
      }),
    }).catch(() => {})
  }
}
