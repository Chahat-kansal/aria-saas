import { supabaseAdmin } from '@/lib/supabase-admin'
import { CANONICAL_COLS } from '@/lib/aria/schema-registry'
import { computeSlowDay } from '@/lib/aria/slow-day'

export interface LossSignal {
  id: string
  type: 'slow_period' | 'margin_leak' | 'lapsing_customers' | 'unanswered_reviews' | 'profit_leak'
  title: string
  insight: string
  solution: string
  estimated_monthly_loss_aud: number
  propose_only: boolean
  act_label?: string
  payload: Record<string, unknown>
}

export async function detectLosses(businessId: string): Promise<LossSignal[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86400000).toISOString()

  const [slow, margin, lapsing, reviews, leaks] = await Promise.allSettled([
    detectSlowPeriods(businessId, ninetyDaysAgo),
    detectMarginLeaks(businessId, thirtyDaysAgo),
    detectLapsingCustomers(businessId, fortyFiveDaysAgo),
    detectUnansweredReviews(businessId, thirtyDaysAgo),
    detectExistingProfitLeaks(businessId),
  ])

  const signals: LossSignal[] = []
  if (slow.status === 'fulfilled' && slow.value) signals.push(slow.value)
  if (margin.status === 'fulfilled' && margin.value) signals.push(margin.value)
  if (lapsing.status === 'fulfilled' && lapsing.value) signals.push(lapsing.value)
  if (reviews.status === 'fulfilled' && reviews.value) signals.push(reviews.value)
  if (leaks.status === 'fulfilled') signals.push(...leaks.value)

  return signals.sort((a, b) => b.estimated_monthly_loss_aud - a.estimated_monthly_loss_aud).slice(0, 4)
}

async function detectSlowPeriods(businessId: string, _since: string): Promise<LossSignal | null> {
  const slowDayResult = await computeSlowDay(businessId)
  if (!slowDayResult || slowDayResult.all.length < 2) return null

  const all = slowDayResult.all  // sorted ascending by avgRev
  const avgs = all.map(d => d.avgRev)
  const medianAvg = avgs[Math.floor(avgs.length / 2)]
  const slowest = all[0]

  if (!slowest || slowest.avgRev >= medianAvg * 0.85) return null

  const gapPerOccurrence = medianAvg - slowest.avgRev
  const monthlyLoss = Math.round(gapPerOccurrence * 4.3)
  const gapPct = Math.round((gapPerOccurrence / medianAvg) * 100)

  return {
    id: 'slow_period_' + slowest.name.toLowerCase(),
    type: 'slow_period',
    title: slowest.name + ' revenue ' + gapPct + '% below median',
    insight: slowest.name + 's average $' + Math.round(slowest.avgRev) + ' vs $' + Math.round(medianAvg) + ' median — $' + Math.round(gapPerOccurrence) + ' gap per ' + slowest.name + ', ~$' + monthlyLoss + '/month.',
    solution: 'Run a ' + slowest.name + '-specific promotion, event, or staff-led push to drive foot traffic on your quietest day. Target existing customers with a day-of-week SMS offer.',
    estimated_monthly_loss_aud: monthlyLoss,
    propose_only: true,
    payload: {
      slowest_day: slowest.name,
      avg_revenue_aud: Math.round(slowest.avgRev),
      median_avg_aud: Math.round(medianAvg),
      gap_per_occurrence_aud: Math.round(gapPerOccurrence),
    },
  }
}

