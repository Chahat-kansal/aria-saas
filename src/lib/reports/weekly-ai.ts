import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runAriaCouncil, insertCouncilRun, type CouncilOutput } from '@/lib/aria/council'
import type { WeeklyReportData } from './weekly-data'

export interface PromoRecommendation {
  title: string
  mechanic: string
  timing: string
  expected_impact: string
  urgency: string
}

export interface SplitDecision {
  topic: string
  optimist_view: string
  critic_view: string
  strategist_view: string
}

export interface WeeklyNarrative {
  executive_summary: string
  high_confidence_insights: string[]
  split_decisions: SplitDecision[]
  promo_recommendations: PromoRecommendation[]
  suspicious_summary: string | null
  council_meta: CouncilOutput['meta']
}

export interface BusinessRow {
  id: string
  name: string | null
  trading_name: string | null
  email: string | null
  timezone: string | null
  industry: string | null
  city: string | null
}

function fmt(n: number) { return (Number(n) || 0).toFixed(2) }
function pct(n: number | null) { return n != null ? (n > 0 ? '+' : '') + n.toFixed(1) + '%' : 'n/a' }

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function buildContext(data: WeeklyReportData, biz: BusinessRow): string {
  const bizName = biz.trading_name ?? biz.name ?? biz.id
  const weekFrom = data.weekStart.slice(0, 10)
  const weekTo = data.weekEnd.slice(0, 10)

  const bestDay = [...data.revenueByDay].sort((a, b) => b.revenue - a.revenue)[0]
  const worstDay = [...data.revenueByDay].sort((a, b) => a.revenue - b.revenue)[0]

  const topByRev = data.topProductsByRevenue.slice(0, 5)
    .map(p => `${p.productName} $${fmt(p.revenue)}`).join(', ')
  const topByVol = data.topProductsByUnits.slice(0, 5)
    .map(p => `${p.productName} ${p.quantitySold} units`).join(', ')

  // Find peak hour bucket
  const peakBucket = [...data.hourlyBuckets].sort((a, b) => b.transactions - a.transactions)[0]
  const peakStr = peakBucket
    ? `${DAY_NAMES[peakBucket.dayOfWeek]} ${peakBucket.hour}:00 (${peakBucket.transactions} transactions)`
    : 'not enough data'

  const totalPm = data.paymentMethods.reduce((s, p) => s + p.count, 0)
  const pmStr = data.paymentMethods.map(p => {
    const pctVal = totalPm > 0 ? ((p.count / totalPm) * 100).toFixed(0) : '0'
    return `${p.method} ${pctVal}%`
  }).join(', ')

  const flagTypes = [...new Set(data.suspiciousTransactions.map(f => f.flagReason))].join(', ')

  const maxVar = data.shiftClosures.reduce((mx, s) => Math.max(mx, Math.abs(s.varianceCents)), 0)

  const margin = data.estimatedGrossMarginPercent != null
    ? data.estimatedGrossMarginPercent.toFixed(1) + '%'
    : 'not enough cost data'

  return [
    `Business: ${bizName}, industry: ${biz.industry ?? 'unknown'}, city: ${biz.city ?? 'unknown'}`,
    `Week: ${weekFrom} to ${weekTo}`,
    `Revenue: $${fmt(data.totalRevenue)} (${pct(data.revenueChangePercent)} vs prior week $${fmt(data.priorWeekRevenue)})`,
    `Transactions: ${data.totalTransactions}, avg basket $${fmt(data.avgBasket)}`,
    `Best day: ${bestDay ? DAY_NAMES[bestDay.dayOfWeek] + ' $' + fmt(bestDay.revenue) : 'n/a'}, Worst day: ${worstDay ? DAY_NAMES[worstDay.dayOfWeek] + ' $' + fmt(worstDay.revenue) : 'n/a'}`,
    `Top products by revenue: ${topByRev || 'none'}`,
    `Top products by volume: ${topByVol || 'none'}`,
    `Peak hours: ${peakStr}`,
    `Payment split: ${pmStr || 'no data'}`,
    `Suspicious flags: ${data.suspiciousTransactions.length} (${flagTypes || 'none'})`,
    `Register closures: ${data.shiftClosures.length} shifts, max variance $${(Math.abs(maxVar) / 100).toFixed(2)}`,
    `Estimated gross margin: ${margin}`,
  ].join('\n')
}

