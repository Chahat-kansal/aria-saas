export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-5-20250929'

// Industry benchmarks: { industry_keyword: { avg_health, target_reviews } }
const INDUSTRY_BENCHMARKS: Record<string, { avg_health: number; target_reviews: number; top_keywords: string[] }> = {
  cafe: { avg_health: 62, target_reviews: 50, top_keywords: ['coffee', 'breakfast', 'brunch', 'cafe near me', 'specialty coffee'] },
  restaurant: { avg_health: 58, target_reviews: 80, top_keywords: ['restaurant near me', 'dine in', 'takeaway', 'best restaurant', 'menu'] },
  retail: { avg_health: 55, target_reviews: 30, top_keywords: ['shop', 'store near me', 'buy', 'online store', 'price'] },
  bakery: { avg_health: 60, target_reviews: 40, top_keywords: ['bakery', 'fresh bread', 'cakes', 'pastries', 'custom cakes'] },
  hair: { avg_health: 65, target_reviews: 60, top_keywords: ['hair salon', 'haircut', 'colourist', 'blowdry', 'best salon near me'] },
  beauty: { avg_health: 63, target_reviews: 55, top_keywords: ['beauty salon', 'facial', 'nails', 'waxing', 'beauty near me'] },
  gym: { avg_health: 60, target_reviews: 45, top_keywords: ['gym', 'fitness', 'personal trainer', 'classes', 'gym near me'] },
  default: { avg_health: 58, target_reviews: 40, top_keywords: ['local business', 'near me', 'best service', 'open now'] },
}

function getBenchmark(industry: string | null) {
  if (!industry) return INDUSTRY_BENCHMARKS.default
  const key = industry.toLowerCase()
  return INDUSTRY_BENCHMARKS[key] ?? Object.entries(INDUSTRY_BENCHMARKS).find(([k]) => key.includes(k))?.[1] ?? INDUSTRY_BENCHMARKS.default
}

