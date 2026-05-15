export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { calculateApplicableDiscounts, type CartItem } from '@/lib/pos/discount-engine'

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

  const { cart } = await req.json() as { cart: CartItem[] }
  if (!cart?.length) return NextResponse.json({ auto: [], manual: [], coupons: [] })

  const { data: promotions } = await supabase
    .from('pos_promotions')
    .select('id, name, promotion_type, applies_to, category_id, product_id, product_ids, bundle_price, discount_percent, discount_amount, active_days, active_hour_start, active_hour_end, requires_code, stacks_with_others, active, min_spend, buy_quantity, get_quantity')
    .eq('business_id', bid)
    .eq('active', true)

  const result = calculateApplicableDiscounts(cart, promotions ?? [], new Date())
  return NextResponse.json(result)
}

export const POST = withErrorCapture('pos/promotions/applicable', _POST)