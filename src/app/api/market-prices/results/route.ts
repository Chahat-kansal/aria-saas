export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const business_id = url.searchParams.get('business_id')
  const overpricedOnly = url.searchParams.get('overpriced_only') === 'true'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Verify ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Latest scan summary
  const { data: latestScan } = await supabaseAdmin
    .from('market_price_scans')
    .select('id, status, products_scanned, prices_found, overpriced_count, underpriced_count, potential_revenue_gain_cents, started_at, finished_at')
    .eq('business_id', business_id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Market price cache entries joined with product info
  let cacheQuery = supabaseAdmin
    .from('pos_market_price_cache')
    .select('id, product_id, source_name, source_url, shelf_price, fetched_at, expires_at, price_gap_cents, price_gap_pct, is_overpriced, is_underpriced, search_query, retailer_type')
    .eq('business_id', business_id)
    .order('fetched_at', { ascending: false })
    .limit(limit * 10)

  if (overpricedOnly) cacheQuery = cacheQuery.eq('is_overpriced', true)

  const { data: cacheRows } = await cacheQuery

  // Load product info for all unique product_ids
  const productIds = [...new Set((cacheRows ?? []).map(r => r.product_id as string))]
  const { data: products } = productIds.length > 0
    ? await supabaseAdmin.from('pos_products').select('id, name, price, category').in('id', productIds)
    : { data: [] }

  const productMap = new Map((products ?? []).map(p => [p.id, p]))

  // Group by product_id → pick best/lowest market price, list all retailers
  const grouped = new Map<string, {
    product_id: string
    product_name: string
    your_price_cents: number
    your_price_dollars: number
    market_low_dollars: number
    market_avg_dollars: number
    price_gap_cents: number
    price_gap_pct: number
    is_overpriced: boolean
    is_underpriced: boolean
    retailers: Array<{ name: string; price: number; url: string }>
  }>()

  for (const row of (cacheRows ?? [])) {
    const pid = row.product_id as string
    const product = productMap.get(pid)
    if (!product) continue

    const price = Number(row.shelf_price)
    if (!grouped.has(pid)) {
      grouped.set(pid, {
        product_id: pid,
        product_name: product.name as string,
        your_price_cents: Math.round(Number(product.price) * 100),
        your_price_dollars: Number(product.price),
        market_low_dollars: price,
        market_avg_dollars: price,
        price_gap_cents: row.price_gap_cents as number ?? 0,
        price_gap_pct: Number(row.price_gap_pct ?? 0),
        is_overpriced: Boolean(row.is_overpriced),
        is_underpriced: Boolean(row.is_underpriced),
        retailers: [],
      })
    }

    const g = grouped.get(pid)!
    if (price < g.market_low_dollars) g.market_low_dollars = price
    g.market_avg_dollars = (g.market_avg_dollars + price) / 2
    g.retailers.push({
      name: row.source_name as string,
      price,
      url: row.source_url as string,
    })
  }

  const results = [...grouped.values()].slice(0, limit)

  return NextResponse.json({ scan: latestScan, results })
}

export const GET = withErrorCapture('market-prices/results', _GET)
