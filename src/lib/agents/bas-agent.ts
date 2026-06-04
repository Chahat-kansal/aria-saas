import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types'
import { BaseAgent } from './base-agent'

// ATO quarter definitions
export interface BasQuarter {
  quarter: string
  period_start: Date
  period_end: Date
  due_date: Date
}

const FY = 2026

export function getCurrentQuarter(): BasQuarter {
  const now = new Date()
  const quarters: BasQuarter[] = [
    { quarter: 'Q1 FY' + FY, period_start: new Date(FY - 1 + '-07-01'), period_end: new Date(FY - 1 + '-09-30'), due_date: new Date(FY - 1 + '-10-28') },
    { quarter: 'Q2 FY' + FY, period_start: new Date(FY - 1 + '-10-01'), period_end: new Date(FY - 1 + '-12-31'), due_date: new Date(FY + '-02-28') },
    { quarter: 'Q3 FY' + FY, period_start: new Date(FY + '-01-01'), period_end: new Date(FY + '-03-31'), due_date: new Date(FY + '-04-28') },
    { quarter: 'Q4 FY' + FY, period_start: new Date(FY + '-04-01'), period_end: new Date(FY + '-06-30'), due_date: new Date(FY + '-07-28') },
  ]
  return quarters.find(q => now >= q.period_start && now <= q.period_end) ?? quarters[3]
}

export class BasAgent extends BaseAgent {
  type: AgentType = 'bas_compliance'

