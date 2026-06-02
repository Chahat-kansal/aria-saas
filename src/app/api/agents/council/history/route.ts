export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ sessions: [], total_revenue_attributed: 0, total_cost_saved: 0 })

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '30'), 90)

  const { data: sessions } = await supabaseAdmin
    .from('agent_council_sessions')
    .select('*')
    .eq('business_id', biz.id)
    .eq('status', 'complete')
    .order('session_date', { ascending: false })
    .limit(limit)

  const sessionIds = (sessions ?? []).map((s: Record<string, unknown>) => String(s.id))

  let proposalsBySession: Record<string, unknown[]> = {}
  if (sessionIds.length > 0) {
    const { data: allProposals } = await supabaseAdmin
      .from('agent_council_proposals')
      .select('*')
      .in('session_id', sessionIds)
    for (const p of allProposals ?? []) {
      const sid = String((p as Record<string, unknown>).session_id)
      if (!proposalsBySession[sid]) proposalsBySession[sid] = []
      proposalsBySession[sid].push(p)
    }
  }

  const enriched = (sessions ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    proposals: proposalsBySession[String(s.id)] ?? [],
  }))

  const totalRevenue = (sessions ?? []).reduce((sum: number, s: Record<string, unknown>) =>
    sum + Number(s.actual_revenue_impact ?? s.projected_revenue_impact ?? 0), 0)
  const totalCostSaved = (sessions ?? []).reduce((sum: number, s: Record<string, unknown>) =>
    sum + Number(s.projected_cost_saving ?? 0), 0)

  return NextResponse.json({
    sessions: enriched,
    total_revenue_attributed: Math.round(totalRevenue * 100) / 100,
    total_cost_saved: Math.round(totalCostSaved * 100) / 100,
  })
}

export const GET = withErrorCapture('agents/council/history', _GET)
