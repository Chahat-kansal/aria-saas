export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripeOrders = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { linkOrCreateMembership } from '@/lib/loyalty/membership'
import { normalisePhone } from '@/lib/clicksend'
import { getCxSession } from '@/lib/cx/get-cx-session'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

type ItemInput = {
  product_id: string
  product_name: string
  quantity: number
  unit_price?: number         // ignored — server re-fetches from pos_products
  modifiers?: { id: string; name: string; price_cents?: number }[]
  config?: { mode: string; layers: string[]; added: unknown[]; removed: unknown[] }
  note?: string
}

export async function POST(req: Request, { params }: { params: { business_id: string } }) {
  const idOrSlug = params.business_id
  const sb = adminClient()
  const business_id = await resolveBusinessId(sb, idOrSlug)

  if (!business_id) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Session gate — cx_session cookie required; guest checkout disabled.
  const session = await getCxSession(req, business_id)
  if (!session) return NextResponse.json({ error: 'Sign in to place an order' }, { status: 401 })

  const body = await req.json() as {
    customer_name?: string          // dead param — name derived from session + pos_customers
    customer_phone?: string         // dead param — phone from session
    customer_email?: string         // dead param — email from session
    items: ItemInput[]
    notes?: string
    special_instructions?: string
    payment_method?: string
    pickup_time?: string
    fulfillment_type?: string
    source?: string
  }

  if (!body.items?.length)
    return NextResponse.json({ error: 'items required' }, { status: 400 })

  const { data: biz } = await sb.from('businesses').select('id').eq('id', business_id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // ── Derive identity from session (not body) ──
  const { data: sessionCust } = await sb
    .from('pos_customers')
    .select('id, name, phone')
    .eq('business_id', business_id)
    .eq('loyalty_identity_id', session.identity_id)
    .is('deleted_at', null)
    .maybeSingle()

  const sessionCustTyped = sessionCust as { id: string; name: string | null; phone: string | null } | null
  const customerPhone = session.phone ?? sessionCustTyped?.phone ?? null
  const customerName = (sessionCustTyped?.name ?? '').trim() || session.email?.split('@')[0] || 'Member'

  // ── Server-side price verification ──
  // client-supplied unit_price is NEVER used for financial computation.
  const productIds = [...new Set(body.items.map(i => i.product_id))]
  const modifierIds = [...new Set(
    body.items.flatMap(i => (i.modifiers ?? []).map(m => m.id)).filter(Boolean)
  )]

  const [prodRes, modRes] = await Promise.all([
    sb.from('pos_products')
      .select('id, price')
      .eq('business_id', business_id)
      .in('id', productIds),
    modifierIds.length > 0
      ? sb.from('pos_modifiers')
          .select('id, price_cents')
          .eq('business_id', business_id)
          .in('id', modifierIds)
      : Promise.resolve({ data: [] as { id: string; price_cents: number }[], error: null }),
  ])

  if (prodRes.error) return NextResponse.json({ error: 'Product lookup failed' }, { status: 500 })

  const prodPrices = new Map<string, number>()
  for (const p of (prodRes.data ?? []) as { id: string; price: number }[]) {
    prodPrices.set(p.id, Number(p.price) || 0)
  }

  const missingProducts = body.items.filter(i => !prodPrices.has(i.product_id))
  if (missingProducts.length > 0) {
    return NextResponse.json({ error: 'One or more items are no longer available' }, { status: 400 })
  }

  const modPrices = new Map<string, number>()
  for (const m of (modRes.data ?? []) as { id: string; price_cents: number }[]) {
    modPrices.set(m.id, Number(m.price_cents) || 0)
  }

  // Build verified items with server-authoritative prices.
  // Modifier price falls back to max(0, clientValue) when not found in DB (deleted modifier).
  const verifiedItems = body.items.map(item => ({
    product_id: item.product_id,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: prodPrices.get(item.product_id)!,
    modifiers: (item.modifiers ?? []).map(m => ({
      id: m.id,
      name: m.name,
      price_cents: modPrices.has(m.id) ? modPrices.get(m.id)! : Math.max(0, m.price_cents ?? 0),
    })),
    ...(item.config ? { config: item.config } : {}),
    ...(item.note ? { note: item.note } : {}),
  }))

  const subtotal = verifiedItems.reduce((s, item) => {
    const modsCents = (item.modifiers ?? []).reduce((ms, m) => ms + (m.price_cents ?? 0), 0)
    return s + item.quantity * (item.unit_price + modsCents / 100)
  }, 0)

  const orderNumber = 'ONL-' + Date.now().toString(36).toUpperCase().slice(-6)

  const { data: order, error } = await sb.from('pos_online_orders').insert({
    business_id,
    order_number: orderNumber,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: session.email ?? null,
    items: verifiedItems,
    subtotal,
    total: subtotal,
    notes: body.notes ?? body.special_instructions ?? null,
    pickup_time: body.pickup_time ? new Date(body.pickup_time).toISOString() : null,
    fulfillment_type: body.fulfillment_type ?? 'pickup',
    source: body.source ?? 'online',
    status: 'pending',
  }).select('id, order_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orderId = (order as { id: string }).id
  const bid = business_id

  let earnCustomerId: string | null = null
  let earnSaleId: string | null = null

  try {
    let customerId: string | null = sessionCustTyped?.id ?? null

    if (!customerId) {
      // Edge case: session exists but no pos_customers row for this business yet.
      const normPhone = customerPhone ? normalisePhone(customerPhone) : null
      const { data: created, error: createErr } = await sb.from('pos_customers').insert({
        business_id: bid,
        loyalty_identity_id: session.identity_id,
        name: customerName.slice(0, 80),
        phone: normPhone,
        email: session.email ?? null,
        source: 'online_order',
        points_balance: 0,
        stamps_count: 0,
        loyalty_points: 0,
      }).select('id').single()

      if (createErr && /duplicate|unique/i.test(createErr.message)) {
        const { data } = await sb.from('pos_customers')
          .select('id').eq('business_id', bid).eq('loyalty_identity_id', session.identity_id)
          .maybeSingle()
        customerId = (data as { id: string } | null)?.id ?? null
      } else {
        customerId = (created as { id: string } | null)?.id ?? null
      }
    }

    if (customerId) {
      earnCustomerId = customerId

      // Ensure loyalty_identity_id is stamped on the pos_customers row (idempotent).
      await linkOrCreateMembership(
        session.identity_id, bid,
        { phone: customerPhone, email: session.email ?? null },
        customerName,
      )

      // Idempotency: reuse existing sale if this order_number was already processed.
      const { data: existingSale } = await sb.from('pos_sales')
        .select('id').eq('business_id', bid).eq('idempotency_key', orderNumber).maybeSingle()
      let saleId: string | null = (existingSale as { id: string } | null)?.id ?? null

      if (!saleId) {
        const normPhone = customerPhone ? normalisePhone(customerPhone) : null
        const { data: sale, error: saleErr } = await sb.from('pos_sales').insert({
          business_id: bid,
          customer_id: customerId,
          total_amount: subtotal,
          source: 'online_order',
          order_type: 'online_order',
          status: 'completed',
          idempotency_key: orderNumber,
          customer_name: customerName,
          customer_phone: normPhone,
          notes: body.notes ?? null,
          pickup_time: body.pickup_time ? new Date(body.pickup_time).toISOString() : null,
        }).select('id').single()

        if (saleErr && !/duplicate|unique/i.test(saleErr.message)) {
          throw new Error('[place-order] pos_sales insert: ' + saleErr.message)
        }
        saleId = (sale as { id: string } | null)?.id ?? null
      }

      if (saleId) {
        earnSaleId = saleId
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

  const isCardPayment = (body.payment_method ?? '').startsWith('pay_online')
  let stripeClientSecret: string | null = null

  if (isCardPayment) {
    try {
      const pi = await stripeOrders.paymentIntents.create({
        amount: Math.round(subtotal * 100),
        currency: 'aud',
        metadata: {
          kind: 'online_order',
          order_id: orderId,
          order_number: orderNumber,
          business_id: bid,
          sale_id: earnSaleId ?? '',
          customer_id: earnCustomerId ?? '',
        },
        automatic_payment_methods: { enabled: true },
      }, { idempotencyKey: orderNumber })
      stripeClientSecret = pi.client_secret
      await sb.from('pos_online_orders').update({
        stripe_payment_intent_id: pi.id,
        stripe_payment_status: pi.status,
        updated_at: new Date().toISOString(),
      }).eq('id', orderId)
    } catch (e) {
      void sb.from('activity_log').insert({
        business_id: bid,
        action_type: 'stripe_pi_error',
        description: '[place-order] PaymentIntent create failed: ' + (e as Error).message,
        metadata: { order_id: orderId, error: (e as Error).message },
        created_at: new Date().toISOString(),
      })
      return NextResponse.json({ error: 'Payment setup failed. Please try again.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    order_number: (order as { order_number: string }).order_number,
    total: subtotal,
    estimated_ready_minutes: 15,
    ...(stripeClientSecret ? {
      stripe_client_secret: stripeClientSecret,
      stripe_publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    } : {}),
  })
}