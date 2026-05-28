export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { notifyBusinessFollowers } from '@/lib/community/push'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('name, logo_url').eq('id', bid).maybeSingle()
  const result = await notifyBusinessFollowers(bid, {
    title: 'Hello from ' + (biz?.name ?? 'this shop'),
    body: 'This is a test notification. Push is wired up.',
    url: '/community/businesses/' + bid,
    icon: biz?.logo_url ?? '/icon-192.png',
    tag: 'community-test-' + bid,
  })
  return NextResponse.json(result)
}

export const POST = withErrorCapture('community/owner/push-test', _POST)