async function detectMarginLeaks(businessId: string, since: string): Promise<LossSignal | null> {
  // Get recent sale IDs (limit 400 to keep .in() tractable)
  const { data: recentSales } = await supabaseAdmin
    .from('pos_sales')
    .select('id')
    .eq('business_id', businessId)
    .neq('status', 'voided')
    .gte('created_at', since)
    .limit(400)

  if (!recentSales || recentSales.length === 0) return null
  const saleIds = recentSales.map((s: { id: string }) => s.id)

  const { data: items } = await supabaseAdmin
    .from('pos_sale_items')
    .select('product_id, product_name, unit_price, cost_price, quantity')
    .in('sale_id', saleIds)
    .gt('cost_price', 0)
    .limit(3000)

  if (!items || items.length < 5) return null

  type SaleItem = { product_id: string | null; product_name: string | null; unit_price: number | null; cost_price: number | null; quantity: number | null }

  const byProduct: Record<string, { rev: number; cost: number; units: number; name: string }> = {}
  for (const item of items as SaleItem[]) {
    const pid = item.product_id ?? 'unknown'
    const qty = Number(item.quantity ?? 0)
    if (!byProduct[pid]) byProduct[pid] = { rev: 0, cost: 0, units: 0, name: item.product_name ?? pid }
    byProduct[pid].rev += Number(item.unit_price ?? 0) * qty
    byProduct[pid].cost += Number(item.cost_price ?? 0) * qty
    byProduct[pid].units += qty
  }

  const allRev = Object.values(byProduct).reduce((s, p) => s + p.rev, 0)
  const allCost = Object.values(byProduct).reduce((s, p) => s + p.cost, 0)
  const avgMargin = allRev > 0 ? (allRev - allCost) / allRev : 0

  const leakers = Object.entries(byProduct)
    .map(([id, p]) => {
      const margin = p.rev > 0 ? (p.rev - p.cost) / p.rev : 0
      const lostMargin = (avgMargin - margin) * p.rev
      return { id, name: p.name, margin, units: p.units, lostMargin }
    })
    .filter(p => p.units >= 5 && p.margin < avgMargin * 0.85 && p.lostMargin > 0)
    .sort((a, b) => b.lostMargin - a.lostMargin)
    .slice(0, 5)

  if (leakers.length === 0) return null

  const monthlyLoss = Math.round(leakers.reduce((s, l) => s + l.lostMargin, 0) * 1.5)
  const topLeaker = leakers[0]
  const names = leakers.map(l => l.name).slice(0, 3).join(', ')

  return {
    id: 'margin_leak_products',
    type: 'margin_leak',
    title: leakers.length + ' high-volume product' + (leakers.length > 1 ? 's' : '') + ' with below-average margin',
    insight: names + ' sell well but margin is ' + Math.round((avgMargin - topLeaker.margin) * 100) + 'pts below your average — potential $' + monthlyLoss + '/month improvement.',
    solution: 'Review cost of goods or raise prices on margin-leaking products by 5-10%. Small adjustments on high-volume items compound quickly.',
    estimated_monthly_loss_aud: monthlyLoss,
    propose_only: true,
    payload: {
      product_ids: leakers.map(l => l.id),
      product_names: leakers.map(l => l.name),
      avg_margin_pct: Math.round(avgMargin * 100),
      leaker_margins: leakers.map(l => ({ id: l.id, name: l.name, margin_pct: Math.round(l.margin * 100) })),
    },
  }
}

async function detectLapsingCustomers(businessId: string, cutoff: string): Promise<LossSignal | null> {
  const spendCol = CANONICAL_COLS.CUSTOMER_SPEND
  const { data: customers } = await supabaseAdmin
    .from('pos_customers')
    .select(`id, ${spendCol}, last_visit_at, marketing_consent`)
    .eq('business_id', businessId)
    .gt(spendCol, 0)
    .lt('last_visit_at', cutoff)
    .not('last_visit_at', 'is', null)
    .order(spendCol, { ascending: false })
    .limit(100)

  if (!customers || customers.length === 0) return null

  type Customer = { id: string; total_spent: number | null; last_visit_at: string | null; marketing_consent: boolean | null }
  const custs = customers as Customer[]

  const totalSpend = custs.reduce((s, c) => s + Number(c.total_spent ?? 0), 0)
  const avgSpend = totalSpend / custs.length
  const consentCount = custs.filter(c => c.marketing_consent).length
  const targetCount = consentCount > 0 ? consentCount : custs.length
  const monthlyLoss = Math.round(avgSpend * custs.length / 3)

  return {
    id: 'lapsing_customers',
    type: 'lapsing_customers',
    title: custs.length + ' regular customer' + (custs.length > 1 ? 's' : '') + ' lapsing',
    insight: custs.length + ' customers who spent with you previously haven\'t returned in 45+ days. Avg spend $' + Math.round(avgSpend) + '. Estimated $' + monthlyLoss + '/month at risk.',
    solution: 'Send a personalised winback offer to these ' + targetCount + ' customer' + (targetCount !== 1 ? 's' : '') + '. A 15% discount or free item typically recovers 20-30% of lapsed regulars.',
    estimated_monthly_loss_aud: monthlyLoss,
    propose_only: false,
    act_label: 'Create winback campaign for ' + targetCount + ' customer' + (targetCount !== 1 ? 's' : ''),
    payload: {
      customer_ids: custs.slice(0, 50).map(c => c.id),
      customer_count: custs.length,
      consent_count: consentCount,
      avg_spend_aud: Math.round(avgSpend),
    },
  }
}

