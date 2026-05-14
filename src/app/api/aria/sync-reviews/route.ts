export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaObserve } from '@/lib/aria/brain'

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY

async function _POST(req: Request) {
  const authHeader = req.headers.get('authorization') ?? ''
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  const supabase = createServerSupabaseClient()

  let userId: string | null = null
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  }

  const { business_id, place_id } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Verify user owns this business (skip for cron)
  const bizQuery = supabase.from('businesses').select('id, google_place_id').eq('id', business_id)
  if (!isCron && userId) bizQuery.eq('user_id', userId)
  const { data: biz } = await bizQuery.maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let googlePlaceId = (place_id as string | undefined) || biz.google_place_id
  if (!googlePlaceId) {
    return NextResponse.json({ error: 'no_place_id', message: 'Add your Google Place ID in Settings first' }, { status: 400 })
  }

  if (!PLACES_KEY) {
    return NextResponse.json({ error: 'not_configured', message: 'Add GOOGLE_PLACES_API_KEY to Vercel environment variables' }, { status: 503 })
  }

  // Persist place_id if just provided
  if (place_id && place_id !== biz.google_place_id) {
    await supabase.from('businesses').update({ google_place_id: googlePlaceId }).eq('id', business_id)
  }

  // Call Google Places API
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(googlePlaceId)}&fields=name,rating,user_ratings_total,reviews&key=${PLACES_KEY}`
  const response = await fetch(url)
  const data = await response.json() as { status: string; error_message?: string; result?: { name?: string; rating?: number; user_ratings_total?: number; reviews?: GoogleReview[] } }

  if (data.status !== 'OK') {
    return NextResponse.json({
      error: `Google API error: ${data.status}`,
      message: data.error_message ?? 'Check your Place ID and API key',
    }, { status: 400 })
  }

  const place = data.result!
  const rawReviews: GoogleReview[] = place.reviews ?? []

  // Update business rating stats
  await supabase.from('businesses').update({
    google_average_rating: place.rating ?? null,
    google_total_reviews:  place.user_ratings_total ?? null,
    google_reviews_last_synced: new Date().toISOString(),
  }).eq('id', business_id)

  let reviews_synced = 0

  for (const review of rawReviews) {
    const review_id = `${googlePlaceId}_${review.time}_${(review.author_name ?? 'anon').replace(/\s/g, '_')}`

    // Skip if already stored
    const { data: existing } = await supabase
      .from('google_reviews')
      .select('id')
      .eq('review_id', review_id)
      .maybeSingle()
    if (existing) continue

    // Draft AI reply with Claude Haiku
    let ai_drafted_reply: string | null = null
    let sentiment: string | null = null
    let sentiment_score: number | null = null

    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: `You are Aria, drafting Google review replies for an Australian small business.
Write warm, professional, genuine replies. 2-3 sentences max. Never sound templated.
For negative reviews: acknowledge the issue, apologise sincerely, invite them back.
For positive reviews: thank them specifically, mention something from their review.
Respond ONLY with JSON: { "reply": "...", "sentiment": "positive|neutral|negative", "score": 0.0-1.0 }`,
          messages: [{
            role: 'user',
            content: `Review (${review.rating}/5 stars): "${review.text ?? '(no text)'}"\nReviewer: ${review.author_name ?? 'Anonymous'}`,
          }],
        }),
      })
      const aiData = await aiRes.json() as { content?: Array<{ text?: string }> }
      const raw = aiData.content?.[0]?.text?.replace(/```json|```/g, '').trim() ?? '{}'
      const parsed = JSON.parse(raw) as { reply?: string; sentiment?: string; score?: number }
      ai_drafted_reply = parsed.reply ?? null
      sentiment        = parsed.sentiment ?? null
      sentiment_score  = parsed.score ?? null
    } catch { /* non-fatal — review saved without AI draft */ }

    await supabase.from('google_reviews').insert({
      business_id,
      review_id,
      reviewer_name:    review.author_name ?? null,
      reviewer_avatar:  review.profile_photo_url ?? null,
      rating:           review.rating,
      comment:          review.text ?? null,
      review_date:      new Date(review.time * 1000).toISOString(),
      has_reply:        false,
      ai_drafted_reply,
      ai_draft_at:      ai_drafted_reply ? new Date().toISOString() : null,
      sentiment,
      sentiment_score,
      status:           'new',
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    })

    reviews_synced++

    // Aria Brain observations (fire-and-forget)
    if ((review.rating ?? 3) <= 2) {
      ariaObserve({
        businessId: business_id,
        category: 'customer',
        event: 'negative_review_received',
        metadata: {
          reviewer: review.author_name,
          rating: review.rating,
          snippet: (review.text ?? '').slice(0, 100),
        },
      }).catch(() => {})
    } else if ((review.rating ?? 3) >= 4) {
      ariaObserve({
        businessId: business_id,
        category: 'customer',
        event: 'positive_review_received',
        metadata: { reviewer: review.author_name, rating: review.rating },
      }).catch(() => {})
    }
  }

  return NextResponse.json({
    ok: true,
    reviews_synced,
    total_on_google: place.user_ratings_total,
    rating: place.rating,
  })
}

export const POST = withErrorCapture('aria/sync-reviews', _POST)

interface GoogleReview {
  author_name?: string
  rating?: number
  text?: string
  time: number
  profile_photo_url?: string
  author_url?: string
  relative_time_description?: string
}