export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: decision } = await supabase
    .from('agent_decisions')
    .select('id, business_id')
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

  let reason: string | undefined
  try {
    const body = await req.json()
    reason = body?.reason
  } catch { /* reason is optional */ }

  await supabase.from('agent_decisions').update({
    status: 'rejected',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    outcome: reason ? { reason } : null,
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/agent-decisions/[id]/reject', _POST)