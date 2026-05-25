import { supabaseAdmin } from '@/lib/supabase-admin'
import { gatherWeeklyData, computeWeekStart } from './weekly-data'

export async function runWeeklyReport(businessId: string): Promise<void> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, trading_name, email, timezone, industry')
    .eq('id', businessId)
    .single()

  if (!biz) {
    console.error(`[weekly-report] business ${businessId} not found`)
    return
  }

  const tz = (biz.timezone as string | null) ?? 'Australia/Melbourne'
  const bizName = (biz.trading_name as string | null) ?? (biz.name as string | null) ?? businessId
  const weekStart = computeWeekStart(tz)

  const data = await gatherWeeklyData(businessId, weekStart, tz)

  if (data.totalRevenue === 0 && data.totalTransactions === 0) {
    console.log(`[weekly-report] ${bizName}: skipped (no transactions this week)`)
    return
  }

  // Sprint 2 (Prompt 14) replaces this placeholder with council summary + email
  console.log(`[weekly-report] ${bizName}: would generate report — Sprint 2 will complete this`)
}
