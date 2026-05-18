import { createServerSupabaseClient } from '@/lib/supabase-server'
import { geocodeAddress } from './signals/geocode'
import { fetchWeather } from './signals/weather'
import type { BusinessContext, ProductContext } from './types'

const VELOCITY_WINDOW_DAYS = 28

export async function buildBusinessContext(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  opts: { productId?: string; includeWeather?: boolean } = {},
): Promise<BusinessContext | null> {
  const includeWeather = opts.includeWeather !== false

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, industry, industry_subtype').eq('id', businessId).maybeSingle()
  if (!biz) return null

  let weatherSignal: BusinessContext['external_signals']['weather'] = null
  if (includeWeather) {
    try {
      const { data: outlet } = await supabase.from('pos_outlets')
        .select('address').eq('business_id', businessId).eq('is_default', true).maybeSingle()
      if (outlet?.address) {
        const geo = await geocodeAddress(String(outlet.address))
        if (geo) weatherSignal = await fetchWeather(geo.lat, geo.lng, biz.industry ?? 'retail')
      }
    } catch { /* weather failure non-fatal */ }
  }

  const cutoff = new Date(Date.now() - VELOCITY_WINDOW_DAYS * 86400_000).toISOString()
  const obsCutoff = new Date(Date.now() - 14 * 86400_000).toISOString()

  const [salesQ, obsQ] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', cutoff),
    supabase.from('aria_actions').select('category, source, payload, created_at, status, title, reason').eq('business_id', businessId).gte('created_at', obsCutoff).order('created_at', { ascending: false }).limit(30),
  ])

  const salesArr = salesQ.data ?? []
  const totalRevenue = salesArr.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const avgTicket = salesArr.length > 0 ? totalRevenue / salesArr.length : 0

  const obs = obsQ.data ?? []
  const observations = obs.map(o => ({
    category: String(o.category ?? 'unknown'),
    event_type: String((o.payload as Record<string, unknown> | null)?.event_type ?? o.source ?? 'observation'),
    data: (o.payload as Record<string, unknown>) ?? {},
    created_at: String(o.created_at),
  }))
  const dismissals = obs.filter(o => o.status === 'dismissed').map(o => ({
    title: String(o.title ?? ''),
    reason: String(o.reason ?? (o.payload as Record<string, unknown> | null)?.dismissed_reason ?? 'user dismissed'),
    dismissed_at: String(o.created_at),
  }))

  let productCtx: ProductContext | undefined
  if (opts.productId) {
    const { data: p } = await supabase.from('pos_products')
      .select('id, name, price, cost_price, stock_quantity, category, brand, age_restricted, alcohol_percentage, shelf_life_days, additional_tax_code_ids, barcode')
      .eq('id', opts.productId).eq('business_id', businessId).maybeSingle()
    if (p) {
      const price = Number(p.price) || 0
      const cost = Number(p.cost_price) || 0
      const margin = +(price - cost).toFixed(2)
      const marginPct = price > 0 ? +((margin / price) * 100).toFixed(1) : 0
      const { data: items } = await supabase.from('pos_sale_items')
        .select('quantity').eq('business_id', businessId).eq('product_id', p.id).gte('created_at', cutoff).limit(500)
      const totalUnits = (items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0), 0)
      const weeks = VELOCITY_WINDOW_DAYS / 7
      const unitsPerWeek = +(totalUnits / weeks).toFixed(2)
      const stockQty = Number(p.stock_quantity) || 0
      const weeksOfStock = unitsPerWeek > 0 ? +(stockQty / unitsPerWeek).toFixed(1) : null
      productCtx = {
        id: p.id, name: p.name, price, cost_price: cost,
        margin_dollars: margin, margin_pct: marginPct,
        stock_quantity: stockQty, units_per_week: unitsPerWeek, weeks_of_stock: weeksOfStock,
        category: p.category ?? null, brand: p.brand ?? null,
        age_restricted: !!p.age_restricted,
        alcohol_percentage: p.alcohol_percentage != null ? Number(p.alcohol_percentage) : null,
        shelf_life_days: p.shelf_life_days != null ? Number(p.shelf_life_days) : null,
        barcode: p.barcode ?? null,
        additional_tax_code_ids: (p.additional_tax_code_ids as string[] | null) ?? [],
      }
    }
  }

  return {
    business_id: biz.id, business_name: biz.name,
    industry: biz.industry ?? 'retail', industry_subtype: biz.industry_subtype ?? null,
    total_sales_last_28d: salesArr.length,
    total_revenue_last_28d: +totalRevenue.toFixed(2),
    avg_ticket_last_28d: +avgTicket.toFixed(2),
    product: productCtx,
    external_signals: { weather: weatherSignal },
    recent_observations: observations,
    past_dismissals: dismissals,
  }
}
