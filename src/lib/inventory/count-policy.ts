// INV-BASELINE-1 PHASE 2 — commit or review? The one place that decides.
//
// THE CONTROL THIS ENCODES. Inventory internal control normally separates custody from counting.
// A café cannot: the owner has custody, counts the stock, and approves the result. The standard
// compensating control for an operator that small is documented delegation with defined
// thresholds, so:
//
//   1. ATTRIBUTION IS UNCONDITIONAL. Every count-driven stock change writes an attributed
//      pos_stock_adjustments row — owner included, no path exempt. That is handled by the caller;
//      this module never returns an outcome that would move stock silently.
//   2. An owner's own count COMMITS below the materiality threshold. The owner completing their
//      own count IS a human witnessing it, and a second click on their own work is ceremony, not
//      control.
//   3. ABOVE the threshold everything routes to review — the owner's counts included. Materiality
//      decides, not role.
//   4. Staff counts ALWAYS route. Unchanged, and the default here, so an unknown actor fails
//      closed rather than open.
//
// ⚠ THE THRESHOLD IS DELIBERATELY NOT IN DOLLARS.
//
// 0 of 74 products carry a cost. A dollar materiality figure computed against a null cost is
// precisely the GROUNDING-TEETH failure this repo already committed once — a briefing that
// computed every percentage against a fabricated $999,999 target — and total_variance_cents is
// committing a version of it right now by summing quantities into a money column (phase 3).
// So v1 is QUANTITY and PERCENTAGE OF BOOK STOCK, whichever trips first, and any surface showing
// the threshold must say WHY it is not in dollars. See THRESHOLD_DISCLOSURE below.
//
// TODO(INV-COST-1): when product costs land, add a dollar arm to this policy — material when the
// variance is worth more than $X — and switch THRESHOLD_DISCLOSURE to describe it. Until then a
// dollar figure here would be invented, not measured.

/** Absolute units of variance at which a count stops being routine. */
export const MATERIAL_QTY_UNITS = 5

/** Fraction of book stock at which a count stops being routine. */
export const MATERIAL_PCT_OF_BOOK = 0.10

/**
 * Shown wherever the threshold is explained. Names the reason it is quantity-based so nobody
 * reads it as a considered choice to ignore value.
 */
export const THRESHOLD_DISCLOSURE =
  `Counts differing by ${MATERIAL_QTY_UNITS} or more units, or by ${Math.round(MATERIAL_PCT_OF_BOOK * 100)}% or more of expected stock, go to owner review. ` +
  'This threshold is measured in units, not dollars, because product costs have not been entered yet.'

export type CountActor = 'owner' | 'staff'

export type CountOutcome =
  /** Variance is zero — nothing to move and nothing to review. */
  | 'no_change'
  /** Below threshold and counted by the owner — apply it, with an attributed adjustment row. */
  | 'commit'
  /** Material, or counted by staff — file to the owner review queue and DO NOT move stock. */
  | 'review'

export interface CountDecision {
  outcome: CountOutcome
  /** Machine-readable why, for evidence payloads and tests. */
  reason: 'zero_variance' | 'staff_count' | 'below_threshold' | 'qty_threshold' | 'pct_threshold'
  /** Human-readable why, safe to show an owner. */
  detail: string
}

/**
 * Is this variance material? Quantity OR percentage, whichever trips first.
 *
 * BOUNDARY: `>=`, so a variance EXACTLY AT the threshold is material and routes to review. A
 * control whose threshold excludes its own boundary is off by one in the permissive direction,
 * which is the wrong direction for the only check standing between a miscount and the books.
 *
 * BOOK STOCK OF ZERO: the percentage arm is undefined (division by zero), so only the quantity arm
 * applies. Deliberate — the alternative is treating every first count of a newly-stocked product as
 * an infinite-percentage variance, which would route the most routine event there is.
 */
export function isMaterialVariance(varianceQty: number, systemQty: number): boolean {
  const v = Math.abs(Number(varianceQty) || 0)
  if (v === 0) return false
  if (v >= MATERIAL_QTY_UNITS) return true
  const book = Number(systemQty) || 0
  if (book > 0 && v / book >= MATERIAL_PCT_OF_BOOK) return true
  return false
}

/**
 * Decide what happens to one counted line.
 *
 * Pure on purpose. The threshold is the whole control, and a control expressed only as an `if`
 * inside a 200-line submit function is one refactor away from being lost — which is exactly how
 * the auto-correcting stocktake route came to contradict the two engines that forbade it.
 *
 * `actor` defaults to 'staff' so an un-migrated or unknown caller routes to review rather than
 * committing. Fail closed.
 */
export function decideCountOutcome(
  input: { varianceQty: number; systemQty: number; actor?: CountActor },
): CountDecision {
  const variance = Number(input.varianceQty) || 0
  const systemQty = Number(input.systemQty) || 0

  if (variance === 0) {
    return { outcome: 'no_change', reason: 'zero_variance', detail: 'Count matched expected stock.' }
  }

  // Rule 4, checked BEFORE materiality: staff never commit, however small the difference.
  if ((input.actor ?? 'staff') !== 'owner') {
    return { outcome: 'review', reason: 'staff_count', detail: 'Counted by staff — sent to the owner to confirm.' }
  }

  const v = Math.abs(variance)
  if (v >= MATERIAL_QTY_UNITS) {
    return {
      outcome: 'review',
      reason: 'qty_threshold',
      detail: `Difference of ${v} units is at or above the ${MATERIAL_QTY_UNITS}-unit review threshold.`,
    }
  }
  if (systemQty > 0 && v / systemQty >= MATERIAL_PCT_OF_BOOK) {
    return {
      outcome: 'review',
      reason: 'pct_threshold',
      detail: `Difference of ${v} is at or above ${Math.round(MATERIAL_PCT_OF_BOOK * 100)}% of the ${systemQty} expected.`,
    }
  }

  return {
    outcome: 'commit',
    reason: 'below_threshold',
    detail: 'Below the review threshold and counted by the owner — applied directly.',
  }
}
