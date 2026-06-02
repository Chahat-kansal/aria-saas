export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { executeProposal } from '@/lib/agents/council-executor'
import type { AgentCouncilProposal } from '@/lib/agents/types'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { decision?: string; note?: string }
  const { decision, note } = body

  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be approved or rejected' }, { status: 400 })
  }

  // Verify ownership via session → business
  const { data: proposal } = await supabaseAdmin
    .from('agent_council_proposals')
    .select('*, agent_council_sessions(business_id)')
    .eq('id', params.id)
    .maybeSingle()

  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const businessId = (proposal.agent_council_sessions as Record<string, unknown> | null)?.business_id as string
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let executed = false
  let outcome: Record<string, unknown> = {}

  if (decision === 'approved') {
    await supabaseAdmin
      .from('agent_council_proposals')
      .update({ council_decision: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', params.id)

    const result = await executeProposal(proposal as AgentCouncilProposal, supabaseAdmin)
    executed = result.success
    outcome = result.outcome

    await supabaseAdmin
      .from('agent_council_proposals')
      .update({ executed_at: result.success ? new Date().toISOString() : null, outcome_data: outcome })
      .eq('id', params.id)

    if (result.success) {
      await supabaseAdmin
        .from('agent_council_sessions')
        .update({ executed_actions: supabaseAdmin.rpc('increment', { x: 1 }) as unknown as number })
        .eq('id', proposal.session_id)
        .then(() => {}, () => {})
    }
  } else {
    await supabaseAdmin
      .from('agent_council_proposals')
      .update({ council_decision: 'rejected', council_reasoning: note ?? 'Rejected by owner', reviewed_at: new Date().toISOString() })
      .eq('id', params.id)
  }

  const { data: updated } = await supabaseAdmin
    .from('agent_council_proposals')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({ proposal: updated, executed, outcome })
}

export const PATCH = withErrorCapture('agents/council/proposals/[id]', _PATCH)