export async function generateWeeklyNarrative(
  data: WeeklyReportData,
  business: BusinessRow,
): Promise<WeeklyNarrative> {
  let businessContext = buildContext(data, business)

  // Invoice intelligence — roll cash-flow into the weekly narrative.
  try {
    const { getInvoiceStats, formatInvoiceBriefingBlock } = await import('@/lib/aria/invoice-intelligence')
    const invStats = await getInvoiceStats(supabaseAdmin, business.id)
    businessContext += '\n' + formatInvoiceBriefingBlock(invStats) +
      '\n(If overdue value is rising, call it out as a trend to watch — e.g. "invoice overdue value up vs last week".)'
  } catch (e) { console.error('[weekly-ai] invoice stats failed:', (e as Error).message) }

  // Loyalty counters — only once a program is configured.
  try {
    const { getLoyaltyStats, hasLoyaltySignal } = await import('@/lib/aria/loyalty-intelligence')
    const ls = await getLoyaltyStats(supabaseAdmin, business.id)
    if (hasLoyaltySignal(ls)) {
      businessContext += `\nLOYALTY: ${ls.members} members (${ls.newMembers30d} new in 30d), ${ls.redemptions30d} redemptions in 30d, ${ls.pointsOutstanding} points outstanding.`
    }
  } catch (e) { console.error('[weekly-ai] loyalty stats failed:', (e as Error).message) }

  // ── Aria Council (3-brain deliberation) ───────────────────────────────────
  const council = await runAriaCouncil(businessContext, business.id, 'weekly_report')

  // Fire-and-forget council run log
  void insertCouncilRun(business.id, 'weekly_report', council, false)

  // ── Targeted promo call (Sonnet — generative, not council) ─────────────
  const peakBucket = [...data.hourlyBuckets].sort((a, b) => b.transactions - a.transactions)[0]
  const promoContext = [
    `Business: ${business.trading_name ?? business.name}, industry: ${business.industry ?? 'retail'}`,
    `Week revenue: $${(Number(data.totalRevenue) || 0).toFixed(2)}, transactions: ${data.totalTransactions}`,
    `Peak time: ${peakBucket ? DAY_NAMES[peakBucket.dayOfWeek] + ' ' + peakBucket.hour + ':00' : 'unknown'}`,
    `Top revenue products: ${data.topProductsByRevenue.slice(0, 3).map(p => p.productName).join(', ')}`,
    `Revenue trend vs prior week: ${data.revenueChangePercent != null ? data.revenueChangePercent.toFixed(1) + '%' : 'unknown'}`,
  ].join('\n')

  let promoRecs: PromoRecommendation[] = []
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let promoInputTokens = 0, promoOutputTokens = 0, promoSuccess = false
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      temperature: 0.5,
      system: 'You are a retail/cafe promotions expert for Australian small businesses. Return ONLY valid JSON, no preamble, no code fences.',
      messages: [{
        role: 'user',
        content: `Based on this week's data, suggest exactly 3 specific promo ideas tied to the actual peak times and top products. Return ONLY:\n[{"title":"...","mechanic":"...","timing":"...","expected_impact":"...","urgency":"high|medium|low"}]\n\nData:\n${promoContext}`,
      }],
    })
    promoInputTokens = res.usage.input_tokens
    promoOutputTokens = res.usage.output_tokens
    const text = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('')
    const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const s = clean.indexOf('['), e = clean.lastIndexOf(']')
    if (s >= 0 && e > s) {
      const parsed = JSON.parse(clean.slice(s, e + 1)) as PromoRecommendation[]
      if (Array.isArray(parsed)) { promoRecs = parsed.slice(0, 3); promoSuccess = true }
    }
  } catch (e) { console.error('[weekly-ai] promo call failed:', (e as Error).message) }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: business.id, agent_key: 'weekly_promos', provider: 'anthropic',
        model_id: 'claude-sonnet-4-5-20250929', role: 'promo',
        input_tokens: promoInputTokens, output_tokens: promoOutputTokens, success: promoSuccess,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  })()

  // ── Suspicious summary paragraph ─────────────────────────────────────────
  let suspiciousSummary: string | null = null
  if (data.suspiciousTransactions.length > 0) {
    const types = [...new Set(data.suspiciousTransactions.map(f => f.flagReason))]
    suspiciousSummary = `${data.suspiciousTransactions.length} transaction${data.suspiciousTransactions.length > 1 ? 's were' : ' was'} flagged this week across ${types.length} rule type${types.length > 1 ? 's' : ''}: ${types.join(', ')}. Review the transactions table below and investigate any that seem unusual.`
  }

  return {
    executive_summary: council?.final_briefing ?? '',
    high_confidence_insights: council?.consensus ?? [],
    split_decisions: (council?.contested ?? []) as unknown as SplitDecision[],
    promo_recommendations: promoRecs,
    suspicious_summary: suspiciousSummary,
    council_meta: council?.meta ?? { brains_succeeded: 0, brains_failed: 0, synthesis_succeeded: false, fell_back: true, duration_ms: 0 },
  }
}
