export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: Request, { params }: { params: { business_id: string } }) {
  const { business_id } = params
  const body = await req.json() as {
    customer_name: string
    customer_phone?: string
    customer_email?: string
    items: Array<{ product_id: string; product_name: string; quantity: number; unit_price: number }>
    notes?: string
    pickup_time?: string
    fulfillment_type?: string
    source?: string
  }

  if (!body.customer_name || !body.items?.length)
    return NextResponse.json({ error: 'customer_name and items required' }, { status: 400 })

  const sb = adminClient()
  const { data: biz } = await sb.from('businesses').select('id').eq('id', business_id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const subtotal = body.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const orderNumber = 'ONL-' + Date.now().toString(36).toUpperCase().slice(-6)

  const { data: order, error } = await sb.from('pos_online_orders').insert({
    business_id,
    order_number: orderNumber,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone ?? null,
    customer_email: body.customer_email ?? null,
    items: body.items,
    subtotal,
    total: subtotal,
    notes: body.notes ?? null,
    pickup_time: body.pickup_time ? new Date(body.pickup_time).toISOString() : null,
    fulfillment_type: body.fulfillment_type ?? 'pickup',
    source: body.source ?? 'online',
    status: 'pending',
  }).select('id, order_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    order_id: (order as { id: string }).id,
    order_number: (order as { order_number: string }).order_number,
    total: subtotal,
  })
}
