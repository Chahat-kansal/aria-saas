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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ARIA-LOYALTY-CLOSEOUT-1 §2 — has one loyalty identity split across two live customer rows again?
//
// On 8 July 2026 a merge collapsed three rows for one identity down to one. What stops it coming
// back is not this check — it is the database:
//
//   pos_customers_identity_uniq  UNIQUE (business_id, loyalty_identity_id)
//                                WHERE loyalty_identity_id IS NOT NULL AND deleted_at IS NULL
//
// So this detector is NOT the guard. It is the guard's alarm, and it has exactly two jobs, both of
// which are real: catch the index being dropped or renamed by a later migration, and catch rows
// arriving by a path that never goes through PostgREST (a SQL console, a restore, a COPY). An
// enforced constraint that silently stops being enforced is worse than one that never existed,
// because everything downstream — resolve-code.ts's limit(1), link-identity's identity_taken
// branch — has been written to trust it.
//
// THE PREDICATE BELOW MUST STAY IDENTICAL TO THE INDEX'S. If they diverge, this reports splits the
// index permits (noise) or misses splits it no longer blocks (silence). Both make it worthless.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface IdentitySplit {
  businessId: string
  identityId: string
  /** Every LIVE customer row holding this identity in this business. A split means length > 1. */
  customerIds: string[]
}

/** One live customer row, as the split check needs it. */
export interface IdentityHolderRow {
  id: string
  business_id: string
  loyalty_identity_id: string | null
  deleted_at?: string | null
}

/**
 * Group live rows by (business, identity) and return the groups with more than one member.
 *
 * Pure, so the grouping rule is assertable without a database — which matters more here than usual,
 * because against real data today this function correctly returns [] no matter what it does. A test
 * that only ever sees the healthy case cannot tell a working detector from `return []`.
 *
 * Rows that fail the index's predicate (no identity, or soft-deleted) are dropped rather than
 * grouped: they are exactly the rows the unique index also ignores.
 */
export function findIdentitySplits(rows: IdentityHolderRow[]): IdentitySplit[] {
  const groups = new Map<string, IdentitySplit>()
  for (const r of rows) {
    const identityId = r.loyalty_identity_id ? String(r.loyalty_identity_id) : ''
    const businessId = r.business_id ? String(r.business_id) : ''
    if (!identityId || !businessId) continue
    if ((r.deleted_at ?? null) !== null) continue
    // '::' cannot occur inside a UUID, so the two halves can never be confused for one another.
    const key = businessId + '::' + identityId
    const g = groups.get(key)
    if (g) g.customerIds.push(String(r.id))
    else groups.set(key, { businessId, identityId, customerIds: [String(r.id)] })
  }
  return [...groups.values()]
    .filter((g) => g.customerIds.length > 1)
    // Worst first, then a stable tiebreak — a report whose order changes between identical runs
    // reads as churn and stops being trusted.
    .sort((a, b) => b.customerIds.length - a.customerIds.length || a.identityId.localeCompare(b.identityId))
}

/** Human-readable one-liner for a log or an alert. Mirrors describeDrift. */
export function describeSplit(s: IdentitySplit): string {
  return `business ${s.businessId}: loyalty identity ${s.identityId} is split across ` +
    `${s.customerIds.length} live customer rows [${s.customerIds.join(', ')}] — ` +
    'pos_customers_identity_uniq should have made this impossible'
}

/**
 * The outcome of a split check.
 *
 * `checked` IS THE POINT. A read failure is not "no splits" — an empty array would turn a broken
 * query into a clean bill of health, which is the exact failure mode this sprint exists to remove
 * (link-identity.ts reported success for links it never wrote). The caller must be able to tell
 * "nothing is wrong" apart from "I could not look".
 */
export interface IdentitySplitReport {
  checked: boolean
  splits: IdentitySplit[]
  error?: string
}

/**
 * Read every live, identity-bearing customer row and report the splits.
 *
 * Never throws, for the same reason computeLoyaltyDrift does not: this is a passenger on a cron
 * that also expires points, and a reporting failure must not take the expiry run down with it. It
 * reports the failure instead of hiding it — see IdentitySplitReport.checked.
 */
export async function computeIdentitySplits(db: DriftDb): Promise<IdentitySplitReport> {
  try {
    // Filtered server-side on the index's own predicate. findIdentitySplits re-applies both filters
    // anyway — belt and braces, and it keeps the pure function honest when called with raw rows.
    const { data, error } = await db
      .from('pos_customers')
      .select('id, business_id, loyalty_identity_id, deleted_at')
      .not('loyalty_identity_id', 'is', null)
      .is('deleted_at', null) as { data: IdentityHolderRow[] | null; error: { message?: string } | null }

    if (error) {
      const message = error.message ?? String(error)
      console.error('[loyalty-identity-split] read failed:', message)
      return { checked: false, splits: [], error: message }
    }
    return { checked: true, splits: findIdentitySplits(data ?? []) }
  } catch (e) {
    const message = (e as Error).message
    console.error('[loyalty-identity-split] non-fatal:', message)
    return { checked: false, splits: [], error: message }
  }
}
