export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function POST(req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = getDb()

  // Verify business exists and accepts orders
  const { data: biz } = await db.from('businesses').select('id, name').eq('id', business_id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: outlet } = await db
    .from('pos_outlets')
    .select('id, accepts_online_orders, online_order_throttle_per_15min, pickup_ready_estimate_minutes')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!outlet?.accepts_online_orders) {
    return NextResponse.json({ error: 'Online ordering is not available for this location' }, { status: 503 })
  }

  // Throttle check — count orders in last 15 min
  const throttleWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count: recentCount } = await db
    .from('pos_online_orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business_id)
    .gte('created_at', throttleWindow)

  const throttleLimit = outlet.online_order_throttle_per_15min ?? 10
  if ((recentCount ?? 0) >= throttleLimit) {
    return NextResponse.json({ error: 'We are very busy right now — please try again in a few minutes' }, { status: 429 })
  }

  const body = await req.json()
  const { customer_name, customer_phone, customer_email, items, pickup_time, notes, table_id, source = 'web', special_instructions, fulfillment_type = 'pickup', delivery_address } = body

  if (!customer_name || !items?.length) {
    return NextResponse.json({ error: 'customer_name and items are required' }, { status: 400 })
  }

  // Generate order number
  const { count: orderCount } = await db.from('pos_online_orders').select('id', { count: 'exact', head: true }).eq('business_id', business_id)
  const order_number = `ONL-${String((orderCount ?? 0) + 1).padStart(4, '0')}`

  // Compute totals
  let subtotal = 0
  for (const item of items as Array<{ product_id: string; quantity: number; unit_price: number; modifiers?: Array<{ price_adjustment: number }> }>) {
    const modTotal = (item.modifiers ?? []).reduce((s, m) => s + (m.price_adjustment ?? 0), 0)
    subtotal += (item.unit_price + modTotal) * item.quantity
  }
  const total = +subtotal.toFixed(2)

  // Create the online order record
  const { data: onlineOrder, error: ooErr } = await db.from('pos_online_orders').insert({
    business_id,
    outlet_id: outlet.id,
    order_number,
    customer_name: customer_name.trim(),
    customer_phone: customer_phone?.trim() ?? null,
    customer_email: customer_email?.trim() ?? null,
    source,
    pickup_time: pickup_time ?? null,
    status: 'pending',
    notes: notes ?? null,
    subtotal: total,
    total,
    fulfillment_type: fulfillment_type ?? 'pickup',
    delivery_address: fulfillment_type === 'delivery' ? delivery_address : null,
    items: items ?? [],
    special_instructions: special_instructions || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id, order_number, status').single()

  if (ooErr || !onlineOrder) {
    console.error('[public/place-order] insert failed:', ooErr?.message)
    return NextResponse.json({ error: 'Failed to place order' }, { status: 500 })
  }

  // Create pos_sale record (so it appears in POS)
  const { data: sale } = await db.from('pos_sales').insert({
    business_id,
    outlet_id: outlet.id,
    total_amount: total,
    subtotal: total,
    tax_amount: +(total * 0.1 / 1.1).toFixed(2),
    discount_amount: 0,
    payment_method: 'online',
    status: 'pending',
    order_type: 'pickup',
    customer_name: customer_name.trim(),
    customer_phone: customer_phone?.trim() ?? null,
    pickup_time: pickup_time ?? null,
    table_id: table_id ?? null,
    order_notes: notes ?? null,
    kds_sent: false,
    created_at: new Date().toISOString(),
  }).select('id').single()

  // Create sale items
  if (sale) {
    await db.from('pos_sale_items').insert(
      (items as Array<{ product_id: string; quantity: number; unit_price: number; product_name: string; modifiers?: Array<{ name: string; price_adjustment: number }> }>)
        .map(item => ({
          sale_id: sale.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: +(item.unit_price * item.quantity).toFixed(2),
          modifiers: item.modifiers ?? [],
          business_id,
        }))
    )

    // Link sale to online order
    await db.from('pos_online_orders').update({ sale_id: sale.id, updated_at: new Date().toISOString() }).eq('id', onlineOrder.id)

    // Fire KDS ticket (non-blocking)
    const now = new Date().toISOString()
    db.from('pos_kds_orders').insert({
      business_id,
      sale_id: sale.id,
      table_number: table_id ? `Table ${table_id}` : `Online ${order_number}`,
      items: (items as Array<{ product_name: string; quantity: number; modifiers?: Array<{ name: string }> }>).map(i => ({
        name: i.product_name,
        qty: i.quantity,
        modifiers: (i.modifiers ?? []).map(m => m.name),
        special_instructions: notes ?? null,
      })),
      status: 'new',
      priority: 1,
      notes: `Online order ${order_number}`,
      created_at: now,
    }).then(() => null, () => null)
  }

  // Fire Aria upsell async — don't await
  if (onlineOrder?.id) {
    void fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'}/api/pos/online-orders/aria-upsell`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: onlineOrder.id, business_id, items: items ?? [] }),
    }).catch(() => {})
  }

  const pickupEst = outlet.pickup_ready_estimate_minutes ?? 10
  return NextResponse.json({
    ok: true,
    order_id: onlineOrder.id,
    order_number: onlineOrder.order_number,
    estimated_ready_minutes: pickupEst,
    message: `Your order has been received. Ready in ~${pickupEst} minutes.`,
  })
}
