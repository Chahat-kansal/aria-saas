export const dynamic = 'force-dynamic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyReady } from '@/lib/notify-ready'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { waitUntil } from '@vercel/functions'
import { fireKdsForOrder } from '@/lib/online-orders/fireKdsForOrder'
import { earnOnSale } from '@/lib/loyalty/earnOnSale'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { recordSaleMovements, type SaleMovementLine } from '@/lib/inventory/record-sale-movement'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in params ? await params : params
  const body = await req.json()
  const now = new Date().toISOString()

  // Read current state BEFORE update — for dedup guard and notification payload.
  const { data: currentOrder } = await supabaseAdmin
    .from('pos_online_orders')
    .select('status, customer_name, customer_phone, customer_email, order_number, customer_id, sale_id, total')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  const allowed: Record<string, unknown> = { updated_at: now }
  if (body.status !== undefined) {
    allowed.status = body.status
    if (body.status === 'accepted' || body.status === 'confirmed') allowed.accepted_at = now
    if (body.status === 'rejected' || body.status === 'cancelled') {
      allowed.rejected_at = now
      if (body.rejection_reason) allowed.rejection_reason = body.rejection_reason
    }
    if (body.status === 'ready') allowed.ready_at = now
    if (body.status === 'completed') allowed.picked_up_at = now
  }

  // On accept, optionally create a POS sale and link it (idempotent).
  if ((body.status === 'accepted' || body.status === 'confirmed') && body.create_sale) {
    const { data: ord } = await supabase.from('pos_online_orders')
      .select('order_number, total, sale_id, fulfillment_type, items, outlet_id').eq('id', id).eq('business_id', bid).maybeSingle()
    if (ord && !ord.sale_id) {
      const { data: sale } = await supabase.from('pos_sales').insert({
        business_id: bid, sale_number: String(ord.order_number ?? 'ONL'), payment_method: 'other',
        total_amount: Number(ord.total ?? 0), subtotal: Number(ord.total ?? 0), tax_amount: 0, discount_amount: 0,
        status: 'completed', notes: 'Online order ' + ord.order_number + ' (' + (ord.fulfillment_type ?? 'pickup') + ')',
      }).select('id').single()
      if (sale?.id) {
        allowed.sale_id = sale.id
        // Insert sale items + adjust outlet stock + record movements (idempotent via sale_id guard)
        type OrdItem = { product_id?: string; product_name?: string; quantity?: number; price?: number }
        const rawItems = ((ord.items ?? []) as OrdItem[]).filter(i => i.product_id && Number(i.quantity) > 0)
        if (rawItems.length > 0) {
          await supabaseAdmin.from('pos_sale_items').insert(rawItems.map(i => ({
            sale_id: sale.id,
            business_id: bid,
            product_id: i.product_id,
            product_name: i.product_name ?? '',
            quantity: Number(i.quantity),
            unit_price: Number(i.price ?? 0),
            line_total: Number(i.price ?? 0) * Number(i.quantity),
            discount_percent: 0,
            tax_rate: 0,
            modifiers: [],
          }))).then(() => {}, e => console.error('[online-orders] sale_items insert failed:', (e as Error).message))
          const outletId = await resolveOutletId(supabaseAdmin, bid, (ord.outlet_id as string | null) ?? null)
          const movementLines: SaleMovementLine[] = []
          for (const item of rawItems) {
            const newStock = await adjustOutletStock(supabaseAdmin, {
              businessId: bid, outletId, productId: item.product_id as string,
              delta: -Math.abs(Number(item.quantity)),
            })
            movementLines.push({ itemId: item.product_id as string, quantitySold: Number(item.quantity), newStock })
          }
          await recordSaleMovements(supabaseAdmin, {
            businessId: bid, saleId: sale.id, saleNumber: ord.order_number, lines: movementLines,
            outletId, writtenBy: 'pos/online-orders/[id]:accept',
          })
        }
      }
    }
  }

  const { error } = await supabase.from('pos_online_orders').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Notifications — non-blocking, one per status transition ──
  const prevStatus = currentOrder?.status
  const newStatus = body.status as string | undefined

  if (newStatus && newStatus !== prevStatus && currentOrder) {
    const orderId = id
    const businessId = bid
    const snap = currentOrder
    waitUntil((async () => {
      try {
        // READY → shared notifyReady (SMS → email fallback, phone/email validated)
        // notifyReady also inserts cx_notifications type='order' "Ready for pickup"
        if (newStatus === 'ready') {
          await notifyReady(orderId, snap, businessId, '[online-orders/[id]]')
        }

        // cx in-app notifications — accepted and completed transitions
        const cxCustId = snap.customer_id ?? null
        if (cxCustId) {
          if (newStatus === 'accepted' || newStatus === 'confirmed') {
            await supabaseAdmin.from('cx_notifications').insert({
              business_id: businessId,
              customer_id: cxCustId,
              type: 'order',
              title: 'Order confirmed',
              body: 'Your order ' + (snap.order_number ?? '') + ' is being prepared.',
              action_url: null,
            })
          }
          if (newStatus === 'completed') {
            await supabaseAdmin.from('cx_notifications').insert({
              business_id: businessId,
              customer_id: cxCustId,
              type: 'order',
              title: 'Picked up',
              body: 'Order ' + (snap.order_number ?? '') + ' complete — thanks for your visit!',
              action_url: null,
            })
          }
        }

        // ACCEPTED → email receipt with tracking link
        if ((newStatus === 'accepted' || newStatus === 'confirmed') && snap.customer_email) {
          const { data: biz } = await supabaseAdmin
            .from('businesses').select('name, slug').eq('id', businessId).maybeSingle()
          const bizName = (biz?.name as string | null) ?? 'the café'
          const bizSlug = (biz?.slug as string | null) ?? ''
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
          const trackingUrl = appUrl + '/menu/' + bizSlug + '/order/' + (snap.order_number ?? '')
          const firstName = (snap.customer_name ?? '').split(' ')[0] || 'there'
          const orderNum = snap.order_number ?? ''
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Aria <orders@ariaos.site>',
                to: [snap.customer_email],
                subject: 'Order ' + orderNum + ' confirmed at ' + bizName,
                html: '<p>Hi ' + firstName + ',</p><p>Your order <strong>' + orderNum + '</strong> at <strong>' + bizName + '</strong> has been accepted and is being prepared.</p><p><a href="' + trackingUrl + '">Track your order live &rarr;</a></p><p>We\'ll SMS you when it\'s ready.</p>',
              }),
            }).catch(() => null)
          }
        }
      } catch (e) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId,
          action_type: 'order_notify_error',
          description: '[order-notify] status=' + newStatus + ' err=' + String(e),
          metadata: { order_id: orderId, status: newStatus, error: String(e) },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  // ── KDS fire — non-blocking, on first accept/confirm only ──
  // Webhook auto-accepts paid orders; for pay_on_pickup this path runs when owner taps accept.
  if (
    (newStatus === 'accepted' || newStatus === 'confirmed') &&
    prevStatus !== 'accepted' && prevStatus !== 'confirmed'
  ) {
    const fireOrderId = id
    const fireBid = bid
    waitUntil((async () => {
      try {
        // Gate: card payments must be confirmed before KDS fires (pay_on_pickup skips gate)
        const { data: stripeOrd } = await supabaseAdmin
          .from('pos_online_orders')
          .select('stripe_payment_intent_id, stripe_payment_status, order_number')
          .eq('id', fireOrderId)
          .maybeSingle()
        const stripePI = (stripeOrd as { stripe_payment_intent_id?: string | null } | null)?.stripe_payment_intent_id
        const stripeStatus = (stripeOrd as { stripe_payment_status?: string | null } | null)?.stripe_payment_status
        if (stripePI && stripeStatus !== 'succeeded') {
          void supabaseAdmin.from('activity_log').insert({
            business_id: fireBid, action_type: 'kds_fire_blocked_unpaid',
            description: '[online-orders] KDS fire blocked — payment not confirmed for order ' + ((stripeOrd as { order_number?: string } | null)?.order_number ?? ''),
            metadata: { order_id: fireOrderId, stripe_pi: stripePI, stripe_status: stripeStatus },
            created_at: new Date().toISOString(),
          })
          return
        }
        await fireKdsForOrder(fireOrderId, fireBid)
      } catch (kdsErr) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: fireBid,
          action_type: 'online_kds_fire_error',
          description: '[online-orders] KDS fire failed: ' + (kdsErr as Error).message,
          metadata: { order_id: fireOrderId },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  // ── Loyalty earn — fires once on pickup (status → completed), idempotent via earnOnSale ──
  // FIX-ONLINE-PAY-A A3 — this was a PERMANENT NO-OP until now: createSale earned at placement, so
  // earnOnSale's SELECT-first guard (earnOnSale.ts:36-48) always found a row and returned early.
  // A card order's sale is now created 'pending' and skips the earn, so this call finally does the
  // job the comment above has always claimed. CASH orders still earn at placement (their sale is
  // created 'completed'), so for those this remains a no-op — correctly, not accidentally.
  if (newStatus === 'completed' && prevStatus !== 'completed') {
    const earnOrderId = id
    const earnBid = bid
    const earnSaleId = (currentOrder as { sale_id?: string | null } | null)?.sale_id ?? null
    const earnCustomerId = (currentOrder as { customer_id?: string | null } | null)?.customer_id ?? null
    const earnTotal = Number((currentOrder as { total?: string | null } | null)?.total ?? 0)
    if (earnSaleId && earnCustomerId) {
      waitUntil((async () => {
        try {
          await earnOnSale({ businessId: earnBid, customerId: earnCustomerId, saleId: earnSaleId, totalAmount: earnTotal })
        } catch (e) {
          void supabaseAdmin.from('activity_log').insert({
            business_id: earnBid,
            action_type: 'online_earn_error',
            description: '[online-orders] earnOnSale on pickup failed: ' + (e as Error).message,
            metadata: { order_id: earnOrderId, sale_id: earnSaleId },
            created_at: new Date().toISOString(),
          })
        }
      })())
    }
    // Fallback: record stock movements on pickup if accept path didn't already (handles pre-fix orders; no-op if already recorded)
    if (earnSaleId) {
      waitUntil((async () => {
        try {
          const { data: existingMov } = await supabaseAdmin
            .from('stock_movements').select('id').eq('sale_id', earnSaleId).limit(1).maybeSingle()
          if (!existingMov) {
            const { data: fullOrd } = await supabaseAdmin.from('pos_online_orders')
              .select('items, outlet_id, order_number').eq('id', earnOrderId).maybeSingle()
            type FallbackItem = { product_id?: string; quantity?: number }
            const rawFallback = ((fullOrd?.items ?? []) as FallbackItem[])
              .filter(i => i.product_id && Number(i.quantity) > 0)
            if (rawFallback.length > 0) {
              const fallbackOutletId = await resolveOutletId(supabaseAdmin, earnBid, (fullOrd?.outlet_id as string | null) ?? null)
              const fallbackLines: SaleMovementLine[] = []
              for (const item of rawFallback) {
                const newStock = await adjustOutletStock(supabaseAdmin, {
                  businessId: earnBid, outletId: fallbackOutletId, productId: item.product_id as string,
                  delta: -Math.abs(Number(item.quantity)),
                })
                fallbackLines.push({ itemId: item.product_id as string, quantitySold: Number(item.quantity), newStock })
              }
              await recordSaleMovements(supabaseAdmin, { businessId: earnBid, saleId: earnSaleId, saleNumber: null, lines: fallbackLines, outletId: fallbackOutletId, writtenBy: 'pos/online-orders/[id]:pickup-fallback' })
            }
          }
        } catch (e) {
          void supabaseAdmin.from('activity_log').insert({
            business_id: earnBid, action_type: 'online_movement_fallback_error',
            description: '[online-orders] completed-path movement fallback failed: ' + (e as Error).message,
            metadata: { order_id: earnOrderId, sale_id: earnSaleId },
            created_at: new Date().toISOString(),
          })
        }
      })())
    }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/online-orders/[id]', _PATCH)