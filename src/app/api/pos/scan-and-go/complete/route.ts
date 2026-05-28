export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Cashier-side: mark a cart redeemed once the sale is finalised. ID-check is enforced
// here too — an age-restricted cart cannot complete without id_confirmed.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

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

  // Award loyalty points if the cart was linked to a member (points = $ spent, simple default).
  let pointsAwarded = 0
  if (cart.loyalty_customer_id) {
    pointsAwarded = Math.floor((cart.subtotal_cents as number) / 100)
    if (pointsAwarded > 0) {
      try {
        const { data: cust } = await supabaseAdmin.from('pos_customers').select('points_balance, loyalty_points').eq('id', cart.loyalty_customer_id).maybeSingle()
        const current = Number(cust?.points_balance ?? cust?.loyalty_points ?? 0)
        await supabaseAdmin.from('pos_customers').update({ points_balance: current + pointsAwarded }).eq('id', cart.loyalty_customer_id)
        await supabaseAdmin.from('pos_loyalty_transactions').insert({ business_id: bid, customer_id: cart.loyalty_customer_id, sale_id: body.sale_id ?? null, type: 'earn', points_delta: pointsAwarded })
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json({ ok: true, points_awarded: pointsAwarded })
}

export const POST = withErrorCapture('pos/scan-and-go/complete', _POST)
