import { supabaseAdmin } from '@/lib/supabase-admin'

interface EarnParams {
  businessId: string
  customerId: string
  saleId: string
  totalAmount: number
}

export interface EarnResult {
  earnedPoints: number
  earnedStamps: number
  idempotent: boolean
  skipped?: boolean
}

/**
 * Single source of truth for loyalty base earn on a completed sale.
 *
 * Uses supabaseAdmin for ALL writes so RLS never silently blocks earn.
 * The previous split (user-auth client for RPCs, admin only for ledger) was the
 * root cause of the empty pos_loyalty_transactions ledger.
 *
 * Idempotency guarantee:
 *   1. SELECT-first: returns early if a ledger row for this sale_id already exists.
 *   2. Unique index pos_loyalty_txn_earn_per_sale catches any concurrent race.
 *
 * Called from both /api/pos/sale and /api/pos/sales — one change applies everywhere.
 */
export async function earnOnSale({
  businessId,
  customerId,
  saleId,
  totalAmount,
}: EarnParams): Promise<EarnResult> {
  // 1. Idempotency: abort early if this sale already has a ledger row.
  const { data: existing } = await supabaseAdmin
    .from('pos_loyalty_transactions')
    .select('id, points_delta, stamps_delta')
    .eq('sale_id', saleId)
    .eq('type', 'earn')
    .maybeSingle()

  if (existing) {
    return {
      earnedPoints: existing.points_delta ?? 0,
      earnedStamps: existing.stamps_delta ?? 0,
      idempotent: true,
    }
  }

  // 2. Read loyalty config via supabaseAdmin (bypasses RLS).
  //    FIX 2: base earn fires even with 0 rows in loyalty_reward_rules — bonus rules are additive only.
  const { data: loyCfg } = await supabaseAdmin
    .from('pos_loyalty_config')
    .select('program_enabled, program_type, points_per_dollar')
    .eq('business_id', businessId)
    .maybeSingle()

  // Master gate: if the loyalty program has been disabled by the owner, skip all earn silently.
  if (loyCfg?.program_enabled === false) {
    return { earnedPoints: 0, earnedStamps: 0, idempotent: false, skipped: true }
  }

  const stampsMode = (loyCfg?.program_type ?? 'points') === 'stamps'
  const ptsPerDollar = Number(loyCfg?.points_per_dollar ?? 1)
  const safeAmount =
    typeof totalAmount === 'number' && isFinite(totalAmount) && totalAmount > 0
      ? totalAmount
      : 0
  const earnedPoints = stampsMode ? 0 : Math.max(0, Math.floor(ptsPerDollar * safeAmount))
  const earnedStamps = stampsMode ? 1 : 0

  if (earnedPoints > 0 || earnedStamps > 0) {
    // 3. Write ledger row FIRST — if this succeeds, the customer earned.
    //    Duplicate-key on the unique index means a concurrent request already wrote it.
    const { error: ledgerErr } = await supabaseAdmin
      .from('pos_loyalty_transactions')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        sale_id: saleId,
        type: 'earn',
        points_delta: earnedPoints,
        stamps_delta: earnedStamps,
        created_at: new Date().toISOString(),
      })

    if (ledgerErr) {
      if (/duplicate|unique/i.test(ledgerErr.message)) {
        return { earnedPoints, earnedStamps, idempotent: true }
      }
      throw new Error('[earnOnSale] ledger insert failed: ' + ledgerErr.message)
    }

    // 4. Balance update — only after a successful ledger write.
    if (stampsMode) {
      await supabaseAdmin.rpc('increment_numeric', {
        p_table: 'pos_customers', p_id: customerId, p_column: 'stamps_count', p_amount: 1,
      })
    } else {
      // points_balance is the canonical balance the redeem path reads.
      await supabaseAdmin.rpc('increment_numeric', {
        p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: earnedPoints,
      })
      // loyalty_points is the legacy column; keep in sync for dashboard consistency.
      await supabaseAdmin.rpc('increment_loyalty_points', {
        customer_id: customerId, points: earnedPoints,
      })
    }

    // 4b. CX in-app notification — non-blocking; failure must not disrupt earn flow.
    try {
      await supabaseAdmin.from('cx_notifications').insert({
        business_id: businessId,
        customer_id: customerId,
        type: 'loyalty',
        title: stampsMode ? 'Stamp earned' : ('+' + earnedPoints + ' pts earned'),
        body: stampsMode
          ? 'You earned a stamp on your visit!'
          : ('You earned ' + earnedPoints + ' points on your $' + safeAmount.toFixed(2) + ' visit.'),
        action_url: null,
      })
    } catch { /* non-blocking */ }
  }

  // 5. Customer stats — always fire; not gated on earn amount.
  await supabaseAdmin.rpc('increment_numeric', {
    p_table: 'pos_customers', p_id: customerId, p_column: 'total_spent', p_amount: safeAmount,
  })
  await supabaseAdmin.rpc('increment_numeric', {
    p_table: 'pos_customers', p_id: customerId, p_column: 'visit_count', p_amount: 1,
  })
  await supabaseAdmin
    .from('pos_customers')
    .update({ last_visit: new Date().toISOString() })
    .eq('id', customerId)

  return { earnedPoints, earnedStamps, idempotent: false }
}