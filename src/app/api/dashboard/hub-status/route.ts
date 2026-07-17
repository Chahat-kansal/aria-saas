export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

// Which customer-hub cards are configured for the active business (owner view).
async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
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

export const GET = withBusinessContext('dashboard/hub-status', _GET)
