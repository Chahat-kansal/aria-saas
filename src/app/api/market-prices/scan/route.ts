export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { searchMarketPrice } from '@/lib/aria/market-prices'

const MAX_PRODUCTS = 20
const MAX_RETAILERS = 5

async function runScanInBackground(
  scanId: string,
  businessId: string,
  industry: string,
  productIds?: string[]
) {
  try {
    // Load active products ordered by revenue (highest value first)
    let query = supabaseAdmin
      .from('pos_products')
      .select('id, name, price, category, barcode, is_active')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .limit(MAX_PRODUCTS)

    if (productIds?.length) {
      query = query.in('id', productIds)
    }

    const { data: products } = await query

    if (!products?.length) {
      await supabaseAdmin.from('market_price_scans').update({
        status: 'complete', products_scanned: 0, prices_found: 0,
        finished_at: new Date().toISOString(),
      }).eq('id', scanId)
      return
    }

    let pricesFound = 0
    let overpricedCount = 0
    let underpricedCount = 0
    let potentialRevenueCents = 0

    for (const product of products) {
      const ownerPriceDollars = Number(product.price ?? 0)
      const ownerPriceCents = Math.round(ownerPriceDollars * 100)
      const searchQuery = product.name as string
      const category = (product.category as string | null) ?? ''

      // Check cache first — skip re-fetch within 24h window
      const { data: cached } = await supabaseAdmin
        .from('pos_market_price_cache')
        .select('id, shelf_price, source_name')
        .eq('product_id', product.id)
        .gte('expires_at', new Date().toISOString())
        .limit(MAX_RETAILERS)

      let results
      if (cached && cached.length > 0) {
        // Use cached results — don't re-fetch
        results = (cached as Array<{ shelf_price: number; source_name: string }>)
      } else {
        // Fresh fetch
        const marketResults = await searchMarketPrice(searchQuery, category, industry)
        results = marketResults

        if (marketResults.length > 0) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          const rows = marketResults.map(r => ({
            product_id: product.id,
            business_id: businessId,
            barcode: (product.barcode as string | null) ?? null,
            source_name: r.source_name,
            source_url: r.source_url,
            shelf_price: r.shelf_price,
            fetched_at: new Date().toISOString(),
            expires_at: expiresAt,
            search_query: r.search_query,
            retailer_type: 'competitor',
          }))

          // Delete stale entries for this product, then insert fresh
          await supabaseAdmin.from('pos_market_price_cache').delete().eq('product_id', product.id)
          await supabaseAdmin.from('pos_market_price_cache').insert(rows)
        }
      }

      if (results.length === 0) continue
      pricesFound += results.length

      // Compute market average and gaps
      const prices = results.map(r => {
        const p = typeof r === 'object' && 'shelf_price' in r ? Number(r.shelf_price) : 0
        return p
      }).filter(p => p > 0)

      if (prices.length === 0) continue

      const marketAvgDollars = prices.reduce((s, p) => s + p, 0) / prices.length
      const marketAvgCents = Math.round(marketAvgDollars * 100)
      const gapCents = ownerPriceCents - marketAvgCents
      const gapPct = marketAvgCents > 0 ? (gapCents / marketAvgCents) * 100 : 0
      const isOverpriced = gapPct > 5
      const isUnderpriced = gapPct < -5

      if (isOverpriced) {
        overpricedCount++
        potentialRevenueCents += gapCents // revenue recoverable per unit if matched
      }
      if (isUnderpriced) underpricedCount++

      // Update gap columns on the cache rows we just inserted
      await supabaseAdmin.from('pos_market_price_cache')
        .update({
          price_gap_cents: gapCents,
          price_gap_pct: Math.round(gapPct * 100) / 100,
          is_overpriced: isOverpriced,
          is_underpriced: isUnderpriced,
        })
        .eq('product_id', product.id)
    }

    await supabaseAdmin.from('market_price_scans').update({
      status: 'complete',
      products_scanned: products.length,
      prices_found: pricesFound,
      overpriced_count: overpricedCount,
      underpriced_count: underpricedCount,
      potential_revenue_gain_cents: potentialRevenueCents,
      finished_at: new Date().toISOString(),
    }).eq('id', scanId)
  } catch (e) {
    await supabaseAdmin.from('market_price_scans').update({
      status: 'failed',
      error_detail: (e as Error).message?.slice(0, 500) ?? 'scan error',
      finished_at: new Date().toISOString(),
    }).eq('id', scanId)
  }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; product_ids?: string[] }
  const { business_id, product_ids } = body
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, industry')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 1-scan-per-day limit (enforced server-side)
  const { data: todaysScan } = await supabaseAdmin
    .from('market_price_scans')
    .select('id, started_at, status')
    .eq('business_id', business_id)
    .eq('status', 'complete')
    .gte('started_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .maybeSingle()

  if (todaysScan) {
    return NextResponse.json({
      error: 'daily_limit_reached',
      message: 'Market price scan already ran today. Results are fresh — check again tomorrow.',
      next_available: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      last_scan_id: todaysScan.id,
    }, { status: 429 })
  }

  const { data: created, error: createErr } = await supabaseAdmin
    .from('market_price_scans')
    .insert({
      business_id,
      status: 'running',
      triggered_by: 'manual',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'Could not start scan' }, { status: 500 })
  }

  const industry = (biz.industry as string | null) ?? 'retail'
  // Fire and forget — don't keep the HTTP connection open
  void runScanInBackground(created.id, business_id, industry, product_ids)

  return NextResponse.json({ ok: true, scan_id: created.id, status: 'running' })
}

export const POST = withErrorCapture('market-prices/scan', _POST)
