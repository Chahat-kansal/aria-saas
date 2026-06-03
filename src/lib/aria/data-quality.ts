import { supabaseAdmin } from '@/lib/supabase-admin'

export interface DataQualityReport {
  overall_score: number
  pos_score: number
  customer_score: number
  inventory_score: number
  staff_score: number
  supplier_score: number
  missing_critical: string[]
  missing_helpful: string[]
  reliability_statement: string
  hedge_level: 'none' | 'light' | 'moderate' | 'heavy'
}

export const FALLBACK_QUALITY: DataQualityReport = {
  overall_score: 50, pos_score: 50, customer_score: 50, inventory_score: 50,
  staff_score: 50, supplier_score: 50,
  missing_critical: [], missing_helpful: [],
  reliability_statement: '', hedge_level: 'none',
}

export async function assessDataQuality(businessId: string): Promise<DataQualityReport> {
  try {
    const [salesCheck, customerCheck, stockCheck, staffCheck, supplierCheck] =
      await Promise.allSettled([
        supabaseAdmin.from('pos_sales')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .neq('status', 'voided')
          .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
        supabaseAdmin.from('pos_customers')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gt('visit_count', 0),
        supabaseAdmin.from('pos_products')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true)
          .not('stock_quantity', 'is', null),
        supabaseAdmin.from('pos_timesheets')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('clock_in', new Date(Date.now() - 14 * 86400000).toISOString()),
        supabaseAdmin.from('supplier_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('invoice_date', new Date(Date.now() - 90 * 86400000).toISOString()),
      ])

    const salesCount = salesCheck.status === 'fulfilled' ? (salesCheck.value.count ?? 0) : 0
    const customerCount = customerCheck.status === 'fulfilled' ? (customerCheck.value.count ?? 0) : 0
    const stockCount = stockCheck.status === 'fulfilled' ? (stockCheck.value.count ?? 0) : 0
    const staffCount = staffCheck.status === 'fulfilled' ? (staffCheck.value.count ?? 0) : 0
    const supplierCount = supplierCheck.status === 'fulfilled' ? (supplierCheck.value.count ?? 0) : 0

    const pos_score = Math.min(100, salesCount)
    const customer_score = Math.min(100, customerCount * 5)
    const inventory_score = stockCount > 0 ? Math.min(100, stockCount * 5) : 0
    const staff_score = staffCount > 0 ? 100 : 0
    const supplier_score = supplierCount > 0 ? 100 : 0

    const overall_score = Math.round(
      pos_score * 0.40 + customer_score * 0.20 + inventory_score * 0.20 +
      staff_score * 0.10 + supplier_score * 0.10
    )

    const missing_critical: string[] = []
    const missing_helpful: string[] = []

    if (salesCount < 10) missing_critical.push('Less than 10 sales recorded — revenue analysis unreliable')
    if (salesCount < 50) missing_helpful.push('Only ' + salesCount + ' sales in 30 days — patterns may not be statistically significant')
    if (customerCount < 5) missing_critical.push('No customer data — customer analysis not possible')
    if (stockCount === 0) missing_helpful.push('Stock quantities not tracked — inventory recommendations are estimates')
    if (staffCount === 0) missing_helpful.push('No timesheet data — labour cost analysis not available')
    if (supplierCount === 0) missing_helpful.push('No supplier invoices imported — COGS and margin calculations are estimated')

    let hedge_level: DataQualityReport['hedge_level'] = 'none'
    if (overall_score < 20) hedge_level = 'heavy'
    else if (overall_score < 50) hedge_level = 'moderate'
    else if (overall_score < 75) hedge_level = 'light'

    const reliability_statement = hedge_level === 'heavy'
      ? 'Data warning: With only ' + salesCount + ' sales recorded, my analysis has low reliability. Treat these as directional signals, not firm conclusions.'
      : hedge_level === 'moderate'
      ? 'Based on ' + salesCount + ' sales this month. ' + (missing_critical[0] ?? 'Some gaps in data.')
      : ''

    return {
      overall_score, pos_score, customer_score, inventory_score, staff_score, supplier_score,
      missing_critical, missing_helpful, reliability_statement, hedge_level,
    }
  } catch {
    return { ...FALLBACK_QUALITY }
  }
}
