export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { waitUntil } from '@vercel/functions'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: Request, { params }: { params: { business_id: string } }) {
  const idOrSlug = params.business_id
  const sb = adminClient()
  const business_id = await resolveBusinessId(sb, idOrSlug)
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

  if (!business_id) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  if (!body.customer_name || !body.items?.length)
    return NextResponse.json({ error: 'customer_name and items required' }, { status: 400 })

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

  const orderId = (order as { id: string }).id
  const bid = business_id  // narrowed: guaranteed non-null after the guard above

  // ── Post-order: customer identity + pos_sales + loyalty earn ──
  // Catch-all: failures never bubble to the order response.
  let earnCustomerId: string | null = null
  let earnSaleId: string | null = null

  try {
    // 1. Find or create pos_customers by phone → email → create
    const rawPhone = body.customer_phone ?? null
    const rawEmail = body.customer_email ? body.customer_email.trim().toLowerCase() : null

    let customerId: string | null = null
    if (rawPhone) {
      const { data: byPhone } = await sb.from('pos_customers')
        .select('id').eq('business_id', bid).eq('phone', rawPhone).maybeSingle()
      customerId = (byPhone as { id: string } | null)?.id ?? null
    }
    if (!customerId && rawEmail) {
      const { data: byEmail } = await sb.from('pos_customers')
        .select('id').eq('business_id', bid).ilike('email', rawEmail).maybeSingle()
      customerId = (byEmail as { id: string } | null)?.id ?? null
    }
    if (!customerId) {
      const { data: created } = await sb.from('pos_customers').insert({
        business_id: bid,
        name: body.customer_name.trim().slice(0, 80),
        phone: rawPhone,
        email: rawEmail,
        source: 'online_order',
        points_balance: 0,
        stamps_count: 0,
        loyalty_points: 0,
      }).select('id').single()
      customerId = (created as { id: string } | null)?.id ?? null
    }

    if (customerId) {
      earnCustomerId = customerId

      // 2. Idempotency: reuse existing sale if this order_number was already processed
      const { data: existingSale } = await sb.from('pos_sales')
        .select('id').eq('business_id', bid).eq('idempotency_key', orderNumber).maybeSingle()
      let saleId: string | null = (existingSale as { id: string } | null)?.id ?? null

      if (!saleId) {
        const { data: sale, error: saleErr } = await sb.from('pos_sales').insert({
          business_id: bid,
          customer_id: customerId,
          total_amount: subtotal,
          source: 'online_order',
          order_type: 'online_order',
          status: 'completed',
          idempotency_key: orderNumber,
          customer_name: body.customer_name,
          customer_phone: rawPhone,
          notes: body.notes ?? null,
          pickup_time: body.pickup_time ? new Date(body.pickup_time).toISOString() : null,
        }).select('id').single()

        // Unique-key violation = concurrent retry already inserted it — not a real error
        if (saleErr && !/duplicate|unique/i.test(saleErr.message)) {
          throw new Error('[place-order] pos_sales insert: ' + saleErr.message)
        }
        saleId = (sale as { id: string } | null)?.id ?? null
      }

      if (saleId) {
        earnSaleId = saleId
        // 3. Back-fill pos_online_orders with customer_id + sale_id
        await sb.from('pos_online_orders')
          .update({ customer_id: customerId, sale_id: saleId })
          .eq('id', orderId)
      }
    }
  } catch (e) {
    void sb.from('activity_log').insert({
      business_id: bid,
      action_type: 'online_order_earn_error',
      description: '[place-order] sales/loyalty setup failed: ' + (e as Error).message,
      metadata: { order_id: orderId, order_number: orderNumber, error: (e as Error).message },
      created_at: new Date().toISOString(),
    })
  }

  // 4. Background: loyalty earn — fires after response is sent
  if (earnCustomerId && earnSaleId) {
    const finalCustomerId = earnCustomerId
    const finalSaleId = earnSaleId
    waitUntil((async () => {
      try {
        await earnOnSale({ businessId: bid, customerId: finalCustomerId, saleId: finalSaleId, totalAmount: subtotal })
      } catch (e) {
        void sb.from('activity_log').insert({
          business_id: bid,
          action_type: 'online_order_earn_error',
          description: '[place-order] earnOnSale failed: ' + (e as Error).message,
          metadata: { sale_id: finalSaleId, customer_id: finalCustomerId, error: (e as Error).message },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    order_number: (order as { order_number: string }).order_number,
    total: subtotal,
  })
}