// ARIA-LOYALTY-FIX-1 §2b — make ledger/balance drift VISIBLE.
//
// pos_customers.points_balance is a denormalised running total. pos_loyalty_transactions is the
// ledger that is supposed to explain it. Nothing has ever compared the two, and they had diverged
// by 13,776 points on Sip — 13,785 on customer rows against 9 in the ledger, from a single row.
//
// Points are not money, but they behave like it the moment a customer disputes a balance, an expiry
// run deletes some, or a statement is printed. A number nothing backs is the same problem the
// preload ledger exists to avoid.
//
// THIS DOES NOT MAKE DRIFT IMPOSSIBLE — deriving the displayed balance from the ledger would, and
// that is the right long-term shape, but it touches every read path (wallet, POS customer detail,
// scan-lookup, CX me, dashboards) and is not a safe same-sprint change. This makes drift LOUD
// instead, which is the difference between a bug that gets found and one that does not.

export interface BusinessDrift {
  businessId: string
  /** Sum of pos_customers.points_balance for the business. */
  balanceTotal: number
  /** Sum of pos_loyalty_transactions.points_delta for the business. */
  ledgerTotal: number
  /** balanceTotal - ledgerTotal. Positive = balances claim points the ledger cannot explain. */
  drift: number
}

/**
 * Which businesses are out of balance, worst first.
 *
 * Pure so the threshold is testable. A tolerance exists because a legitimate in-flight write can
 * land between the two sums — but it is deliberately SMALL: this is a bookkeeping identity, not a
 * statistic, and anything above a rounding-shaped difference is a real divergence.
 */
export const DRIFT_TOLERANCE = 0

export function findDrift(rows: BusinessDrift[], tolerance: number = DRIFT_TOLERANCE): BusinessDrift[] {
  return rows
    .filter((r) => Math.abs(r.drift) > tolerance)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
}

/** Human-readable one-liner for a log or an alert. */
export function describeDrift(d: BusinessDrift): string {
  const dir = d.drift > 0 ? 'unbacked by the ledger' : 'missing from balances'
  return `business ${d.businessId}: balances ${d.balanceTotal}, ledger ${d.ledgerTotal}, ` +
    `drift ${d.drift > 0 ? '+' : ''}${d.drift} (${dir})`
}

/** Structural — see the note in link-identity.ts on why this is not SupabaseClient<...>. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DriftDb = { from: (table: string) => any }

/**
 * Read both sides and compute drift per business. Never throws — a reconciliation report must not
 * be the reason a cron that also expires points fails.
 */
export async function computeLoyaltyDrift(db: DriftDb): Promise<BusinessDrift[]> {
  try {
    const [{ data: custs }, { data: ledger }] = await Promise.all([
      db.from('pos_customers').select('business_id, points_balance'),
      db.from('pos_loyalty_transactions').select('business_id, points_delta'),
    ]) as Array<{ data: Array<Record<string, unknown>> | null }>

    const bal = new Map<string, number>()
    for (const r of custs ?? []) {
      const b = String(r.business_id ?? '')
      if (!b) continue
      bal.set(b, (bal.get(b) ?? 0) + Number(r.points_balance ?? 0))
    }
    const led = new Map<string, number>()
    for (const r of ledger ?? []) {
      const b = String(r.business_id ?? '')
      if (!b) continue
      led.set(b, (led.get(b) ?? 0) + Number(r.points_delta ?? 0))
    }

    const out: BusinessDrift[] = []
    for (const b of new Set([...bal.keys(), ...led.keys()])) {
      const balanceTotal = bal.get(b) ?? 0
      const ledgerTotal = led.get(b) ?? 0
      out.push({ businessId: b, balanceTotal, ledgerTotal, drift: balanceTotal - ledgerTotal })
    }
    return out
  } catch (e) {
    console.error('[loyalty-reconcile] non-fatal:', (e as Error).message)
    return []
  }
}
