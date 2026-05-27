export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { geminiFlash } from '@/lib/gemini'
import { checkGeminiRateLimit } from '@/lib/gemini-rate-limiter'

async function fetchCompetitorSocialPosts(competitorName: string, city: string) {
  try {
    const prompt = `Search Instagram and Facebook for recent posts by "${competitorName}" in ${city}, Australia.
What have they posted in the last 7 days? Any promotions, new products, events, or special offers?
Return ONLY valid JSON:
{
  "recent_posts": [{"platform": "instagram|facebook", "content_summary": "string", "post_type": "promo|product|event|other", "detected_at": "today"}],
  "active_promotions": "description of any current deals or null",
  "engagement_level": "high|medium|low|unknown"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/```json|```/g, '').trim()
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, city, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
    .select('id, competitor_name, last_result').eq('business_id', business_id).eq('is_active', true).limit(5)

  const city = (biz.city as string | null) ?? 'Melbourne'
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()
  const allowed = await checkGeminiRateLimit().catch(() => false)

  const results = await Promise.all((watches ?? []).map(async (w) => {
    const lr = (w.last_result as Record<string, unknown> | null) ?? {}
    const cachedSocial = lr.social as { fetched_at?: string } | null

    // Use cache if fetched within 24hrs
    if (cachedSocial?.fetched_at && cachedSocial.fetched_at > oneDayAgo) {
      return { competitor_name: w.competitor_name, ...cachedSocial }
    }

    // Fetch fresh data if within rate limit
    if (!allowed) return { competitor_name: w.competitor_name, cached: true, ...cachedSocial }

    const social = await fetchCompetitorSocialPosts(w.competitor_name as string, city)
    if (social) {
      const update = { ...lr, social: { ...social, fetched_at: new Date().toISOString() } }
      await supabaseAdmin.from('aria_competitor_watches')
        .update({ last_result: update, last_checked_at: new Date().toISOString() })
        .eq('id', w.id)
    }
    return { competitor_name: w.competitor_name, ...(social ?? {}) }
  }))

  return NextResponse.json({ results })
}

export const GET = withErrorCapture('aria/social-intelligence', _GET)
