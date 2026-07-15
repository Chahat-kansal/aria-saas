import { toAESTStart, toAESTEnd } from '@/lib/date-au'
import { supabaseAdmin } from '@/lib/supabase-admin'

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
