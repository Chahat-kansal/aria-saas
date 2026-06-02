export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface KeywordSuggestion {
  keyword: string
  difficulty: 'low' | 'medium' | 'high'
  relevance: 'high' | 'medium' | 'low'
  intent: string
  reason: string
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id, seed_keyword } = body as { business_id?: string; seed_keyword?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, industry, city, address, website')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch top products for context
  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('name, category')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('stock_quantity', { ascending: false })
    .limit(15)

  // Fetch already-tracked keywords to exclude
  const { data: trackedKeywords } = await supabaseAdmin
    .from('seo_keywords')
    .select('keyword')
    .eq('business_id', business_id)

  const { data: rankedKeywords } = await supabaseAdmin
    .from('seo_keyword_rankings')
    .select('keyword')
    .eq('business_id', business_id)

  const alreadyTracked = new Set<string>([
    ...((trackedKeywords ?? []).map((k: { keyword: string }) => k.keyword.toLowerCase())),
    ...((rankedKeywords ?? []).map((k: { keyword: string }) => k.keyword.toLowerCase())),
  ])

  const industry = (biz.industry as string) || 'retail business'
  const suburb = (biz.city as string) || 'Australia'
  const productNames = (products ?? []).slice(0, 10).map((p: { name: string }) => p.name).join(', ')
  const seedContext = seed_keyword ? `Seed keyword: "${seed_keyword}". ` : ''

  const prompt = `${seedContext}Generate 20 targeted keyword suggestions for this Australian ${industry} business.

Business: ${biz.name}
Industry: ${industry}
Location: ${suburb}
Products/services: ${productNames || 'not specified'}
Already tracking: ${[...alreadyTracked].slice(0, 10).join(', ') || 'none'}

Generate keywords NOT already in the "Already tracking" list. Mix of:
- Local intent ("${industry} ${suburb}", "near me")
- Product/service specific ("buy [product] ${suburb}")
- Informational ("how to", "best", "where to find")
- Brand discovery

Return JSON only:
{
  "suggestions": [
    {
      "keyword": "exact search phrase",
      "difficulty": "low|medium|high",
      "relevance": "high|medium|low",
      "intent": "local|product|informational|transactional",
      "reason": "one sentence why this keyword matters for this business"
    }
  ]
}`

  let suggestions: KeywordSuggestion[] = []

  try {
    const msg = await trackAICall(
      { route: 'seo/keyword-suggestions', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'keyword-suggestions' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      })
    )

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    if (Array.isArray(parsed.suggestions)) {
      suggestions = parsed.suggestions
        .filter((s: KeywordSuggestion) => typeof s.keyword === 'string' && s.keyword.trim())
        .filter((s: KeywordSuggestion) => !alreadyTracked.has(s.keyword.toLowerCase()))
        .slice(0, 20)
        .map((s: KeywordSuggestion) => ({
          keyword: String(s.keyword).trim(),
          difficulty: ['low', 'medium', 'high'].includes(s.difficulty) ? s.difficulty : 'medium',
          relevance: ['high', 'medium', 'low'].includes(s.relevance) ? s.relevance : 'medium',
          intent: String(s.intent || 'general'),
          reason: String(s.reason || ''),
        }))
    }
  } catch {
    // Fallback: generate basic local keyword suggestions
    const fallbackTerms = ['near me', 'best ' + industry, industry + ' ' + suburb, industry + ' open now']
    suggestions = fallbackTerms
      .filter(k => !alreadyTracked.has(k.toLowerCase()))
      .map(k => ({ keyword: k, difficulty: 'medium' as const, relevance: 'high' as const, intent: 'local', reason: 'High-volume local intent keyword for your industry' }))
  }

  return NextResponse.json({ suggestions, total: suggestions.length })
}

export const POST = withErrorCapture('seo/keyword-suggestions', _POST)
