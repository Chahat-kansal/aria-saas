export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { CANONICAL_COLS, getCaveat } from '@/lib/aria/schema-registry'
import { computeSlowDay } from '@/lib/aria/slow-day'

const anthropic = new Anthropic()

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabaseAdmin.from('businesses')
    .select('id, name, industry').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  // Run data queries in parallel — registry-canonical sources
  const [
    topItemsResult,
    lowStockResult,
    newProductsResult,
    recentReviewsResult,
    recentSalesResult,
    slowDayResult,
    promosResult,
  ] = await Promise.allSettled([
    // product_sales domain: pos_sale_items.line_total + quantity (CANONICAL_COLS.PRODUCT_REVENUE)
    supabaseAdmin.from('pos_sale_items')
      .select(`product_name,${CANONICAL_COLS.PRODUCT_UNITS},${CANONICAL_COLS.PRODUCT_REVENUE}`)
      .eq('business_id', business_id)
      .gte('created_at', sevenDaysAgo)
      .limit(500),

    // product_stock domain: pos_products.stock_quantity (CANONICAL_COLS.PRODUCT_STOCK)
    supabaseAdmin.from('pos_products')
      .select(`name,${CANONICAL_COLS.PRODUCT_STOCK},reorder_point,price`)
      .eq('business_id', business_id)
      .eq('is_active', true)
      .not(CANONICAL_COLS.PRODUCT_STOCK, 'is', null)
      .lt(CANONICAL_COLS.PRODUCT_STOCK, 10)
      .order(CANONICAL_COLS.PRODUCT_STOCK)
      .limit(3),

    // New products added last 14 days
    supabaseAdmin.from('pos_products')
      .select('name,price,created_at')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .gte('created_at', fourteenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(4),

    // Recent positive reviews
    supabaseAdmin.from('reviews')
      .select('rating,content,text,reviewer_name')
      .eq('business_id', business_id)
      .gte('rating', 4)
      .order('created_at', { ascending: false })
      .limit(3),

    // Revenue last 7 days vs prior 7 days (revenue domain: pos_sales.total_amount)
    supabaseAdmin.from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', fourteenDaysAgo),

    // slow_day domain: daily-bucketing method (computed separately)
    computeSlowDay(business_id),

    // Active and upcoming promotions — canonical: pos_promotions
    supabaseAdmin.from('pos_promotions')
      .select('name, promotion_type, discount_amount, active, starts_at, ends_at')
      .eq('business_id', business_id)
      .order('starts_at', { ascending: false })
      .limit(10),
  ])

  // Aggregate top products by revenue (line_total canonical)
  const topItemsData = topItemsResult.status === 'fulfilled' ? (topItemsResult.value.data ?? []) : []
  const productRevenue: Record<string, { units: number; revenue: number }> = {}
  for (const item of topItemsData) {
    const name = (item as Record<string, unknown>).product_name as string | null
    if (!name) continue
    const p = productRevenue[name] ?? { units: 0, revenue: 0 }
    p.units += Number((item as Record<string, unknown>)[CANONICAL_COLS.PRODUCT_UNITS] ?? 0)
    p.revenue += Number((item as Record<string, unknown>)[CANONICAL_COLS.PRODUCT_REVENUE] ?? 0)
    productRevenue[name] = p
  }
  const topProducts = Object.entries(productRevenue)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(([name, d]) => ({ name, revenue: Math.round(d.revenue * 100) / 100, units: d.units }))

  const lowStock = lowStockResult.status === 'fulfilled' ? (lowStockResult.value.data ?? []) : []
  const newProducts = newProductsResult.status === 'fulfilled' ? (newProductsResult.value.data ?? []) : []
  const recentReviews = recentReviewsResult.status === 'fulfilled'
    ? (recentReviewsResult.value.data ?? []).map((rv: Record<string, unknown>) => ({
        rating: rv.rating,
        review_text: (rv.content ?? rv.text ?? '') as string,
        reviewer_name: rv.reviewer_name as string,
      }))
    : []

  const recentSalesData = recentSalesResult.status === 'fulfilled' ? (recentSalesResult.value.data ?? []) : []
  const cutoff = Date.now() - 7 * 86400000
  const recentRev = recentSalesData.filter(s => new Date((s as Record<string,unknown>).created_at as string).getTime() > cutoff)
    .reduce((a, s) => a + Number((s as Record<string,unknown>).total_amount ?? 0), 0)
  const priorRev = recentSalesData.filter(s => new Date((s as Record<string,unknown>).created_at as string).getTime() <= cutoff)
    .reduce((a, s) => a + Number((s as Record<string,unknown>).total_amount ?? 0), 0)
  const revenueTrend = {
    recentRev: Math.round(recentRev * 100) / 100,
    priorRev: Math.round(priorRev * 100) / 100,
    trend: priorRev > 0 ? ((recentRev - priorRev) / priorRev * 100).toFixed(1) : null,
  }

  const slowDay = slowDayResult.status === 'fulfilled' ? slowDayResult.value : null
  const slowDayCaveat = getCaveat('slow_day') ?? ''

  // Active and upcoming promotions (active now, or starting in the future)
  const allPromos = promosResult.status === 'fulfilled' ? ((promosResult.value.data ?? []) as Array<Record<string, unknown>>) : []
  const nowMs = Date.now()
  const activePromos = allPromos.filter(p => {
    if (p.active) return true
    const starts = p.starts_at ? new Date(p.starts_at as string).getTime() : null
    return starts !== null && starts > nowMs
  }).slice(0, 3)

  const context = {
    business_name: biz.name,
    industry: biz.industry,
    top_products: topProducts,
    slow_day: slowDay ? { name: slowDay.slowest.name, avg_daily_revenue: slowDay.slowest.avgRev.toFixed(2) } : null,
    low_stock: lowStock,
    new_products: newProducts,
    recent_reviews: recentReviews,
    revenue_trend: revenueTrend,
    active_promos: activePromos,
    data_sources: {
      product_revenue: 'pos_sale_items.' + CANONICAL_COLS.PRODUCT_REVENUE + ' (registry canonical)',
      product_stock: 'pos_products.' + CANONICAL_COLS.PRODUCT_STOCK + ' (registry canonical)',
      slow_day_method: 'daily-bucketing average (registry slow_day canonical)',
      promotions: 'pos_promotions.active / starts_at',
    },
  }

  const promoLine = activePromos.length > 0
    ? `Active/upcoming promotions: ${JSON.stringify(activePromos.map(p => ({ name: p.name, type: p.promotion_type, discount: p.discount_amount, active: p.active, starts_at: p.starts_at })))}`
    : 'Active/upcoming promotions: none'

  const prompt = `You are Aria, an AI business advisor for Australian small businesses. Generate exactly 5 specific, actionable reel ideas based on this live business data.

Business: ${biz.name} (${biz.industry})
Top selling products this week (by revenue from live POS): ${JSON.stringify(topProducts)}
Slowest day of week: ${slowDay ? slowDay.slowest.name + ' (avg $' + slowDay.slowest.avgRev.toFixed(2) + '/day — 28-day daily average)' : 'insufficient data'}
Low stock products: ${JSON.stringify(lowStock)}
New products added recently: ${JSON.stringify(newProducts)}
Recent positive reviews: ${JSON.stringify(recentReviews)}
Revenue trend (this week vs last week): ${JSON.stringify(revenueTrend)}
${promoLine}

ASSERTION GUARD — ABSOLUTE — NEVER BREAK:
Every product name, day name, revenue figure, stock count, and promotion name you mention in a reel idea MUST come from the data provided above. NEVER invent a product name, price, discount, stock level, or revenue figure not shown in the data above. If a field is empty or null, do not fabricate data for it. Reference specific product names, days, and promotion names exactly as they appear in the data.

IDEA RULES:
- At least one idea must feature the #1 top product by revenue (if data available)
- If slow_day data is available, at least one idea must target driving traffic on that specific day
- If an active or upcoming promotion exists, at least one idea must feature it (use flash_sale or lifestyle style)
- If a high-volume item (high units sold) exists, feature its volume as the social proof hook
- If no data is available for a signal, skip that type of idea rather than fabricating

Generate 5 reel ideas. Each idea must be directly tied to the actual business data above — reference specific product names, days, or insights.

Respond ONLY with a JSON array of exactly 5 objects. No other text. Each object:
{
  "title": "Short punchy title (max 6 words)",
  "why": "One sentence explaining why this reel makes business sense based on the data — cite the specific data point (e.g. product name, day, promo name, revenue figure)",
  "style": "One of: lifestyle, ugc, product_showcase, cinematic, behind_scenes, flash_sale, testimonial, day_in_life",
  "prompt": "Specific scene description for video generation (2-3 sentences, mention the actual product/day/promo from the data)",
  "hook": "Opening caption hook for Instagram (max 10 words, attention-grabbing)",
  "hashtags": ["tag1", "tag2", "tag3"],
  "urgency": "high|medium|low"
}`

  const t0 = Date.now()
  let ideas: unknown[] = []
  let inputTokens = 0, outputTokens = 0, callSuccess = true, callError: string | null = null

  try {
    const ac = new AbortController()
    let hardTimerId: ReturnType<typeof setTimeout> | undefined
    const hardTimeout = new Promise<never>((_, rej) => {
      hardTimerId = setTimeout(() => {
        ac.abort()
        rej(new Error('reel_suggestions timed out after 25000ms'))
      }, 25_000)
    })

    const response = await Promise.race([
      anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }, { signal: ac.signal }),
      hardTimeout,
    ])
    clearTimeout(hardTimerId)

    inputTokens = response.usage.input_tokens
    outputTokens = response.usage.output_tokens

    const text = (response.content[0] as { type: string; text: string }).text ?? ''
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      ideas = JSON.parse(clean) as unknown[]
    } catch {
      return NextResponse.json({ error: 'Failed to parse ideas', raw: text }, { status: 500 })
    }
  } catch (e) {
    callSuccess = false
    callError = (e as Error).message
    console.error('[reels/ideas] generation failed:', callError)
    return NextResponse.json({ error: 'Ideas generation failed', detail: callError }, { status: 500 })
  } finally {
    const latencyMs = Date.now() - t0
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id,
        agent_key: 'reel_suggestions',
        provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001',
        role: 'other',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        success: callSuccess,
        error_message: callError,
        request_summary: `${biz.name} reel ideas (${topProducts.length} products, slow_day=${slowDay?.slowest.name ?? 'n/a'}, promos=${activePromos.length})`,
        response_summary: callSuccess ? `${ideas.length} ideas generated` : null,
      })
    } catch { /* non-fatal telemetry */ }
  }

  return NextResponse.json({ ideas, context, slow_day_caveat: slowDayCaveat })
}
