import { supabaseAdmin } from '@/lib/supabase-admin'
import { CANONICAL_COLS } from '@/lib/aria/schema-registry'

export type CustomerSegment =
  | 'champions' | 'loyal' | 'regular' | 'new'
  | 'at_risk' | 'hibernating' | 'never_returned' | 'needs_attention'

type EnrichedCustomer = {
  id: string
  days_since_visit: number
  spend: number
  visits: number
  created_at: string | null
}

function quintileScore(value: number, sortedArr: number[], lowerIsBetter: boolean): number {
  if (!sortedArr.length) return 3
  const n = sortedArr.length
  const idx = lowerIsBetter
    ? sortedArr.findIndex(v => v >= value)
    : sortedArr.findIndex(v => v <= value)
  const position = idx === -1 ? n : idx
  const percentile = position / n
  if (percentile <= 0.2) return lowerIsBetter ? 5 : 1
  if (percentile <= 0.4) return lowerIsBetter ? 4 : 2
  if (percentile <= 0.6) return 3
  if (percentile <= 0.8) return lowerIsBetter ? 2 : 4
  return lowerIsBetter ? 1 : 5
}

function classifySegment(r: number, f: number, m: number, total: number, visits: number, createdDaysAgo: number): CustomerSegment {
  if (createdDaysAgo <= 30 && visits <= 2) return 'new'
  if (visits === 1 && createdDaysAgo > 30) return 'never_returned'
  if (r >= 4 && f >= 4 && m >= 4) return 'champions'
  if (f >= 4 && total >= 9) return 'loyal'
  if (r <= 2 && f >= 3) return 'at_risk'
  if (r <= 2 && f <= 2 && m <= 2) return 'hibernating'
  if (r <= 3) return 'needs_attention'
  return 'regular'
}

export async function scoreCustomersForBusiness(businessId: string): Promise<{ scored: number }> {
  const spendCol = CANONICAL_COLS.CUSTOMER_SPEND
  const { data: customers } = await supabaseAdmin
    .from('pos_customers')
    .select(`id, ${spendCol}, visit_count, last_visit_at, last_visit, created_at`)
    .eq('business_id', businessId)

  if (!customers || customers.length === 0) return { scored: 0 }

  const now = Date.now()
  const enriched: EnrichedCustomer[] = customers.map(c => {
    const lastVisit = (c as Record<string, unknown>).last_visit_at || (c as Record<string, unknown>).last_visit
    const days_since_visit = lastVisit
      ? Math.floor((now - new Date(lastVisit as string).getTime()) / 86400000)
      : 9999
    const spend = Number((c as Record<string, unknown>)[spendCol] ?? 0)
    return { id: c.id, days_since_visit, spend, visits: (c as Record<string, unknown>).visit_count as number || 0, created_at: (c as Record<string, unknown>).created_at as string | null }
  })

  const recencyDays  = [...enriched.map(c => c.days_since_visit)].sort((a, b) => a - b)
  const frequencyVals = [...enriched.map(c => c.visits)].sort((a, b) => b - a)
  const monetaryVals  = [...enriched.map(c => c.spend)].sort((a, b) => b - a)

  let scored = 0
  for (const c of enriched) {
    const r = quintileScore(c.days_since_visit, recencyDays, true)
    const f = quintileScore(c.visits, frequencyVals, false)
    const m = quintileScore(c.spend, monetaryVals, false)
    const total = r + f + m
    const createdDaysAgo = c.created_at
      ? Math.floor((now - new Date(c.created_at).getTime()) / 86400000)
      : 9999
    const segment = classifySegment(r, f, m, total, c.visits, createdDaysAgo)
    const { error } = await supabaseAdmin.from('pos_customers').update({
      rfm_recency_score: r, rfm_frequency_score: f, rfm_monetary_score: m,
      rfm_score_total: total, segment, segment_updated_at: new Date().toISOString(),
      days_since_visit: c.days_since_visit, lifetime_value_cents: Math.round(c.spend * 100),
    }).eq('id', c.id)
    if (!error) scored++
  }

  return { scored }
}

export async function generateWinbackRecommendations(businessId: string): Promise<{ recommendations_created: number }> {
  const { data: segCounts } = await supabaseAdmin
    .from('pos_customers').select('segment').eq('business_id', businessId)
  if (!segCounts) return { recommendations_created: 0 }

  const counts: Record<string, number> = {}
  for (const c of segCounts) { const s = c.segment || 'unscored'; counts[s] = (counts[s] || 0) + 1 }
  const total = segCounts.length
  if (total === 0) return { recommendations_created: 0 }

  const recentCutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: recent } = await supabaseAdmin.from('aria_actions').select('id')
    .eq('business_id', businessId).eq('source', 'sprint_t_winback').gte('created_at', recentCutoff).limit(1)
  if (recent?.length) return { recommendations_created: 0 }

  const created: Record<string, unknown>[] = []
  const atRiskCount = counts['at_risk'] || 0
  const hibernatingCount = counts['hibernating'] || 0

  if (atRiskCount >= 5 || atRiskCount / total > 0.15) {
    created.push({
      business_id: businessId,
      title: `${atRiskCount} customers slipping into at-risk`,
      category: 'customers', priority: 'high',
      recommendation: `Run a winback campaign targeting your ${atRiskCount} at-risk customers. A $10-off SMS typically recovers 15-25% in retail and hospo. Go to Customers → Send winback campaign and select the At Risk segment.`,
      reason: `${atRiskCount} customers (${Math.round((atRiskCount / total) * 100)}% of base) used to visit regularly but haven't in 30+ days.`,
      expected_impact: `Estimated 3-${Math.round(atRiskCount * 0.25)} returning customers if you run a $10 SMS offer this week.`,
      confidence: 0.75, status: 'pending', source: 'sprint_t_winback', triggered_by: 'system',
      payload: { segment: 'at_risk', count: atRiskCount, percent_of_base: atRiskCount / total },
    })
  }

  if (hibernatingCount >= 10) {
    created.push({
      business_id: businessId,
      title: `${hibernatingCount} hibernating customers worth waking`,
      category: 'customers', priority: 'medium',
      recommendation: `${hibernatingCount} customers haven't been in for 60+ days. A "free coffee on us" SMS gets the highest open rate for this segment.`,
      reason: `Hibernating customers have low recency, frequency, and monetary scores. They need a stronger nudge than at-risk.`,
      expected_impact: `5-10% typically reactivate.`,
      confidence: 0.65, status: 'pending', source: 'sprint_t_winback', triggered_by: 'system',
      payload: { segment: 'hibernating', count: hibernatingCount },
    })
  }

  if (created.length) await supabaseAdmin.from('aria_actions').insert(created)
  return { recommendations_created: created.length }
}
