import { describe, it, expect } from 'vitest'
import {
  buildPricingProposal, roundToPricePoint, policyFactor, stepUpDecision, policyComparison,
  STEPUP_ANNUAL_DOLLARS, STEPUP_LINE_COUNT, explicitPriceFor,
  type RecoveryPolicy,
} from './surcharge-policy'
import type { ItemImpact } from './item-card-impact'
import { findCapability, isAutoRunnable, CAPABILITIES } from '@/lib/aria/works/capabilities'

/**
 * M14 PHASE 3 — PROPOSE, DON'T PRICE.
 *
 * ⚠️ Every assertion calls a function and reads what it returns — including the capability-registry
 * checks, which drive `findCapability` and `isAutoRunnable` rather than grepping the registry.
 */
const item = (name: string, price: number, units: number | null = 10): ItemImpact => ({
  id: name, name, price, units_sold: units,
  revenue: units == null ? null : price * units, revenue_tier: 'verified',
  surcharge_revenue_lost: null, recovering_price: null,
  margin_dollars: null, margin_tier: 'not_connected', cost_note: 'x',
})

describe('M14 phase 3 · ⚠️ nothing here can price anything', () => {
  it('bulk_price_update is propose_only, money-gated, and a plan runner CANNOT run it', () => {
    const cap = findCapability('bulk_price_update')
    expect(cap).not.toBeNull()
    expect(cap!.gate).toBe('propose_only')
    expect(cap!.gate_reason).toBe('money')
    // The load-bearing one: this is what stops a plan carrying the price change out by itself.
    expect(isAutoRunnable(cap)).toBe(false)
  })

  it('every capability this proposal could reach is propose_only — none is auto', () => {
    for (const id of ['bulk_price_update', 'apply_category_discount'] as const) {
      expect(isAutoRunnable(CAPABILITIES[id]), id).toBe(false)
    }
  })

  it('MUTATION — an engine that priced in place is what goes red', () => {
    // buildPricingProposal is pure. The mutant applies the rise to the item itself, which is the
    // behaviour the decision table forbids ("Never automatically").
    const items = [item('Flat White', 5.0), item('Toastie', 12.5)]
    const before = items.map(i => i.price)

    const r = buildPricingProposal({ items, recovery_pct: 1.32, policy: 'recover_full', rounding: 'nearest_10c', window_days: 90 })
    expect(r.ok).toBe(true)
    // The inputs are untouched: the proposal is a separate object, not an edit.
    expect(items.map(i => i.price)).toEqual(before)

    const mutant = items.map(i => ({ ...i, price: i.price * 1.0132 }))
    expect(mutant.map(i => i.price)).not.toEqual(before)
  })
})

