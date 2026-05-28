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

// Cashier-side: resolve a cart token to its full contents (for the POS sale screen).
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { token?: string }
  const token = (body.token ?? '').trim().toUpperCase()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: cart } = await supabaseAdmin.from('pos_self_checkout_carts')
    .select('id, items, subtotal_cents, status, expires_at, loyalty_customer_id')
    .eq('token', token).eq('business_id', bid).maybeSingle()
  if (!cart) return NextResponse.json({ error: 'Cart not found' }, { status: 404 })
  if (cart.status === 'redeemed') return NextResponse.json({ error: 'This cart was already redeemed.' }, { status: 409 })
  if (cart.status === 'expired' || (cart.expires_at && new Date(cart.expires_at as string) < new Date())) {
    return NextResponse.json({ error: 'This cart has expired — ask the customer to re-open it.' }, { status: 410 })
  }

  const items = (cart.items as Array<{ age_restricted?: boolean }>) ?? []
  return NextResponse.json({
    ok: true,
    cart_id: cart.id,
    items: cart.items,
    subtotal_cents: cart.subtotal_cents,
    requires_id_check: items.some(i => i.age_restricted),
    loyalty_customer_id: cart.loyalty_customer_id ?? null,
  })
}

export const POST = withErrorCapture('pos/scan-and-go/redeem', _POST)
