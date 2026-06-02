export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ session: null, proposals: [], pending_count: 0, auto_executed_count: 0, has_conflicts: false })

  const today = new Date().toISOString().split('T')[0]

  const { data: session } = await supabaseAdmin
    .from('agent_council_sessions')
    .select('*')
    .eq('business_id', biz.id)
    .eq('session_date', today)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ session: null, proposals: [], pending_count: 0, auto_executed_count: 0, has_conflicts: false })
  }

  const { data: proposals } = await supabaseAdmin
    .from('agent_council_proposals')
    .select('*')
    .eq('session_id', session.id)
    .order('urgency', { ascending: true })

  const sorted = (proposals ?? []).sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }
    const ua = urgencyOrder[String(a.urgency ?? 'normal')] ?? 2
    const ub = urgencyOrder[String(b.urgency ?? 'normal')] ?? 2
    if (ua !== ub) return ua - ub
    return Number(b.projected_impact_dollars ?? 0) - Number(a.projected_impact_dollars ?? 0)
  })

  const pendingCount = sorted.filter((p: Record<string, unknown>) => !p.council_decision).length
  const autoExecutedCount = sorted.filter((p: Record<string, unknown>) => p.executed_at).length
  const hasConflicts = sorted.some((p: Record<string, unknown>) =>
    Array.isArray(p.conflicts_with) && (p.conflicts_with as string[]).length > 0)

  return NextResponse.json({
    session,
    proposals: sorted,
    pending_count: pendingCount,
    auto_executed_count: autoExecutedCount,
    has_conflicts: hasConflicts,
  })
}

export const GET = withErrorCapture('agents/council', _GET)
