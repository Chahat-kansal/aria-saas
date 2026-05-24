export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: actions } = await supabaseAdmin.from('aria_agent_actions')
    .select('id, agent_name, action_type, action_input, action_output, risk_level, created_at')
    .eq('business_id', businessId)
    .is('approved', null)
    .eq('executed', false)
    .neq('risk_level', 'low')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ actions: actions ?? [] })
}

export const GET = withErrorCapture('aria/pending-actions', _GET)
