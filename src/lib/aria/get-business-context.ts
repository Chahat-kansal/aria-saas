import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getWeatherContext } from './get-weather-context'

export async function getBusinessContext(businessId: string): Promise<string> {
  const supabase = createServerSupabaseClient()
  const db = supabaseAdmin
  const now = new Date()

  const d7  = new Date(now.getTime() - 7  * 86400000).toISOString()
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()
  const d90 = new Date(now.getTime() - 90 * 86400000).toISOString()

  const ly = new Date(now.getTime() - 365 * 86400000)
  const ly7start  = new Date(ly.getTime() - 7  * 86400000).toISOString()
  const ly7end    = ly.toISOString()
  const ly30start = new Date(ly.getTime() - 30 * 86400000).toISOString()
  const ly30end   = ly.toISOString()

  const [
    business,
    sales7, sales30, sales90,
    ly7, ly30,
    saleItems7,
    customers, reviews, outcomes, lowStock,
  ] = await Promise.allSettled([
    db.from('businesses').select('*').eq('id', businessId).single(),
    db.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', businessId).gte('created_at', d7).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId).gte('created_at', d30).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId).gte('created_at', d90).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', ly7start).lte('created_at', ly7end).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', ly30start).lte('created_at', ly30end).neq('status', 'voided'),
    // SKU aggregation from sale_items
    db.from('pos_sale_items').select('product_name, quantity, unit_price')
      .in('sale_id',
        (await db.from('pos_sales').select('id')
          .eq('business_id', businessId).gte('created_at', d7).neq('status', 'voided')
        ).data?.map((s: any) => s.id) ?? []
      ),
    db.from('customers').select('id, name, total_spent, last_visit, visit_count')
      .eq('business_id', businessId).order('total_spent', { ascending: false }).limit(5),
    db.from('reviews').select('rating, text, created_at')
      .eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
    db.from('aria_outcomes').select('recommendation_type, recommendation_detail, recommended_at')
      .eq('business_id', businessId).order('recommended_at', { ascending: false }).limit(5),
    db.from('pos_products').select('name, stock_quantity, reorder_point')
      .eq('business_id', businessId).eq('is_active', true)
      .filter('stock_quantity', 'lte', 10).limit(5),
  ])

  // SKU aggregation from sale_items
  const skuMap: Record<string, { revenue: number; units: number; name: string }> = {}
  if (saleItems7.status === 'fulfilled' && saleItems7.value.data) {
    for (const item of saleItems7.value.data) {
      const key = item.product_name ?? 'unknown'
      if (!skuMap[key]) skuMap[key] = { revenue: 0, units: 0, name: key }
      skuMap[key].revenue += (item.unit_price ?? 0) * (item.quantity ?? 1)
      skuMap[key].units  += item.quantity ?? 1
    }
  }
  const skus     = Object.values(skuMap).sort((a, b) => b.revenue - a.revenue)
  const top20    = skus.slice(0, 10)
  const bottom20 = skus.length > 5 ? skus.slice(-10).reverse() : []

  const sum = (r: any) => r.status === 'fulfilled'
    ? (r.value.data ?? []).reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0)
    : null

  const rev7   = sum(sales7)
  const rev30  = sum(sales30)
  const rev90  = sum(sales90)
  const lyRev7  = sum(ly7)
  const lyRev30 = sum(ly30)

  const yoy7  = rev7 != null && lyRev7  != null && lyRev7  > 0
    ? (((rev7  - lyRev7)  / lyRev7)  * 100).toFixed(1) + '%' : null
  const yoy30 = rev30 != null && lyRev30 != null && lyRev30 > 0
    ? (((rev30 - lyRev30) / lyRev30) * 100).toFixed(1) + '%' : null

  const biz   = business.status  === 'fulfilled' ? business.value.data   : null
  const custs = customers.status === 'fulfilled' ? customers.value.data  ?? [] : []
  const revs  = reviews.status   === 'fulfilled' ? reviews.value.data    ?? [] : []
  const outs  = outcomes.status  === 'fulfilled' ? outcomes.value.data   ?? [] : []
  const alts  = lowStock.status  === 'fulfilled' ? lowStock.value.data   ?? [] : []

  const lapsed = custs.filter((c: any) =>
    c.last_visit && new Date(c.last_visit) < new Date(now.getTime() - 42 * 86400000)
  )

  const avgRating = revs.length
    ? (revs.reduce((s: number, r: any) => s + (r.rating ?? 0), 0) / revs.length).toFixed(1)
    : null

  const hasSalesData = (rev7 ?? 0) > 0 || skus.length > 0

  const city     = biz?.city ?? biz?.suburb ?? 'Melbourne'
  const industry = biz?.industry ?? 'retail'
  const weather  = await getWeatherContext(industry, city)

  return JSON.stringify({
    _meta: {
      snapshot_date: now.toISOString().split('T')[0],
      has_sales_data: hasSalesData,
      business_id: businessId,
    },
    business: biz ? {
      name:             biz.name,
      industry:         biz.industry,
      city:             biz.city ?? biz.suburb ?? 'AU',
      owner_name:       biz.owner_name ?? biz.contact_name ?? 'the owner',
      plan:             biz.plan,
      pos_enabled:      biz.pos_enabled ?? false,
      entity_type:      biz.entity_type ?? null,
      business_model:   biz.business_model ?? null,
      year_established: biz.year_established ?? null,
      biggest_challenge: biz.biggest_challenge ?? null,
    } : null,
    revenue: {
      last_7_days:    rev7,
      last_30_days:   rev30,
      last_90_days:   rev90,
      yoy_7d_change:  yoy7,
      yoy_30d_change: yoy30,
      yoy_note: yoy7
        ? `vs same period last year: 7d ${yoy7}, 30d ${yoy30 ?? 'n/a'}`
        : 'no prior year data available',
    },
    top_products_7d:  top20.map(s => ({ name: s.name, revenue: s.revenue, units: s.units })),
    slow_products_7d: bottom20.map(s => ({ name: s.name, revenue: s.revenue, units: s.units })),
    customers: {
      total:           custs.length,
      top_5_by_spend:  custs.slice(0, 5).map((c: any) => ({
        name: c.name, total_spent: c.total_spent, visit_count: c.visit_count
      })),
      lapsed_count:  lapsed.length,
      lapsed_sample: lapsed.slice(0, 3).map((c: any) => ({
        name: c.name, last_visit: c.last_visit, total_spent: c.total_spent
      })),
    },
    reviews: {
      average_rating: avgRating,
      recent: revs.slice(0, 3).map((r: any) => ({
        rating: r.rating, text: r.text?.slice(0, 200), date: r.created_at
      })),
    },
    low_stock_alerts: alts,
    recent_aria_outcomes: outs,
    weather: weather ?? { _note: 'Weather data unavailable — proceeding without weather context.' },
    seo: await (async () => {
      try {
        const [seoCtx, kwRankings] = await Promise.all([
          db.from('aria_seo_context').select('health_score, critical_issues, top_keyword, top_keyword_rank, updated_at').eq('business_id', businessId).maybeSingle(),
          db.from('seo_keyword_rankings').select('keyword, current_position, position_history, last_checked_at').eq('business_id', businessId).order('current_position', { ascending: true }).limit(10),
        ])
        const seo = seoCtx.data
        const rankings = (kwRankings.data ?? []) as Array<{ keyword: string; current_position: number | null; position_history: unknown; last_checked_at: string | null }>

        const top5 = rankings
          .filter(r => r.current_position != null)
          .slice(0, 5)
          .map(r => ({ keyword: r.keyword, position: r.current_position }))

        const movers: Array<{ keyword: string; from: number; to: number; change: number }> = []
        for (const r of rankings) {
          if (r.current_position == null) continue
          const hist = Array.isArray(r.position_history) ? (r.position_history as Array<{ position: number | null }>) : []
          if (hist.length < 2) continue
          const prev = hist[hist.length - 2].position
          if (prev == null) continue
          const change = prev - r.current_position
          if (Math.abs(change) > 3) movers.push({ keyword: r.keyword, from: prev, to: r.current_position, change })
        }

        return {
          health_score: seo?.health_score ?? null,
          critical_issues: seo?.critical_issues ?? null,
          top_keyword: seo?.top_keyword ?? (top5[0]?.keyword ?? null),
          top_keyword_rank: seo?.top_keyword_rank ?? (top5[0]?.position ?? null),
          last_audit: seo?.updated_at ?? null,
          top_keywords: top5,
          ranking_movers: movers.slice(0, 5),
        }
      } catch { return null }
    })(),
  }, null, 2)
}

// Pre-flight guard — call before Claude on analysis routes
export function hasEnoughData(context: string): boolean {
  try {
    return JSON.parse(context)._meta?.has_sales_data === true
  } catch {
    return false
  }
}
