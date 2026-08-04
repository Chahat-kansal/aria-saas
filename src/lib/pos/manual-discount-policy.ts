import type { AppliedDiscount } from '@/lib/pos/discount-engine'

// PROMO-EXCLUSIVE-UI-1 — the cashier-side rule for stacks_with_others on the MANUAL path.
//
// WHY THIS IS NOT IN THE ENGINE: on the manual path the cashier is the one choosing, so
// calculateApplicableDiscounts must keep returning EVERY eligible promotion. Resolving it
// engine-side would silently pick a winner and take that choice away. The engine exposes; this
// decides; DiscountBar renders the outcome.
//
// WHY IT IS NOT INLINE IN THE COMPONENT: a rule about money that nobody can test is a rule that
// quietly stops holding. DiscountBar needs a DOM to test and this repo has no React testing stack;
// as a pure function the same logic is covered by the unit suite that already exists.

export type ManualApplyDecision =
  | { action: 'apply' }
  | { action: 'replace'; removeIds: string[]; notice: string }
  | { action: 'refuse'; notice: string }

/**
 * Decide what happens when a cashier taps a manual promotion.
 *
 * stacks_with_others is the owner's safety switch and DEFAULTS TO OFF, so "exclusive" is the common
 * case, not the exotic one. The invariant: an exclusive promotion is never combined with any other,
 * in either direction.
 */
export function decideManualApply(
  applied: AppliedDiscount[],
  incoming: AppliedDiscount,
): ManualApplyDecision {
  const appliedExclusive = applied.find(a => !a.stacks_with_others)

  // Re-tapping the promotion that is already on the sale is a no-op, not a refusal — refusing
  // "because of itself" would read as a broken button.
  if (appliedExclusive && appliedExclusive.promotion_id !== incoming.promotion_id) {
    return {
      action: 'refuse',
      notice: appliedExclusive.promotion_name + '’s discount can’t be combined. Remove it first.',
    }
  }

  if (!incoming.stacks_with_others && applied.length > 0) {
    const others = applied.filter(a => a.promotion_id !== incoming.promotion_id)
    if (others.length === 0) return { action: 'apply' }   // already the only thing applied
    return {
      action: 'replace',
      removeIds: others.map(a => a.promotion_id),
      notice: incoming.promotion_name + ' replaced ' + others.map(a => a.promotion_name).join(', ')
        + ' — it can’t be combined.',
    }
  }

  return { action: 'apply' }
}
