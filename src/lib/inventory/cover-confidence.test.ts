import { describe, it, expect } from 'vitest'
import { coverConfidence } from '@/lib/inventory/par-levels'

// MS9 PHASE 5 — a days-of-cover date from thin evidence says so.
//
// The surface answers "what runs out, when, and HOW SURE ARE WE". The third clause is the one no
// POS ships: a cover date computed from four sales looks exactly as precise as one computed from
// four hundred, and the difference is whether the owner can act on it.
//
// The thresholds, justified:
//   14 DAYS observed — a café's demand cycles weekly; fourteen days is two full weekly cycles,
//   the minimum to tell a weekend-only seller from a steady one. One cycle fits either story.
//   5 UNITS in the window — below five, a single stray sale moves the velocity by 20%+; the date
//   it produces is dominated by one event, not a pattern.

describe("'none' — never sold, never a date", () => {
  it('no_history yields none, with the reason', () => {
    const r = coverConfidence({ noHistory: true, daysObserved: null, unitsInWindow: 0 })
    expect(r.level).toBe('none')
    expect(r.note).toMatch(/never sold/i)
  })

  it('no_history wins even over apparently rich numbers', () => {
    // Contradictory inputs fail closed: the history flag is the evidence of record.
    const r = coverConfidence({ noHistory: true, daysObserved: 90, unitsInWindow: 50 })
    expect(r.level).toBe('none')
  })
})

describe("'low' — thin evidence is stated, not hidden", () => {
  it('under 14 days observed is low, and the note says how many days', () => {
    const r = coverConfidence({ noHistory: false, daysObserved: 6, unitsInWindow: 40 })
    expect(r.level).toBe('low')
    expect(r.note).toContain('6 days')
    expect(r.note).toMatch(/rough guess/i)
  })

  it('exactly 14 days clears the observation test', () => {
    const r = coverConfidence({ noHistory: false, daysObserved: 14, unitsInWindow: 40 })
    expect(r.level).toBe('ok')
  })

  it('under 5 units in the window is low even with a long history', () => {
    // Sip today: months of history, ~2 sales in 28 days. The date must confess.
    const r = coverConfidence({ noHistory: false, daysObserved: 60, unitsInWindow: 2 })
    expect(r.level).toBe('low')
    expect(r.note).toContain('2 sales')
  })

  it('exactly 5 units clears the sample test', () => {
    expect(coverConfidence({ noHistory: false, daysObserved: 60, unitsInWindow: 5 }).level).toBe('ok')
  })
})

describe("'ok' — enough evidence, no caveat", () => {
  it('two weekly cycles and a real sample: no note', () => {
    const r = coverConfidence({ noHistory: false, daysObserved: 45, unitsInWindow: 30 })
    expect(r.level).toBe('ok')
    expect(r.note).toBeNull()
  })

  it('unknown observation depth falls through to the sample test, not to ok', () => {
    // daysObserved null (no first-sale timestamp) must not skip both tests.
    expect(coverConfidence({ noHistory: false, daysObserved: null, unitsInWindow: 2 }).level).toBe('low')
    expect(coverConfidence({ noHistory: false, daysObserved: null, unitsInWindow: 20 }).level).toBe('ok')
  })
})
