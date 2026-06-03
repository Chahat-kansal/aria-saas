export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string }
  const businessId = body.business_id

  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('businesses').update({
    slack_access_token: null,
    slack_team_id: null,
    slack_team_name: null,
    slack_channel_id: null,
    slack_channel_name: null,
    slack_connected: false,
    slack_briefing_enabled: false,
  }).eq('id', businessId)

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('integrations/slack/disconnect', _POST)
