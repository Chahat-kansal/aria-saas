export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import {
  validatePromoSuggestion,
  computeVelocity,
  describeStockSignal,
  type ProductRiskContext,
  type PromoSuggestion,
} from '@/lib/aria/business-rules'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  void req
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString()
  const since28 = new Date(Date.now() - 28 * 86400_000).toISOString()

  // Fetch products with cost data (needed for margin computation)
  const { data: products } = await supabase.from('pos_products')
    .select('id, name, stock_quantity, cost_price, price, track_stock, category_id, alcohol_percentage, age_restricted, shelf_life_days')
    .eq('business_id', bid)
    .eq('is_active', true)
    .limit(100)

  // Fetch recent sale items for velocity
  const productIds = (products ?? []).map(p => p.id)
  const { data: recentSaleItems } = productIds.length > 0
    ? await supabase.from('pos_sale_items')
        .select('product_id, quantity, created_at')
        .in('product_id', productIds)
        .gte('created_at', since28)
        .limit(2000)
    : { data: [] as Array<{ product_id: string; quantity: number; created_at: string }> }

  // Build enriched product list with margin + velocity
  const enriched = (products ?? [])
    .filter(p => p.track_stock && (Number(p.price) || 0) > 0 && (Number(p.cost_price) || 0) > 0)
    .map(p => {
      const price = Number(p.price) || 0
      const cost = Number(p.cost_price) || 0
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
      const vel = computeVelocity(recentSaleItems ?? [], p.id, 28)
      const stock = Number(p.stock_quantity) || 0
      const weeksOfStock = vel > 0 ? stock / vel : null
      return { ...p, margin_pct: Math.round(marginPct * 10) / 10, velocity_per_week: vel, weeks_of_stock: weeksOfStock }
    })
    .filter(p => (p.weeks_of_stock !== null && p.weeks_of_stock > 4) || p.margin_pct >= 40)
    .sort((a, b) => (b.weeks_of_stock ?? 0) - (a.weeks_of_stock ?? 0))
    .slice(0, 8)

  if (enriched.length === 0) {
    return NextResponse.json({
      suggestion: { type: 'none', rationale: 'No products with sufficient margin or overstock detected right now.' },
      stock_signal: null, velocity: null,
    })
  }

  const { data: redemptions } = await supabase.from('pos_promotion_redemptions')
    .select('amount_off').eq('business_id', bid).gte('created_at', since30)
  const totalDiscounted = (redemptions ?? []).reduce((s, r) => s + (Number(r.amount_off) || 0), 0)

  const productSummary = enriched.map(p =>
    `• ${p.name} (id: ${p.id}) — sell $${(Number(p.price) || 0).toFixed(2)}, cost $${(Number(p.cost_price) || 0).toFixed(2)}, margin ${p.margin_pct}%, stock ${p.stock_quantity} units, ${p.velocity_per_week.toFixed(1)} units/wk, ${p.weeks_of_stock !== null ? p.weeks_of_stock.toFixed(1) + ' wks stock' : 'no velocity'}, ${p.age_restricted ? 'AGE-RESTRICTED alcohol' : 'non-alcohol'}${p.shelf_life_days ? `, shelf life ${p.shelf_life_days}d` : ''}`
  ).join('\n')

  const systemPrompt = `You are Aria, an AI business advisor for Australian SMBs. Suggest ONE promotion that makes financial sense.

HARD RULES — violating any = your suggestion gets rejected by the validation engine:
1. BOGO / free_item: ONLY if sell price < $25 AND margin > 30% AND NOT alcohol.
2. Percent-off: NEVER exceed half the gross margin %. (40% margin → max 20% off)
3. Profit per redemption must be > $0.50. For BOGO: paid_qty × margin − free_qty × cost > $0.50.
4. Alcohol (age_restricted): NO BOGO, NO happy_hour. Use percent_off max 10%.
5. Weeks of stock < 12 is NOT genuine overstock. Only flag overstock if weeks_of_stock > 12.
6. If NO product qualifies right now, return {"type":"none","rationale":"reason"}.

Products (pre-filtered):
${productSummary}

Last 30d promo spend: A$${totalDiscounted.toFixed(2)}.

Return ONLY valid JSON:
{
  "type": "bogo" | "percent_off" | "fixed_off" | "bundle" | "happy_hour" | "tiered" | "none",
  "target_product_id": "uuid or null",
  "discount_percent": number or null,
  "free_qty": number or null,
  "paid_qty": number or null,
  "rationale": "one sentence with specific margin % and estimated profit per redemption",
  "estimated_revenue_impact": number (A$ over 30 days based on velocity)
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Suggest the best promotion for this business.' }],
  })

  const raw = (message.content[0] as { text?: string }).text ?? '{}'
  const aiSuggestion = parseLLMJsonOr<PromoSuggestion & { type: string }>(raw, { type: 'none', rationale: 'parse error' }, 'promo-suggest')

  if (!aiSuggestion || aiSuggestion.type === 'none') {
    return NextResponse.json({ suggestion: aiSuggestion, stock_signal: null, velocity: null })
  }

  const targetId = aiSuggestion.target_product_id
  if (!targetId) {
    return NextResponse.json({ suggestion: aiSuggestion, stock_signal: null, velocity: null })
  }

  // Ownership check: product must belong to this business
  const { data: product } = await supabase.from('pos_products')
    .select('id, name, price, cost_price, stock_quantity, category, brand, alcohol_percentage, age_restricted, shelf_life_days')
    .eq('id', targetId)
    .eq('business_id', bid)
    .maybeSingle()

  if (!product) {
    return NextResponse.json({ error: 'Product not found for validation' }, { status: 404 })
  }

  const unitsPerWeek = computeVelocity(recentSaleItems ?? [], product.id, 28)
  const stockSignal = describeStockSignal(Number(product.stock_quantity) || 0, unitsPerWeek)

  const ctx: ProductRiskContext = {
    product_id: product.id,
    name: product.name,
    price: Number(product.price) || 0,
    cost_price: Number(product.cost_price) || 0,
    stock_quantity: Number(product.stock_quantity) || 0,
    alcohol_percentage: product.alcohol_percentage ? Number(product.alcohol_percentage) : null,
    age_restricted: !!product.age_restricted,
    shelf_life_days: product.shelf_life_days,
    units_per_week: unitsPerWeek,
  }

  const validation = validatePromoSuggestion(aiSuggestion as PromoSuggestion, ctx)

  let finalSuggestion: PromoSuggestion = aiSuggestion as PromoSuggestion
  let rejectionNote: string | null = null

  if (!validation.ok) {
    if (validation.rewritten) {
      finalSuggestion = validation.rewritten
      rejectionNote = `Original suggestion rejected: ${validation.rejected_reason} → Replaced with safer alternative.`
    } else {
      return NextResponse.json({
        suggestion: { type: 'none', rationale: validation.rejected_reason },
        reason: validation.rejected_reason,
      }, { status: 422 })
    }
  }

  return NextResponse.json({
    suggestion: finalSuggestion,
    margin_per_redemption_cents: validation.margin_per_redemption_cents,
    stock_signal: stockSignal,
    rejection_note: rejectionNote,
    velocity: {
      units_per_week: unitsPerWeek,
      weeks_of_stock: unitsPerWeek > 0 ? (Number(product.stock_quantity) || 0) / unitsPerWeek : null,
    },
  })
}

export const POST = withErrorCapture('aria/promo-suggest', _POST)