export interface Recommendation {
  priority: number
  action: string
  impact: 'high' | 'medium' | 'low'
  effort: 'low' | 'medium' | 'high'
  category: string
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, city, industry')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Gather context in parallel
  const [issuesResult, localResult, keywordsResult, competitorResult, auditResult] = await Promise.all([
    supabaseAdmin
      .from('seo_issues')
      .select('issue_type, severity, page_url, state, title')
      .eq('business_id', business_id)
      .in('state', ['open', 'unverified'])
      .order('severity', { ascending: true })
      .limit(30),
    supabaseAdmin
      .from('seo_local')
      .select('gbp_completeness, gbp_listed, review_count, review_avg, checklist')
      .eq('business_id', business_id)
      .maybeSingle(),
    supabaseAdmin
      .from('seo_keywords')
      .select('keyword, current_rank, frequency')
      .eq('business_id', business_id)
      .order('current_rank', { ascending: true, nullsFirst: false })
      .limit(20),
    supabaseAdmin
      .from('seo_competitor_analysis')
      .select('analysis')
      .eq('business_id', business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('seo_audits')
      .select('health_score, critical_count, warning_count')
      .eq('business_id', business_id)
      .eq('status', 'complete')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const issues = issuesResult.data ?? []
  const local = localResult.data
  const keywords = keywordsResult.data ?? []
  const competitorData = competitorResult.data?.analysis as Record<string, unknown> | null ?? null
  const audit = auditResult.data

  const benchmark = getBenchmark(biz.industry as string | null)
  const healthScore = audit?.health_score ?? 0
  const criticals = issues.filter(i => i.severity === 'critical')
  const warnings = issues.filter(i => i.severity === 'warning')
  const reviewCount = local?.review_count ?? 0
  const localScore = local?.gbp_completeness ?? 0
  const keywordGaps = competitorData ? ((competitorData.keyword_gaps as string[]) ?? []) : []
  const rankedKeywords = keywords.filter(k => k.current_rank != null)

  if (!process.env.ANTHROPIC_API_KEY) {
    // Fallback: rule-based recommendations
    const recs: Recommendation[] = []
    if (criticals.length > 0) recs.push({ priority: 1, action: `Fix ${criticals.length} critical SEO issue${criticals.length > 1 ? 's' : ''}: ${criticals.slice(0, 2).map(i => i.title).join(', ')}`, impact: 'high', effort: 'low', category: 'issues' })
    if (localScore < 70) recs.push({ priority: 2, action: 'Complete your Google Business Profile — it is currently incomplete', impact: 'high', effort: 'low', category: 'local' })
    if (reviewCount < benchmark.target_reviews) recs.push({ priority: 3, action: `Grow reviews to ${benchmark.target_reviews}+ (currently ${reviewCount}) — ask satisfied customers via email or receipt QR code`, impact: 'high', effort: 'medium', category: 'reviews' })
    if (warnings.length > 0) recs.push({ priority: 4, action: `Resolve ${warnings.length} SEO warning${warnings.length > 1 ? 's' : ''} to improve page quality`, impact: 'medium', effort: 'medium', category: 'issues' })
    if (keywordGaps.length > 0) recs.push({ priority: 5, action: `Target competitor keyword gaps: ${keywordGaps.slice(0, 3).join(', ')}`, impact: 'medium', effort: 'high', category: 'keywords' })
    return NextResponse.json({ recommendations: recs.slice(0, 5) })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const bizName = (biz.name as string | null) ?? 'this business'
  const industry = (biz.industry as string | null) ?? 'local business'

  const context = `Business: ${bizName} — ${industry}${biz.city ? ` in ${biz.city}` : ''}
Current health score: ${healthScore}/100 (industry avg: ${benchmark.avg_health})
Critical issues: ${criticals.length} (${criticals.slice(0, 3).map(i => i.issue_type).join(', ') || 'none'})
Warning issues: ${warnings.length}
Local SEO score: ${localScore}/100
Google reviews: ${reviewCount} (target for industry: ${benchmark.target_reviews}+)
Review average: ${local?.review_avg ?? 'unknown'}
Google Business Profile listed: ${local?.gbp_listed ? 'yes' : 'no'}
Top tracked keywords: ${keywords.slice(0, 8).map(k => `${k.keyword}${k.current_rank ? ` (rank #${k.current_rank})` : ' (unranked)'}`).join(', ') || 'none'}
Ranked keywords: ${rankedKeywords.length}
Competitor keyword gaps: ${keywordGaps.slice(0, 8).join(', ') || 'none identified'}
Industry benchmark keywords: ${benchmark.top_keywords.slice(0, 4).join(', ')}`

  const prompt = `You are an expert local SEO consultant for Australian small businesses.

${context}

Return EXACTLY 5 prioritised recommendations as a JSON array. Each item:
{
  "priority": 1-5 (1 = highest),
  "action": "specific actionable sentence",
  "impact": "high" | "medium" | "low",
  "effort": "low" | "medium" | "high",
  "category": "issues" | "local" | "reviews" | "keywords" | "content" | "technical"
}

Rules:
- Priority 1 MUST be the single highest-ROI action
- Base effort on realistic time to implement (low = <1hr, medium = 1 day, high = 1 week+)
- Be specific to the data above — reference actual issue counts, scores, keywords
- No generic advice — every recommendation must be grounded in the numbers provided
- Return only the JSON array, no other text`

  try {
    const msg = await trackAICall(
      { route: 'seo/recommendations', model: MODEL, businessId: business_id, purpose: 'seo_recommendations', industry: industry },
      () => anthropic.messages.create({ model: MODEL, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    )
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '[]'
    // Parse the JSON array — strip any markdown fences
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    const recommendations: Recommendation[] = JSON.parse(json)
    return NextResponse.json({ recommendations: Array.isArray(recommendations) ? recommendations.slice(0, 5) : [] })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to generate recommendations', detail: (e as Error).message }, { status: 500 })
  }
}

export const GET = withErrorCapture('seo/recommendations', _GET)
