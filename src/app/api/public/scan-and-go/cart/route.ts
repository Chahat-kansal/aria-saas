export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { hasValidKioskSession } from '@/lib/kiosk/cookie'
import crypto from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface CartItem { product_id: string; name: string; price_cents: number; qty: number; age_restricted: boolean }

function shortToken(): string {
  return crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toUpperCase()
}
function subtotal(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.price_cents * i.qty, 0)
}

async function resolveProduct(bid: string, barcode?: string, productId?: string) {
  let pid = productId ?? null
  if (!pid && barcode) {
    const { data: bc } = await supabaseAdmin.from('pos_product_barcodes').select('product_id').eq('business_id', bid).eq('barcode', barcode).maybeSingle()
    pid = (bc?.product_id as string) ?? null
    if (!pid) {
      const { data: p } = await supabaseAdmin.from('pos_products').select('id').eq('business_id', bid).eq('barcode', barcode).maybeSingle()
      pid = (p?.id as string) ?? null
    }
  }
  if (!pid) return null
  const { data: prod } = await supabaseAdmin.from('pos_products')
    .select('id, name, price, price_cents, age_restricted, is_age_restricted').eq('id', pid).eq('business_id', bid).maybeSingle()
  if (!prod) return null
  const price_cents = (prod.price_cents as number | null) ?? Math.round(Number(prod.price ?? 0) * 100)
  return { product_id: prod.id as string, name: (prod.name as string) ?? 'Item', price_cents, age_restricted: !!(prod.age_restricted || prod.is_age_restricted) }
}

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { business_id?: string; token?: string; action?: string; barcode?: string; product_id?: string; qty?: number }
  const bid = body.business_id
  if (!bid) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!hasValidKioskSession(bid)) return NextResponse.json({ error: 'session_expired' }, { status: 401 })

  // Load or create the shopping cart.
  let cart: { id: string; token: string; items: CartItem[] } | null = null
  if (body.token) {
    const { data } = await supabaseAdmin.from('pos_self_checkout_carts').select('id, token, items, status').eq('token', body.token).eq('business_id', bid).maybeSingle()
    if (data && data.status === 'shopping') cart = { id: data.id as string, token: data.token as string, items: (data.items as CartItem[]) ?? [] }
  }
  if (!cart) {
    const token = shortToken()
    const { data, error } = await supabaseAdmin.from('pos_self_checkout_carts').insert({ business_id: bid, token, items: [], subtotal_cents: 0, status: 'shopping' }).select('id, token').single()
    if (error || !data) return NextResponse.json({ error: 'Could not start cart' }, { status: 500 })
    cart = { id: data.id as string, token: data.token as string, items: [] }
  }

  const items = cart.items
  const action = body.action ?? 'add'

  if (action === 'add') {
    const prod = await resolveProduct(bid, body.barcode, body.product_id)
    if (!prod) return NextResponse.json({ ok: true, not_found: true, token: cart.token, items, subtotal_cents: subtotal(items) })
    const existing = items.find(i => i.product_id === prod.product_id)
    if (existing) existing.qty += 1
    else items.push({ ...prod, qty: 1 })
  } else if (action === 'remove') {
    const idx = items.findIndex(i => i.product_id === body.product_id)
    if (idx >= 0) items.splice(idx, 1)
  } else if (action === 'update_qty') {
    const it = items.find(i => i.product_id === body.product_id)
    if (it) { it.qty = Math.max(0, Math.floor(body.qty ?? it.qty)); if (it.qty === 0) items.splice(items.indexOf(it), 1) }
  }

  const sub = subtotal(items)
  await supabaseAdmin.from('pos_self_checkout_carts').update({ items, subtotal_cents: sub }).eq('id', cart.id)
  return NextResponse.json({ ok: true, token: cart.token, items, subtotal_cents: sub })
}

// Customer phone polls cart status by token (so it can show "paid" after redemption).
async function _GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const bid = url.searchParams.get('business_id')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
  if (!bid) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!hasValidKioskSession(bid)) return NextResponse.json({ error: 'session_expired' }, { status: 401 })
  const { data } = await supabaseAdmin.from('pos_self_checkout_carts')
    .select('token, items, subtotal_cents, status, expires_at, redeemed_at').eq('token', token).eq('business_id', bid).maybeSingle()
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ token: data.token, items: data.items, subtotal_cents: data.subtotal_cents, status: data.status, expires_at: data.expires_at, redeemed_at: data.redeemed_at })
}

export const POST = withErrorCapture('public/scan-and-go/cart', _POST)
export const GET = withErrorCapture('public/scan-and-go/cart', _GET)
