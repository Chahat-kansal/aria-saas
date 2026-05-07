export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 45

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { ARIA_VOICE } from '@/lib/aria-voice-guide'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { getWeatherForecast, getUpcomingHolidays } from '@/lib/external-apis'
import { trackUsage } from '@/lib/track-usage'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, business_id } = await req.json()

  const { data: biz } = await supabase
    .from('businesses')
    .select('id,name,industry,city')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  trackUsage({ business_id: biz.id, event_type: 'pos_chat' })

  // ── Competitor price detection ──────────────────────────────────────────────
  const competitorKeywords = [
    'competitor', 'competition', 'competing', 'other shop', 'other store',
    'price compare', 'am i competitive', 'cheaper', 'more expensive',
    'market price', 'rival', 'nearby', 'down the road', 'same price',
    'dan murphy', 'bws', 'woolworths', 'coles', 'aldi',
  ]
  const isCompetitorQuery = competitorKeywords.some(k => message.toLowerCase().includes(k))

  let mentionedProduct: string | null = null
  if (isCompetitorQuery) {
    const { data: prodNames } = await supabase.from('pos_products')
      .select('name').eq('business_id', biz.id).eq('is_active', true).limit(100)
    const lower = message.toLowerCase()
    mentionedProduct = prodNames?.find(p =>
      lower.includes(p.name.toLowerCase().split(' ')[0].toLowerCase())
    )?.name ?? null
  }

  if (isCompetitorQuery && mentionedProduct) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aria-saas-fot6.vercel.app'
    const priceRes = await fetch(`${appUrl}/api/aria/competitor-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({ business_id: biz.id, product_name: mentionedProduct }),
    }).catch(() => null)

    if (priceRes?.ok) {
      const pd = await priceRes.json()
      const ownPrice = (pd.own_price_cents || 0) / 100
      const avgPrice = (pd.avg_competitor_price_cents || 0) / 100
      const diff = ownPrice - avgPrice
      const diffPct = avgPrice > 0 ? (diff / avgPrice * 100) : 0
      const posLabel = pd.positioning === 'below_market' ? 'below market — you are the cheapest option'
        : pd.positioning === 'above_market' ? 'above market — you are more expensive than competitors'
        : 'at market — you are competitively priced'

      const competitorRows = (pd.competitors || []).map((c: any) => [
        c.competitor_name,
        `A$${(c.price_cents / 100).toFixed(2)}`,
        c.confidence === 'high' ? '✓ Confirmed' : '~ Estimated',
        c.price_cents < pd.own_price_cents ? '🟢 Cheaper' : '🔴 Pricier',
      ])

      return NextResponse.json({
        message: `${mentionedProduct}: you're at A$${ownPrice.toFixed(2)}, ${posLabel}. Market average is A$${avgPrice.toFixed(2)} — you're ${Math.abs(diffPct).toFixed(1)}% ${diff > 0 ? 'above' : 'below'} average.`,
        cards: [
          { type: 'metric', label: 'Your Price', value: ownPrice.toFixed(2), prefix: 'A$', change_pct: Math.abs(diffPct), change_dir: diff > 0 ? 'down' : 'up', color: diff > 0 ? 'amber' : 'green' },
          { type: 'metric', label: 'Market Average', value: avgPrice.toFixed(2), prefix: 'A$', color: 'cyan' },
          { type: 'metric', label: 'Your Margin', value: (pd.own_margin_pct || 0).toFixed(1), suffix: '%', color: (pd.own_margin_pct || 0) > 20 ? 'green' : 'amber' },
        ],
        data_tables: competitorRows.length > 0 ? [{
          title: `Competitor Prices — ${mentionedProduct}`,
          columns: ['Competitor', 'Price', 'Confidence', 'vs You'],
          rows: competitorRows,
          highlight_row: (pd.competitors || []).findIndex(
            (c: any) => c.price_cents === Math.min(...(pd.competitors || []).map((x: any) => x.price_cents))
          ),
        }] : [],
        actions: [
          diff > 0
            ? { label: 'Lower price to match market', action: 'adjust_price', data: { product: mentionedProduct, suggested_cents: Math.round(avgPrice * 100) }, color: 'amber', icon: '📉' }
            : { label: 'View all products', action: 'view_products', data: {}, color: 'violet', icon: '📦' },
          { label: 'Run full competitor scan', action: 'competitor_scan', data: { business_id: biz.id }, color: 'cyan', icon: '🔍' },
        ],
        chart: null,
        context_type: 'competitor_price_comparison',
      })
    }
  }

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [
    { data: todaySales },
    { data: yesterdaySales },
    { data: weekSales },
    { data: monthSales },
    { data: lastMonthSales },
    { data: topProducts },
    { data: lowStock },
    { data: allProducts },
    { data: promotions },
    weather,
  ] = await Promise.all([
    supabase.from('pos_sales')
      .select('id,total_amount,payment_method,created_at,served_by')
      .eq('business_id', biz.id)
      .gte('created_at', todayStart.toISOString())
      .limit(200),
    supabase.from('pos_sales')
      .select('id,total_amount')
      .eq('business_id', biz.id)
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString())
      .limit(200),
    supabase.from('pos_sales')
      .select('total_amount')
      .eq('business_id', biz.id)
      .gte('created_at', weekStart.toISOString())
      .limit(500),
    supabase.from('pos_sales')
      .select('total_amount')
      .eq('business_id', biz.id)
      .gte('created_at', monthStart.toISOString())
      .limit(500),
    supabase.from('pos_sales')
      .select('total_amount')
      .eq('business_id', biz.id)
      .gte('created_at', lastMonthStart.toISOString())
      .lte('created_at', lastMonthEnd.toISOString())
      .limit(500),
    supabase.from('pos_sale_items')
      .select('product_name,quantity,line_total')
      .gte('created_at', weekStart.toISOString())
      .limit(500),
    supabase.from('pos_products')
      .select('id,name,stock_quantity,cost_price,price,category_id')
      .eq('business_id', biz.id)
      .eq('is_active', true)
      .lt('stock_quantity', 10),
    supabase.from('pos_products')
      .select('id,name,stock_quantity,price,cost_price,category_id')
      .eq('business_id', biz.id)
      .eq('is_active', true)
      .limit(200),
    supabase.from('pos_promotions')
      .select('name,active')
      .eq('business_id', biz.id)
      .eq('active', true),
    getWeatherForecast(biz.city || 'Melbourne').catch(() => []),
  ])

  // All monetary values in DB are dollars — multiply by 100 to work as cents internally
  const toCents = (dollars: number) => Math.round((dollars || 0) * 100)
  const getTotal = (sales: any[] | null) =>
    (sales || []).reduce((s, x) => s + toCents(x.total_amount), 0)
  const fmt = (cents: number) => (cents / 100).toFixed(2)

  const todayRevenueCents   = getTotal(todaySales)
  const todayCount          = (todaySales || []).length
  const todayAvgCents       = todayCount > 0 ? todayRevenueCents / todayCount : 0
  const yesterdayRevenueCents = getTotal(yesterdaySales)
  const weekRevenueCents    = getTotal(weekSales)
  const monthRevenueCents   = getTotal(monthSales)
  const lastMonthRevenueCents = getTotal(lastMonthSales)

  const revenueChangePct = yesterdayRevenueCents > 0
    ? ((todayRevenueCents - yesterdayRevenueCents) / yesterdayRevenueCents * 100) : 0
  const monthChangePct = lastMonthRevenueCents > 0
    ? ((monthRevenueCents - lastMonthRevenueCents) / lastMonthRevenueCents * 100) : 0

  const productMap: Record<string, { qty: number; revenue: number }> = {}
  for (const item of (topProducts || [])) {
    if (!item.product_name) continue
    if (!productMap[item.product_name]) productMap[item.product_name] = { qty: 0, revenue: 0 }
    productMap[item.product_name].qty += item.quantity || 0
    productMap[item.product_name].revenue += toCents(item.line_total)
  }
  const topProductsList = Object.entries(productMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)
    .map(([name, d], i) => ({ rank: i + 1, name, qty: d.qty, revenue: d.revenue }))

  const paymentBreakdown: Record<string, number> = {}
  for (const sale of (todaySales || [])) {
    const method = sale.payment_method || 'cash'
    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + toCents(sale.total_amount)
  }

  const hourlyToday: Record<number, number> = {}
  for (const sale of (todaySales || [])) {
    const hour = new Date(sale.created_at).getHours()
    hourlyToday[hour] = (hourlyToday[hour] || 0) + toCents(sale.total_amount)
  }

  const hotWeekend = (weather as any[]).slice(0, 7).some((d: any) => d.is_hot)
  const holidays = getUpcomingHolidays(7, 'VIC')

  const ctx = `
REAL-TIME BUSINESS DATA for ${biz.name} (${biz.industry}):

TODAY (${new Date().toLocaleDateString('en-AU')}):
  Revenue: A$${fmt(todayRevenueCents)} (${revenueChangePct >= 0 ? '+' : ''}${revenueChangePct.toFixed(1)}% vs yesterday)
  Transactions: ${todayCount} (avg A$${fmt(todayAvgCents)})
  Yesterday: A$${fmt(yesterdayRevenueCents)}, ${(yesterdaySales || []).length} transactions
  Payment breakdown: ${Object.entries(paymentBreakdown).map(([m, v]) => `${m}: A$${fmt(v)}`).join(', ') || 'No sales yet'}

THIS WEEK: A$${fmt(weekRevenueCents)}
THIS MONTH: A$${fmt(monthRevenueCents)} (${monthChangePct >= 0 ? '+' : ''}${monthChangePct.toFixed(1)}% vs last month)
LAST MONTH: A$${fmt(lastMonthRevenueCents)}

TOP PRODUCTS THIS WEEK:
${topProductsList.map(p => `  ${p.rank}. ${p.name}: ${p.qty} sold, A$${fmt(p.revenue)} revenue`).join('\n') || '  No sales data yet'}

LOW STOCK ALERTS (under 10 units):
${(lowStock || []).map(p => `  ⚠️ ${p.name}: ${p.stock_quantity} remaining`).join('\n') || '  None — all good'}

TOTAL PRODUCTS: ${(allProducts || []).length}
ACTIVE PROMOTIONS: ${(promotions || []).map(p => p.name).join(', ') || 'None'}

WEATHER: ${hotWeekend ? '☀️ Hot weekend forecast — expect increased cold drink demand' : '🌤 Mild conditions'}
UPCOMING: ${holidays.length > 0 ? holidays.slice(0, 2).map((h: any) => `${h.name} in ${h.days_away} days`).join(', ') : 'None this week'}

HOURLY TODAY: ${Object.entries(hourlyToday).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, v]) => `${h}:00=A$${fmt(v)}`).join(', ') || 'No sales yet'}
`

  const systemPrompt = `${ARIA_VOICE}

