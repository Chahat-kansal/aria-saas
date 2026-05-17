export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { calculateApplicableDiscounts, type CartItem, type Customer } from '@/lib/pos/discount-engine'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ auto: [], manual: [], coupons: [] })

  const { cart, customer_id } = await req.json() as { cart: CartItem[]; customer_id?: string | null }
  if (!cart?.length) return NextResponse.json({ auto: [], manual: [], coupons: [] })

  const { data: promotions } = await supabase
    .from('pos_promotions')
    .select('id, name, promotion_type, applies_to, category_id, product_id, product_ids, bundle_price, discount_percent, discount_amount, active_days, active_hour_start, active_hour_end, starts_at, ends_at, requires_code, stacks_with_others, stack_priority, active, min_spend, buy_quantity, get_quantity, customer_group_id, min_customer_lifetime_spend, min_customer_visits, max_total_uses, current_uses, max_uses_per_customer, max_uses_per_day, exclude_discounted')
    .eq('business_id', bid)
    .eq('active', true)

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

  const result = calculateApplicableDiscounts(cart, (promotions ?? []) as Parameters<typeof calculateApplicableDiscounts>[1], { now: new Date(), customer, usage })
  return NextResponse.json(result)
}

export const POST = withErrorCapture('pos/promotions/applicable', _POST)