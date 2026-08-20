export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { guardOutput } from '@/lib/aria/ground-guard'
import { resolveCostFor, COST_SOURCE_LABEL } from '@/lib/inventory/resolve-cost'

async function _POST(req: Request) {
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

    const [{ data: product }, { data: saleItems30d }, { data: saleItems12m }, { data: invRows }] = await Promise.all([
      supabase.from('pos_products')
        .select('name,price,is_active')
        .eq('id', product_id).maybeSingle(),
      supabase.from('pos_sale_items')
        .select('quantity,line_total,created_at')
        .eq('product_id', product_id)
        .gte('created_at', from30d).limit(500),
      supabase.from('pos_sale_items')
        .select('quantity,line_total,created_at')
        .eq('product_id', product_id)
        .gte('created_at', `${from12m}T00:00:00`)
        .limit(2000),
      // FAB-FIX-1 — canonical on-hand (items_on_hand summed across outlets), NOT the stock_quantity cache.
      supabase.from('pos_outlet_inventory')
        .select('items_on_hand')
        .eq('business_id', business_id).eq('product_id', product_id).limit(10000),
    ])

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const onHand = (invRows || []).reduce((s, r) => s + (Number(r.items_on_hand) || 0), 0)

    // Metrics
    const units30d = (saleItems30d || []).reduce((s, i) => s + (i.quantity || 0), 0)
    const rev30d   = (saleItems30d || []).reduce((s, i) => s + (i.line_total || 0), 0)
    const dailyVel = units30d / 30
    const daysStock = dailyVel > 0 && onHand > 0
      ? Math.round(onHand / dailyVel) : 999

    const priceCents = Math.round((product.price || 0) * 100)
    // MS10 phase 2 — cost through the resolver. The raw cost_price is a fabricated price*0.4
    // back-calculation on most rows, so `|| 0` here produced either a definitionally-60% margin or
    // a 100% one. Unknown stays null and the margin says so, rather than being a number.
    const resolvedCost = await resolveCostFor(supabase, business_id, product_id, null)
    const costCents  = resolvedCost.cost != null ? Math.round(resolvedCost.cost * 100) : null
    const marginPct  = priceCents > 0 && costCents != null ? ((priceCents - costCents) / priceCents * 100) : null

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
    const response = await trackAICall({ route: 'aria/product-insights', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'product-insights' }, () => client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: 'You are Aria, an AI business analyst. Give concise product insights. Max 3 bullet points. Australian dollars. Be specific with numbers. No preamble.',
      messages: [{
        role: 'user',
        content: `Product: ${product.name}
Sales trend: ${trendLabel} vs previous month
Best month: ${bestMonth[0]} (${bestMonth[1]} units)
Last 30 days: ${units30d} units, A$${rev30d.toFixed(2)} revenue
Current stock: ${onHand} units
Days of stock at current velocity: ${daysStock === 999 ? 'No recent sales' : daysStock + ' days'}
Margin: ${marginPct != null ? marginPct.toFixed(1) + '%' : 'unknown — no cost recorded'}
Sell price: A$${product.price?.toFixed(2)}
Cost: ${costCents != null ? 'A$' + (costCents / 100).toFixed(2) + ' (' + COST_SOURCE_LABEL[resolvedCost.source] + ')' : 'unknown — no cost recorded'}
If the cost is an estimate or unknown, hedge any margin claims accordingly.

Give 3 specific insights and 1 recommended action. Format:
- [insight 1]
- [insight 2]
- [insight 3]
💡 Recommended: [action]`,
      }],
    }))

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const lines = text.split('\n').filter(l => l.trim())
    // BUGFIX-FAB-3 — guard each prose bullet + the recommendation against the REAL computed metrics.
    const allowed: number[] = [units30d, Math.round(rev30d * 100) / 100, Math.round(dailyVel * 100) / 100, daysStock, Math.round(trendPct * 10) / 10, onHand, Number(product.price) || 0]
    if (marginPct != null) allowed.push(Math.round(marginPct * 10) / 10)
    if (costCents != null) allowed.push(costCents / 100)
    const insightsRaw = lines.filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
    const insights = await Promise.all(insightsRaw.map(async s => (await guardOutput(s, allowed, { mode: 'strip', businessId: business_id, surface: 'product-insights' })).text))
    const recLine  = lines.find(l => l.startsWith('💡')) ?? ''
    const recommendation = (await guardOutput(recLine.replace(/^💡\s*Recommended:\s*/i, '').trim(), allowed, { mode: 'strip', businessId: business_id, surface: 'product-insights' })).text

    const result = {
      insights,
      recommendation,
      metrics: {
        units_30d: units30d,
        revenue_30d: rev30d,
        daily_velocity: Math.round(dailyVel * 100) / 100,
        days_of_stock: daysStock,
        margin_pct: marginPct != null ? Math.round(marginPct * 10) / 10 : null,
        cost_source: resolvedCost.source,
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

export const POST = withErrorCapture('aria/product-insights', _POST)
