import { supabaseAdmin } from '@/lib/supabase-admin'

// HEALTH-SIGNALS-1 — diagnostic FACTS so Aria reasons about system state instead of inferring
// "POS broken" from low revenue. These are the verifiable signals; known_unknowns is the explicit
// list of what Aria CANNOT verify (so it asks rather than asserts). No prompt rules — just facts.

export interface PosHealth {
  status: 'OK' | 'DEGRADED' | 'NO_DATA'
  payment_coverage_pct: number | null
  last_sale_recorded_at: string | null
  last_sync_at: string | null
  hours_since_last_sale: number | null
  completed_sales_7d: number
  reasoning: string
}

export interface DayOfWeekContext {
  today_dow: string
  today_baseline_revenue: number | null
  today_baseline_rank: number | null // 1 = best day, 7 = worst
  actual_revenue_so_far: number
  deviation_from_baseline_pct: number | null
  reasoning: string
}

export interface DataFreshness {
  last_pos_sync_at: string | null
  last_action_executed_at: string | null
  stale_signals_count: number
  reasoning: string
}

export interface HealthSignals {
  pos_health: PosHealth
  day_of_week_context: DayOfWeekContext
  weather_context: { available: false; reason: string } | { available: true; conditions_today: string; historical_rainy_day_revenue_avg: number | null; historical_clear_day_revenue_avg: number | null; rain_factor: number | null; reasoning: string }
  data_freshness: DataFreshness
  known_unknowns: string[]
  computed_at: string
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// created_at is UTC timestamptz; +10h ≈ AEST for day/DOW bucketing (fixed offset, matches date-au).
function aestParts(iso: string): { dateKey: string; dow: number } {
  const a = new Date(new Date(iso).getTime() + 10 * 3600000)
  return { dateKey: a.toISOString().slice(0, 10), dow: a.getUTCDay() }
}

const KNOWN_UNKNOWNS: string[] = [
  'Whether the shop was physically open today',
  'Whether staff were present',
  'Whether there was a local event, closure, or disruption',
  'Whether a payment provider had an outage today',
  'Whether marketing/promo was running',
]

export async function computeHealthSignals(businessId: string): Promise<HealthSignals> {
  const now = Date.now()
  const since7d = new Date(now - 7 * 86400000).toISOString()
  const since56d = new Date(now - 56 * 86400000).toISOString()
  const todayAest = new Date(now + 10 * 3600000)
  const todayDow = todayAest.getUTCDay()
  const todayKey = todayAest.toISOString().slice(0, 10)

  const [covRes, lastSaleRes, sales56Res, lastActionRes] = await Promise.all([
    supabaseAdmin.rpc('wh_payments_coverage', { p_business_id: businessId, p_since: since7d }).then(r => r, () => ({ data: null })),
    supabaseAdmin.from('pos_sales').select('created_at').eq('business_id', businessId).eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle().then(r => r, () => ({ data: null })),
    supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).eq('status', 'completed').gte('created_at', since56d).then(r => r, () => ({ data: null })),
    supabaseAdmin.from('aria_actions').select('updated_at').eq('business_id', businessId).eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle().then(r => r, () => ({ data: null })),
  ])

  // ── pos_health ───────────────────────────────────────────────────────────
  const covRow = (covRes.data as Array<{ total_sales: number; paid_sales: number }> | null)?.[0]
  const completed7 = covRow ? Number(covRow.total_sales) : 0
  const paid7 = covRow ? Number(covRow.paid_sales) : 0
  const coveragePct = completed7 > 0 ? +((paid7 / completed7) * 100).toFixed(1) : null
  const lastSaleAt = (lastSaleRes.data as { created_at?: string } | null)?.created_at ?? null
  const hoursSinceLastSale = lastSaleAt ? +((now - new Date(lastSaleAt).getTime()) / 3600000).toFixed(1) : null

  let posStatus: PosHealth['status']
  let posReason: string
  if (completed7 < 5) {
    posStatus = 'NO_DATA'
    posReason = `Only ${completed7} completed sales in the last 7 days — too small a sample to draw any POS-health conclusion. Low revenue here does NOT imply a broken POS.`
  } else if (completed7 >= 10 && coveragePct != null && coveragePct < 95) {
    posStatus = 'DEGRADED'
    posReason = `Payment coverage is ${coveragePct}% on ${completed7} completed sales (≥10 sample) — below the 95% healthy threshold. Worth investigating payment recording.`
  } else if (coveragePct != null && coveragePct >= 95 && (hoursSinceLastSale == null || hoursSinceLastSale < 48)) {
    posStatus = 'OK'
    posReason = `${coveragePct}% payment coverage on ${completed7} completed sales; last sale ${hoursSinceLastSale != null ? hoursSinceLastSale + 'h ago' : 'unknown'} — POS is healthy.`
  } else {
    posStatus = 'OK'
    posReason = `${coveragePct != null ? coveragePct + '% payment coverage on ' + completed7 + ' completed sales' : completed7 + ' completed sales'}${hoursSinceLastSale != null && hoursSinceLastSale >= 48 ? `; quiet (last sale ${hoursSinceLastSale}h ago)` : ''} — no evidence of a POS fault. Quiet trade is not a system failure.`
  }

