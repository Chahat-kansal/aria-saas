export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { analyzeBestTimes } from '@/lib/social/smart-scheduler'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = new URL(req.url).searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buckets = await analyzeBestTimes(supabase, business_id)

  return NextResponse.json({
    buckets,
    total_posts_with_data: buckets.reduce((s, b) => s + b.sampleSize, 0),
    has_enough_data: buckets.reduce((s, b) => s + b.sampleSize, 0) >= 10,
  })
}

export const GET = withErrorCapture('social/scheduler/analyze', _GET)