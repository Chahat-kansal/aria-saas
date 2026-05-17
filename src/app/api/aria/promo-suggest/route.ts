export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaInsight } from '@/lib/ai-router'
import { parseLLMJsonOr } from '@/lib/ai-json'

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

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [salesData, productsData, redemptionData] = await Promise.all([
    supabase.from('pos_sales').select('total_amount, created_at, status').eq('business_id', bid).gte('created_at', since),
    supabase.from('pos_products').select('id, name, stock_quantity, cost_price, price, track_stock, category_id').eq('business_id', bid).eq('is_active', true).limit(100),
    supabase.from('pos_promotion_redemptions').select('amount_off, created_at').eq('business_id', bid).gte('created_at', since),
  ])

  const totalSales = (salesData.data ?? []).filter(s => s.status !== 'voided' && s.status !== 'refunded').reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const slowProducts = (productsData.data ?? []).filter(p => p.track_stock && (Number(p.stock_quantity) || 0) > 30).slice(0, 10)
  const totalDiscounted = (redemptionData.data ?? []).reduce((s, r) => s + (Number(r.amount_off) || 0), 0)

  const dataPrompt = `Last 30 days context for business ${bid}:
- Total revenue: A$${totalSales.toFixed(2)}
- Total amount discounted by promos: A$${totalDiscounted.toFixed(2)}
- Products with >30 units in stock (potential overstock):
${slowProducts.map(p => `  - ${p.name}: ${p.stock_quantity} units @ A$${(Number(p.price) || 0).toFixed(2)} (cost A$${(Number(p.cost_price) || 0).toFixed(2)})`).join('\n') || '  - none'}

Suggest ONE specific promotion that would help. Choose from: percent_off, bogo, free_item, happy_hour, combo.
Return JSON only, schema: {
  "promotion_name": "string max 30 chars",
  "promotion_type": "percent_off|bogo|free_item|happy_hour|combo",
  "discount_percent": number or null,
  "discount_amount": number or null,
  "target_product_id": "uuid or null",
  "target_product_name": "string or null",
  "reasoning": "one sentence why this will help",
  "estimated_impact_aud": number,
  "active_days": [1,2,3,4,5,6,7],
  "active_hour_start": number,
  "active_hour_end": number
}`

  const raw = await ariaInsight({ event_type: 'promo_suggest_request', category: 'promotions', data: { context_chars: dataPrompt.length }, triggered_by: dataPrompt }).catch(() => '')
  const parsed = parseLLMJsonOr<Record<string, unknown>>(raw || '{}', {}, 'promo-suggest')
  return NextResponse.json({ suggestion: parsed })
}

export const POST = withErrorCapture('aria/promo-suggest', _POST)