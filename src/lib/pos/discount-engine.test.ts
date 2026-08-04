import { describe, it, expect } from 'vitest'
import { calculateApplicableDiscounts } from '@/lib/pos/discount-engine'
import { cartItem, promo, AUTO_TYPE, MANUAL_TYPE, TEST_NOW } from '@/lib/pos/__fixtures__/cart'

// INFRA-UNITTEST-1 — a transcription of results PROMO-STACK-1 measured against the real engine and
// then deleted. Nothing here is newly reasoned: every expectation below was observed, before and
// after the fix, in that sprint's probe run.
//
// WHAT THIS PROTECTS: resolveStacking used to end `return [...stackable, nonStackable[0]]`, which
// combined the best non-stackable WITH every stackable one. stacks_with_others=false — the owner's
// exclusivity switch, which DEFAULTS TO OFF — therefore did nothing whenever any stackable
// promotion was also live, on the path DiscountBar auto-applies with no cashier involved.
// Reverting that one line must turn this file red. That is the file's entire job.

const cart = [cartItem({ unit_price: 100 })]

/** Every applied discount across all three buckets — the question is whether a promotion was
 *  offered at all, not which tray it landed in. Checking only `auto` was itself a false-pass
 *  source: percent_off is not in AUTO_TYPES and lands in `manual`. */
function applied(promos: Parameters<typeof calculateApplicableDiscounts>[1], weather: { max_temp_c: number } | null = null) {
  const r = calculateApplicableDiscounts(cart, promos, { now: TEST_NOW, weather })
  return [...r.auto, ...r.manual, ...r.coupons]
}
function autoOnly(promos: Parameters<typeof calculateApplicableDiscounts>[1]) {
  return calculateApplicableDiscounts(cart, promos, { now: TEST_NOW }).auto
}

describe('resolveStacking — the auto path (DiscountBar applies these in a loop)', () => {
  const A = (o: Record<string, unknown> = {}) => promo({ id: 'A', name: 'A', promotion_type: AUTO_TYPE, ...o })
  const B = (o: Record<string, unknown> = {}) => promo({ id: 'B', name: 'B', promotion_type: AUTO_TYPE, ...o })

  it('case 1 — two non-stackable promotions: exactly one applies', () => {
    expect(autoOnly([A(), B()])).toHaveLength(1)
  })

  it('case 2 — lower stack_priority wins the tie, deterministically', () => {
    const out = autoOnly([A({ stack_priority: 10 }), B({ stack_priority: 100 })])
    expect(out).toHaveLength(1)
    expect(out[0].promotion_name).toBe('A')
  })

  it('case 3 — both stackable: both apply (the opt-in path, and correct)', () => {
    expect(autoOnly([A({ stacks_with_others: true }), B({ stacks_with_others: true })])).toHaveLength(2)
  })

  // ── THE REGRESSION THIS FILE EXISTS FOR ──────────────────────────────────────────────────────
  it('case 4 — a non-stackable is NEVER combined with a stackable one', () => {
    expect(autoOnly([A({ stacks_with_others: true }), B({ stacks_with_others: false })])).toHaveLength(1)
  })

  it('case 4b — and not in the reverse row order either', () => {
    expect(autoOnly([A({ stacks_with_others: false }), B({ stacks_with_others: true })])).toHaveLength(1)
  })

  it('case 4c — a larger exclusive wins and applies ALONE', () => {
    const out = autoOnly([
      A({ stacks_with_others: true, discount_percent: 5 }),
      B({ stacks_with_others: false, discount_percent: 40 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].promotion_name).toBe('B')
    expect(out[0].amount_off).toBe(40)
  })

  it('case 4d — two stackables outweighing an exclusive keep BOTH, exclusive dropped', () => {
    const out = autoOnly([
      A({ stacks_with_others: true, discount_percent: 30 }),
      B({ stacks_with_others: true, discount_percent: 30 }),
      promo({ id: 'C', name: 'C', promotion_type: AUTO_TYPE, stacks_with_others: false, discount_percent: 40 }),
    ])
    expect(out).toHaveLength(2)
    expect(out.map(d => d.promotion_name).sort()).toEqual(['A', 'B'])
  })

  it('case 5 — the winner is the LARGEST discount, not the first found', () => {
    const out = autoOnly([A({ discount_percent: 10 }), B({ discount_percent: 20 })])
    expect(out).toHaveLength(1)
    expect(out[0].amount_off).toBe(20)
  })

  it('case 5b — and the same winner with the row order reversed', () => {
    const out = autoOnly([B({ discount_percent: 20 }), A({ discount_percent: 10 })])
    expect(out).toHaveLength(1)
    expect(out[0].amount_off).toBe(20)
  })

  it('case 6 — a weather trigger creates no stacking exception', () => {
    const out = calculateApplicableDiscounts(cart, [
      A({ trigger_type: 'weather_max_temp_below', trigger_config: { celsius: 10 } }),
      B({ trigger_type: 'weather_max_temp_below', trigger_config: { celsius: 5 } }),
    ], { now: TEST_NOW, weather: { max_temp_c: 4 } }).auto
    expect(out).toHaveLength(1)
  })
})

describe('the manual path — RECORDED BEHAVIOUR, not an endorsement', () => {
  const A = (o: Record<string, unknown> = {}) => promo({ id: 'A', name: 'A', promotion_type: MANUAL_TYPE, ...o })
  const B = (o: Record<string, unknown> = {}) => promo({ id: 'B', name: 'B', promotion_type: MANUAL_TYPE, ...o })

  // PROMO-STACK-1 finding, reported and deliberately NOT fixed: resolveStacking is applied only to
  // result.auto, so stacks_with_others is ignored entirely here. It is not automatic — DiscountBar
  // renders these as buttons a cashier clicks — but the owner's safety switch does nothing on this
  // path, and the one promotion that exists in production today is on it. Pinned so that if anyone
  // changes it, they do so knowingly and this test fails loudly rather than silently drifting.
  it('returns every eligible promotion, ignoring stacks_with_others (known gap)', () => {
    expect(applied([A(), B()])).toHaveLength(2)
    expect(applied([A({ stacks_with_others: true }), B({ stacks_with_others: false })])).toHaveLength(2)
  })
})
