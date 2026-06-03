export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { AeoMonitor } from '@/lib/agents/aeo-monitor'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id,google_average_rating,google_total_reviews').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()

  const [reviewsRes, pendingRes, weekCountRes, requestsRes] = await Promise.all([
    supabaseAdmin.from('business_reviews')
      .select('id,platform,reviewer_name,rating,review_text,review_date,response_text,response_status,sentiment,sentiment_score,key_themes,is_crisis')
      .eq('business_id', biz.id)
      .order('review_date', { ascending: false })
      .limit(50),
    supabaseAdmin.from('business_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .eq('response_status', 'pending')
      .not('response_text', 'is', null),
    supabaseAdmin.from('business_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .gte('review_date', d7),
    supabaseAdmin.from('review_requests')
      .select('id,channel,sent_at,opened_at,clicked_at,review_received')
      .eq('business_id', biz.id)
      .order('sent_at', { ascending: false })
      .limit(30),
  ])

  const aeoMonitor = new AeoMonitor()
  const { score: aeoScore, snapshots: aeoSnapshots } = await aeoMonitor.getAeoScore(biz.id)

  const reviews = reviewsRes.data ?? []
  const platformStats: Record<string, { count: number; total_rating: number }> = {}
  for (const r of reviews) {
    const p = String(r.platform)
    if (!platformStats[p]) platformStats[p] = { count: 0, total_rating: 0 }
    platformStats[p].count++
    platformStats[p].total_rating += Number(r.rating)
  }

  const requests = requestsRes.data ?? []
  const requestStats = {
    sent: requests.length,
    opened: requests.filter(r => r.opened_at).length,
    clicked: requests.filter(r => r.clicked_at).length,
    reviews_received: requests.filter(r => r.review_received).length,
  }

  return NextResponse.json({
    reviews,
    stats: {
      avg_rating: biz.google_average_rating ?? null,
      total_reviews: biz.google_total_reviews ?? reviews.length,
      pending_responses: pendingRes.count ?? 0,
      this_week_count: weekCountRes.count ?? 0,
      platform_breakdown: Object.entries(platformStats).map(([platform, s]) => ({
        platform,
        count: s.count,
        avg_rating: s.count > 0 ? Math.round((s.total_rating / s.count) * 10) / 10 : null,
      })),
    },
    aeo_score: aeoScore,
    aeo_snapshots: aeoSnapshots,
    request_stats: requestStats,
  })
}

export const GET = withErrorCapture('agents/reputation', _GET)
