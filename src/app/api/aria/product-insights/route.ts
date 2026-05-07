export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { product_id, business_id } = await req.json() as { product_id: string; business_id: string }
    if (!product_id || !business_id) return NextResponse.json({ error: 'product_id and business_id required' }, { status: 400 })

    const { data: biz } = await supabase.from('businesses').select('id')
      .eq('id', business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 1-hour cache
    const cacheFloor = new Date(Date.now() - 3600000).toISOString()
    const { data: cached } = await supabase.from('external_data_cache')
      .select('data').eq('cache_key', `product_insights:${product_id}`)
      .gte('cached_at', cacheFloor).maybeSingle()
    if (cached?.data) return NextResponse.json(cached.data)

    const from12m = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0]
    const from30d = new Date(Date.now() - 30 * 86400000).toISOString()

    const [{ data: product }, { data: saleItems30d }, { data: saleItems12m }] = await Promise.all([
      supabase.from('pos_products')
        .select('name,price,cost_price,stock_quantity,is_active')
        .eq('id', product_id).maybeSingle(),
      supabase.from('pos_sale_items')
        .select('quantity,line_total,created_at')
        .eq('product_id', product_id).eq('business_id', business_id)
        .gte('created_at', from30d).limit(500),
      supabase.from('pos_sale_items')
        .select('quantity,line_total,created_at')
        .eq('product_id', product_id).eq('business_id', business_id)
        .gte('created_at', `${from12m}T00:00:00`)
        .limit(2000),
    ])

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    // Metrics
    const units30d = (saleItems30d || []).reduce((s, i) => s + (i.quantity || 0), 0)
    const rev30d   = (saleItems30d || []).reduce((s, i) => s + (i.line_total || 0), 0)
    const dailyVel = units30d / 30
    const daysStock = dailyVel > 0 && (product.stock_quantity ?? 0) > 0
      ? Math.round((product.stock_quantity ?? 0) / dailyVel) : 999

    const priceCents = Math.round((product.price || 0) * 100)
    const costCents  = Math.round((product.cost_price || 0) * 100)
    const marginPct  = priceCents > 0 ? ((priceCents - costCents) / priceCents * 100) : 0

    // Monthly grouping for trend
    const monthMap: Record<string, number> = {}
    for (const item of (saleItems12m || [])) {
      const m = item.created_at.slice(0, 7)
      monthMap[m] = (monthMap[m] || 0) + (item.quantity || 0)
    }
    const months = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))
    const lastMonth  = months[months.length - 1]?.[1] ?? 0
    const prevMonth  = months[months.length - 2]?.[1] ?? 0
    const trendPct   = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth * 100) : 0
    const trendLabel = trendPct > 10 ? `up ${trendPct.toFixed(0)}%` : trendPct < -10 ? `down ${Math.abs(trendPct).toFixed(0)}%` : 'stable'
    const bestMonth  = months.reduce((b, m) => m[1] > (b[1] || 0) ? m : b, ['—', 0] as [string, number])

    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'You are Aria, an AI business analyst. Give concise product insights. Max 3 bullet points. Australian dollars. Be specific with numbers. No preamble.',
      messages: [{
        role: 'user',
        content: `Product: ${product.name}
Sales trend: ${trendLabel} vs previous month
Best month: ${bestMonth[0]} (${bestMonth[1]} units)
Last 30 days: ${units30d} units, A$${rev30d.toFixed(2)} revenue
Current stock: ${product.stock_quantity ?? 0} units
Days of stock at current velocity: ${daysStock === 999 ? 'No recent sales' : daysStock + ' days'}
Margin: ${marginPct.toFixed(1)}%
Sell price: A$${product.price?.toFixed(2)}
Cost: A$${product.cost_price?.toFixed(2)}

Give 3 specific insights and 1 recommended action. Format:
- [insight 1]
- [insight 2]
- [insight 3]
💡 Recommended: [action]`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const lines = text.split('\n').filter(l => l.trim())
    const insights = lines.filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
    const recLine  = lines.find(l => l.startsWith('💡')) ?? ''
    const recommendation = recLine.replace(/^💡\s*Recommended:\s*/i, '').trim()

    const result = {
      insights,
      recommendation,
      metrics: {
        units_30d: units30d,
        revenue_30d: rev30d,
        daily_velocity: Math.round(dailyVel * 100) / 100,
        days_of_stock: daysStock,
        margin_pct: Math.round(marginPct * 10) / 10,
        trend_pct: Math.round(trendPct * 10) / 10,
        trend_label: trendLabel,
        best_month: bestMonth[0],
      },
    }

    // Cache result
    await supabase.from('external_data_cache').upsert({
      cache_key: `product_insights:${product_id}`,
      data: result,
      cached_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })

    return NextResponse.json(result)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
