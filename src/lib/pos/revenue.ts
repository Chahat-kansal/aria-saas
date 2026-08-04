// REVENUE-RAIL-1 — one definition of what counts as revenue, replacing ~140 hand-written status
// filters across the app. Two conventions had grown up:
//
//   eq('status','completed')   (66 files) — CORRECT, but blind to refunds.
//   neq('status','voided')     (74 files) — WRONG. Counts the split PARENT and its children (the
//                                           same money twice), plus unpaid laybys, drafts and
//                                           pending as though they were takings.
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
 * BOTH SPELLINGS ARE LIVE — this is not defensive over-inclusion, it is what the code writes:
 *   'refund'    <- api/pos/refund-unlinked/route.ts:26, api/pos/sales/[id]/refund/route.ts:48
 *   'refunded'  <- api/pos/sales/return/route.ts:79, lib/pos/return-engine.ts:148
 * The return-engine path is the MAIN returns flow (see CLAUDE.md RULE 6, which documents 'refunded'
 * rows as a separate row with a negative total_amount linked via original_sale_id). Listing only
 * 'refund' would have silently dropped every engine-processed return from net sales.
 *
 * Dated on the day the refund row was WRITTEN, never backdated to the original sale — matching
 * Square, where a refund never re-opens a closed day's gross and only lowers net for the day it is
 * processed. That falls out of using the refund row's own created_at, so there is nothing to do
 * beyond not special-casing it.
 */
export const DEDUCTION_STATUSES = ['refund', 'refunded'] as const

// ── FOLLOW-UP, OWED AFTER REVENUE-RAIL-1 COMMITS 2 AND 3 LAND ────────────────────────────────────
// Holding both spellings is correct TODAY — dropping either would lose real money from net sales.
// But it also permanently encodes an inconsistency nobody ever decided on, and every future reader
// has to relearn that two spellings mean one thing. Correct now, wrong to leave.
//
// The work, in order:
//   1. Pick a winner. 'refunded' is the stronger candidate: it is what the MAIN returns path writes
//      (return-engine.ts) and what CLAUDE.md RULE 6 already documents by name.
//   2. Normalise the data: update pos_sales set status = <winner> where status = <loser>.
//      Live count at the time of writing: 1 row total across both spellings, so this is cheap now
//      and gets more expensive with every refund processed.
//   3. Change the two losing writers, then remove the losing spelling from DEDUCTION_STATUSES.
//      Order matters — remove it from this list LAST, or in-flight rows written by the old code
//      between deploy and migration drop straight out of net sales.
//
// Do NOT do this before commits 2 and 3 are finished: changing what a status MEANS while call sites
// are still being migrated makes a real regression indistinguishable from the migration.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything else: not yet earned, never earned, or a bookkeeping parent.
 *
 *   'open'     — an unpaid split child OR a layby. Indistinguishable by status alone (the
 *                distinguisher is parent_sale_id, which splits have and laybys don't) — and it does
 *                not matter, because both follow the same lifecycle: they sit at 'open' until paid,
 *                then move to 'completed' through the normal payment flow. Correctly excluded while
 *                unpaid, correctly counted once paid. Neither needs special handling.
 *   'split'    — the parent of a split cheque. api/pos/sales/[id]/split/route.ts distributes the
 *                total across N children (parent_sale_id set, status 'open') and marks the parent
 *                'split'. THE CHILDREN CARRY THE MONEY, so counting the parent as well is the
 *                double-count that neq('voided') was committing.
 *   'draft'    — a held/parked cart. Explicitly not-yet-real revenue.
 *   'pending'  — not yet settled.
 *   'voided'   — never earned.
 *   'rewarded' — see the guard in classifySale().
 */
export const EXCLUDED_STATUSES = ['voided', 'draft', 'pending', 'split', 'open', 'rewarded'] as const

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
