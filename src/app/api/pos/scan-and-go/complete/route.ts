export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'

// Cashier-side: mark a cart redeemed once the sale is finalised. ID-check is enforced
// here too — an age-restricted cart cannot complete without id_confirmed.
async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { token?: string; sale_id?: string; id_confirmed?: boolean }
  const token = (body.token ?? '').trim().toUpperCase()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: cart } = await supabaseAdmin.from('pos_self_checkout_carts')
    .select('id, items, status, loyalty_customer_id, subtotal_cents').eq('token', token).eq('business_id', bid).maybeSingle()
  if (!cart) return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
  if (cart.status === 'redeemed') return NextResponse.json({ ok: true, already: true })

  const items = (cart.items as Array<{ age_restricted?: boolean; product_id: string; qty: number }>) ?? []
  if (items.some(i => i.age_restricted) && !body.id_confirmed) {
    return NextResponse.json({ error: 'id_check_required' }, { status: 412 })
  }

  await supabaseAdmin.from('pos_self_checkout_carts').update({
    status: 'redeemed', redeemed_at: new Date().toISOString(), redeemed_sale_id: body.sale_id ?? null,
  }).eq('id', cart.id)

  // LOYALTY-FINISH — this used to be a bespoke earn implementation:
  // hardcoded 1pt/$1 (ignored pos_loyalty_config.points_per_dollar), never
  // checked program_enabled, a non-atomic read-then-write on points_balance
  // (race-prone), never synced the legacy loyalty_points column, and never
  // touched total_spent/visit_count/last_visit. Now goes through the single
  // source of truth — same call every other sale-completion path makes.
  let pointsAwarded = 0
  if (cart.loyalty_customer_id && body.sale_id) {
    try {
      const result = await earnOnSale({
        businessId: bid,
        customerId: cart.loyalty_customer_id,
        saleId: body.sale_id,
        totalAmount: (cart.subtotal_cents as number) / 100,
      })
      pointsAwarded = result.earnedPoints
    } catch (e) { console.error('[pos/scan-and-go/complete] earnOnSale failed:', (e as Error).message) }
  } else if (cart.loyalty_customer_id && !body.sale_id) {
    // Can't safely dedupe an earn without a sale_id to key the ledger on — skip rather than risk a double-award.
    console.error('[pos/scan-and-go/complete] loyalty customer attached but no sale_id provided — skipping earn')
  }

  return NextResponse.json({ ok: true, points_awarded: pointsAwarded })
}

export const POST = withBusinessContext('pos/scan-and-go/complete', _POST)
