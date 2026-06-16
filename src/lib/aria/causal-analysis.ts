import { supabaseAdmin } from '@/lib/supabase-admin'

// I12 CAUSAL Part 2 — probabilistic causal inference. For an event at time T we compare the 14-day
// revenue AFTER T to the 14 days BEFORE, then scale that observed change by the business's own
// baseline weekly volatility (std-dev of weekly revenue deltas over the last 12 weeks). A change far
// larger than normal week-to-week noise gets a high p_caused; a change within the noise floor does
// not. Co-occurring events in the window share credit by recency. No external deps — SQL + sigmoid.

export interface AlternativeExplanation {
  event_id: string
  event_type: string
  title: string
  days_from_event: number
  credit_pct: number
}

export interface CausalHypothesis {
  event_id: string
  event_type: string
  observed_delta_cents: number
  pre_revenue_cents: number
  post_revenue_cents: number
  baseline_volatility_cents: number
  post_window_complete: boolean
  p_caused_pct: number
  alternative_explanations: AlternativeExplanation[]
  reasoning: string
}

function dollarsToCents(d: number): number { return Math.round(d * 100) }
// sigmoid centred so |delta| == 1 std-dev of weekly noise → ~0.5; larger ratios approach 1.
function pCaused(ratio: number): number {
  const p = 1 / (1 + Math.exp(-(ratio - 1)))
  return Math.max(0, Math.min(1, p))
}

export async function analyzeEvent(eventId: string): Promise<CausalHypothesis | null> {
  const { data: ev } = await supabaseAdmin
    .from('intelligence_events')
    .select('id, business_id, event_type, title, triggered_at')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev || !ev.business_id || !ev.triggered_at) return null

  const businessId = ev.business_id as string
  const T = new Date(ev.triggered_at as string)
  const now = new Date()
  const preStart = new Date(T.getTime() - 14 * 86400000)
  const postEnd = new Date(T.getTime() + 14 * 86400000)
  const effectivePostEnd = postEnd > now ? now : postEnd
  const postWindowComplete = postEnd <= now
  const volStart = new Date(T.getTime() - 84 * 86400000) // 12 weeks before T

  const [preRes, postRes, volRes, coRes] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status', 'completed')
      .gte('created_at', preStart.toISOString()).lt('created_at', T.toISOString()),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status', 'completed')
      .gte('created_at', T.toISOString()).lt('created_at', effectivePostEnd.toISOString()),
    supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).eq('status', 'completed')
      .gte('created_at', volStart.toISOString()).lt('created_at', T.toISOString()),
    // co-occurring events in [T-14d, T+14d], excluding self
    supabaseAdmin.from('intelligence_events').select('id, event_type, title, triggered_at')
      .eq('business_id', businessId).neq('id', eventId)
      .gte('triggered_at', preStart.toISOString()).lte('triggered_at', postEnd.toISOString()),
  ])

  const sum = (rows: Array<{ total_amount: number | null }> | null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const preRev = sum(preRes.data as Array<{ total_amount: number | null }>)
  const postRevRaw = sum(postRes.data as Array<{ total_amount: number | null }>)
  // If the post window is partial, scale to a comparable 14-day figure so the delta is fair.
  const postDays = Math.max(1, (effectivePostEnd.getTime() - T.getTime()) / 86400000)
  const postRev = postWindowComplete ? postRevRaw : postRevRaw * (14 / postDays)
  const observedDeltaCents = dollarsToCents(postRev - preRev)

  // baseline volatility: std-dev of week-over-week revenue DELTAS across the prior 12 weeks
  const volRows = (volRes.data ?? []) as Array<{ total_amount: number | null; created_at: string }>
  const weekly = new Map<number, number>()
  for (const r of volRows) {
    const wk = Math.floor((T.getTime() - new Date(r.created_at).getTime()) / (7 * 86400000))
    weekly.set(wk, (weekly.get(wk) ?? 0) + Number(r.total_amount ?? 0))
  }
  const weekTotals = [...weekly.keys()].sort((a, b) => a - b).map(k => weekly.get(k) ?? 0)
  const deltas: number[] = []
  for (let i = 1; i < weekTotals.length; i++) deltas.push(weekTotals[i] - weekTotals[i - 1])
  let volatilityCents: number
  if (deltas.length >= 2) {
    const mean = deltas.reduce((s, n) => s + n, 0) / deltas.length
    const variance = deltas.reduce((s, n) => s + (n - mean) ** 2, 0) / deltas.length
    volatilityCents = dollarsToCents(Math.sqrt(variance))
  } else {
    // too little history to know the noise floor — use the pre-window revenue as a weak proxy
    volatilityCents = dollarsToCents(Math.max(preRev * 0.25, 1))
  }

  const ratio = Math.abs(observedDeltaCents) / Math.max(volatilityCents, 1)
  const pPct = Math.round(pCaused(ratio) * 100)

  // alternatives: other events in the window share credit by recency to T (closer = more credit)
  const coEvents = (coRes.data ?? []) as Array<{ id: string; event_type: string; title: string; triggered_at: string }>
  const weighted = coEvents.map(e => {
    const days = (new Date(e.triggered_at).getTime() - T.getTime()) / 86400000
    return { e, days, w: 1 / (1 + Math.abs(days)) }
  })
  const wSum = weighted.reduce((s, x) => s + x.w, 0)
  const alternatives: AlternativeExplanation[] = weighted
    .sort((a, b) => b.w - a.w)
    .slice(0, 5)
    .map(x => ({
      event_id: x.e.id,
      event_type: x.e.event_type,
      title: x.e.title,
      days_from_event: +x.days.toFixed(1),
      credit_pct: wSum > 0 ? Math.round((x.w / wSum) * 100) : 0,
    }))

  const deltaDollars = (observedDeltaCents / 100)
  const volDollars = (volatilityCents / 100)
  const reasoning = pPct >= 60
    ? `Revenue ${deltaDollars >= 0 ? 'rose' : 'fell'} $${Math.abs(deltaDollars).toFixed(0)} in the 14 days after "${ev.title}" vs the 14 before. That move is ${ratio.toFixed(1)}× this business's normal weekly swing ($${volDollars.toFixed(0)}), so it is ${pPct}% likely linked to this event rather than ordinary noise.${alternatives.length ? ` Other events in the window could share credit: ${alternatives.slice(0, 3).map(a => `${a.event_type} (${a.credit_pct}%)`).join(', ')}.` : ''}`
    : `Revenue changed $${deltaDollars.toFixed(0)} after "${ev.title}", but that is only ${ratio.toFixed(1)}× the normal weekly swing ($${volDollars.toFixed(0)}) — within noise, so no causal claim (p=${pPct}%, below the 60% floor).${alternatives.length ? ` Co-occurring events: ${alternatives.slice(0, 3).map(a => a.event_type).join(', ')}.` : ''}`

  return {
    event_id: eventId,
    event_type: ev.event_type as string,
    observed_delta_cents: observedDeltaCents,
    pre_revenue_cents: dollarsToCents(preRev),
    post_revenue_cents: dollarsToCents(postRev),
    baseline_volatility_cents: volatilityCents,
    post_window_complete: postWindowComplete,
    p_caused_pct: pPct,
    alternative_explanations: alternatives,
    reasoning,
  }
}
