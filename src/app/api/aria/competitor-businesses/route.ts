export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Read-only list of competitors the "Scan Area" button discovered. The scan
// (/api/aria/competitors) writes these rows; the overview reads them here so
// scan results actually surface instead of staying invisible.
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ competitors: [] })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ competitors: [] })

  const { data } = await supabase.from('competitor_businesses')
    .select('id,competitor_name,competitor_address,distance_m,category,phone,website,google_rating,last_checked')
    .eq('business_id', business_id)
    .order('distance_m', { ascending: true })

  return NextResponse.json({ competitors: data ?? [] })
}

export const GET = withErrorCapture('aria/competitor-businesses', _GET)
