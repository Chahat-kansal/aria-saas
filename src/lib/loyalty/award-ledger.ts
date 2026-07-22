import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-GAME-2 — extracted from the identical private copies in reward-rules.ts and tiers.ts (both
// wrote this exact sequence independently). Single canonical ledger-write primitive: increment the
// legacy loyalty_points column, increment the canonical points_balance, and record the earn in
// pos_loyalty_transactions. This is NOT idempotent by itself — every caller must claim its own
// idempotency row FIRST (a UNIQUE-constrained insert) and only call this after the claim succeeds.

export async function awardPointsViaLedger(customerId: string, businessId: string, points: number): Promise<void> {
  if (points <= 0) return
  await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
  await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: 'earn', points_delta: points, created_at: new Date().toISOString(),
  })
}
