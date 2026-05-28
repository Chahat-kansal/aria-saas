export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// Which customer-hub cards are configured for the active business (owner view).
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const [{ data: biz }, { data: cfg }] = await Promise.all([
    supabaseAdmin.from('businesses').select('website, booking_link_slug, google_review_link, google_business_url, community_bio, community_verified').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_loyalty_config').select('public_enrol_enabled').eq('business_id', bid).maybeSingle(),
  ])

  return NextResponse.json({
    loyalty: !!cfg?.public_enrol_enabled,
    booking: !!biz?.booking_link_slug,
    review: !!(biz?.google_review_link || biz?.google_business_url),
    website: !!biz?.website,
    community: !!(biz?.community_bio || biz?.community_verified),
  })
}

export const GET = withErrorCapture('dashboard/hub-status', _GET)
