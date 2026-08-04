export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { applyCode, type CartItem, type Customer, type Promotion } from '@/lib/pos/discount-engine'
import { readWeatherSignal } from '@/lib/promotions/weather-signal'
import { todayAEST } from '@/lib/date-au'

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { code, cart, customer_id } = await req.json() as { code: string; cart: CartItem[]; customer_id?: string | null }
  if (!code?.trim()) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const { data: promotions } = await supabase
    .from('pos_promotions')
    .select('id, name, promotion_type, applies_to, category_id, product_id, product_ids, bundle_price, discount_percent, discount_amount, active_days, active_hour_start, active_hour_end, starts_at, ends_at, requires_code, stacks_with_others, stack_priority, active, min_spend, buy_quantity, get_quantity, customer_group_id, min_customer_lifetime_spend, min_customer_visits, max_total_uses, current_uses, max_uses_per_customer, max_uses_per_day, exclude_discounted, trigger_type, trigger_config')
    .eq('business_id', bid)
    .eq('active', true)
    .not('requires_code', 'is', null)

  let customer: Customer | null = null
  if (customer_id) {
    const { data } = await supabase.from('pos_customers')
      .select('id, customer_group_id, total_spent, visit_count')
      .eq('id', customer_id).eq('business_id', bid).maybeSingle()
    if (data) customer = { id: data.id, customer_group_id: data.customer_group_id, total_spent: Number(data.total_spent) || 0, visit_count: Number(data.visit_count) || 0 }
  }

  const usage: { customer_redemptions: Record<string, number>; daily_redemptions: Record<string, number> } = {
    customer_redemptions: {},
    daily_redemptions: {},
  }
  const promoIds = (promotions ?? []).map(p => p.id)
  if (promoIds.length > 0) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    if (customer_id) {
      const { data: custRows } = await supabase.from('pos_promotion_redemptions')
        .select('promotion_id').eq('business_id', bid).eq('customer_id', customer_id).in('promotion_id', promoIds)
      for (const r of custRows ?? []) {
        usage.customer_redemptions[r.promotion_id] = (usage.customer_redemptions[r.promotion_id] ?? 0) + 1
      }
    }
    const { data: dayRows } = await supabase.from('pos_promotion_redemptions')
      .select('promotion_id').eq('business_id', bid).gte('created_at', todayStart.toISOString()).in('promotion_id', promoIds)
    for (const r of dayRows ?? []) {
      usage.daily_redemptions[r.promotion_id] = (usage.daily_redemptions[r.promotion_id] ?? 0) + 1
    }
  }

  // S-PROMO-RULE-1 — same cached-only, fail-closed read as the auto path.
  const weather = (promotions ?? []).some(p => p.trigger_type)
    ? await readWeatherSignal(bid, todayAEST())
    : null

  const result = applyCode(code.trim(), cart ?? [], (promotions ?? []) as Promotion[], { now: new Date(), customer, usage, weather })
  if (!result.ok) return NextResponse.json({ error: result.error, valid: false }, { status: 400 })
  return NextResponse.json({ discount: result.discount, valid: true })
}

export const POST = withBusinessContext('pos/promotions/apply-code', _POST)