  const pos_health: PosHealth = {
    status: posStatus,
    payment_coverage_pct: coveragePct,
    last_sale_recorded_at: lastSaleAt,
    last_sync_at: lastSaleAt, // no dedicated sync column on pos_sales; newest recorded sale is the freshness proxy
    hours_since_last_sale: hoursSinceLastSale,
    completed_sales_7d: completed7,
    reasoning: posReason,
  }

  // ── day_of_week_context ──────────────────────────────────────────────────
  const rows56 = (sales56Res.data ?? []) as Array<{ total_amount: number | null; created_at: string }>
  const dayAgg = new Map<string, { tot: number; dow: number }>()
  for (const r of rows56) {
    const { dateKey, dow } = aestParts(r.created_at)
    const cur = dayAgg.get(dateKey) ?? { tot: 0, dow }
    cur.tot += Number(r.total_amount ?? 0); dayAgg.set(dateKey, cur)
  }
  const dowSums = new Map<number, { tot: number; days: number }>()
  let actualToday = 0
  for (const [dateKey, agg] of dayAgg.entries()) {
    if (dateKey === todayKey) { actualToday = agg.tot; continue } // today excluded from its own baseline
    const cur = dowSums.get(agg.dow) ?? { tot: 0, days: 0 }
    cur.tot += agg.tot; cur.days += 1; dowSums.set(agg.dow, cur)
  }
  const dowAvgs: Array<{ dow: number; avg: number }> = []
  for (const [dow, s] of dowSums.entries()) dowAvgs.push({ dow, avg: s.days > 0 ? s.tot / s.days : 0 })
  dowAvgs.sort((a, b) => b.avg - a.avg) // best first
  const todayBaseline = dowSums.get(todayDow) && dowSums.get(todayDow)!.days > 0
    ? +(dowSums.get(todayDow)!.tot / dowSums.get(todayDow)!.days).toFixed(2) : null
  const todayRank = todayBaseline != null ? (dowAvgs.findIndex(d => d.dow === todayDow) + 1) || null : null
  const deviationPct = (todayBaseline != null && todayBaseline > 0)
    ? +(((actualToday - todayBaseline) / todayBaseline) * 100).toFixed(1) : null
  const day_of_week_context: DayOfWeekContext = {
    today_dow: DOW_NAMES[todayDow],
    today_baseline_revenue: todayBaseline,
    today_baseline_rank: todayRank,
    actual_revenue_so_far: +actualToday.toFixed(2),
    deviation_from_baseline_pct: deviationPct,
    reasoning: todayBaseline != null
      ? `${DOW_NAMES[todayDow]} averages $${todayBaseline.toFixed(2)} historically${todayRank ? ` (rank ${todayRank}/${dowAvgs.length} by revenue)` : ''}. Today's $${actualToday.toFixed(2)} is ${deviationPct != null ? deviationPct + '% vs that baseline' : 'within range'}.`
      : `Not enough ${DOW_NAMES[todayDow]} history in the last 56 days to set a baseline.`,
  }

  // ── weather_context (table not yet implemented — mark unavailable, never block) ──
  let weather_context: HealthSignals['weather_context'] = { available: false, reason: 'weather_history not yet implemented' }
  try {
    const { error: whErr } = await supabaseAdmin.from('weather_history').select('id', { head: true, count: 'exact' }).eq('business_id', businessId).limit(1)
    if (whErr) weather_context = { available: false, reason: 'weather_history not yet implemented' }
    // If the table exists in future, populate the rainy/clear averages here. Until then: unavailable.
  } catch { /* table absent — stays unavailable */ }

  // ── data_freshness ───────────────────────────────────────────────────────
  const lastActionAt = (lastActionRes.data as { updated_at?: string } | null)?.updated_at ?? null
  const data_freshness: DataFreshness = {
    last_pos_sync_at: lastSaleAt,
    last_action_executed_at: lastActionAt,
    stale_signals_count: 0,
    reasoning: lastSaleAt
      ? `Newest recorded sale ${hoursSinceLastSale != null ? hoursSinceLastSale + 'h ago' : 'unknown'}; last executed action ${lastActionAt ? new Date(lastActionAt).toISOString().slice(0, 10) : 'none'}.`
      : 'No completed sales recorded — cannot assess data freshness.',
  }

  return {
    pos_health,
    day_of_week_context,
    weather_context,
    data_freshness,
    known_unknowns: KNOWN_UNKNOWNS,
    computed_at: new Date().toISOString(),
  }
}
