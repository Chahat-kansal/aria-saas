export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: uab } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = uab?.business_id
  if (!bid) return NextResponse.json({ score: null })

  const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry,google_average_rating,google_total_reviews').eq('id', bid).maybeSingle()
  const { data: reviews } = await supabaseAdmin.from('google_reviews')
    .select('rating,has_reply,sentiment,review_date').eq('business_id', bid)
    .order('review_date', { ascending: false }).limit(30)

  if (!reviews || reviews.length === 0) return NextResponse.json({ score: null, reason: 'No reviews yet' })

  const recent10 = reviews.slice(0, 10)
  const b = biz as Record<string, unknown> | null
  const avgRecent = recent10.reduce((s, r) => s + Number((r as Record<string,unknown>).rating || 0), 0) / recent10.length
  const negativeUnreplied = reviews.filter(r => !(r as Record<string,unknown>).has_reply && Number((r as Record<string,unknown>).rating || 5) <= 2).length
  const responseRate = Math.round((reviews.filter(r => (r as Record<string,unknown>).has_reply).length / reviews.length) * 100)

  const sentimentMap: Record<string, number> = {}
  for (const r of reviews) {
    const s = (r as Record<string,unknown>).sentiment as string | null
    if (s) sentimentMap[s] = (sentimentMap[s] ?? 0) + 1
  }

  const prompt = `Business: ${b?.name} (${b?.industry})
Google rating: ${b?.google_average_rating} (${b?.google_total_reviews} total reviews)
Recent 10 reviews avg rating: ${avgRecent.toFixed(1)}
Response rate: ${responseRate}%
Negative reviews without a reply: ${negativeUnreplied}
Sentiment breakdown: ${JSON.stringify(sentimentMap)}

Calculate a reputation score 0-100 for this Australian small business. Return JSON only:
{
  "score": 0,
  "trend": "up|down|stable",
  "grade": "A|B|C|D|F",
  "summary": "One sentence — current reputation state",
  "top_risk": "Biggest risk to their reputation right now (one sentence)",
  "top_action": "Single most important action to improve reputation (one sentence)"
}`

  const result = await callAnthropic(
    {
      model: 'haiku',
      systemPrompt: 'You are a reputation analytics engine. Return JSON only. No preamble.',
      userPrompt: prompt,
      maxTokens: 400,
      businessId: bid,
      agentKey: 'review_reputation',
      role: 'analysis',
    },
    {},
  )

  try {
    const cleaned = result.raw.replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim()
    return NextResponse.json(JSON.parse(cleaned))
  } catch {
    return NextResponse.json({ score: null })
  }
}

export const GET = withErrorCapture('aria/reviews/reputation', _GET)
