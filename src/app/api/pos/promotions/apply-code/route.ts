export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { applyCode, type CartItem } from '@/lib/pos/discount-engine'

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
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { code, cart } = await req.json() as { code: string; cart: CartItem[] }
  if (!code?.trim()) return NextResponse.json({ error: 'code required' }, { status: 400 })

  const { data: promotions } = await supabase
    .from('pos_promotions')
    .select('id, name, promotion_type, applies_to, category_id, product_id, product_ids, bundle_price, discount_percent, discount_amount, active_days, active_hour_start, active_hour_end, requires_code, stacks_with_others, active, min_spend, buy_quantity, get_quantity')
    .eq('business_id', bid)
    .eq('active', true)
    .not('requires_code', 'is', null)

  const discount = applyCode(code.trim(), cart ?? [], promotions ?? [], new Date())
  if (!discount) return NextResponse.json({ error: 'Invalid or expired code', valid: false }, { status: 400 })
  return NextResponse.json({ discount, valid: true })
}

export const POST = withErrorCapture('pos/promotions/apply-code', _POST)