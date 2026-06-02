export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const event_type = searchParams.get('event_type')
  if (!business_id || !event_type) return NextResponse.json({ error: 'business_id and event_type required' }, { status: 400 })
  const biz = await supabaseAdmin.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data } = await supabaseAdmin.from('intelligence_events')
    .select('id, title, body, triggered_at, acknowledged')
    .eq('business_id', business_id)
    .eq('event_type', event_type)
    .lt('triggered_at', sevenDaysAgo)
    .order('triggered_at', { ascending: false })
    .limit(3)
  return NextResponse.json({ patterns: data ?? [], count: (data ?? []).length })
}
export const GET = withErrorCapture('intelligence-events/patterns', _GET)