async function detectUnansweredReviews(businessId: string, since: string): Promise<LossSignal | null> {
  const { data: reviews } = await supabaseAdmin
    .from('google_reviews')
    .select('id, rating, comment, review_date')
    .eq('business_id', businessId)
    .lte('rating', 3)
    .eq('has_reply', false)
    .gte('review_date', since)
    .order('review_date', { ascending: false })
    .limit(20)

  if (!reviews || reviews.length === 0) return null

  type Review = { id: string; rating: number | null; comment: string | null; review_date: string | null }
  const revs = reviews as Review[]

  const avgRating = revs.reduce((s, r) => s + Number(r.rating ?? 3), 0) / revs.length
  const monthlyLoss = revs.length * 80

  return {
    id: 'unanswered_reviews',
    type: 'unanswered_reviews',
    title: revs.length + ' negative review' + (revs.length > 1 ? 's' : '') + ' with no reply',
    insight: revs.length + ' review' + (revs.length > 1 ? 's' : '') + ' rated ' + Math.round(avgRating * 10) / 10 + '/5 or below haven\'t received a response. Unanswered negative reviews deter ~68% of prospective customers.',
    solution: 'Reply to each with a brief professional response acknowledging the issue. Aria can draft personalised replies — you review before publishing.',
    estimated_monthly_loss_aud: monthlyLoss,
    propose_only: false,
    act_label: 'Draft AI replies for ' + revs.length + ' review' + (revs.length > 1 ? 's' : ''),
    payload: {
      review_ids: revs.map(r => r.id),
      review_count: revs.length,
      avg_rating: Math.round(avgRating * 10) / 10,
      reviews: revs.slice(0, 5).map(r => ({ id: r.id, rating: r.rating ?? 0, comment: (r.comment ?? '').slice(0, 120) })),
    },
  }
}

async function detectExistingProfitLeaks(businessId: string): Promise<LossSignal[]> {
  const { data: leaks } = await supabaseAdmin
    .from('profit_leaks')
    .select('id, description, monthly_loss, category')
    .eq('business_id', businessId)
    .eq('status', 'detected')
    .order('monthly_loss', { ascending: false })
    .limit(3)

  if (!leaks || leaks.length === 0) return []

  return (leaks as Array<{ id: string; description: string | null; monthly_loss: number | null; category: string | null }>).map(leak => ({
    id: 'profit_leak_' + leak.id,
    type: 'profit_leak' as const,
    title: (leak.description ?? 'Profit leak detected').slice(0, 60),
    insight: 'Aria detected a ' + (leak.category ?? 'cost') + ' issue costing an estimated $' + Math.round(Number(leak.monthly_loss ?? 0)) + '/month.',
    solution: 'Review and address this ' + (leak.category ?? 'profit leak') + '. Mark it resolved once corrected.',
    estimated_monthly_loss_aud: Math.round(Number(leak.monthly_loss ?? 0)),
    propose_only: true,
    payload: {
      leak_id: leak.id,
      category: leak.category,
      monthly_loss: Math.round(Number(leak.monthly_loss ?? 0)),
    },
  }))
}
