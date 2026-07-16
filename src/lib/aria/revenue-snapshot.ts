import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { makeProvenance, type ComputeResult } from './compute/provenance'

export interface RevenueSnapshot {
  business_id: string
  date: string
  revenue: number
  transaction_count: number
  window_start: string
  window_end: string
  computed_at: string
}

// BRIEF-INTEGRITY-1 — the ONE canonical "revenue for a calendar day" computation. Every advisor and
// the briefing anti-repetition dedup block must use this; no independent pos_sales day-boundary
// queries elsewhere in the briefing/advisor pipeline.
//
// status='completed' — verified live (2026-07-15): pos_sales.status also takes 'voided', 'draft',
// and 'refunded'. 'draft' rows are unsent/in-progress orders, not real revenue — a `!= 'voided'`
// filter (used elsewhere in this codebase, see schema-registry.ts) would silently count them.
// 'completed' is the only filter that returns real, finished sales.
//
// AEST (Australia/Melbourne) day boundaries via date-au.ts's toAESTStart/toAESTEnd — this is what
// "pulls TZ-2-LIB-FIX forward" for every caller of this function: one DST-aware boundary
// computation, not each call site doing its own (sometimes UTC, sometimes local-server-time) math.
export async function getRevenueSnapshot(businessId: string, dateStr: string): Promise<RevenueSnapshot> {
  const window_start = toAESTStart(dateStr)
  const window_end = toAESTEnd(dateStr)

  const { data, error } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', window_start)
    .lte('created_at', window_end)

  if (error) throw new Error(`getRevenueSnapshot(${businessId}, ${dateStr}): ${error.message}`)

  const rows = data ?? []
  const revenue = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  return {
    business_id: businessId,
    date: dateStr,
    revenue,
    transaction_count: rows.length,
    window_start,
    window_end,
    computed_at: new Date().toISOString(),
  }
}

// INTEL-COMPUTE-1 — extends the exact same canonical rule (status='completed', AEST boundaries)
// to an arbitrary [startDate, endDate] window, for the ~90+ "this week"/"this month"/"last N days"
// call sites the audit found reimplementing this with a divergent status filter or UTC boundary
// (BRIEF-INTEGRITY-1's `!= 'voided'` pattern, recurring). This does NOT replace getRevenueSnapshot
// (single-day callers are unaffected) — it's the same rule, generalized to a range, so a caller
// needing "this week" no longer has to hand-roll its own day-boundary math to sum several days.
export interface RangeRevenueSnapshot {
  business_id: string
  start_date: string
  end_date: string
  revenue: number
  transaction_count: number
  window_start: string
  window_end: string
  computed_at: string
}

export async function getRevenueForRange(
  businessId: string,
  startDate: string,
  endDate: string,
): Promise<RangeRevenueSnapshot> {
  const window_start = toAESTStart(startDate)
  const window_end = toAESTEnd(endDate)

  const { data, error } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', window_start)
    .lte('created_at', window_end)

  if (error) throw new Error(`getRevenueForRange(${businessId}, ${startDate}..${endDate}): ${error.message}`)

  const rows = data ?? []
  const revenue = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)

  return {
    business_id: businessId,
    start_date: startDate,
    end_date: endDate,
    revenue,
    transaction_count: rows.length,
    window_start,
    window_end,
    computed_at: new Date().toISOString(),
  }
}

export interface RevenueComparison {
  current: RangeRevenueSnapshot
  prior: RangeRevenueSnapshot
  change_pct: number
}

// INTEL-COMPUTE-1 — the fix for the "inconsistent period pairing" bug class the audit found
// repeatedly (e.g. pos-end-of-day/route.ts comparing a session-scoped "today" against a
// calendar-day-scoped 7-day average; several signal-engine.ts sites guarding a zero prior-period
// to a misleading 0% instead of reporting no baseline exists). Both periods are computed by the
// exact same getRevenueForRange() call — they can never disagree on filter or boundary logic
// the way two independently-written queries could — and a zero/missing prior period returns
// InsufficientData rather than a fabricated 0%.
export async function getRevenueComparison(
  businessId: string,
  current: { start: string; end: string },
  prior: { start: string; end: string },
): Promise<ComputeResult<RevenueComparison>> {
  const [currentSnap, priorSnap] = await Promise.all([
    getRevenueForRange(businessId, current.start, current.end),
    getRevenueForRange(businessId, prior.start, prior.end),
  ])

  const inputs = { businessId, current, prior }
  if (priorSnap.revenue <= 0) {
    return {
      ok: false,
      reason: 'No prior-period revenue to compare against (period had $0 in completed sales) — cannot compute a meaningful growth percentage.',
      provenance: makeProvenance('getRevenueComparison', '1.0.0', inputs, "status='completed', AEST boundaries, both periods via getRevenueForRange", 'derived'),
    }
  }

  const change_pct = ((currentSnap.revenue - priorSnap.revenue) / priorSnap.revenue) * 100

  return {
    ok: true,
    data: { current: currentSnap, prior: priorSnap, change_pct },
    provenance: makeProvenance('getRevenueComparison', '1.0.0', inputs, "status='completed', AEST boundaries, both periods via getRevenueForRange", 'derived'),
  }
}
