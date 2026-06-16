import { supabaseAdmin } from '@/lib/supabase-admin'

// AM-1 — OWNER BEHAVIOUR patterns derived from activity_log (when the owner works, what they do
// most). Distinct from aria_business_memory (I3 data/chat patterns), aria_agent_memory (LRN-1
// automation outcomes) and aria_advice_weights (I4). Pure SQL aggregation — no AI, no invented
// numbers. Surfaced to groundTruth so Aria adapts timing/tone; cached in aria_signal_cache.

const MIN_SAMPLE = 20            // RULE 5: fewer owner actions than this = no confident pattern
const WINDOW_DAYS = 90
const TTL_MS = 24 * 3600 * 1000
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export interface OwnerPattern {
  available: boolean
  reason?: string
  sample_size: number
  window_days: number
  peak_hours: Array<{ hour: string; count: number }>
  peak_daypart: string
  busiest_day: string | null
  top_actions: Array<{ action_type: string; count: number; pct: number }>
  reasoning: string
  computed_at: string
}

// created_at is UTC timestamptz; +10h ≈ AEST for hour/day bucketing (matches the I1 convention).
function aestHour(iso: string): number { return new Date(new Date(iso).getTime() + 10 * 3600000).getUTCHours() }
function aestDow(iso: string): number { return new Date(new Date(iso).getTime() + 10 * 3600000).getUTCDay() }
function hourLabel(h: number): string { return (h % 12 || 12) + (h < 12 ? 'am' : 'pm') }
function daypart(h: number): string { return h < 6 ? 'overnight' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening' }

export async function computeOwnerPatterns(businessId: string): Promise<OwnerPattern> {
  const now = new Date().toISOString()
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString()
  const { data } = await supabaseAdmin
    .from('activity_log')
    .select('action_type, created_at')
    .eq('business_id', businessId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  const sample = ((data ?? []) as Array<{ action_type: string | null; created_at: string | null }>)
    .filter(r => r.created_at)

  if (sample.length < MIN_SAMPLE) {
    return {
      available: false,
      reason: `Only ${sample.length} owner actions in the last ${WINDOW_DAYS} days — too few to infer a reliable pattern.`,
      sample_size: sample.length, window_days: WINDOW_DAYS,
      peak_hours: [], peak_daypart: '', busiest_day: null, top_actions: [],
      reasoning: 'Insufficient owner activity for a confident behaviour pattern.', computed_at: now,
    }
  }

  const hourCounts = new Array(24).fill(0) as number[]
  const dowCounts = new Array(7).fill(0) as number[]
  const dpCounts: Record<string, number> = {}
  const actionCounts: Record<string, number> = {}
  for (const r of sample) {
    const h = aestHour(r.created_at!)
    hourCounts[h]++
    dpCounts[daypart(h)] = (dpCounts[daypart(h)] ?? 0) + 1
    dowCounts[aestDow(r.created_at!)]++
    const a = r.action_type ?? 'unknown'
    actionCounts[a] = (actionCounts[a] ?? 0) + 1
  }

  const total = sample.length
  const peak_hours = hourCounts
    .map((count, h) => ({ hour: hourLabel(h), count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  const peak_daypart = Object.entries(dpCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const busiestDow = dowCounts.map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c)[0]
  const busiest_day = busiestDow && busiestDow.c > 0 ? DOW[busiestDow.i] : null
  const top_actions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action_type, count]) => ({ action_type, count, pct: Math.round((count / total) * 1000) / 10 }))

  const reasoning = `Over the last ${WINDOW_DAYS} days this owner is most active in the ${peak_daypart}`
    + ` (peak around ${peak_hours.map(p => p.hour).join(', ')})${busiest_day ? `, busiest on ${busiest_day}` : ''}.`
    + ` Most-frequent actions: ${top_actions.map(a => `${a.action_type} (${a.pct}%)`).join(', ')}.`
    + ` ${total} owner actions sampled — adapt timing/tone to this; never invent owner-behaviour figures.`

  return { available: true, sample_size: total, window_days: WINDOW_DAYS, peak_hours, peak_daypart, busiest_day, top_actions, reasoning, computed_at: now }
}

// Generic cache-first read + idempotent refresh for a per-business pattern signal in
// aria_signal_cache. Shared by AM-1 (owner_pattern) and AM-2 (customer_pattern) so the caching
// machinery exists once: read the freshest non-expired row; on miss/expiry recompute, delete any
// prior rows for this (business_id, signal_type) then insert the fresh one (refresh never duplicates).
export async function getOrRefreshSignalPattern<T>(
  businessId: string,
  signalType: string,
  ttlMs: number,
  compute: (bid: string) => Promise<T>,
): Promise<T | null> {
  try {
    const { data: cached } = await supabaseAdmin
      .from('aria_signal_cache')
      .select('payload')
      .eq('business_id', businessId)
      .eq('signal_type', signalType)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cached?.payload) return cached.payload as T

    const result = await compute(businessId)
    await supabaseAdmin.from('aria_signal_cache')
      .delete().eq('business_id', businessId).eq('signal_type', signalType)
    await supabaseAdmin.from('aria_signal_cache').insert({
      business_id: businessId,
      signal_type: signalType,
      cache_key: signalType,
      payload: result as unknown as Record<string, unknown>,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    })
    return result
  } catch {
    return null
  }
}

// Cache-first owner pattern (aria_signal_cache 'owner_pattern', 24h TTL), via the shared helper.
export async function getOrRefreshOwnerPattern(businessId: string): Promise<OwnerPattern | null> {
  return getOrRefreshSignalPattern(businessId, 'owner_pattern', TTL_MS, computeOwnerPatterns)
}
