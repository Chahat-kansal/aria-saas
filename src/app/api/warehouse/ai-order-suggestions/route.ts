export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single()
  return data?.id ?? null
}

function calcNextDeliveryDate(deliveryDays: number[], leadTimeDays: number): Date {
  if (!deliveryDays.length) {
    return new Date(Date.now() + (leadTimeDays || 5) * 86400000)
  }
  const now = new Date()
  const todayDow = (now.getDay() + 6) % 7 // convert Sun=0 to Mon=0
  for (let offset = 1; offset <= 14; offset++) {
    const dow = (todayDow + offset) % 7
    if (deliveryDays.includes(dow)) {
      return new Date(Date.now() + offset * 86400000)
    }
  }
  return new Date(Date.now() + (leadTimeDays || 5) * 86400000)
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, supplier_id } = await req.json()
  if (!business_id || !supplier_id) return NextResponse.json({ error: 'business_id and supplier_id required' }, { status: 400 })
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch supplier
  const { data: supplier } = await supabaseAdmin
    .from('pos_suppliers')
    .select('id, name, lead_time_days, delivery_days, order_cutoff_days, short_code, region')
    .eq('id', supplier_id)
    .single()
  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  const leadDays = supplier.lead_time_days ?? 5
  const nextDelivery = calcNextDeliveryDate(supplier.delivery_days ?? [], leadDays)
  const daysToDelivery = Math.round((nextDelivery.getTime() - Date.now()) / 86400000)

  // Fetch products for this supplier
  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, sku, stock_quantity, cost_price, case_quantity, reorder_point, reorder_qty')
    .eq('business_id', business_id)
    .eq('supplier_id', supplier_id)
    .eq('is_active', true)
    .eq('track_stock', true)
    .limit(200)

  if (!products?.length) return NextResponse.json({ suggestions: [], summary: 'No tracked products for this supplier.' })

  const productIds = products.map(p => p.id)
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString()

  // Fetch sale IDs for last 90d
  const { data: sales90 } = await supabaseAdmin
    .from('pos_sales')
    .select('id, created_at')
    .eq('business_id', business_id)
    .neq('status', 'voided')
    .gte('created_at', cutoff90)
    .limit(5000)

  const saleIds30 = (sales90 ?? []).filter(s => s.created_at >= cutoff30).map(s => s.id)
  const saleIds90 = (sales90 ?? []).map(s => s.id)

  const sold30 = new Map<string, number>()
  const sold90 = new Map<string, number>()

  if (saleIds90.length > 0) {
    const { data: items90 } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_id, quantity, sale_id')
      .in('sale_id', saleIds90)
      .in('product_id', productIds)
      .limit(20000)

    const set30 = new Set(saleIds30)
    for (const item of items90 ?? []) {
      sold90.set(item.product_id, (sold90.get(item.product_id) ?? 0) + item.quantity)
      if (set30.has(item.sale_id)) {
        sold30.set(item.product_id, (sold30.get(item.product_id) ?? 0) + item.quantity)
      }
    }
  }

  // Fetch price history for price change detection
  const thirtyDaysAgo = cutoff30
  const { data: recentPrices } = await supabaseAdmin
    .from('supplier_product_prices')
    .select('product_id, cost_price, recorded_at')
    .eq('supplier_id', supplier_id)
    .gte('recorded_at', new Date(Date.now() - 60 * 86400000).toISOString())
    .in('product_id', productIds)
    .order('recorded_at', { ascending: true })

  const priceByProduct = new Map<string, { old: number; current: number }>()
  for (const p of recentPrices ?? []) {
    const pid = p.product_id
    if (!pid) continue
    const existing = priceByProduct.get(pid)
    if (!existing) {
      priceByProduct.set(pid, { old: Number(p.cost_price), current: Number(p.cost_price) })
    } else {
      existing.current = Number(p.cost_price)
    }
  }

  // Build suggestions per product
  interface Suggestion {
    product_id: string; product_name: string; current_qty: number;
    suggested_qty: number; velocity_per_week: number; stock_days_remaining: number;
    trend: 'up' | 'down' | 'same'; price_change_pct: number; urgency_score: number;
    reason?: string
  }

  const suggestions: Suggestion[] = []
  const TARGET_COVER_DAYS = 14

  for (const p of products) {
    const qty30 = sold30.get(p.id) ?? 0
    const qty90 = sold90.get(p.id) ?? 0
    const avgDaily30 = qty30 / 30
    const avgDaily90 = qty90 / 90
    if (avgDaily30 < 0.05 && avgDaily90 < 0.05) continue

    const stockDays = avgDaily30 > 0 ? (p.stock_quantity ?? 0) / avgDaily30 : 999
    const targetCover = daysToDelivery + TARGET_COVER_DAYS
    const safetyStock = avgDaily30 * leadDays * 1.5
    let rawQty = Math.max(0, Math.ceil(avgDaily30 * targetCover + safetyStock - (p.stock_quantity ?? 0)))

    let trend: 'up' | 'down' | 'same' = 'same'
    let trendMultiplier = 1
    if (avgDaily90 > 0) {
      if (avgDaily30 > avgDaily90 * 1.1) { trend = 'up'; trendMultiplier = 1.2 }
      else if (avgDaily30 < avgDaily90 * 0.9) { trend = 'down'; trendMultiplier = 0.85 }
    }

    rawQty = Math.ceil(rawQty * trendMultiplier)
    const caseQty = p.case_quantity ?? 1
    const suggestedQty = rawQty <= 0 ? 0 : (rawQty < caseQty ? caseQty : Math.ceil(rawQty / caseQty) * caseQty)

    const priceData = priceByProduct.get(p.id)
    const priceChangePct = priceData && priceData.old > 0
      ? ((priceData.current - priceData.old) / priceData.old) * 100 : 0

    const urgencyScore = stockDays <= leadDays ? 1 : stockDays <= leadDays * 2 ? 0.7 : 0.3

    suggestions.push({
      product_id: p.id,
      product_name: p.name,
      current_qty: p.stock_quantity ?? 0,
      suggested_qty: suggestedQty,
      velocity_per_week: Math.round(avgDaily30 * 7 * 10) / 10,
      stock_days_remaining: Math.round(stockDays * 10) / 10,
      trend,
      price_change_pct: Math.round(priceChangePct * 10) / 10,
      urgency_score: urgencyScore,
    })
  }

  suggestions.sort((a, b) => b.urgency_score - a.urgency_score)

  // Claude: generate per-product reasons + global summary
  let inputTokens = 0; let outputTokens = 0; let claudeSuccess = false
  let globalSummary: string | null = null
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    const productLines = suggestions.slice(0, 20).map(s =>
      `${s.product_name}: stock ${s.stock_days_remaining}d, velocity ${s.velocity_per_week}/wk, trend ${s.trend}, suggested ${s.suggested_qty} units, price change ${s.price_change_pct}%`
    ).join('\n')

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: 'You are Aria, an AI supply chain assistant for an Australian small business. Generate concise, plain-English reasons for stock reorder suggestions. Each reason must be one sentence. Also write a global summary. Respond in JSON: {"reasons": {"Product Name": "reason"}, "summary": "global summary"}',
      messages: [{
        role: 'user',
        content: `Supplier: ${supplier.name}. Next delivery in ${daysToDelivery} days. Products:\n${productLines}\n\nGenerate a reason for each product and a 1-2 sentence global summary of the order.`,
      }],
    })

    inputTokens = msg.usage.input_tokens
    outputTokens = msg.usage.output_tokens
    claudeSuccess = true

    const raw = (msg.content[0] as any).text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      for (const s of suggestions) {
        s.reason = parsed.reasons?.[s.product_name] ?? null
      }
      globalSummary = parsed.summary ?? null
    }
  } catch { /* non-fatal — suggestions still returned without AI reasons */ }

  // Log to aria_ai_calls
  void Promise.resolve(supabaseAdmin.from('aria_ai_calls').insert({
    business_id, agent_key: 'supplier_order_suggestions', provider: 'anthropic',
    model_id: 'claude-haiku-4-5-20251001', role: 'reorder',
    input_tokens: inputTokens, output_tokens: outputTokens, success: claudeSuccess,
  })).catch(() => {})

  // Save suggestions to table
  if (suggestions.length) {
    const rows = suggestions.map(s => ({
      business_id,
      supplier_id,
      product_id: s.product_id,
      product_name: s.product_name,
      suggested_qty: s.suggested_qty,
      current_qty: s.current_qty,
      reason: s.reason ?? null,
      trend: s.trend,
      velocity_per_week: s.velocity_per_week,
      stock_days_remaining: s.stock_days_remaining,
      price_change_pct: s.price_change_pct,
      accepted: null,
    }))
    void Promise.resolve(supabaseAdmin.from('supplier_ai_suggestions').insert(rows)).catch(() => {})
  }

  return NextResponse.json({
    suggestions,
    summary: globalSummary ?? `${suggestions.length} products need ordering. Next ${supplier.name} delivery: ${nextDelivery.toDateString()}.`,
    next_delivery_date: nextDelivery.toISOString().split('T')[0],
    days_to_delivery: daysToDelivery,
  })
}

export const POST = withErrorCapture('warehouse/ai-order-suggestions', _POST)
