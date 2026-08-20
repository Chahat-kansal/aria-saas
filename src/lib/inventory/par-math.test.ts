import { describe, it, expect } from 'vitest'
import { computeParMath, type ParSettings } from '@/lib/inventory/par-levels'

// MS9 PHASE 4 — par from velocity, never from a guess.
//
// The engine (computePar) already existed; what did not exist was the never-sold distinction. A
// product with product_velocity.history_state = 'no_history' now gets NO par — a distinct state
// from a par of zero. Zero is a decision about a product we know; no-par is an absence of
// evidence, and a reorder suggestion built on it is a guess wearing a number.
//
// The math was EXTRACTED, not changed (RULE 0): identical arithmetic to what computePar has always
// run, now assertable.

const SETTINGS: ParSettings = {
  lead_time_days: 3, buffer_weeks: 1, review_cycle_days: 7,
  default_reorder_qty: 12, min_velocity_per_day: 0.05,
}

const sold = (unitsPerDay: number, tier = 'B', onHand = 0) =>
  computeParMath({ unitsPerDay, tier, onHand, settings: SETTINGS, historyState: 'has_history' })

describe('velocity drives the par — the mutation target', () => {
  it('a fast-mover gets a higher par than a slow-mover on the SAME lead time', () => {
    const fast = sold(10)   // 10 units/day
    const slow = sold(1)    // 1 unit/day
    expect(fast.reorder_point).toBeGreaterThan(slow.reorder_point)
    expect(fast.target_stock).toBeGreaterThan(slow.target_stock)
    // And proportionally: B-tier safety = 7 days, lead 3 → reorder_point = upd × 10.
    expect(fast.reorder_point).toBe(100)
    expect(slow.reorder_point).toBe(10)
  })

  it('ignoring velocity is impossible — par scales with units/day, not a constant', () => {
    // Three velocities, three distinct pars. A constant-par mutation fails all three equalities.
    const pars = [1, 5, 10].map(v => sold(v).reorder_point)
    expect(new Set(pars).size).toBe(3)
  })

  it('ABC safety scales A above B above C on identical velocity', () => {
    const a = computeParMath({ unitsPerDay: 4, tier: 'A', onHand: 0, settings: SETTINGS, historyState: 'has_history' })
    const b = computeParMath({ unitsPerDay: 4, tier: 'B', onHand: 0, settings: SETTINGS, historyState: 'has_history' })
    const c = computeParMath({ unitsPerDay: 4, tier: 'C', onHand: 0, settings: SETTINGS, historyState: 'has_history' })
    expect(a.reorder_point).toBeGreaterThan(b.reorder_point)
    expect(b.reorder_point).toBeGreaterThan(c.reorder_point)
  })
})

describe('never-sold gets NO par — distinct from a par of zero', () => {
  it('no_history: no par, no date, no suggestion, and NOT the review state', () => {
    const r = computeParMath({ unitsPerDay: 0, tier: 'C', onHand: 40, settings: SETTINGS, historyState: 'no_history' })
    expect(r.no_history).toBe(true)
    expect(r.reorder_point).toBe(0)
    expect(r.days_of_cover).toBeNull()       // never a date for a product that has never sold
    expect(r.below_reorder).toBe(false)
    expect(r.suggested_qty).toBe(0)
    expect(r.review).toBe(false)             // distinct from slow/dead-but-sold
  })

  it('NO velocity row at all is treated as never-sold — absence of evidence fails closed', () => {
    const r = computeParMath({ unitsPerDay: 3, tier: 'A', onHand: 10, settings: SETTINGS, historyState: null })
    expect(r.no_history).toBe(true)
    expect(r.suggested_qty).toBe(0)
  })

  it('a SOLD-but-slow product is review, which is a different state again', () => {
    // Below min_velocity_per_day: par 0 + review (owner decides: delist?), not no-par.
    const r = sold(0.01, 'C')
    expect(r.review).toBe(true)
    expect(r.no_history).toBe(false)
  })
})

describe('the rest of the arithmetic is unchanged (RULE 0)', () => {
  it('below-reorder triggers at the boundary and suggests up to target', () => {
    // upd 2, B-tier: reorder_point = 2×10 = 20, target = 2×17 = 34.
    const at = sold(2, 'B', 20)
    expect(at.below_reorder).toBe(true)
    expect(at.suggested_qty).toBe(14)        // 34 − 20
    const above = sold(2, 'B', 21)
    expect(above.below_reorder).toBe(false)
    expect(above.suggested_qty).toBe(0)
  })

  it('days of cover = on-hand / velocity, one decimal', () => {
    expect(sold(2, 'B', 15).days_of_cover).toBe(7.5)
  })

  it('MOQ floors the reorder quantity', () => {
    // Slow-but-real mover: target − reorder_point below MOQ → MOQ wins.
    const r = sold(0.1, 'C', 0)
    expect(r.reorder_qty).toBeGreaterThanOrEqual(SETTINGS.default_reorder_qty)
  })
})
