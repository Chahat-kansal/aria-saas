export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { withCronRetry } from '@/lib/api/retry'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submitBatch } from '@/lib/aria-batch'
import { nowAEST, toAESTStart, toAESTEnd, startOfWeekAEST } from '@/lib/date-au'
import { ARIA_SYSTEM_PROMPT } from '@/lib/aria-system-prompt'
import { trackCron } from '@/app/api/cron/_lib/track-cron'

interface MarketCtx {
  overpricedCount: number
  underpricedCount: number
  biggestOverpricedProduct: string | null
  biggestGapCents: number
  potentialRevenueCents: number
  lastChecked: string | null
}

async function getMarketPriceContext(businessId: string): Promise<MarketCtx | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: scan } = await supabaseAdmin
    .from('market_price_scans')
    .select('id, overpriced_count, underpriced_count, potential_revenue_gain_cents, finished_at')
    .eq('business_id', businessId)
    .eq('status', 'complete')
    .gte('started_at', sevenDaysAgo)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!scan) return null

  // Find the biggest overpriced gap for a specific product name
  const { data: topOverpriced } = await supabaseAdmin
    .from('pos_market_price_cache')
    .select('search_query, price_gap_cents')
    .eq('business_id', businessId)
    .eq('is_overpriced', true)
    .order('price_gap_cents', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    overpricedCount: scan.overpriced_count as number ?? 0,
    underpricedCount: scan.underpriced_count as number ?? 0,
    biggestOverpricedProduct: (topOverpriced?.search_query as string | null) ?? null,
    biggestGapCents: (topOverpriced?.price_gap_cents as number | null) ?? 0,
    potentialRevenueCents: scan.potential_revenue_gain_cents as number ?? 0,
    lastChecked: scan.finished_at as string | null,
  }
}

function buildMarketPricesPromptBlock(market: MarketCtx | null, industry: string | null): string {
  if (!market) return ''
  const ind = (industry ?? 'retail').toLowerCase()
  const lastDate = market.lastChecked ? new Date(market.lastChecked).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'recently'

  if (market.overpricedCount > 0) {
    const gain = (market.potentialRevenueCents / 100).toFixed(0)
    const product = market.biggestOverpricedProduct ?? 'a product'
    const gap = (market.biggestGapCents / 100).toFixed(2)
    if (ind === 'liquor') return `\n\nMARKET PRICE ALERT (checked ${lastDate}): ${market.overpricedCount} product(s) priced above major retailers. Dan Murphy's guarantee means customers who check will leave. Biggest gap: ${product} at A$${gap} above market — fixing it alone could recover A$${gain} in unit margins. Visit Competitor Intelligence → Market Prices to match with one click.`
    if (ind === 'cafe') return `\n\nMARKET PRICE INTELLIGENCE (checked ${lastDate}): ${market.overpricedCount} item(s) above market average. Biggest gap: ${product} is A$${gap} above the local average — that's pricing power you're not capturing, or margin you're losing. Check Market Prices tab to review.`
    if (ind === 'restaurant') return `\n\nPRICING INSIGHT (checked ${lastDate}): ${market.overpricedCount} menu item(s) above Uber Eats/Menulog average for your area. Your delivery margin is exposed — ${product} is A$${gap} above market. Review Market Prices in Competitor Intelligence.`
    return `\n\nMARKET PRICE ALERT (checked ${lastDate}): ${market.overpricedCount} product(s) priced above major retailers. Biggest gap: ${product} at A$${gap} above market. Fixing pricing could recover A$${gain} per unit. Visit Competitor Intelligence → Market Prices.`
  }

  if (market.underpricedCount > 0) {
    if (ind === 'cafe') return `\n\nPRICING POWER (checked ${lastDate}): ${market.underpricedCount} item(s) below local average — you have room to raise prices without losing customers. Check Market Prices in Competitor Intelligence.`
    if (ind === 'bakery') return `\n\nPRICING OPPORTUNITY (checked ${lastDate}): ${market.underpricedCount} product(s) below artisan bakery average in your area. Strong demand signal — consider a small price increase and monitor conversion. Market Prices tab has the details.`
    return `\n\nPRICING POWER (checked ${lastDate}): ${market.underpricedCount} product(s) are below market average — you have room to raise prices. Check Market Prices in Competitor Intelligence.`
  }

  return `\n\nMARKET PRICING (last checked ${lastDate}): Your pricing is competitive — no significant gaps found.`
}