You are Aria, the AI business analyst for ${biz.name}.
You have access to REAL-TIME business data shown above.
All monetary values are in Australian dollars (A$).

YOUR JOB: Give the owner insights like a senior business analyst.
Use SPECIFIC NUMBERS from the data. Never be vague.

RESPONSE FORMAT — return ONLY valid JSON, no other text:

{
  "message": "1-3 sentences, specific numbers, direct insight",
  "cards": [
    {
      "type": "metric",
      "label": "Today Revenue",
      "value": "1,234.50",
      "prefix": "A$",
      "suffix": "",
      "change_pct": 12.5,
      "change_dir": "up",
      "color": "green"
    }
  ],
  "data_tables": [
    {
      "title": "Top Products This Week",
      "columns": ["Product", "Sold", "Revenue"],
      "rows": [["Coopers Pale", "48", "A$264.00"]],
      "highlight_row": 0
    }
  ],
  "chart": {
    "type": "bar",
    "labels": ["9am", "10am", "11am"],
    "values": [120, 340, 280],
    "label": "Revenue by Hour",
    "color": "#00E5FF"
  },
  "actions": [
    {
      "label": "Create Promotion",
      "action": "create_promotion",
      "data": {},
      "color": "violet",
      "icon": "🎯"
    }
  ],
  "context_type": "sales_overview"
}

