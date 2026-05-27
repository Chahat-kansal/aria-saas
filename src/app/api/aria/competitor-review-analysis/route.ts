export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { geminiFlash } from '@/lib/gemini'
import { checkGeminiRateLimit } from '@/lib/gemini-rate-limiter'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchCompetitorReviews(competitorName: string, suburb: string) {
  try {
    const prompt = `Search Google Maps and review sites for recent customer reviews of "${competitorName}" in ${suburb}, Australia.
What are customers saying? What do they complain about? What do they praise?
Return ONLY valid JSON:
{
  "average_rating": number,
  "review_count_estimate": number,
  "top_complaints": ["string"],
  "top_praises": ["string"],
  "recent_sentiment": "improving|declining|stable",
  "opportunity_for_competitor": "what a competing business could do better based on these complaints"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/```json|```/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchPlaceRating(name: string, city: string): Promise<{ rating: number | null; review_count: number | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return { rating: null, review_count: null }
  try {
    const q = encodeURIComponent(`${name} ${city}`)
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${key}`)
    const d = await r.json() as { results?: Array<{ rating?: number; user_ratings_total?: number }> }
    const place = d.results?.[0]
    return { rating: place?.rating ?? null, review_count: place?.user_ratings_total ?? null }
  } catch { return { rating: null, review_count: null } }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id } = await req.json()
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, industry, city, google_average_rating, google_total_reviews')
    .eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
    .select('id, competitor_name, last_result').eq('business_id', business_id).eq('is_active', true).limit(5)

  const suburb = (biz.city as string | null) ?? 'Melbourne'
  const geminiAllowed = await checkGeminiRateLimit().catch(() => false)
  const oneWeekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

  const competitors = await Promise.all((watches ?? []).map(async w => {
    const lr = (w.last_result as Record<string, unknown> | null) ?? {}
    const placeData = await fetchPlaceRating(w.competitor_name as string, suburb)

    // Gemini review sentiment — cache per competitor per week
    let reviewSentiment: Record<string, unknown> | null = null
    const cached = lr.review_sentiment as { fetched_at?: string } | null
    if (cached?.fetched_at && cached.fetched_at > oneWeekAgo) {
      reviewSentiment = cached
    } else if (geminiAllowed) {
      reviewSentiment = await fetchCompetitorReviews(w.competitor_name as string, suburb)
      if (reviewSentiment) {
        const updated = { ...lr, review_sentiment: { ...reviewSentiment, fetched_at: new Date().toISOString() } }
        await supabaseAdmin.from('aria_competitor_watches')
          .update({ last_result: updated }).eq('id', (w as any).id)
      }
    }

    return {
      name: w.competitor_name as string,
      rating: placeData.rating ?? (lr?.rating as number | null) ?? null,
      review_count: placeData.review_count ?? (lr?.review_count as number | null) ?? null,
      review_sentiment: reviewSentiment,
    }
  }))

  const { data: ourReviews } = await supabaseAdmin.from('google_reviews')
    .select('rating, keyword_tags').eq('business_id', business_id)
    .order('review_date', { ascending: false }).limit(30)

  const positiveKeywords = (ourReviews ?? []).filter(r => Number(r.rating ?? 0) >= 4)
    .flatMap(r => (r.keyword_tags as string[] | null) ?? []).slice(0, 10)

  const context = `Our business: ${biz.name} (${biz.industry}, ${suburb})
Our rating: ${biz.google_average_rating ?? '?'}★ (${biz.google_total_reviews ?? 0} reviews)
Our positive keywords: ${positiveKeywords.join(', ') || 'not available'}

Competitors:
${competitors.map(c => `- ${c.name}: ${c.rating ?? '?'}★ (${c.review_count ?? '?'} reviews)`).join('\n') || 'No competitors tracked yet — add them in the Competitors section.'}`

  let analysis = { advantages: ['Add competitor watches to unlock AI benchmarking'], gaps: [] as string[], summary: 'Track competitors to see how you compare in your local market.', action: 'Go to the Competitors page and add your main competitors.' }

  if ((watches ?? []).length > 0) {
    try {
      const msg = await trackAICall(
        { route: 'aria/competitor-review-analysis', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'competitor-analysis' },
        () => anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: 'You are a competitive intelligence analyst for Australian small businesses. Return JSON only, no preamble.',
          messages: [{ role: 'user', content: `${context}\n\nReturn JSON: {"advantages":["..."],"gaps":["..."],"summary":"one paragraph","action":"single most important action"}` }],
        })
      )
      const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
      const m = raw.match(/\{[\s\S]*\}/)
      if (m) analysis = JSON.parse(m[0])
    } catch { /* use default */ }
  }

  return NextResponse.json({ competitors, analysis, our_rating: biz.google_average_rating, our_reviews: biz.google_total_reviews })
}

export const POST = withErrorCapture('aria/competitor-review-analysis', _POST)
