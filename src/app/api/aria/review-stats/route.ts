import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ sent: 0, reviews: 0 })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ sent: 0, reviews: 0 })

  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ sent: 0, reviews: 0 })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [sentRes, reviewsRes] = await Promise.all([
    supabase.from('aria_autopilot_actions').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('action_type', 'review_request').gte('created_at', weekAgo),
    supabase.from('reviews').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).gte('created_at', weekAgo),
  ])

  return NextResponse.json({ sent: sentRes.count ?? 0, reviews: reviewsRes.count ?? 0 })
}
