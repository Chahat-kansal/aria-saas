export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY
const SERPER_KEY = process.env.SERPER_API_KEY

// Fetch additional reviews via Serper.dev when Places API doesn't return all reviews
async function fetchReviewsViaSerper(
  businessName: string,
  knownKeys: Set<string>,
): Promise<Array<{ author_name: string; rating: number; text: string; time: number }>> {
  if (!SERPER_KEY) return []
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `"${businessName}" google reviews site:google.com`, num: 10, gl: 'au' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      reviews?: Array<{ name?: string; rating?: number; snippet?: string; date?: string }>
    }
    const reviews: Array<{ author_name: string; rating: number; text: string; time: number }> = []
    for (const r of data.reviews ?? []) {
      if (!r.snippet) continue
      const approxTime = r.date ? Math.floor(new Date(r.date).getTime() / 1000) : Math.floor(Date.now() / 1000)
      const key = `${r.name ?? 'anon'}_${approxTime}`
      if (knownKeys.has(key)) continue
      reviews.push({ author_name: r.name ?? 'Google Reviewer', rating: r.rating ?? 5, text: r.snippet, time: approxTime })
    }
    console.log(`[sync-reviews/serper] found ${reviews.length} additional reviews`)
    return reviews
  } catch (e) {
    console.error('[sync-reviews/serper] failed:', e)
    return []
  }
}

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

  // Call Google Places API 3x with different sort orders to get more reviews
  // (Google caps at 5 per call but different sorts return different reviews)
  const sortOrders = ['most_relevant', 'newest', 'highest_rating', 'lowest_rating']
  let place: { name?: string; rating?: number; user_ratings_total?: number; reviews?: GoogleReview[] } | null = null
  const allReviewsMap = new Map<string, GoogleReview>()
  let lastStatus = ''

  for (const sortOrder of sortOrders) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(googlePlaceId)}&fields=name,rating,user_ratings_total,reviews&reviews_sort=${sortOrder}&key=${PLACES_KEY}`
    try {
      const response = await fetch(url)
      const data = await response.json() as { status: string; error_message?: string; result?: { name?: string; rating?: number; user_ratings_total?: number; reviews?: GoogleReview[] } }
      lastStatus = data.status
      if (data.status === 'OK' && data.result) {
        place = place ?? data.result // use first successful result for metadata
        for (const r of data.result.reviews ?? []) {
          // Deduplicate by author + time
          const key = `${r.author_name}_${r.time}`
          if (!allReviewsMap.has(key)) allReviewsMap.set(key, r)
        }
      }
    } catch { /* continue */ }
  }

  if (!place) {
    return NextResponse.json({
      error: `Google API error: ${lastStatus}`,
      message: 'Check your Place ID and API key',
    }, { status: 400 })
  }

  const rawReviews: GoogleReview[] = [...allReviewsMap.values()]
  const totalOnGoogle = place.user_ratings_total ?? 0
  const placesCount = rawReviews.length
  console.log(`[sync-reviews] fetched ${placesCount} unique reviews via multi-sort (${totalOnGoogle} total on Google)`)

  // If Places API returned fewer reviews than Google reports, use Serper to get more
  if (SERPER_KEY && totalOnGoogle > placesCount && place.name) {
    const knownKeys = new Set(rawReviews.map(r => `${r.author_name ?? 'anon'}_${r.time}`))
    const serperReviews = await fetchReviewsViaSerper(place.name, knownKeys)
    for (const r of serperReviews) {
      rawReviews.push({ author_name: r.author_name, rating: r.rating, text: r.text, time: r.time })
    }
    console.log(`[sync-reviews] total after Serper: ${rawReviews.length}`)
  }

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
      const raw = aiData.content?.[0]?.text ?? ''
      const parsed = parseLLMJsonOr<{ reply?: string; sentiment?: string; score?: number }>(
        raw, {}, 'sync-reviews'
      )
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
      import('@/lib/aria/brain').then(({ ariaObserve }) => ariaObserve({
        business_id,
        category: 'customers',
        event_type: 'negative_review_received',
        triggered_by: 'sync',
        data: { reviewer: review.author_name, rating: review.rating, snippet: (review.text ?? '').slice(0, 100) },
      }).catch(() => {})).catch(() => {})
    } else if ((review.rating ?? 3) >= 4) {
      import('@/lib/aria/brain').then(({ ariaObserve }) => ariaObserve({
        business_id,
        category: 'customers',
        event_type: 'positive_review_received',
        triggered_by: 'sync',
        data: { reviewer: review.author_name, rating: review.rating },
      }).catch(() => {})).catch(() => {})
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