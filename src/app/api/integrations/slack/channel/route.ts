export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getSlackAccessToken } from '@/lib/integrations/slack'

// GET — list channels for the connected workspace
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('slack_connected')
    .eq('id', businessId).eq('user_id', user.id).maybeSingle()
  const accessToken = biz?.slack_connected ? await getSlackAccessToken(businessId) : null
  if (!accessToken) return NextResponse.json({ error: 'Slack not connected' }, { status: 400 })

  const res = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200', {
    headers: { Authorization: 'Bearer ' + accessToken },
  })
  const data = await res.json() as Record<string, unknown>
  if (!data.ok) return NextResponse.json({ error: String(data.error ?? 'Failed to list channels') }, { status: 502 })

  const channels = ((data.channels as Array<Record<string, unknown>>) ?? []).map(c => ({
    id: c.id, name: c.name,
  }))
  return NextResponse.json({ channels })
}

// PUT — save selected channel
async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { business_id: string; channel_id: string; channel_name: string }
  const { business_id, channel_id, channel_name } = body
  if (!business_id || !channel_id) return NextResponse.json({ error: 'business_id and channel_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabaseAdmin.from('businesses').update({
    slack_channel_id: channel_id,
    slack_channel_name: channel_name,
  }).eq('id', business_id)

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('integrations/slack/channel', _GET)
export const PUT = withErrorCapture('integrations/slack/channel', _PUT)
