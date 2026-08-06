// REVENUE-RAIL-1 — one definition of what counts as revenue, replacing ~140 hand-written status
// filters across the app. Two conventions had grown up:
//
//   eq('status','completed')   (66 files) — CORRECT, but blind to refunds.
//   neq('status','voided')     (74 files) — WRONG. Counts unpaid laybys, drafts, pending and the
//                                           parent of an in-progress split as though they were
//                                           takings.
//
// CORRECTION (FIX-SPLIT-DEAD-ROUTE-1): this header used to say neq('voided') counted "the split
// PARENT and its children (the same money twice)". That specific double-count never existed — it
// described api/pos/sales/[id]/split, a route with no caller that could not write its 'split'
// status past the CHECK anyway. The LIVE split system (api/pos/splits/*) keeps the money in
// pos_sale_splits and parks the parent at 'open'/'partial_paid', so neq('voided') over-counts it
// ONCE while unpaid, not twice. The filter is still wrong; the reason is narrower than claimed.
//
// So this is not a negotiation between two conventions. One of them is simply right, and the work
// is migrating the other 74 onto it while adding the refund line both were missing.
//
// SHAPE: a classifier, not a boolean. Real POS reporting is gross -> named deductions -> net
// (Square: net sales = gross less returns, discounts and comps; Toast: gross less discounts and
// refunds). A single isRevenue() collapses that into one blended number and throws away the
// diagnostic an owner actually needs — the discount and refund lines are the ones worth questioning
// weekly. Keeping deductions named preserves that.

export type SaleClass = 'gross' | 'deduction' | 'excluded'

/** Statuses that count toward GROSS sales. */
export const GROSS_STATUSES = ['completed'] as const

/**
 * Statuses that REDUCE net sales and are reported on their own line.
 *
 * ONLY 'refunded' CAN EXIST. Corrected in FIX-SPLIT-DEAD-ROUTE-1 after dumping the constraint:
 * pos_sales_status_check permits pending|draft|open|partial_paid|completed|voided|refunded.
 * 'refund' (present tense) is NOT permitted, so a row with it cannot exist no matter what any
 * writer attempts — which supersedes the note this comment used to carry claiming both spellings
 * were live. That was wrong: I inferred it from two writers emitting 'refund' without checking the
 * constraint, and the correct inference is the opposite one — those writers are BROKEN.
 *
 * ⚠ STILL OPEN, NOT FIXED HERE: api/pos/refund-unlinked/route.ts:26 and
 * api/pos/sales/[id]/refund/route.ts:48 both still INSERT status:'refund'. Those inserts violate
 * the CHECK and fail at runtime — refunds do not record. Live data agrees: zero 'refund' rows ever,
 * one 'refunded'. Removing the value here is safe precisely BECAUSE it can never exist; it does not
 * fix the writers, and they need their own sprint.
 */
export const DEDUCTION_STATUSES = ['refunded'] as const

// ── THAT FOLLOW-UP IS NOW CLOSED, AND ITS PREMISE WAS WRONG ─────────────────────────────────────
// This block used to say "holding both spellings is correct TODAY — dropping either would lose real
// money from net sales", and prescribed a careful three-step migration ending in removing the loser.
// The careful ordering was unnecessary: 'refund' was never CHECK-permitted, so no row could ever
// have carried it and nothing could be lost by dropping it. The lesson is the one this file keeps
// re-learning — check the constraint, not the writers. What writers ATTEMPT and what the database
// ACCEPTS are different questions, and only the second one determines what a report can see.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything else: not yet earned, never earned, or a bookkeeping parent.
 *
 *   'open'     — what the LIVE split system actually does, plus laybys. splits/route.ts:99 sets the
 *                PARENT sale to 'open' while its splits are outstanding; the money lives in
 *                pos_sale_splits until then. splits/[id]/pay/route.ts:52 moves the parent to
 *                'partial_paid' and finally back to 'completed', and deleting all splits restores
 *                'completed' (splits/[id]/route.ts:64). So the parent is correctly EXCLUDED while
 *                its splits are unpaid and correctly counted ONCE, at the end. Laybys share the
 *                same shape, so neither needs special handling.
 *   'partial_paid' — the same parent, mid-payment. Listed EXPLICITLY rather than relying on
 *                classifySale's default: a CHECK-permitted status that reaches the rail only by
 *                falling through the bottom is one refactor away from being classified wrong.
 *   'split'    — IMPOSSIBLE. pos_sales_status_check does not permit it, so no row has ever carried
 *                it (live: 0 rows, ever). Kept for the same reason as 'rewarded': if something ever
 *                starts writing it, it lands in 'excluded' rather than falling through
 *                unclassified. The only route that would have written it
 *                (api/pos/sales/[id]/split) never had a caller and is now a 410 tombstone.
 *                ⚠ This entry previously described a parent/child double-count as if it had
 *                happened. It never did — that route never ran. The neq('voided') double-count
 *                described at the top of this file is real, but it comes from LAYBYS and DRAFTS,
 *                not from split parents.
 *   'draft'    — a held/parked cart. Explicitly not-yet-real revenue.
 *   'pending'  — not yet settled.
 *   'voided'   — never earned.
 *   'rewarded' — see the guard in classifySale().
 */
export const EXCLUDED_STATUSES = ['voided', 'draft', 'pending', 'split', 'open', 'partial_paid', 'rewarded'] as const

export function classifySale(status: string | null | undefined): SaleClass {
  if (!status) return 'excluded'
  if ((GROSS_STATUSES as readonly string[]).includes(status)) return 'gross'
  if ((DEDUCTION_STATUSES as readonly string[]).includes(status)) return 'deduction'
  if (status === 'rewarded') {
    // B4 — 'rewarded' is a loyalty_referrals status (lib/loyalty/referrals.ts:113); nothing writes
    // it to pos_sales today, and live data confirms zero such rows. It is listed as excluded rather
    // than omitted so that IF something starts writing it, this warns on the first read instead of
    // silently under-counting. At that point the decision to make is whether it is a comp — a
    // deduction with $0 revenue but real unit volume — not simply "leave it out".
    console.warn('[revenue] unexpected pos_sales.status="rewarded" — see REVENUE-RAIL-1')
  }
  return 'excluded'
}

/**
 * The statuses a query must fetch to compute gross AND net in one pass.
 *
 * Use as `.in('status', REPORTABLE_STATUSES)`, then classify the rows. Deliberately NOT a
 * "everything except voided" negation — that is the shape that caused this.
 */
export const REPORTABLE_STATUSES: string[] = [...GROSS_STATUSES, ...DEDUCTION_STATUSES]

/**
 * Sum a set of sales into gross / deductions / net.
 *
 * Deduction rows are stored with a NEGATIVE total_amount, so `net` is a plain sum of both classes
 * while `deductions` is reported as a positive magnitude — which is how an owner reads a deductions
 * line. Excluded rows contribute to neither, and are counted so a caller can assert that a report's
 * inputs were what it expected rather than trusting the filter.
 */
export function sumSales(
  rows: Array<{ status?: string | null; total_amount?: number | string | null }>,
): { gross: number; deductions: number; net: number; excluded_rows: number } {
  let gross = 0, deductions = 0, excluded_rows = 0
  for (const r of rows) {
    const amount = Number(r.total_amount ?? 0)
    switch (classifySale(r.status)) {
      case 'gross': gross += amount; break
      case 'deduction': deductions += Math.abs(amount); break
      default: excluded_rows++; break
    }
  }
  return { gross, deductions, net: gross - deductions, excluded_rows }
}