CARD RULES:
- 2-4 metric cards for any sales/revenue question
- change_dir: "up" green, "down" red, "flat" gray
- Colors: "green","red","amber","violet","cyan","blue"
- All money with A$ prefix

TABLE RULES:
- Include for product performance or comparisons
- Max 8 rows, highlight_row: 0 for top row

CHART RULES:
- Bar chart for hourly data
- null if no chart adds value

ACTION RULES:
- 1-3 relevant actions always
- Available: create_promotion, reorder_product, view_report, adjust_price, open_orders, view_products, close_register, create_order, adjust_stock, run_autopilot

TONE: Direct, specific, Australian English, A$ always`

  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'

  let structured: any
  try {
    structured = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    structured = { message: raw, cards: [], data_tables: [], chart: null, actions: [], context_type: 'general' }
  }

  // Auto-create draft order for low stock if action requests it
  const actionResults: any[] = []
  for (const action of (structured.actions || [])) {
    if (action.auto_execute && action.action === 'create_order') {
      const items = (lowStock || []).slice(0, 10).map(p => ({
        product_id: p.id,
        product_name: p.name,
        current_stock: p.stock_quantity,
        suggested_qty: 24,
        manual_qty: null,
        unit_cost_cents: toCents(p.cost_price),
        total_cost_cents: 24 * toCents(p.cost_price),
        reason: 'Low stock — auto-ordered by Aria',
      }))
      if (items.length > 0) {
        await supabase.from('purchase_order_drafts').insert({
          business_id: biz.id,
          draft_type: 'ai_generated',
          status: 'pending_approval',
          items,
          total_cost_cents: items.reduce((s, i) => s + i.total_cost_cents, 0),
          aria_reasoning: 'Created by Aria chat — low stock detected',
          week_starting: new Date().toISOString().split('T')[0],
        })
        actionResults.push({ type: 'order_created', message: `Draft order created for ${items.length} products` })
      }
    }
  }

  return NextResponse.json({ ...structured, action_results: actionResults })
}
