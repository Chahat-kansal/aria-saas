import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST } from '@/lib/date-au'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'

export interface LabourRealtime {
  labour_pct: number
  active_staff_count: number
  active_staff_names: string[]
  cost_so_far: number
  revenue_today: number
  threshold_pct: number
  target_pct: number
  over_threshold: boolean
}

// OWNER-APP PH-1 — extracted from api/agents/labour/realtime/route.ts (zero behavior change to
// that route, same math) so the owner-app's Today screen can read the same real-time labour%
// this app already computes elsewhere, instead of a second, driftable copy of the same query.
// Extended with active_staff_names (staff_members.first_name/last_name — RULE 6: no `name` column
// on staff_members) for the "<name> has the counter" line — the existing route never needed names,
// only a count.
export async function getLabourRealtime(businessId: string): Promise<LabourRealtime> {
  const now = new Date()

  const [activeStaffRes, snapshot, settingsRes] = await Promise.all([
    supabaseAdmin
      .from('pos_timesheets')
      .select('clock_in,staff_member_id,staff_members(first_name,last_name,hourly_rate,pay_rate_cents)')
      .eq('business_id', businessId)
      .is('clock_out', null),
    // OWNER-APP PH-1 — was a hand-rolled pos_sales sum here (caught by canon-rail-guard's ad-hoc-
    // revenue-sum rule on push). Uses the canonical getRevenueSnapshot() instead — the same source
    // the owner-app's own Today screen uses for its SALES stat, so the two numbers (sales, and
    // labour% which divides by this same revenue figure) can never drift apart from each other.
    getRevenueSnapshot(businessId, todayAEST()),
    supabaseAdmin
      .from('agent_settings')
      .select('config')
      .eq('business_id', businessId)
      .eq('agent_type', 'labour_optimisation')
      .maybeSingle(),
  ])

  const cfg = (settingsRes.data?.config as Record<string, unknown>) ?? {}
  const threshold = Number(cfg.labour_pct_threshold ?? 38)
  const targetPct = Number(cfg.target_labour_pct ?? 30)

  const nowSec = now.getTime() / 1000
  let labourCostSoFar = 0
  const activeStaff = activeStaffRes.data ?? []
  const names: string[] = []
  for (const ts of activeStaff) {
    if (!ts.clock_in) continue
    const hoursElapsed = (nowSec - new Date(ts.clock_in).getTime() / 1000) / 3600
    const sm = (ts as { staff_members?: { first_name?: string; last_name?: string; hourly_rate?: number; pay_rate_cents?: number } }).staff_members
    const rateCents = sm?.pay_rate_cents ?? (sm?.hourly_rate ? Math.round(Number(sm.hourly_rate) * 100) : 2500)
    labourCostSoFar += hoursElapsed * (rateCents / 100)
    if (sm?.first_name) names.push([sm.first_name, sm.last_name].filter(Boolean).join(' '))
  }
  const revenueToday = snapshot.revenue
  const labourPct = revenueToday > 0 ? (labourCostSoFar / revenueToday) * 100 : 0

  return {
    labour_pct: Math.round(labourPct * 10) / 10,
    active_staff_count: activeStaff.length,
    active_staff_names: names,
    cost_so_far: Math.round(labourCostSoFar * 100) / 100,
    revenue_today: Math.round(revenueToday * 100) / 100,
    threshold_pct: threshold,
    target_pct: targetPct,
    over_threshold: labourPct > threshold,
  }
}
