export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Module-level Stripe client (PRELOAD) — mirrors stripe-orders webhook pattern
const stripeOrders = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { waitUntil } from '@vercel/functions'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'
import { linkOrCreateMembership } from '@/lib/loyalty/membership'
import { normalisePhone } from '@/lib/clicksend'

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
    items: Array<{ product_id: string; product_name: string; quantity: number; unit_price: number; modifiers?: { id: string; name: string; price_cents: number }[]; config?: { mode: string; layers: string[]; added: unknown[]; removed: unknown[] }; note?: string }>
    notes?: string
    special_instructions?: string
    payment_method?: string
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
    notes: body.notes ?? body.special_instructions ?? null,
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
    // 1. Find or create pos_customers — always use canonical (normalised) phone.
    //    One real person = one customer. Lookup by normPhone first; raw-phone fallback
    //    handles existing rows that were stored before normalisation was enforced.
    const rawPhone = body.customer_phone?.trim() ?? null
    const normPhone = rawPhone ? normalisePhone(rawPhone) : null
    const rawEmail = body.customer_email ? body.customer_email.trim().toLowerCase() : null

    let customerId: string | null = null
    if (normPhone) {
      // Primary: normalised form (all new rows stored this way)
      const { data: byNorm } = await sb.from('pos_customers')
        .select('id').eq('business_id', bid).eq('phone', normPhone)
        .order('created_at', { ascending: true }).limit(1)
      customerId = (byNorm as { id: string }[] | null)?.[0]?.id ?? null

      // Fallback: raw form (transition — old rows may have been stored un-normalised)
      if (!customerId && normPhone !== rawPhone) {
        const { data: byRaw } = await sb.from('pos_customers')
          .select('id').eq('business_id', bid).eq('phone', rawPhone!)
          .order('created_at', { ascending: true }).limit(1)
        customerId = (byRaw as { id: string }[] | null)?.[0]?.id ?? null
        // Normalise phone in-place so future lookups find the canonical form
        if (customerId) {
          await sb.from('pos_customers').update({ phone: normPhone }).eq('id', customerId)
        }
      }
    }
    if (!customerId && rawEmail) {
      const { data: byEmail } = await sb.from('pos_customers')
        .select('id').eq('business_id', bid).ilike('email', rawEmail)
        .order('created_at', { ascending: true }).limit(1)
      customerId = (byEmail as { id: string }[] | null)?.[0]?.id ?? null
    }
    if (!customerId) {
      const { data: created, error: createErr } = await sb.from('pos_customers').insert({
        business_id: bid,
        name: body.customer_name.trim().slice(0, 80),
        phone: normPhone,
        email: rawEmail,
        source: 'online_order',
        points_balance: 0,
        stamps_count: 0,
        loyalty_points: 0,
      }).select('id').single()
      // Concurrent insert race — re-fetch the winner
      if (createErr && /duplicate|unique/i.test(createErr.message)) {
        if (normPhone) {
          const { data } = await sb.from('pos_customers')
            .select('id').eq('business_id', bid).eq('phone', normPhone)
            .order('created_at', { ascending: true }).limit(1)
          customerId = (data as { id: string }[] | null)?.[0]?.id ?? null
        }
      } else {
        customerId = (created as { id: string } | null)?.id ?? null
      }
    }

    if (customerId) {
      earnCustomerId = customerId

      // 1b. Find/create global loyalty_identity + stamp loyalty_identity_id on pos_customers.
      //     Runs on every online order so the identity link is always populated.
      if (normPhone || rawEmail) {
        let identityId: string | null = null

        if (normPhone) {
          const { data: idByPhone } = await sb.from('loyalty_identity')
            .select('id').eq('phone', normPhone).maybeSingle()
          identityId = (idByPhone as { id: string } | null)?.id ?? null
        }
        if (!identityId && rawEmail) {
          const { data: idByEmail } = await sb.from('loyalty_identity')
            .select('id').ilike('email', rawEmail).maybeSingle()
          identityId = (idByEmail as { id: string } | null)?.id ?? null
        }
        if (!identityId) {
          const { data: newId, error: idErr } = await sb.from('loyalty_identity')
            .insert({ phone: normPhone, email: rawEmail })
            .select('id').single()
          if (idErr && /duplicate|unique/i.test(idErr.message)) {
            // Concurrent insert race — re-fetch whichever row won the unique constraint
            if (normPhone) {
              const { data } = await sb.from('loyalty_identity').select('id').eq('phone', normPhone).maybeSingle()
              identityId = (data as { id: string } | null)?.id ?? null
            }
            if (!identityId && rawEmail) {
              const { data } = await sb.from('loyalty_identity').select('id').ilike('email', rawEmail).maybeSingle()
              identityId = (data as { id: string } | null)?.id ?? null
            }
          } else {
            identityId = (newId as { id: string } | null)?.id ?? null
          }
        }
        if (identityId) {
          await linkOrCreateMembership(
            identityId, bid,
            { phone: normPhone, email: rawEmail },
            body.customer_name.trim(),
          )
        }
      }

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
          customer_phone: normPhone,
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

  // 4. Card payments — create Stripe PaymentIntent, return client_secret to frontend.
  //    Loyalty earn is deferred to the stripe-orders webhook (runs only after payment confirmed).
  const isCardPayment = (body.payment_method ?? '').startsWith('pay_online')
  let stripeClientSecret: string | null = null

  if (isCardPayment) {
    try {
      // idempotencyKey = orderNumber: same order retried → same PI returned, no double-charge
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

  // 5. Background: loyalty earn — skip for card payments; webhook handles after confirmation.
  if (earnCustomerId && earnSaleId && !isCardPayment) {
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
    estimated_ready_minutes: 15,
    ...(stripeClientSecret ? {
      stripe_client_secret: stripeClientSecret,
      stripe_publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    } : {}),
  })
}