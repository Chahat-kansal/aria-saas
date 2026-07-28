export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { getLabourRealtime } from '@/lib/aria/labour-realtime'
import { todayAEST, toAESTStart } from '@/lib/date-au'
import { listOwnerDecisions } from '@/lib/owner-app/decisions'

// OWNER-APP PH-1 — Today screen's aggregates. GROUNDING-TEETH: every figure traces to a real
// canonical source, never recomputed/invented here:
//   sales / covers  -> getRevenueSnapshot() (the ONE canonical "revenue for a calendar day"
//                       source, RULE 6: status='completed', AEST day boundary). transaction_count
//                       stands in for "covers" (no literal per-head covers count exists anywhere
//                       in this schema) — an honest proxy, documented as such, not a real covers figure.
//   labour %        -> getLabourRealtime() (shared with api/agents/labour/realtime, same math)
//   who's on shift  -> getLabourRealtime().active_staff_names (pos_timesheets clock_out is null)
//   exceptions      -> profit_leaks where status='detected' (the same "what's off" signal
//                       dashboard/stats/route.ts already reads) — empty array renders the honest
//                       empty-state, never a fabricated exception
//   handled today   -> aria_autopilot_actions resolved today (AEST), status in (approved,rejected)
//   waiting decisions -> the same registry the Decisions tab reads (listOwnerDecisions)
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const today = todayAEST()
  const midnight = toAESTStart(today)

  const [snapshot, labour, waiting, leaksRes, handledRes] = await Promise.all([
    getRevenueSnapshot(business_id, today),
    getLabourRealtime(business_id),
    listOwnerDecisions(supabase, business_id, { status: 'waiting', domain: 'all' }),
    supabase.from('profit_leaks').select('id, title, description, monthly_loss')
      .eq('business_id', business_id).eq('status', 'detected').order('monthly_loss', { ascending: false }).limit(10),
    supabase.from('aria_autopilot_actions').select('id', { count: 'exact', head: true })
      .eq('business_id', business_id).in('status', ['approved', 'rejected']).gte('resolved_at', midnight),
  ])

  return NextResponse.json({
    sales: snapshot.revenue,
    covers: snapshot.transaction_count,
    labour_pct: labour.labour_pct,
    active_staff_names: labour.active_staff_names,
    handled_today: handledRes.count ?? 0,
    exceptions: (leaksRes.data ?? []).map(l => ({ id: l.id, title: l.title, description: l.description, monthly_loss: l.monthly_loss })),
    top_decisions: waiting.slice(0, 3),
    waiting_count: waiting.length,
  })
}

export const GET = withErrorCapture('owner/today', _GET)
