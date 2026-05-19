export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: uab } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = uab?.business_id
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [reviewsRes, requestsRes] = await Promise.all([
    supabaseAdmin.from('google_reviews').select('id,rating,sentiment,has_reply,reply_date,review_date,reply_published_at,created_at').eq('business_id', bid),
    supabaseAdmin.from('review_requests').select('id,status,sent_at,clicked_at,review_id,created_at').eq('business_id', bid).gte('created_at', thirtyDaysAgo),
  ])

  const reviews = (reviewsRes.data ?? []) as Array<Record<string, unknown>>
  const requests = (requestsRes.data ?? []) as Array<Record<string, unknown>>

  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of reviews) { const star = Math.min(5, Math.max(1, Number(r.rating) || 3)); dist[star]++ }

  const sentiment = { positive: 0, neutral: 0, negative: 0 }
  for (const r of reviews) { if (r.sentiment) (sentiment as Record<string, number>)[r.sentiment as string]++ }

  const withReply = reviews.filter(r => r.has_reply).length
  const responseRate = reviews.length > 0 ? Math.round((withReply / reviews.length) * 100) : 0

  const responseTimes = reviews
    .filter(r => r.has_reply && r.reply_date && r.review_date)
    .map(r => new Date(r.reply_date as string).getTime() - new Date(r.review_date as string).getTime())
  const avgResponseHours = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / (1000 * 60 * 60))
    : null

  const requestsSent      = requests.length
  const requestsClicked   = requests.filter(r => r.clicked_at).length
  const requestsConverted = requests.filter(r => r.review_id).length

  const monthlyTrend: Array<{ month: string; count: number; avg_rating: number }> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const month = d.toISOString().slice(0, 7)
    const monthReviews = reviews.filter(r => ((r.review_date ?? r.created_at) as string | undefined ?? '').startsWith(month))
    monthlyTrend.push({
      month,
      count: monthReviews.length,
      avg_rating: monthReviews.length > 0
        ? Math.round((monthReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / monthReviews.length) * 10) / 10
        : 0,
    })
  }

  return NextResponse.json({
    total: reviews.length,
    avg_rating: reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length) * 10) / 10
      : 0,
    distribution: dist,
    sentiment,
    response_rate: responseRate,
    avg_response_hours: avgResponseHours,
    unreplied: reviews.filter(r => !r.has_reply).length,
    negative_unreplied: reviews.filter(r => !r.has_reply && Number(r.rating) <= 2).length,
    requests_sent: requestsSent,
    requests_clicked: requestsClicked,
    request_conversion_rate: requestsSent > 0 ? Math.round((requestsConverted / requestsSent) * 100) : 0,
    monthly_trend: monthlyTrend,
  })
}

export const GET = withErrorCapture('reviews/analytics', _GET)
