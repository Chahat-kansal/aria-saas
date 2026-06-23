export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { guardOutput } from '@/lib/aria/ground-guard'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

  // Fetch 90 days of closed sessions with variance data
  const { data: sessions } = await supabase
    .from('pos_cash_sessions')
    .select('id, variance_cents, closed_at, closed_by, total_cash_sales, total_card_sales, opening_float')
    .eq('business_id', bid)
    .eq('status', 'closed')
    .not('variance_cents', 'is', null)
    .gte('closed_at', ninetyDaysAgo)
    .order('closed_at', { ascending: false })
    .limit(90)

  if (!sessions || sessions.length < 3) {
    return NextResponse.json({ insight: null, reason: 'insufficient_data' })
  }

  // Cross-reference with timesheets — find who was working on variance nights
  // Get all timesheets for the same date range
  const { data: timesheets } = await supabase
    .from('pos_timesheets')
    .select('staff_name, staff_id, clock_in, clock_out, pay_rate_cents')
    .eq('business_id', bid)
    .gte('clock_in', ninetyDaysAgo)
    .not('clock_out', 'is', null)

  // Build variance by day of week
  const dowVariances: Record<number, number[]> = {}
  const staffVariances: Record<string, number[]> = {}
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  for (const s of sessions) {
    if (s.variance_cents == null || !s.closed_at) continue
    const d = new Date(s.closed_at)
    const dow = d.getDay()
    if (!dowVariances[dow]) dowVariances[dow] = []
    dowVariances[dow].push(s.variance_cents)

    // Match with who was working that night
    if (timesheets) {
      const dateStr = d.toISOString().split('T')[0]
      const workingThatNight = timesheets.filter(t => {
        if (!t.clock_in) return false
        return t.clock_in.startsWith(dateStr) || (t.clock_out && t.clock_out.startsWith(dateStr))
      })
      for (const t of workingThatNight) {
        const name = t.staff_name ?? 'Unknown'
        if (!staffVariances[name]) staffVariances[name] = []
        staffVariances[name].push(s.variance_cents)
      }
    }
  }

  // Find worst DOW
  const dowSummary = Object.entries(dowVariances).map(([dow, vals]) => ({
    day: DAYS[parseInt(dow)],
    avg: Math.round(vals.reduce((a,b) => a+b, 0) / vals.length),
    count: vals.length,
    negCount: vals.filter(v => v < -200).length,
  })).sort((a,b) => a.avg - b.avg)

  // Find staff with consistent negative variance
  const staffSummary = Object.entries(staffVariances)
    .filter(([, vals]) => vals.length >= 3)
    .map(([name, vals]) => ({
      name,
      avg: Math.round(vals.reduce((a,b) => a+b, 0) / vals.length),
      count: vals.length,
      negRate: vals.filter(v => v < -200).length / vals.length,
    }))
    .sort((a,b) => a.avg - b.avg)

  // Overall stats
  const allVariances = sessions.map(s => s.variance_cents ?? 0)
  const avgVariance = Math.round(allVariances.reduce((a,b) => a+b, 0) / allVariances.length)
  const shortSessions = allVariances.filter(v => v < -200).length
  const totalShortage = allVariances.filter(v => v < 0).reduce((a,b) => a+b, 0)

  // Build structured data for Claude
  const analysisData = {
    sessions_analysed: sessions.length,
    avg_variance_cents: avgVariance,
    short_sessions: shortSessions,
    total_shortage_cents: totalShortage,
    worst_days: dowSummary.slice(0, 3),
    staff_patterns: staffSummary.slice(0, 5),
  }

  // Run Claude haiku — fast & cheap, structured output
  let insight = ''
  // aria_autopilot_actions.priority CHECK: ('urgent','important','routine')
  let priority: 'urgent' | 'important' | 'routine' = 'routine'

  try {
    const response = await trackAICall(
      { route: 'aria/cashup-intelligence', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'cash-variance-analysis' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You are Aria, an AI business advisor for an Australian retail/liquor store owner.

Analyse this cash-up variance data and write ONE clear, specific, actionable insight. Be direct — no fluff.

Data:
- ${analysisData.sessions_analysed} cash-ups analysed over 90 days
- Average variance: ${avgVariance > 0 ? '+' : ''}A$${(Math.abs(avgVariance)/100).toFixed(2)} per night
- Short sessions: ${shortSessions} of ${analysisData.sessions_analysed} (${Math.round(shortSessions/analysisData.sessions_analysed*100)}%)
- Total cumulative shortage: A$${(Math.abs(totalShortage)/100).toFixed(2)}

Day-of-week breakdown:
${dowSummary.map(d => `  ${d.day}: avg ${d.avg > 0 ? '+' : ''}A$${(Math.abs(d.avg)/100).toFixed(2)} (${d.count} closes, ${d.negCount} short)`).join('\n')}

${staffSummary.length > 0 ? 'Staff variance correlation:\n' + staffSummary.map(s => `  ${s.name}: avg ${s.avg > 0 ? '+' : ''}A$${(Math.abs(s.avg)/100).toFixed(2)} across ${s.count} closes (${Math.round(s.negRate*100)}% short)`).join('\n') : 'No staff pattern data available.'}

Write your insight in this exact JSON format:
{
  "title": "Short headline (max 8 words)",
  "body": "2-3 sentence specific finding with numbers. Tell them what to do about it.",
  "priority": "urgent|important|routine",
  "estimated_annual_impact_cents": <integer, annual cost of this pattern>
}

Only output the JSON. No markdown, no explanation.`,
        }],
      })
    )

    const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    insight = parsed.body ?? ''
    // BUGFIX-FAB-3 — guard the prose body against the REAL variance figures (all code-computed above).
    if (insight) {
      const allowed: number[] = [Math.abs(avgVariance) / 100, Math.abs(totalShortage) / 100, shortSessions, sessions.length, Math.round(shortSessions / sessions.length * 100)]
      for (const d of dowSummary) allowed.push(Math.abs(d.avg) / 100, d.count, d.negCount)
      for (const s of staffSummary) allowed.push(Math.abs(s.avg) / 100, s.count, Math.round(s.negRate * 100))
      insight = (await guardOutput(insight, allowed, { mode: 'strip', businessId: bid, surface: 'cashup-intelligence' })).text
    }
    const rawPriority: string = parsed.priority ?? ''
    priority = rawPriority === 'high' || rawPriority === 'urgent' ? 'urgent'
      : rawPriority === 'medium' || rawPriority === 'important' ? 'important'
      : 'routine'

    // Write to aria_autopilot_actions so it shows up in the autopilot dashboard
    if (insight) {
      await supabase.from('aria_autopilot_actions').insert({
        business_id: bid,
        category: 'cashflow',
        priority,
        title: parsed.title ?? 'Cash variance pattern detected',
        description: insight,
        action_data: { type: 'cash_variance_analysis', data: analysisData },
        estimated_impact: parsed.estimated_annual_impact_cents > 0
          ? 'A$' + Math.round(parsed.estimated_annual_impact_cents / 100).toLocaleString() + '/year recoverable'
          : null,
        status: 'pending',
      })
    }

    return NextResponse.json({
      insight,
      priority,
      title: parsed.title,
      estimated_impact_cents: parsed.estimated_annual_impact_cents,
      analysis: analysisData,
    })
  } catch {
    // Fallback: rule-based insight without Claude
    const worstDay = dowSummary[0]
    const fallback = worstDay && worstDay.negCount >= 2
      ? `Your ${worstDay.day} closes average ${worstDay.avg < 0 ? '-' : '+'}A$${(Math.abs(worstDay.avg)/100).toFixed(2)} variance. Over ${shortSessions} nights short in 90 days — add a double-count procedure on ${worstDay.day} closes.`
      : `${shortSessions} of ${sessions.length} cash-ups were short in the last 90 days. Total cumulative shortage: A$${(Math.abs(totalShortage)/100).toFixed(2)}.`
    return NextResponse.json({ insight: fallback, priority: 'routine', analysis: analysisData })
  }
}

export const POST = withErrorCapture('aria/cashup-intelligence', _POST)
