export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { hasValidKioskSession } from '@/lib/kiosk/cookie'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// Seal a cart: no more adds, 15-min token window for the cashier to redeem.
async function _POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { business_id?: string; token?: string; loyalty_phone?: string }
  const bid = body.business_id
  if (!bid || !body.token) return NextResponse.json({ error: 'business_id and token required' }, { status: 400 })
  if (!hasValidKioskSession(bid)) return NextResponse.json({ error: 'session_expired' }, { status: 401 })

  const { data: cart } = await supabaseAdmin.from('pos_self_checkout_carts')
    .select('id, items, status').eq('token', body.token).eq('business_id', bid).maybeSingle()
  if (!cart) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!Array.isArray(cart.items) || cart.items.length === 0) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (cart.status !== 'shopping') return NextResponse.json({ ok: true, token: body.token })

  // Optional loyalty link by phone.
  let loyaltyId: string | null = null
  if (body.loyalty_phone) {
    const { data: cust } = await supabaseAdmin.from('pos_customers').select('id').eq('business_id', bid).eq('phone', body.loyalty_phone.trim()).maybeSingle()
    loyaltyId = (cust?.id as string) ?? null
  }

  const now = new Date()
  const expires = new Date(now.getTime() + 15 * 60 * 1000)
  await supabaseAdmin.from('pos_self_checkout_carts').update({
    status: 'finished', finished_at: now.toISOString(), expires_at: expires.toISOString(),
    loyalty_customer_id: loyaltyId,
  }).eq('id', cart.id)

  return NextResponse.json({ ok: true, token: body.token, expires_at: expires.toISOString() })
}

export const POST = withErrorCapture('public/scan-and-go/finish', _POST)
