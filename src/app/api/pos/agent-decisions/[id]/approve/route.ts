export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { executeApprovedDecision } from '@/lib/pos/agent-executor'

type Params = { params: Promise<{ id: string }> }

async function _POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: decision } = await supabase
    .from('agent_decisions')
    .select('id, business_id, agent_type, status')
    .eq('id', id)
    .single()

  if (!decision) return NextResponse.json({ error: 'Decision not found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', decision.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Mark reviewed_by before executing
  await supabase.from('agent_decisions').update({
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  const result = await executeApprovedDecision(id, supabase)

  return NextResponse.json({
    ok: result.ok,
    message: result.message,
    outcome: result.outcome,
  }, { status: result.ok ? 200 : 500 })
}

export const POST = withErrorCapture('pos/agent-decisions/[id]/approve', _POST)