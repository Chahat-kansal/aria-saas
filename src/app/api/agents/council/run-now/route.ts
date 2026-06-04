export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runCouncilSession } from '@/lib/agents/council'

// TEMPORARY diagnostic route — authenticated by the user's own session.
// Runs the agent council for the user's active business and returns a
// per-agent decision/proposal breakdown. REMOVE after verification.
export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No active business' }, { status: 404 })

  // Clear today's session so the run is not skipped by the "already ran" guard.
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await supabaseAdmin.from('agent_council_sessions')
    .select('id').eq('business_id', biz.id).eq('session_date', today).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('agent_council_proposals').delete().eq('session_id', existing.id)
    await supabaseAdmin.from('agent_council_sessions').delete().eq('id', existing.id)
  }

  const started = Date.now()
  let session: any = null
  let runError: string | null = null
  try {
    session = await runCouncilSession(biz.id)
  } catch (e: any) {
    runError = e?.message ?? String(e)
  }

  // Read back what actually landed in the DB, grouped by agent.
  let proposalsByAgent: Record<string, number> = {}
  let decisionsByAgent: Record<string, number> = {}
  let totalProposals = 0
  let totalDecisions = 0
  try {
    const { data: sess } = await supabaseAdmin.from('agent_council_sessions')
      .select('id').eq('business_id', biz.id).eq('session_date', today).maybeSingle()
    if (sess) {
      const { data: props } = await supabaseAdmin.from('agent_council_proposals')
        .select('agent_type').eq('session_id', sess.id)
      for (const p of props ?? []) {
        proposalsByAgent[p.agent_type] = (proposalsByAgent[p.agent_type] ?? 0) + 1
        totalProposals++
      }
    }
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: decs } = await supabaseAdmin.from('agent_decisions')
      .select('agent_type').eq('business_id', biz.id).gte('created_at', since)
    for (const d of decs ?? []) {
      decisionsByAgent[d.agent_type] = (decisionsByAgent[d.agent_type] ?? 0) + 1
      totalDecisions++
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    business: biz.name,
    ran_ms: Date.now() - started,
    run_error: runError,
    session_status: session?.session?.status ?? session?.status ?? null,
    agent_errors: session?.agent_errors ?? session?.errors ?? [],
    total_decisions: totalDecisions,
    total_proposals: totalProposals,
    decisions_by_agent: decisionsByAgent,
    proposals_by_agent: proposalsByAgent,
  })
}
