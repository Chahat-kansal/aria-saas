import { supabaseAdmin } from '@/lib/supabase-admin'

// FIX-ONLINE-PAY-1 A3 — the single place a pending online sale becomes revenue.
//
// Called from BOTH confirmation paths so they cannot drift:
//   · webhooks/stripe-orders — the normal path, when Stripe confirms
//   · order-track recovery   — the safety net for a webhook that never landed
//
// Both may run for the same order; both are safe to repeat (see the guards below).

/**
 * Promote the sale linked to an online order from 'pending' to 'completed', and award loyalty.
 *
 * Returns the sale id when it promoted (or was already completed), else null.
 * Never throws — the caller is either a webhook Stripe will retry or a customer-facing read.
 */
export async function promoteOnlineSaleToCompleted(
  orderId: string,
  businessId: string,
): Promise<string | null> {
  try {
    const { data: order } = await supabaseAdmin
      .from('pos_online_orders')
      .select('id, sale_id')
      .eq('id', orderId)
      .eq('business_id', businessId)
      .maybeSingle()

    const saleId = (order?.sale_id as string | null) ?? null
    if (!saleId) return null

    // ONLY pending -> completed. A replayed webhook must never resurrect a sale that has since been
    // voided or refunded: Stripe retries, and this is not a once-only endpoint. The guard is in the
    // WHERE clause rather than a read-then-write, so two concurrent retries cannot both promote.
    const { data: promoted } = await supabaseAdmin
      .from('pos_sales')
      .update({ status: 'completed' })
      .eq('id', saleId)
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    // FIX-ONLINE-PAY-A A3 — NO EARN HERE, deliberately. The loyalty earn already exists at
    // online-orders/[id]/route.ts:213, fired on PICKUP (status -> completed). That call had been a
    // permanent no-op because createSale earned at placement; now that a pending sale skips the
    // earn, it does the job it was written for. Adding a second earn path here would move the
    // moment points are awarded from collection to payment — a semantic change nobody asked for —
    // and would leave two places to keep in step. The fix was a subtraction, not an addition.

    return saleId
  } catch (e) {
    console.error('[promote-online-sale] failed (non-fatal):', (e as Error).message)
    return null
  }
}
