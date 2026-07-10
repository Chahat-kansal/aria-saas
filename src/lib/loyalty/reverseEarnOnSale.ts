import { supabaseAdmin } from '@/lib/supabase-admin'

interface ReverseParams {
  businessId: string
  saleId: string
  /** The voided sale's total_amount — reversed off total_spent alongside points. */
  totalAmount?: number
}

export interface ReverseResult {
  reversed: boolean
  pointsReversed: number
  stampsReversed: number
  alreadyReversed?: boolean
  nothingToReverse?: boolean
}

/**
 * LOYALTY-FINISH — reverses a completed sale's loyalty earn on void. The
 * exact inverse of earnOnSale: looks up the original 'earn' ledger row for
 * this sale_id (the source of truth for exactly what was awarded) rather
 * than recomputing from the current points_per_dollar rate, which may have
 * changed since the sale — so the reversal is always correct.
 *
 * Idempotency: a unique-per-sale 'adjustment' ledger row (tagged
 * reward_redeemed='void_reversal') marks the reversal as done, mirroring
 * earnOnSale's own SELECT-first + insert-first pattern. Safe to call from
 * every void route, including if void is somehow triggered twice.
 *
 * Bug this fixes: no void route previously reversed loyalty points at all —
 * a customer kept points/stamps earned on a sale that was later voided,
 * indefinitely. Call this from every "void a sale" code path — one change
 * applies everywhere, same principle as earnOnSale's own header comment.
 */
export async function reverseEarnOnSale({ businessId, saleId, totalAmount }: ReverseParams): Promise<ReverseResult> {
  // 1. Already reversed? (idempotency — safe to call more than once)
  const { data: existingReversal } = await supabaseAdmin
    .from('pos_loyalty_transactions')
    .select('id')
    .eq('sale_id', saleId)
    .eq('type', 'adjustment')
    .eq('reward_redeemed', 'void_reversal')
    .maybeSingle()
  if (existingReversal) return { reversed: false, pointsReversed: 0, stampsReversed: 0, alreadyReversed: true }

  // 2. What was actually earned on this sale? (nothing to reverse if no earn row —
  //    e.g. no customer was attached, or the loyalty program was disabled at sale time.)
  const { data: earnRow } = await supabaseAdmin
    .from('pos_loyalty_transactions')
    .select('customer_id, points_delta, stamps_delta')
    .eq('sale_id', saleId)
    .eq('type', 'earn')
    .maybeSingle()
  if (!earnRow?.customer_id) return { reversed: false, pointsReversed: 0, stampsReversed: 0, nothingToReverse: true }

  const pointsToReverse = earnRow.points_delta ?? 0
  const stampsToReverse = earnRow.stamps_delta ?? 0
  if (pointsToReverse === 0 && stampsToReverse === 0) {
    return { reversed: false, pointsReversed: 0, stampsReversed: 0, nothingToReverse: true }
  }

  // 3. Ledger row FIRST (negative deltas) — the idempotency marker for future calls.
  const { error: ledgerErr } = await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId,
    customer_id: earnRow.customer_id,
    sale_id: saleId,
    type: 'adjustment',
    points_delta: -pointsToReverse,
    stamps_delta: -stampsToReverse,
    reward_redeemed: 'void_reversal',
    created_at: new Date().toISOString(),
  })
  if (ledgerErr) {
    if (/duplicate|unique/i.test(ledgerErr.message)) {
      return { reversed: false, pointsReversed: 0, stampsReversed: 0, alreadyReversed: true }
    }
    throw new Error('[reverseEarnOnSale] ledger insert failed: ' + ledgerErr.message)
  }

  // 4. Balance reversal — only after a successful ledger write.
  if (pointsToReverse > 0) {
    await supabaseAdmin.rpc('increment_numeric', {
      p_table: 'pos_customers', p_id: earnRow.customer_id, p_column: 'points_balance', p_amount: -pointsToReverse,
    })
    await supabaseAdmin.rpc('increment_loyalty_points', {
      customer_id: earnRow.customer_id, points: -pointsToReverse,
    })
  }
  if (stampsToReverse > 0) {
    await supabaseAdmin.rpc('increment_numeric', {
      p_table: 'pos_customers', p_id: earnRow.customer_id, p_column: 'stamps_count', p_amount: -stampsToReverse,
    })
  }

  // 5. total_spent reversal — a voided sale shouldn't count toward lifetime spend either.
  if (typeof totalAmount === 'number' && isFinite(totalAmount) && totalAmount > 0) {
    await supabaseAdmin.rpc('increment_numeric', {
      p_table: 'pos_customers', p_id: earnRow.customer_id, p_column: 'total_spent', p_amount: -totalAmount,
    })
  }

  return { reversed: true, pointsReversed: pointsToReverse, stampsReversed: stampsToReverse }
}
