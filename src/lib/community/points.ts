import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-GAME-LEAN — lifetime EARNED points. PRE-FLIGHT confirmed no table/column stores this directly:
// pos_customers.points_balance / loyalty_points are CURRENT balances (decremented by redemptions),
// not lifetime earned. Defined here as SUM(points_delta) WHERE points_delta > 0 across
// pos_loyalty_transactions — every earning type (earn/birthday/winback/a positive adjustment) counts;
// redeems (negative) and negative adjustments correctly don't. Query cost: one indexed aggregate per
// customer (or one grouped aggregate for a batch) — cheap, but not free; do not call in a tight loop
// over individual customers when a batch call is available.

/** Batch lifetime-earned-points lookup — one query for N customers (no N+1). */
export async function getLifetimePointsBatch(customerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const ids = [...new Set(customerIds)].filter(Boolean)
  if (!ids.length) return map
  const { data } = await supabaseAdmin
    .from('pos_loyalty_transactions')
    .select('customer_id, points_delta')
    .in('customer_id', ids)
    .gt('points_delta', 0)
  for (const r of data ?? []) {
    const id = r.customer_id as string
    map.set(id, (map.get(id) ?? 0) + (Number(r.points_delta) || 0))
  }
  return map
}

export async function getLifetimePoints(customerId: string): Promise<number> {
  const map = await getLifetimePointsBatch([customerId])
  return map.get(customerId) ?? 0
}
