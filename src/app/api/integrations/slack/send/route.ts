export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendSlackMessage } from '@/lib/integrations/slack'

export { sendSlackMessage }

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { business_id: string; message: string; blocks?: unknown[] }
  const { business_id, message, blocks } = body
  if (!business_id || !message) return NextResponse.json({ error: 'business_id and message required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: bizData } = await supabaseAdmin.from('businesses')
    .select('slack_access_token, slack_channel_id, slack_connected')
    .eq('id', business_id).single()

  if (!bizData?.slack_connected || !bizData.slack_access_token || !bizData.slack_channel_id) {
    return NextResponse.json({ error: 'Slack not connected or no channel selected' }, { status: 400 })
  }

  const result = await sendSlackMessage(bizData.slack_access_token, bizData.slack_channel_id, message, blocks)
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Slack send failed' }, { status: 502 })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('integrations/slack/send', _POST)
