export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withCronRetry } from '@/lib/api/retry'
import { searchMarketPrice } from '@/lib/aria/market-prices'

const CRON_MAX_PRODUCTS = 10  // tighter budget than manual scan (20)
const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const now = Date.now()
  const thirtyDaysAgo = new Date(now - THIRTY_DAYS_MS).toISOString()
  const twentyHoursAgo = new Date(now - TWENTY_HOURS_MS).toISOString()

  // Businesses that have used the feature in the last 30 days but haven't been scanned in 20h
  const { data: activeBusinessIds } = await supabaseAdmin
    .from('market_price_scans')
    .select('business_id')
    .gte('started_at', thirtyDaysAgo)
    .eq('status', 'complete')

  if (!activeBusinessIds?.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No active businesses to scan.' })
  }

  const uniqueIds = [...new Set(activeBusinessIds.map(r => r.business_id as string))]

  // Filter out businesses scanned in the last 20h
  const { data: recentScans } = await supabaseAdmin
    .from('market_price_scans')
    .select('business_id')
    .in('business_id', uniqueIds)
    .gte('started_at', twentyHoursAgo)
    .eq('status', 'complete')

  const recentlyScanned = new Set((recentScans ?? []).map(r => r.business_id as string))
  const toScan = uniqueIds.filter(id => !recentlyScanned.has(id))

  if (toScan.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'All active businesses scanned recently.' })
  }

  // Load industry for each business
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, industry')
    .in('id', toScan)

  const bizMap = new Map((businesses ?? []).map(b => [b.id as string, (b.industry as string | null) ?? 'retail']))

  let processed = 0
  const errors: string[] = []

  for (const businessId of toScan) {
    try {
      const industry = bizMap.get(businessId) ?? 'retail'

      // Create scan row
      const { data: scan } = await supabaseAdmin
        .from('market_price_scans')
        .insert({ business_id: businessId, status: 'running', triggered_by: 'cron', started_at: new Date().toISOString() })
        .select('id')
        .single()

      if (!scan) continue

      const { data: products } = await supabaseAdmin
        .from('pos_products')
        .select('id, name, price, category, barcode')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .limit(CRON_MAX_PRODUCTS)

      if (!products?.length) {
        await supabaseAdmin.from('market_price_scans').update({ status: 'complete', products_scanned: 0, prices_found: 0, finished_at: new Date().toISOString() }).eq('id', scan.id)
        processed++
        continue
      }

      let pricesFound = 0
      let overpricedCount = 0
      let underpricedCount = 0
      let potentialRevenueCents = 0

      for (const product of products) {
        const ownerPriceCents = Math.round(Number(product.price ?? 0) * 100)

        // Skip if cached within 24h
        const { data: cached } = await supabaseAdmin
          .from('pos_market_price_cache')
          .select('id')
          .eq('product_id', product.id)
          .gte('expires_at', new Date().toISOString())
          .limit(1)
          .maybeSingle()
        if (cached) { pricesFound++; continue }

        const marketResults = await searchMarketPrice(product.name as string, (product.category as string | null) ?? '', industry)
        if (!marketResults.length) continue

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        await supabaseAdmin.from('pos_market_price_cache').delete().eq('product_id', product.id)
        await supabaseAdmin.from('pos_market_price_cache').insert(marketResults.map(r => ({
          product_id: product.id, business_id: businessId,
          barcode: (product.barcode as string | null) ?? null,
          source_name: r.source_name, source_url: r.source_url,
          shelf_price: r.shelf_price, fetched_at: new Date().toISOString(),
          expires_at: expiresAt, search_query: r.search_query, retailer_type: 'competitor',
        })))

        pricesFound += marketResults.length
        const prices = marketResults.map(r => r.shelf_price).filter(p => p > 0)
        if (!prices.length) continue

        const marketAvgCents = Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100)
        const gapCents = ownerPriceCents - marketAvgCents
        const gapPct = marketAvgCents > 0 ? (gapCents / marketAvgCents) * 100 : 0
        const isOverpriced = gapPct > 5
        const isUnderpriced = gapPct < -5

        if (isOverpriced) { overpricedCount++; potentialRevenueCents += gapCents }
        if (isUnderpriced) underpricedCount++

        await supabaseAdmin.from('pos_market_price_cache')
          .update({ price_gap_cents: gapCents, price_gap_pct: Math.round(gapPct * 100) / 100, is_overpriced: isOverpriced, is_underpriced: isUnderpriced })
          .eq('product_id', product.id)
      }

      await supabaseAdmin.from('market_price_scans').update({
        status: 'complete', products_scanned: products.length, prices_found: pricesFound,
        overpriced_count: overpricedCount, underpriced_count: underpricedCount,
        potential_revenue_gain_cents: potentialRevenueCents, finished_at: new Date().toISOString(),
      }).eq('id', scan.id)

      processed++
    } catch (e) {
      errors.push(`${businessId}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, processed, errors: errors.length ? errors : undefined })
}

export const GET = withCronRetry('market-price-refresh', _GET)
