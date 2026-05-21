import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '@/lib/aria/providers/anthropic'

const INSIGHT_SYSTEM = `You are Aria's workforce analyst for an Australian SMB.
Given labour and sales data, identify the most important workforce insight.

Return ONLY valid JSON:
{
  "insight_type": "labour_cost_high"|"overtime_risk"|"understaffed"|"top_performer"|"all_clear",
  "title": "short title",
  "recommendation": "1-2 sentence actionable recommendation",
  "expected_impact_dollars": 0.00,
  "confidence": "high"|"medium"|"low",
  "priority": "high"|"medium"|"low"
}`

interface InsightResult {
  insight_type: string
  title: string
  recommendation: string
  expected_impact_dollars: number
  confidence: string
  priority: string
}

export async function runWorkforceInsights(businessId: string): Promise<void> {
  const supabase = createServerSupabaseClient()

  const since = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [salesQ, timesheetsQ, staffingRulesQ] = await Promise.all([
    supabase.from('pos_sales')
      .select('total_amount').eq('business_id', businessId)
      .neq('status', 'voided').gte('created_at', since),
    supabase.from('pos_timesheets')
      .select('staff_member_id, staff_name, clock_in, clock_out, break_minutes, total_pay_cents')
      .eq('business_id', businessId).gte('clock_in', since).not('clock_out', 'is', null),
    supabase.from('pos_staffing_rules')
      .select('min_staff, day_of_week, hour_of_day').eq('business_id', businessId),
  ])

  const weekRevenue = (salesQ.data ?? [])
    .reduce((s, x) => s + (Number(x.total_amount) || 0), 0)

  const totalLabourCents = (timesheetsQ.data ?? [])
    .reduce((s, t) => s + (Number(t.total_pay_cents) || 0), 0)

  const labourPct = weekRevenue > 0
    ? (totalLabourCents / 100 / weekRevenue * 100)
    : 0

  const hoursPerStaffDay = new Map<string, number>()
  for (const t of timesheetsQ.data ?? []) {
    if (!t.clock_out) continue
    const key = `${t.staff_member_id ?? t.staff_name}:${String(t.clock_in).slice(0, 10)}`
    const h = Math.max(0,
      (new Date(String(t.clock_out)).getTime() - new Date(String(t.clock_in)).getTime()) / 3600_000
      - (Number(t.break_minutes) || 0) / 60
    )
    hoursPerStaffDay.set(key, (hoursPerStaffDay.get(key) ?? 0) + h)
  }
  const overtimeInstances = [...hoursPerStaffDay.values()].filter(h => h > 10).length

  const fallback: InsightResult = {
    insight_type: labourPct > 35 ? 'labour_cost_high' : 'all_clear',
    title: labourPct > 35 ? 'High labour cost ratio' : 'Workforce on track',
    recommendation: labourPct > 35
      ? `Labour is ${labourPct.toFixed(1)}% of revenue this week. Industry benchmark is 25-30%. Review roster for next week.`
      : 'Labour costs are within acceptable range.',
    expected_impact_dollars: labourPct > 35
      ? +((labourPct - 30) / 100 * weekRevenue).toFixed(2)
      : 0,
    confidence: 'medium',
    priority: labourPct > 35 ? 'high' : 'low',
  }

  const prompt = `Business workforce data for last 7 days:
Revenue: $${weekRevenue.toFixed(2)}
Total labour cost: $${(totalLabourCents / 100).toFixed(2)}
Labour % of revenue: ${labourPct.toFixed(1)}%
Overtime instances (>10h/day): ${overtimeInstances}
Staff with timesheets: ${new Set(timesheetsQ.data?.map(t => t.staff_member_id)).size}
Staffing rules configured: ${(staffingRulesQ.data ?? []).length}

Identify the most important workforce insight.`

  const result = await callAnthropic<InsightResult>(
    {
      model: 'haiku',
      systemPrompt: INSIGHT_SYSTEM,
      userPrompt: prompt,
      maxTokens: 300,
      businessId,
      agentKey: 'generic',
      role: 'analysis' as never,
    },
    fallback,
  )

  const d = result.data
  if (!d || d.insight_type === 'all_clear') return

  try {
    await supabaseAdmin.from('aria_actions').insert({
      business_id: businessId,
      category: 'staff',
      title: String(d.title ?? 'Workforce insight'),
      recommendation: String(d.recommendation ?? ''),
      expected_impact: (Number(d.expected_impact_dollars) || 0).toFixed(2),
      confidence: String(d.confidence ?? 'medium'),
      status: 'pending',
      source: 'workforce_brain',
      priority: String(d.priority ?? 'medium'),
      payload: {
        insight_type: d.insight_type,
        week_revenue: weekRevenue,
        labour_pct: +labourPct.toFixed(1),
        total_labour_cents: totalLabourCents,
        overtime_instances: overtimeInstances,
      },
    })
  } catch (e) {
    console.error('workforce brain ariaObserve failed:', e)
  }
}
