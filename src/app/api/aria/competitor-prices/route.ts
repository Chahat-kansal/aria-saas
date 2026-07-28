export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import * as Sentry from '@sentry/nextjs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseLLMJsonOr } from '@/lib/ai-json'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { requireSection } from '@/lib/billing/enforce'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { business_id, product_name, product_category, competitors: competitorNames } = await req.json() as {
      business_id: string; product_name: string; product_category?: string; competitors?: string[]
    }
    if (!business_id || !product_name) return NextResponse.json({ error: 'business_id and product_name required' }, { status: 400 })

    const { data: biz } = await supabase.from('businesses')
      .select('id,name,industry,city').eq('id', business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // SS-RECONCILE — was requireFeature(business_id, 'competitor_analysis') (pro-only). Competitor
    // watch's nav item lives in the 'Reputation' section, which is growth+ in the confirmed plan
    // matrix — this loosens from pro to growth, never re-tightens (RULE0).
    const gate = await requireSection(business_id, 'Reputation')
    if (gate) return gate

    // Own product price
    const { data: ownProduct } = await supabase.from('pos_products')
      .select('name,price,cost_price,category_id')
      .eq('business_id', business_id).eq('is_active', true)
      .ilike('name', `%${product_name}%`).maybeSingle()

    const ownPriceCents = Math.round((ownProduct?.price || 0) * 100)
    const ownCostCents = Math.round((ownProduct?.cost_price || 0) * 100)
    const ownMarginPct = ownPriceCents > 0 ? ((ownPriceCents - ownCostCents) / ownPriceCents * 100) : 0

    // 24-hour cache check
    const { data: cached } = await supabase.from('competitor_price_cache')
      .select('*').eq('business_id', business_id)
      .ilike('product_name', `%${product_name}%`)
      .gte('expires_at', new Date().toISOString())
      .order('searched_at', { ascending: false }).limit(10)

    // Exclude any previously cached entries that were AI-estimated (confidence: 'low')
    const validCached = (cached || []).filter(r => r.confidence !== 'low')
    if (validCached.length >= 2) {
      return buildResponse(product_name, ownPriceCents, ownMarginPct, validCached.map(r => ({
        competitor_name: r.competitor_name,
        price_cents: r.competitor_price_cents,
        confidence: r.confidence,
        source_url: r.found_url,
        in_stock: true,
      })), true)
    }

    // Get nearby competitors for context
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ariaos.site'
    let nearbyNames: string[] = competitorNames || []
    if (nearbyNames.length === 0) {
      try {
        const compRes = await fetch(`${appUrl}/api/aria/competitors?business_id=${business_id}&radius_m=5000`, {
          headers: { cookie: req.headers.get('cookie') || '' },
        })
        if (compRes.ok) {
          const compData = await compRes.json()
          nearbyNames = (compData.competitors || []).slice(0, 6).map((c: any) => c.competitor_name)
        }
      } catch { /* use fallback */ }
    }

    // Claude web_search to find prices
    let prices: any[] = []
    const client = new Anthropic()
    const businessCity = biz.city || 'Australia'

    const searchPrompt = `Search for the current retail price of "${product_name}" at these specific businesses in ${businessCity}, Australia: ${nearbyNames.slice(0, 5).join(', ')}.

Also search: "${product_name}" price Australia

For each competitor you find a price for, extract:
1. The exact current price in Australian dollars
2. Whether it appears to be in stock
3. The specific product size/variant if shown

Return ONLY a JSON array (no other text):
[
  {
    "competitor_name": "Store Name",
    "price_cents": 2499,
    "in_stock": true,
    "product_variant": "750ml",
    "source_url": "https://...",
    "confidence": "high"
  }
]
confidence: "high" if exact price found, "medium" if approximate, "low" if estimated.
Return [] if no prices found.`

    try {
      const createParams: any = {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 800,
      temperature: 0.4,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: searchPrompt }],
      }
      const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/competitor-prices', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'competitor-price-search' }, () => client.messages.create(createParams, {
        headers: { 'anthropic-beta': 'web-search-2025-03-05' },
      } as any))

      const textBlocks = response.content.filter((b: any) => b.type === 'text')
      const jsonText = textBlocks.map((b: any) => b.text).join('')
      prices = parseLLMJsonOr<any[]>(jsonText, [], 'competitor-prices', 'array')
    } catch {
      // Web search unavailable — never estimate; return honest "no data" response
      return NextResponse.json({
        competitors: [],
        error: 'price_search_unavailable',
        message: 'Live competitor price data is not available right now. We never show estimated or AI-generated prices — only verified data from web search.',
        retryable: true,
      }, { status: 200 })
    }

    // Save to cache
    for (const p of prices) {
      await supabase.from('competitor_price_cache').insert({
        business_id,
        product_name,
        competitor_name: p.competitor_name,
        competitor_price_cents: p.price_cents,
        confidence: p.confidence || 'medium',
        found_url: p.source_url || null,
        searched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      })
    }

    return buildResponse(product_name, ownPriceCents, ownMarginPct, prices, false)
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'aria/competitor-prices' } })
    return NextResponse.json({
      competitors: [],
      error: 'price_search_unavailable',
      message: 'Live competitor price data is not available right now. We never show estimated or AI-generated prices — only verified data from web search.',
      retryable: true,
    }, { status: 200 })
  }
}

function buildResponse(
  product_name: string,
  ownPriceCents: number,
  ownMarginPct: number,
  prices: any[],
  from_cache: boolean,
) {
  const sorted = [...prices].sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
  const avgCents = prices.length > 0
    ? Math.round(prices.reduce((s, p) => s + (p.price_cents || 0), 0) / prices.length)
    : 0

  const positioning = ownPriceCents === 0 || avgCents === 0 ? 'unknown'
    : ownPriceCents < avgCents * 0.95 ? 'below_market'
    : ownPriceCents > avgCents * 1.05 ? 'above_market'
    : 'at_market'

  return NextResponse.json({
    product_name,
    own_price_cents: ownPriceCents,
    own_margin_pct: Math.round(ownMarginPct * 10) / 10,
    competitors: sorted,
    avg_competitor_price_cents: avgCents,
    positioning,
    cheapest: sorted[0] || null,
    most_expensive: sorted[sorted.length - 1] || null,
    searched_at: new Date().toISOString(),
    from_cache,
  })
}

export const POST = withErrorCapture('aria/competitor-prices', _POST)
