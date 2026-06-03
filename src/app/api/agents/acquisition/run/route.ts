export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CustomerAcquisitionAgent } from '@/lib/agents/customer-acquisition-agent'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const agent = new CustomerAcquisitionAgent()
  const result = await agent.run(biz.id)

  return NextResponse.json({ ok: true, decisions: result.decisions.length, errors: result.errors.length })
}

export const POST = withErrorCapture('agents/acquisition/run', _POST)