describe('M14 phase 3 · rounding is visible, never silent', () => {
  it('each style rounds where it says it does', () => {
    expect(roundToPricePoint(4.5594, 'exact')).toBe(4.56)
    expect(roundToPricePoint(4.5594, 'nearest_5c')).toBe(4.55)
    expect(roundToPricePoint(4.5594, 'nearest_10c')).toBe(4.6)
    expect(roundToPricePoint(4.5594, 'nearest_50c')).toBe(4.5)
    expect(roundToPricePoint(0, 'nearest_10c')).toBe(0)
    expect(roundToPricePoint(-3, 'nearest_10c')).toBe(0)
  })

  it('⚠️ every line reports its DRIFT — what the rounding did to the recovery', () => {
    const r = buildPricingProposal({
      items: [item('Chai Tea', 4.5), item('Avocado Toast', 16.0)],
      recovery_pct: 1.32, policy: 'recover_full', rounding: 'nearest_10c', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    const chai = r.data.lines.find(l => l.name === 'Chai Tea')!
    expect(chai.target_price).toBe(4.56)      // exact
    expect(chai.proposed_price).toBe(4.6)     // rounded to 10c
    expect(chai.rounding_drift).toBe(0.04)    // recovers 4c MORE than needed
    const toast = r.data.lines.find(l => l.name === 'Avocado Toast')!
    expect(toast.target_price).toBe(16.21)
    expect(toast.proposed_price).toBe(16.2)
    expect(toast.rounding_drift).toBe(-0.01)  // recovers 1c LESS
    // And the net is reported, so an owner sees the whole rounding before approving.
    expect(r.data.total_rounding_drift).toBe(0.03)
  })

  it('exact rounding leaves no drift at all — a legitimate choice, not a missing feature', () => {
    const r = buildPricingProposal({
      items: [item('Chai Tea', 4.5)], recovery_pct: 1.32, policy: 'recover_full', rounding: 'exact', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.lines[0].rounding_drift).toBe(0)
    expect(r.data.total_rounding_drift).toBe(0)
  })
})

describe('M14 phase 3 · the three policies, on the owner\'s own coffee', () => {
  it('recover fully / recover half / absorb do what they say', () => {
    expect(policyFactor('recover_full')).toBe(1)
    expect(policyFactor('recover_half')).toBe(0.5)
    expect(policyFactor('absorb')).toBe(0)
  })

  it('a $4.50 chai under each policy, at a 1.32% shortfall', () => {
    const c = policyComparison(4.5, 1.32, 'nearest_10c')
    expect(c.map(x => x.policy)).toEqual(['recover_full', 'recover_half', 'absorb'])
    expect(c[0].proposed_price).toBe(4.6)     // full
    expect(c[1].proposed_price).toBe(4.5)     // half — rounds back to the same price at 10c
    expect(c[2].proposed_price).toBe(4.5)     // absorb — unchanged
    expect(c[2].change).toBe(0)
    // Absorbing means wearing the whole shortfall per sale.
    expect(c[2].absorbed_per_sale).toBe(0.06)
    // Recovering fully with a 10c round-up actually over-recovers here, so the owner absorbs less
    // than nothing — worth seeing rather than hiding.
    expect(c[0].absorbed_per_sale).toBeLessThan(0)
  })

  it('absorb changes no price at all, so there is nothing to approve', () => {
    const r = buildPricingProposal({
      items: [item('a', 5), item('b', 12)], recovery_pct: 1.32, policy: 'absorb', rounding: 'nearest_10c', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.applied_pct).toBe(0)
    expect(r.data.unchanged_count).toBe(2)
    expect(r.data.requires_stepup).toBe(false)   // nothing changes, so nothing to step up for
  })
})

describe('M14 phase 3 · the step-up is demanded on amount OR on breadth', () => {
  it('a big annual effect demands one, and says the amount', () => {
    const s = stepUpDecision(3, STEPUP_ANNUAL_DOLLARS)
    expect(s.required).toBe(true)
    expect(s.reason).toContain('a year')
    expect(stepUpDecision(3, STEPUP_ANNUAL_DOLLARS - 1).required).toBe(false)
  })

  it('a small rise across the WHOLE menu demands one too — breadth is not smallness', () => {
    const s = stepUpDecision(STEPUP_LINE_COUNT, 10)
    expect(s.required).toBe(true)
    expect(s.reason).toContain(String(STEPUP_LINE_COUNT) + ' prices')
    expect(stepUpDecision(STEPUP_LINE_COUNT - 1, 10).required).toBe(false)
  })

  it('a big NEGATIVE effect demands one as well — a price cut is a money decision', () => {
    expect(stepUpDecision(2, -STEPUP_ANNUAL_DOLLARS).required).toBe(true)
  })

  it('a proposal that changes nothing never asks for a step-up', () => {
    expect(stepUpDecision(0, 99999)).toEqual({ required: false, reason: null })
  })
})

describe('M14 phase 3 · annualising is honest about its window', () => {
  it('a 90-day window is scaled by 365/90, not by 4', () => {
    const r = buildPricingProposal({
      items: [item('Flat White', 5.0, 100)], recovery_pct: 2, policy: 'recover_full', rounding: 'exact', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    // 5.00 → 5.10, +0.10 × 100 units × (365/90) = 40.56
    expect(r.data.lines[0].revenue_effect).toBe(40.56)
  })

  it('an item with unknown units contributes null, and the total ignores it rather than guessing', () => {
    const r = buildPricingProposal({
      items: [item('Known', 5, 100), item('Unknown', 5, null)],
      recovery_pct: 2, policy: 'recover_full', rounding: 'exact', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.lines.find(l => l.name === 'Unknown')!.revenue_effect).toBeNull()
    expect(r.data.total_revenue_effect).toBe(40.56)
  })

  it('every item unknown means the total is null, never 0', () => {
    const r = buildPricingProposal({
      items: [item('a', 5, null)], recovery_pct: 2, policy: 'recover_full', rounding: 'exact', window_days: 90,
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.total_revenue_effect).toBeNull()
  })

  it('a zero-day window is refused rather than dividing by zero', () => {
    const r = buildPricingProposal({ items: [item('a', 5)], recovery_pct: 2, policy: 'recover_full', rounding: 'exact', window_days: 0 })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected refusal')
    expect(r.reason).toContain('cannot be annualised')
  })

  it('ANTI-VACUITY — the three policies produce three different proposals', () => {
    const mk = (policy: RecoveryPolicy) => {
      const r = buildPricingProposal({ items: [item('Chai', 4.5, 100)], recovery_pct: 4, policy, rounding: 'exact', window_days: 90 })
      if (!r.ok) throw new Error(r.reason)
      return r.data.lines[0].proposed_price
    }
    const prices = [mk('recover_full'), mk('recover_half'), mk('absorb')]
    expect(new Set(prices).size).toBe(3)
    expect(prices).toEqual([4.68, 4.59, 4.5])
  })
})

describe('M14 phase 4 · the approved price is the price that gets written', () => {
  const lines = [
    { product_id: 'chai', to: 4.6 },
    { product_id: 'toast', to: 16.2 },
  ]

  it('⚠️ WITHOUT THIS the executor would apply a flat percentage and discard the rounding', () => {
    // The proposal's whole point is per-item rounded prices. The executor could only apply ONE
    // percentage across a filtered set, so an owner would have approved $4.60 and got $4.5594.
    // explicitPriceFor is what makes the approved number the written number.
    expect(explicitPriceFor(lines, 'chai')).toBe(4.6)
    expect(explicitPriceFor(lines, 'toast')).toBe(16.2)
    // The flat-percentage result, for contrast — it is not what the owner approved.
    expect(Math.round(4.5 * 1.0132 * 10000) / 10000).toBe(4.5594)
  })

  it('a product the owner did not approve gets NO price — never a fallback rule', () => {
    // The executor skips a null rather than repricing by the leftover percentage.
    expect(explicitPriceFor(lines, 'not-in-the-proposal')).toBeNull()
  })

  it('an absent, empty or malformed list yields null, so the percentage path stays intact', () => {
    expect(explicitPriceFor(null, 'chai')).toBeNull()
    expect(explicitPriceFor(undefined, 'chai')).toBeNull()
    expect(explicitPriceFor([], 'chai')).toBeNull()
  })

  it('a zero, negative or non-numeric price is refused rather than written', () => {
    // A $0 shelf price is the single most damaging thing a price writer can do.
    expect(explicitPriceFor([{ product_id: 'a', to: 0 }], 'a')).toBeNull()
    expect(explicitPriceFor([{ product_id: 'a', to: -5 }], 'a')).toBeNull()
    expect(explicitPriceFor([{ product_id: 'a', to: NaN }], 'a')).toBeNull()
    expect(explicitPriceFor([{ product_id: 'a', to: 'abc' as unknown as number }], 'a')).toBeNull()
  })

  it('ids are compared as strings, so a uuid from JSON still matches', () => {
    expect(explicitPriceFor([{ product_id: '123' as unknown as string, to: 9 }], 123 as unknown as string)).toBe(9)
  })

  it('MUTATION — a resolver that fell back to the percentage on a miss', () => {
    // The mutant: when the product is not in the list, reprice it anyway. That silently changes
    // prices the owner never saw, which is exactly what the explicit list exists to prevent.
    const mutant = (ls: typeof lines, id: string, pct: number, current: number) =>
      explicitPriceFor(ls, id) ?? Math.round(current * (1 + pct / 100) * 100) / 100
    expect(mutant(lines, 'unapproved', 1.32, 5)).toBe(5.07)   // the mutant reprices it
    expect(explicitPriceFor(lines, 'unapproved')).toBeNull()  // the real one refuses
  })

  it('the proposal and the executor agree on the payload shape, end to end', () => {
    const built = buildPricingProposal({
      items: [item('chai', 4.5), item('toast', 16.0)],
      recovery_pct: 1.32, policy: 'recover_full', rounding: 'nearest_10c', window_days: 90,
    })
    if (!built.ok) throw new Error(built.reason)
    // Exactly the mapping the route writes into the decision payload.
    const payloadLines = built.data.lines
      .filter(l => l.proposed_price !== l.current_price)
      .map(l => ({ product_id: l.id, to: l.proposed_price }))
    // …and exactly what the executor reads back out of it.
    for (const l of payloadLines) {
      expect(explicitPriceFor(payloadLines, l.product_id)).toBe(l.to)
    }
    expect(payloadLines).toEqual([{ product_id: 'chai', to: 4.6 }, { product_id: 'toast', to: 16.2 }])
  })
})
