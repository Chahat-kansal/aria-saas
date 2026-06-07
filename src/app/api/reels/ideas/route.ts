export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { CANONICAL_COLS, getCaveat } from '@/lib/aria/schema-registry'

const anthropic = new Anthropic()

// Registry-canonical DOW names aligned with JS getDay() (0=Sunday)
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Registry slow_day method: daily-bucketing over 90 days (neq voided, limit 3000)
async function computeSlowDay(business_id: string): Promise<{ name: string; avgRev: number } | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('created_at,total_amount')
    .eq('business_id', business_id)
    .neq('status', 'voided')
    .gte('created_at', ninetyDaysAgo)
    .limit(3000)

  if (!sales?.length) return null

  // Step 1: bucket by calendar date
  const dailyRevenue: Record<string, number> = {}
  for (const sale of sales) {
    const dateKey = (sale.created_at as string).slice(0, 10)
    dailyRevenue[dateKey] = (dailyRevenue[dateKey] ?? 0) + Number(sale.total_amount ?? 0)
  }

  // Step 2: group daily totals by DOW, average them
  const dowBuckets: Record<number, { total: number; days: number }> = {}
  for (const [dateStr, rev] of Object.entries(dailyRevenue)) {
    const dow = new Date(dateStr).getDay()
    const b = dowBuckets[dow] ?? { total: 0, days: 0 }
    b.total += rev
    b.days++
    dowBuckets[dow] = b
  }

  // Step 3: require ≥8 calendar days per DOW; rank ascending
  const slowEntry = Object.entries(dowBuckets)
    .filter(([, d]) => d.days >= 8)
    .map(([dow, d]) => ({ dow: Number(dow), avgRev: d.total / d.days }))
    .sort((a, b) => a.avgRev - b.avgRev)[0] ?? null

  return slowEntry ? { name: DOW_NAMES[slowEntry.dow], avgRev: slowEntry.avgRev } : null
}

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

  const context = {
    business_name: biz.name,
    industry: biz.industry,
    top_products: topProducts,
    slow_day: slowDay ? { name: slowDay.name, avg_daily_revenue: slowDay.avgRev.toFixed(2) } : null,
    low_stock: lowStock,
    new_products: newProducts,
    recent_reviews: recentReviews,
    revenue_trend: revenueTrend,
    data_sources: {
      product_revenue: 'pos_sale_items.' + CANONICAL_COLS.PRODUCT_REVENUE + ' (registry canonical)',
      product_stock: 'pos_products.' + CANONICAL_COLS.PRODUCT_STOCK + ' (registry canonical)',
      slow_day_method: 'daily-bucketing average (registry slow_day canonical)',
    },
  }

  const prompt = `You are Aria, an AI business advisor for Australian small businesses. Generate exactly 5 specific, actionable reel ideas based on this live business data.

Business: ${biz.name} (${biz.industry})
Top selling products this week (by revenue from live POS): ${JSON.stringify(topProducts)}
Slowest day of week: ${slowDay ? slowDay.name + ' (avg $' + slowDay.avgRev.toFixed(2) + '/day — 90-day daily average)' : 'insufficient data'}
Low stock products: ${JSON.stringify(lowStock)}
New products added recently: ${JSON.stringify(newProducts)}
Recent positive reviews: ${JSON.stringify(recentReviews)}
Revenue trend (this week vs last week): ${JSON.stringify(revenueTrend)}

ASSERTION GUARD — ABSOLUTE — NEVER BREAK:
Every product name, day name, revenue figure, and stock count you mention in a reel idea MUST come from the data provided above. NEVER invent a product name, price, stock level, or revenue figure not shown in the data above. If a field is empty or null, do not fabricate data for it. Reference specific product names and days exactly as they appear in the data.

Generate 5 reel ideas. Each idea must be directly tied to the actual business data above — reference specific product names, days, or insights.

Respond ONLY with a JSON array of exactly 5 objects. No other text. Each object:
{
  "title": "Short punchy title (max 6 words)",
  "why": "One sentence explaining why this reel makes business sense based on the data — cite the specific data point",
  "style": "One of: lifestyle, ugc, product_showcase, cinematic, behind_scenes, flash_sale, testimonial, day_in_life",
  "prompt": "Specific scene description for video generation (2-3 sentences, mention the actual product/day from the data)",
  "hook": "Opening caption hook for Instagram (max 10 words, attention-grabbing)",
  "hashtags": ["tag1", "tag2", "tag3"],
  "urgency": "high|medium|low"
}`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (response.content[0] as { type: string; text: string }).text ?? ''
  let ideas: unknown[] = []
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    ideas = JSON.parse(clean) as unknown[]
  } catch {
    return NextResponse.json({ error: 'Failed to parse ideas', raw: text }, { status: 500 })
  }

  return NextResponse.json({ ideas, context, slow_day_caveat: slowDayCaveat })
}
