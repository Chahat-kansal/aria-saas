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
      .select('id, sale_id, customer_id, stripe_payment_status')
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
      .select('id, total_amount, customer_id')
      .maybeSingle()

    // FIX-ONLINE-PAY-1 A4 — loyalty is earned HERE, not at placement, because a sale created
    // 'pending' deliberately skipped it (create-sale.ts). Safe to call on every retry: earnOnSale
    // early-returns when a ledger row already exists for the sale (earnOnSale.ts:36-47, verified
    // before this was wired in — the sprint asked for that check rather than assuming it).
    const customerId = (promoted?.customer_id as string | null) ?? (order?.customer_id as string | null) ?? null
    if (promoted && customerId) {
      try {
        const { earnOnSale } = await import('@/lib/loyalty/earnOnSale')
        await earnOnSale({
          businessId,
          customerId,
          saleId,
          totalAmount: Number(promoted.total_amount ?? 0),
        })
      } catch (e) {
        // Non-fatal: the money is recorded, and a missing earn is recoverable. Failing the webhook
        // here would make Stripe retry a payment write that already succeeded.
        console.error('[promote-online-sale] loyalty earn failed (non-fatal):', (e as Error).message)
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId,
          action_type: 'loyalty_earn_error',
          description: '[promote-online-sale] earnOnSale failed: ' + (e as Error).message,
          metadata: { sale_id: saleId, order_id: orderId },
          created_at: new Date().toISOString(),
        })
      }
    }

    return saleId
  } catch (e) {
    console.error('[promote-online-sale] failed (non-fatal):', (e as Error).message)
    return null
  }
}