  async run(business_id: string): Promise<AgentRunResult> {
    const start = Date.now()
    const errors: Error[] = []
    const q = getCurrentQuarter()
    try {
      const settings = await this.getSettings(business_id)
      if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - start }
      const basConfig = settings.config as { gst_rate?: number; payg_withholding_rate?: number; super_guarantee_rate?: number }
      const { totalPayable, dueDate, quarter, superRatePct } = await this.generateBasDraft(business_id, q.period_start, q.period_end, basConfig)
      if (totalPayable > 0) {
        const decision: AgentDecisionInput = {
          business_id,
          agent_type: 'bas_compliance' as AgentType,
          decision_data: {
            action_type: 'review_bas_draft',
            quarter,
            total_payable: Math.round(totalPayable * 100) / 100,
            due_date: dueDate.toISOString().slice(0, 10),
            super_rate_used: superRatePct,
            super_rate_flag: 'ACTION REQUIRED: Confirm the current AU super guarantee rate (' + superRatePct + '%) is correct for this financial year with your accountant before lodging.',
          },
          reasoning: 'BAS ' + quarter + ' draft prepared: $' + totalPayable.toFixed(0) + ' payable by ' + dueDate.toISOString().slice(0, 10) + '. Super at ' + superRatePct + '% — owner must confirm rate before lodging.',
          confidence_score: 0.95,
          projected_impact_cents: Math.round(totalPayable * 100),
          expires_at: dueDate.toISOString(),
        }
        const saved = await this.saveDecisions([decision])
        await this.logRun(business_id, { decisions: saved, errors, duration_ms: Date.now() - start })
        return { decisions: saved, errors, duration_ms: Date.now() - start }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)))
    }
    await this.logRun(business_id, { decisions: [], errors, duration_ms: Date.now() - start })
    return { decisions: [], errors, duration_ms: Date.now() - start }
  }

  async generateBasDraft(business_id: string, period_start: Date, period_end: Date, config: { gst_rate?: number; payg_withholding_rate?: number; super_guarantee_rate?: number } = {}): Promise<{ totalPayable: number; dueDate: Date; quarter: string; superRatePct: number }> {
    const gstRate = Number(config.gst_rate ?? 0.10)
    const paygRate = Number(config.payg_withholding_rate ?? 0.19)
    const superRate = Number(config.super_guarantee_rate ?? 0.115)
    const superRatePct = Math.round(superRate * 1000) / 10
    const startStr = period_start.toISOString()
    const endStr = new Date(period_end.getTime() + 86399000).toISOString() // include end of day

    // Determine quarter label
    const q = (() => {
      const month = period_start.getMonth()
      const year = period_start.getFullYear()
      if (month === 6) return 'Q1 FY' + (year + 1)
      if (month === 9) return 'Q2 FY' + (year + 1)
      if (month === 0) return 'Q3 FY' + year
      if (month === 3) return 'Q4 FY' + year
      return 'Q? FY' + year
    })()

    const dueDate = (() => {
      const month = period_end.getMonth()
      const year = period_end.getFullYear()
      if (month === 8) return new Date(year + '-10-28') // Sep → Oct 28
      if (month === 11) return new Date((year + 1) + '-02-28') // Dec → Feb 28
      if (month === 2) return new Date(year + '-04-28') // Mar → Apr 28
      if (month === 5) return new Date(year + '-07-28') // Jun → Jul 28
      return new Date(year + '-10-28')
    })()

    // STEP 1: G1 Total sales
    const { data: salesData } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', business_id)
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .neq('status', 'voided')

    const g1TotalSales = (salesData ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

    // STEP 2+3: GST-free and input-taxed sales
    const { data: saleItems } = await supabaseAdmin
      .from('pos_sale_items')
      .select('line_total, product_id, pos_sales!inner(created_at, business_id, status)')
      .gte('pos_sales.created_at', startStr)
      .lte('pos_sales.created_at', endStr)
      .neq('pos_sales.status', 'voided')
      .eq('pos_sales.business_id', business_id)

    // Get all product classifications for business
    const { data: classifications } = await supabaseAdmin
      .from('product_tax_classifications')
      .select('product_id, gst_treatment')
      .eq('business_id', business_id)

    const classMap: Record<string, string> = {}
    for (const c of classifications ?? []) {
      classMap[c.product_id] = c.gst_treatment
    }

    let g3GstFreeSales = 0
    let g4InputTaxedSales = 0
    let unclassifiedCount = 0

    for (const item of saleItems ?? []) {
      const treatment = classMap[item.product_id]
      if (!treatment) { unclassifiedCount++; continue }
      if (treatment === 'gst_free') g3GstFreeSales += Number(item.line_total ?? 0)
      if (treatment === 'input_taxed') g4InputTaxedSales += Number(item.line_total ?? 0)
    }

    // STEP 4: GST on sales — GST = taxable × rate / (1 + rate)
    const taxableSales = g1TotalSales - g3GstFreeSales - g4InputTaxedSales
    const field1aGstOnSales = taxableSales > 0 ? taxableSales * gstRate / (1 + gstRate) : 0

    // STEP 5: GST credits from purchases
    let field1bGstCredits = 0
    let g11NoncapitalPurchases = 0
    try {
      const { data: invoices } = await supabaseAdmin
        .from('supplier_invoices')
        .select('total')
        .eq('business_id', business_id)
        .gte('invoice_date', period_start.toISOString().slice(0, 10))
        .lte('invoice_date', period_end.toISOString().slice(0, 10))
        .neq('status', 'disputed')

      g11NoncapitalPurchases = (invoices ?? []).reduce((s, i) => s + Number(i.total ?? 0), 0)
      field1bGstCredits = g11NoncapitalPurchases * gstRate / (1 + gstRate)
    } catch { /* supplier_invoices may not exist */ }

    // STEP 6: Net GST
    const netGst = field1aGstOnSales - field1bGstCredits

    // STEP 7: PAYG Withholding from timesheets
    const { data: timesheets } = await supabaseAdmin
      .from('pos_timesheets')
      .select('hours_worked, staff_members(hourly_rate, first_name, last_name, id)')
      .eq('business_id', business_id)
      .gte('clock_in', startStr)
      .lte('clock_in', endStr)

    let w1TotalSalaryWages = 0
    const staffEarnings: Record<string, { name: string; staff_member_id: string; earnings: number }> = {}

    for (const ts of timesheets ?? []) {
      const rate = Number((ts.staff_members as { hourly_rate?: number } | null)?.hourly_rate ?? 25)
      const hours = Number(ts.hours_worked ?? 0)
      const earnings = hours * rate
      w1TotalSalaryWages += earnings

      const sm = ts.staff_members as { id?: string; first_name?: string; last_name?: string } | null
      if (sm?.id) {
        const name = (sm.first_name ?? '') + ' ' + (sm.last_name ?? '')
        if (!staffEarnings[sm.id]) staffEarnings[sm.id] = { name, staff_member_id: sm.id, earnings: 0 }
        staffEarnings[sm.id].earnings += earnings
      }
    }

    // Approximate withholding from config (default 19% for sub-$87k annual workers)
    const w2AmountsWithheld = w1TotalSalaryWages * paygRate

    // STEP 8: Super obligations (rate from config, default 11.5% — owner must confirm for current FY)
    const quarterLabel = q
    const superDueDate = new Date(dueDate.getTime() + 28 * 86400000)

    for (const [staffId, staff] of Object.entries(staffEarnings)) {
      const superOwed = staff.earnings * superRate
      await supabaseAdmin
        .from('super_obligations')
        .upsert({
          business_id,
          staff_member_id: staffId,
          staff_name: staff.name.trim() || 'Unknown',
          quarter: quarterLabel,
          period_start: period_start.toISOString().slice(0, 10),
          period_end: period_end.toISOString().slice(0, 10),
          ordinary_time_earnings: Math.round(staff.earnings * 100) / 100,
          super_rate_pct: superRatePct,
          super_amount_owed: Math.round(superOwed * 100) / 100,
          payment_due_date: superDueDate.toISOString().slice(0, 10),
          status: 'unpaid',
        }, { onConflict: 'business_id,staff_member_id,period_start' })
    }

    // STEP 9: Reconciliation gaps
    const gaps: string[] = []
    if (unclassifiedCount > 0) gaps.push(unclassifiedCount + ' sale items without GST classification — affects accuracy')
    if (field1bGstCredits === 0 && g11NoncapitalPurchases === 0) gaps.push('No supplier invoices found — GST credits may be understated')

    // STEP 10: Total payable
    const totalPayable = netGst + w2AmountsWithheld

    // STEP 11: Handover summary via Sonnet
    let handoverSummary = ''
    try {
      const { data: bizData } = await supabaseAdmin
        .from('businesses')
        .select('name')
        .eq('id', business_id)
        .maybeSingle()

      handoverSummary = await this.claudeReason({
        system: 'You are an Australian tax expert writing concise BAS handover notes for accountant review.',
        user: 'Write a concise BAS handover summary (3-4 sentences) for an Australian accountant:\n' +
          'Business: ' + (bizData?.name ?? 'Unknown') + '\n' +
          'Quarter: ' + q + '\n' +
          'Period: ' + period_start.toISOString().slice(0, 10) + ' to ' + period_end.toISOString().slice(0, 10) + '\n' +
          'Due: ' + dueDate.toISOString().slice(0, 10) + '\n' +
          'G1 Total Sales: $' + g1TotalSales.toFixed(0) + '\n' +
          'G3 GST-free: $' + g3GstFreeSales.toFixed(0) + '\n' +
          '1A GST on sales: $' + field1aGstOnSales.toFixed(0) + '\n' +
          '1B GST credits: $' + field1bGstCredits.toFixed(0) + '\n' +
          'Net GST: $' + netGst.toFixed(0) + (netGst > 0 ? ' (payable)' : ' (refund)') + '\n' +
          'W1 Wages: $' + w1TotalSalaryWages.toFixed(0) + '\n' +
          'W2 PAYG: $' + w2AmountsWithheld.toFixed(0) + '\n' +
          'Total payable: $' + totalPayable.toFixed(0) + '\n' +
          (unclassifiedCount > 0 ? unclassifiedCount + ' products need GST classification.\n' : '') +
          'Tone: professional, factual, suitable for accountant review.',
        maxTokens: 400,
        model: 'claude-sonnet-4-5-20250929',
        agent_key: 'bas_compliance',
        role: 'compliance',
        business_id,
      })
    } catch { /* non-fatal */ }

    // STEP 12: Upsert bas_drafts
    await supabaseAdmin
      .from('bas_drafts')
      .upsert({
        business_id,
        quarter: q,
        period_start: period_start.toISOString().slice(0, 10),
        period_end: period_end.toISOString().slice(0, 10),
        due_date: dueDate.toISOString().slice(0, 10),
        g1_total_sales: Math.round(g1TotalSales * 100) / 100,
        g3_gst_free_sales: Math.round(g3GstFreeSales * 100) / 100,
        g4_input_taxed_sales: Math.round(g4InputTaxedSales * 100) / 100,
        field_1a_gst_on_sales: Math.round(field1aGstOnSales * 100) / 100,
        field_1b_gst_credits: Math.round(field1bGstCredits * 100) / 100,
        g11_noncapital_purchases: Math.round(g11NoncapitalPurchases * 100) / 100,
        net_gst: Math.round(netGst * 100) / 100,
        w1_total_salary_wages: Math.round(w1TotalSalaryWages * 100) / 100,
        w2_amounts_withheld: Math.round(w2AmountsWithheld * 100) / 100,
        total_payable: Math.round(totalPayable * 100) / 100,
        unclassified_sales_count: unclassifiedCount,
        reconciliation_gaps: gaps,
        handover_summary: handoverSummary,
        handover_generated_at: handoverSummary ? new Date().toISOString() : null,
      }, { onConflict: 'business_id,period_start' })

    return { totalPayable, dueDate, quarter: q, superRatePct }
  }
}
