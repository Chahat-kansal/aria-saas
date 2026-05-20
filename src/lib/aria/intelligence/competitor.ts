import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface CompetitorCheckResult {
  competitor_name: string
  products_found: Array<{
    product_name: string
    competitor_price: number | null
    your_price: number | null
    price_gap: number | null
    alert: boolean
    detail: string
  }>
  checked_at: string
  source_quality: 'high' | 'medium' | 'low'
}

export async function checkCompetitorPrices(
  businessId: string,
  watchId: string,
  competitorName: string,
  competitorUrl: string | null,
  productsToWatch: string[],
): Promise<CompetitorCheckResult> {
  const supabase = createServerSupabaseClient()

  const { data: yourProducts } = await supabase.from('pos_products')
    .select('name,price,category,brand')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .limit(200)

  const yourPriceMap = new Map(
    (yourProducts ?? []).map((p: Record<string,unknown>) => [String(p.name).toLowerCase(), Number(p.price) || 0])
  )

  const productList = productsToWatch.length > 0
    ? productsToWatch.slice(0, 5).join(', ')
    : 'products prices'
  const query = competitorUrl
    ? `site:${competitorUrl} prices ${productList} AUD`
    : `"${competitorName}" prices ${productList} AUD Australia`

  // Use Anthropic web_search (already in the stack, no extra API key)
  let answer = ''
  try {
    const anthropic = new Anthropic()
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: query }],
    } as Parameters<typeof anthropic.messages.create>[0], {
      headers: { 'anthropic-beta': 'web-search-2025-03-05' }
    } as never) as { content: Array<{type: string; text?: string}> }
    answer = resp.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
  } catch { answer = '' }

  const productsFound = productsToWatch.slice(0, 10).map(productName => {
    const yourPrice = yourPriceMap.get(productName.toLowerCase()) ?? null
    const escaped = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const priceRegex = new RegExp(`${escaped}[^$\n]*\\$([0-9]+\\.?[0-9]*)`, 'i')
    const match = answer.match(priceRegex)
    const competitorPrice = match ? parseFloat(match[1]) : null
    const priceGap = yourPrice && competitorPrice ? +(yourPrice - competitorPrice).toFixed(2) : null
    const alert = !!(priceGap && priceGap > 2)

    return {
      product_name: productName,
      competitor_price: competitorPrice,
      your_price: yourPrice,
      price_gap: priceGap,
      alert,
      detail: match ? `Found in search: "${match[0].trim()}"` : 'Price not found in search results',
    }
  })

  const result: CompetitorCheckResult = {
    competitor_name: competitorName,
    products_found: productsFound,
    checked_at: new Date().toISOString(),
    source_quality: answer ? 'medium' : 'low',
  }

  await supabaseAdmin.from('aria_competitor_watches').update({
    last_checked_at: result.checked_at,
    last_result: result,
    updated_at: result.checked_at,
  }).eq('id', watchId)

  const alerts = productsFound.filter(p => p.alert)
  if (alerts.length > 0) {
    await supabaseAdmin.from('aria_actions').insert({
      business_id: businessId,
      category: 'pricing',
      title: `Competitor alert: ${competitorName} is cheaper on ${alerts.length} item${alerts.length !== 1 ? 's' : ''}`,
      recommendation: alerts.map(a =>
        `${a.product_name}: ${competitorName} $${a.competitor_price?.toFixed(2)} vs yours $${a.your_price?.toFixed(2)} (gap: $${a.price_gap?.toFixed(2)})`
      ).join('. '),
      expected_impact: (alerts.reduce((s, a) => s + Math.abs(a.price_gap ?? 0), 0)).toFixed(2),
      confidence: 'medium',
      status: 'pending',
      source: 'aria_intelligence:competitor',
      priority: 'high',
      payload: { watch_id: watchId, competitor: competitorName, alerts },
    })
  }

  return result
}