async function buildBriefingContext(businessId: string) {
  // TZ-1: yesterday = yesterday's AEST calendar date, bounded with +10:00 instants
  // (businesses.timezone is selected at the call site but date-au has no TZ param — AEST assumed, multi-TZ later)
  const yday = new Date(nowAEST().getTime() - 86400000).toISOString().slice(0, 10)
  const yStart = toAESTStart(yday)
  const yEnd   = toAESTEnd(yday)
  // WEEK-1: "Week so far" = calendar week, Monday 00:00 AEST → now (was rolling 7 days — AUDIT-1 finding #3 mislabel)
  const weekAgo = toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))

  const [{ data: ySales }, { data: wSales }, { data: stock }, { data: items }] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', yStart).lte('created_at', yEnd),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', weekAgo),
    supabaseAdmin.from('pos_products').select('name,stock_quantity,low_stock_threshold').eq('business_id', businessId).eq('is_active', true).limit(20),
    supabaseAdmin.from('pos_sale_items').select('product_name,quantity').eq('business_id', businessId).gte('created_at', yStart).lte('created_at', yEnd),
  ])

  const counts: Record<string, number> = {}
  for (const i of items ?? []) {
    counts[i.product_name] = (counts[i.product_name] ?? 0) + (i.quantity ?? 1)
  }
  const topProduct = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'no sales'

  return {
    yesterdayRevenue: (ySales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2),
    yesterdayTransactions: (ySales ?? []).length,
    weekRevenue: (wSales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2),
    topProduct,
    lowStock: (stock ?? []).filter(p => (p.stock_quantity ?? 0) < (p.low_stock_threshold ?? 5)).slice(0, 3).map(p => p.name),
  }
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'daily-briefing-submit', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,city,owner_name,timezone')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    const requests = await Promise.all(businesses.map(async biz => {
      const [ctx, marketCtx] = await Promise.all([
        buildBriefingContext(biz.id),
        getMarketPriceContext(biz.id),
      ])
      const marketBlock = buildMarketPricesPromptBlock(marketCtx, biz.industry ?? null)
      return {
        custom_id: biz.id,
        params: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: ARIA_SYSTEM_PROMPT,
          messages: [{
            role: 'user' as const,
            content: `Write today's morning briefing for ${biz.name}, a ${biz.industry ?? 'business'} in ${biz.city ?? 'Australia'}. Owner: ${biz.owner_name ?? 'there'}.\n\nYesterday: A$${ctx.yesterdayRevenue} from ${ctx.yesterdayTransactions} sales. Top seller: ${ctx.topProduct}.\nWeek so far: A$${ctx.weekRevenue}.\nLow stock: ${ctx.lowStock.join(', ') || 'none'}.${marketBlock}\n\nWrite 4 sentences: how yesterday went, one thing to watch today, one specific action they should take now. If market price data is included, add a sentence about the pricing opportunity. End with a single priority. No bullet points.`,
          }],
        },
      }
    }))

    const batchId = await submitBatch(requests)

    await supabaseAdmin.from('aria_batch_jobs').insert({
      batch_id: batchId, job_type: 'daily_briefing',
      business_count: businesses.length, status: 'submitted',
    })

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      businesses_processed: businesses.length,
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, batch_id: batchId, count: businesses.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function _GETTracked(req: Request) {
  return trackCron('daily-briefing-submit', async () => _GET(req))
}
export const GET = withCronRetry('daily-briefing-submit', _GETTracked)
