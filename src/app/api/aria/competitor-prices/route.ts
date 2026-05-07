export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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

    if (cached && cached.length >= 2) {
      return buildResponse(product_name, ownPriceCents, ownMarginPct, cached.map(r => ({
        competitor_name: r.competitor_name,
        price_cents: r.competitor_price_cents,
        confidence: r.confidence,
        source_url: r.found_url,
        in_stock: true,
      })), true)
    }

    // Get nearby competitors for context
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aria-saas-fot6.vercel.app'
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: searchPrompt }],
      }
      const response = await client.messages.create(createParams, {
        headers: { 'anthropic-beta': 'web-search-2025-03-05' },
      } as any)

      const textBlocks = response.content.filter((b: any) => b.type === 'text')
      const jsonText = textBlocks.map((b: any) => b.text).join('')
      const match = jsonText.match(/\[[\s\S]*\]/)
      if (match) prices = JSON.parse(match[0])
    } catch {
      // Web search unavailable — fall back to Claude text generation
      try {
        const fallbackRes = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Based on typical Australian retail pricing, estimate the price of "${product_name}" at these stores in ${businessCity}: ${nearbyNames.slice(0, 4).join(', ')}. Return ONLY a JSON array: [{"competitor_name":"Name","price_cents":1999,"in_stock":true,"confidence":"low"}]. Use realistic Australian prices.`,
          }],
        })
        const text = fallbackRes.content[0].type === 'text' ? fallbackRes.content[0].text : ''
        const m = text.match(/\[[\s\S]*\]/)
        if (m) prices = JSON.parse(m[0])
      } catch { /* return empty */ }
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
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
