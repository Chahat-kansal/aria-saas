export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, hint?: string | null): Promise<string | null> {
  if (hint) {
    // Verify ownership
    const { data } = await supabase.from('businesses').select('id').eq('id', hint).eq('user_id', userId).maybeSingle()
    if (data?.id) return data.id as string
  }
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ reviews: [], stats: null })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const status      = searchParams.get('status')

  const bid = await getBid(supabase, user.id, business_id)
  if (!bid) return NextResponse.json({ reviews: [], stats: null })

  const { data: biz } = await supabase
    .from('businesses')
    .select('google_place_id, google_average_rating, google_total_reviews, google_reviews_last_synced')
    .eq('id', bid)
    .maybeSingle()

  let query = supabase
    .from('google_reviews')
    .select('id, review_id, reviewer_name, reviewer_avatar, rating, comment, review_date, has_reply, reply_text, reply_date, ai_drafted_reply, sentiment, sentiment_score, status, created_at')
    .eq('business_id', bid)
    .order('review_date', { ascending: false })
    .limit(50)

  const platform = searchParams.get('platform')
  if (status === 'new')      query = query.eq('status', 'new')
  if (status === 'replied')  query = query.eq('status', 'replied')
  if (status === 'negative') query = query.lte('rating', 2)
  if (platform && platform !== 'all') query = query.eq('platform', platform)

  const { data: reviews } = await query

  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const r of reviews ?? []) {
    const star = Math.min(5, Math.max(1, r.rating ?? 3))
    dist[star] = (dist[star] ?? 0) + 1
  }

  return NextResponse.json({
    reviews: reviews ?? [],
    stats: {
      google_place_id:  biz?.google_place_id ?? null,
      average_rating:   biz?.google_average_rating ?? null,
      total_reviews:    biz?.google_total_reviews ?? null,
      last_synced:      biz?.google_reviews_last_synced ?? null,
      local_count:      reviews?.length ?? 0,
      distribution:     dist,
    },
  })
}

export const GET = withErrorCapture('aria/reviews', _GET)

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, reply_text, has_reply } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Verify ownership via business_id join
  const { data: rev } = await supabase.from('google_reviews').select('business_id').eq('id', id).maybeSingle()
  if (!rev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const bid = await getBid(supabase, user.id, rev.business_id)
  if (bid !== rev.business_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status    !== undefined) update.status    = status
  if (reply_text !== undefined) update.reply_text = reply_text
  if (has_reply !== undefined) {
    update.has_reply = has_reply
    if (has_reply) {
      update.reply_date = new Date().toISOString()
      update.status     = 'replied'
    }
  }

  const { error } = await supabase.from('google_reviews').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attempt to post reply to Google My Business if GMB token is available
  let gmb_published = false
  if (has_reply && reply_text) {
    try {
      const { data: fullRev } = await supabaseAdmin.from('google_reviews').select('review_id,business_id').eq('id', id).maybeSingle()
      const { data: conn } = await supabaseAdmin.from('social_connections')
        .select('access_token').eq('business_id', fullRev?.business_id).eq('platform', 'google_business').eq('is_active', true).maybeSingle()

      if (conn?.access_token && fullRev?.review_id) {
        const gmbRes = await fetch(
          `https://mybusiness.googleapis.com/v4/accounts/-/locations/-/reviews/${fullRev.review_id}/reply`,
          {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${conn.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: reply_text }),
          },
        )
        if (gmbRes.ok) {
          await supabaseAdmin.from('google_reviews').update({
            reply_published_at: new Date().toISOString(),
            reply_source: 'manual',
          }).eq('id', id)
          gmb_published = true
        }
      }
    } catch { /* non-fatal — save to DB regardless */ }
  }

  return NextResponse.json({ ok: true, gmb_published })
}

export const PATCH = withErrorCapture('aria/reviews', _PATCH)