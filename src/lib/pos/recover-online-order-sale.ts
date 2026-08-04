import { supabaseAdmin } from '@/lib/supabase-admin'
import { createSale, type CreateSaleItem } from '@/lib/pos/create-sale'
import { normalisePhone } from '@/lib/phone'

// S-ORD-CONFIRM §3 — recovery for "paid, but no sale".
//
// place-order creates the sale BEFORE payment resolves and wraps it in a catch that logs to
// activity_log and continues, so a createSale failure leaves a genuine, paid order with sale_id
// NULL. That is not a cosmetic gap: no revenue row, no stock decrement, no loyalty earn — the moat
// data for that order simply never exists.
//
// IDEMPOTENCY IS INHERITED, NOT REIMPLEMENTED. createSale already replays an existing sale when it
// sees a matching (business_id, idempotency_key) — see create-sale.ts:163-170 — and place-order
// already passes idempotencyKey = orderNumber. Using the SAME key here means a double-run returns
// the existing sale rather than creating a second one, so this is safe to call on every poll.
// Deliberately reusing that key rather than the brief's suggested `onl:<order_id>`: a new key would
// NOT match the one place-order wrote, so a retry would create the duplicate sale the key exists to
// prevent.

/**
 * Attempt to create the missing sale for a paid online order. Returns the sale id when one exists
 * or was created, else null. Never throws — the tracking read must keep working regardless.
 *
 * The CALLER is responsible for only invoking this when payment has actually succeeded.
 */
export async function recoverSaleForOnlineOrder(businessId: string, orderId: string): Promise<string | null> {
  try {
    const { data: order } = await supabaseAdmin
      .from('pos_online_orders')
      .select('id, order_number, items, total, customer_id, customer_name, customer_phone, notes, special_instructions, sale_id, stripe_payment_status')
      .eq('id', orderId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!order) return null
    if (order.sale_id) return order.sale_id as string                    // already recovered
    if (order.stripe_payment_status !== 'succeeded') return null         // unpaid — not a lost sale

    const rawItems = (order.items as Array<Record<string, unknown>> | null) ?? []
    if (rawItems.length === 0) return null                               // nothing to build a sale from

    const items: CreateSaleItem[] = rawItems.map(i => {
      const qty = Number(i.quantity ?? 1)
      const unit = Number(i.unit_price ?? 0)
      const mods = (i.modifiers as Array<{ price_cents?: number }> | undefined) ?? []
      const modsCents = mods.reduce((s, m) => s + Number(m.price_cents ?? 0), 0)
      return {
        product_id: String(i.product_id ?? ''),
        product_name: String(i.product_name ?? 'Item'),
        quantity: qty,
        unit_price: unit,
        line_total: +(qty * (unit + modsCents / 100)).toFixed(2),
        modifiers: mods as CreateSaleItem['modifiers'],
        item_notes: (i.note as string | null) ?? null,
      }
    })

    const total = Number(order.total ?? 0)
    const phone = order.customer_phone ? normalisePhone(String(order.customer_phone)) : null

    const result = await createSale(supabaseAdmin as never, {
      businessId,
      // CreateSaleParams.userId is non-nullable but is read ONLY for price_override_by, and only
      // when an item carries price_overridden (create-sale.ts:277). Recovery never sets that flag,
      // so this value is inert — there is no staff session to attribute a recovery to anyway.
      userId: (order.customer_id as string | null) ?? '',
      items,
      customerId: (order.customer_id as string | null) ?? null,
      // Card is the only way stripe_payment_status reaches 'succeeded'.
      paymentMethod: 'card',
      subtotal: total,
      taxAmount: 0,
      totalAmount: total,
      notes: (order.notes as string | null) ?? (order.special_instructions as string | null) ?? null,
      orderType: 'online_order',
      source: 'online_order',
      idempotencyKey: String(order.order_number),   // SAME key place-order used — see header
      customerName: (order.customer_name as string | null) ?? null,
      customerPhone: phone,
      skipKds: true,                                 // preserve the deliberate online-order KDS timing
    })

    if (result.error || !result.sale) {
      console.error('[recover-online-order-sale] createSale failed:', result.error)
      return null
    }

    const saleId = (result.sale as { id: string }).id
    await supabaseAdmin.from('pos_online_orders')
      .update({ sale_id: saleId })
      .eq('id', orderId)
      .is('sale_id', null)      // set-once: a concurrent poll cannot overwrite a sale already linked

    console.log('[recover-online-order-sale] recovered sale', saleId, 'for order', order.order_number)
    return saleId
  } catch (e) {
    console.error('[recover-online-order-sale] non-fatal:', (e as Error).message)
    return null
  }
}
