export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ decisions: [] })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'pending'
  const agentType = searchParams.get('type')

  let q = supabase
    .from('agent_decisions')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(50)

  if (status !== 'all') q = q.eq('status', status)
  if (agentType) q = q.eq('agent_type', agentType)

  const { data: decisions, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ decisions: decisions ?? [] })
}

export const GET = withErrorCapture('pos/agent-decisions', _GET)