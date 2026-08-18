import { describe, it, expect } from 'vitest'
import {
  decideCountOutcome, isMaterialVariance,
  MATERIAL_QTY_UNITS, MATERIAL_PCT_OF_BOOK, THRESHOLD_DISCLOSURE,
} from '@/lib/inventory/count-policy'

// INV-BASELINE-1 PHASE 2 — the control, tested at its edges.
//
// A café cannot separate custody from counting: the owner holds the stock, counts it, and approves
// the result. The compensating control is documented delegation with defined thresholds, so this
// module is the whole control. Everything below is a case that would otherwise rot silently.

describe('the boundary — the case that rots', () => {
  // ── EXACTLY AT THE THRESHOLD ─────────────────────────────────────────────────────────────────
  // The single most important assertion in this file. `>` instead of `>=` is a one-character change
  // that nothing else in the system would notice, and it moves the boundary case from "owner
  // reviews it" to "applied silently".
  it('a variance EXACTLY at the unit threshold is material — it reviews, it does not commit', () => {
    const d = decideCountOutcome({ varianceQty: MATERIAL_QTY_UNITS, systemQty: 100, actor: 'owner' })
    expect(d.outcome).toBe('review')
    expect(d.reason).toBe('qty_threshold')
    expect(isMaterialVariance(MATERIAL_QTY_UNITS, 100)).toBe(true)
  })

  it('one unit below the threshold commits', () => {
    const d = decideCountOutcome({ varianceQty: MATERIAL_QTY_UNITS - 1, systemQty: 100, actor: 'owner' })
    expect(d.outcome).toBe('commit')
    expect(d.reason).toBe('below_threshold')
  })

  it('a variance EXACTLY at the percentage threshold is material', () => {
    // ⚠ THE UNIT ARM MUST NOT BE ABLE TO DECIDE THIS CASE.
    //
    // The first version of this test used 10 of 100 — exactly 10% — and it was WORTHLESS: 10 is
    // also >= MATERIAL_QTY_UNITS, so isMaterialVariance returned true from the quantity arm and
    // never reached the percentage comparison. Flipping the percentage `>=` to `>` left the whole
    // suite green. Caught by the mutation check; recorded here so it is not reintroduced.
    //
    // 4 of 40 is exactly 10% AND 4 < MATERIAL_QTY_UNITS, so only the percentage arm can decide it.
    expect(MATERIAL_QTY_UNITS).toBeGreaterThan(4)          // guards the premise of this test
    expect(isMaterialVariance(4, 40)).toBe(true)           // exactly at 10% → material
    expect(isMaterialVariance(3, 40)).toBe(false)          // 7.5%, and 3 units → under both arms
  })

  it('the two arms are OR, not AND — either alone is enough', () => {
    // Big in units, trivial in percent: 6 of 1000 = 0.6%.
    expect(isMaterialVariance(6, 1000)).toBe(true)
    // Big in percent, trivial in units: 2 of 4 = 50%.
    expect(isMaterialVariance(2, 4)).toBe(true)
  })

  it('direction does not matter — a shortfall and a surplus are equally material', () => {
    // Shrinkage and phantom stock are both control failures; only the magnitude decides.
    expect(isMaterialVariance(-MATERIAL_QTY_UNITS, 100)).toBe(true)
    expect(decideCountOutcome({ varianceQty: -6, systemQty: 100, actor: 'owner' }).outcome).toBe('review')
  })
})

describe('who counted decides before how much', () => {
  it('staff counts ALWAYS route, however small', () => {
    // Rule 4. A one-unit difference counted by staff is still not the staffer's to apply.
    const d = decideCountOutcome({ varianceQty: 1, systemQty: 500, actor: 'staff' })
    expect(d.outcome).toBe('review')
    expect(d.reason).toBe('staff_count')
  })

  it('an unknown or missing actor FAILS CLOSED to review', () => {
    // A caller that has not been migrated must not silently gain the power to commit.
    expect(decideCountOutcome({ varianceQty: 1, systemQty: 500 }).outcome).toBe('review')
    expect(decideCountOutcome({ varianceQty: 1, systemQty: 500, actor: undefined }).outcome).toBe('review')
  })

  it('the owner commits below threshold — the whole point of the exception', () => {
    // The owner completing their own count IS the human witnessing it; a second click on their own
    // work is ceremony, not control.
    expect(decideCountOutcome({ varianceQty: 2, systemQty: 500, actor: 'owner' }).outcome).toBe('commit')
  })

  it('materiality overrides role — a big owner variance still reviews', () => {
    expect(decideCountOutcome({ varianceQty: 40, systemQty: 500, actor: 'owner' }).outcome).toBe('review')
  })
})

describe('zero and edge inputs', () => {
  it('a matching count moves nothing and queues nothing', () => {
    const d = decideCountOutcome({ varianceQty: 0, systemQty: 10, actor: 'owner' })
    expect(d.outcome).toBe('no_change')
    expect(d.reason).toBe('zero_variance')
    // Also true for staff — there is nothing to review when the count matched.
    expect(decideCountOutcome({ varianceQty: 0, systemQty: 10, actor: 'staff' }).outcome).toBe('no_change')
  })

  it('book stock of zero uses the unit arm only, never a division by zero', () => {
    // First count of a newly-stocked product: book 0, counted 3. The percentage is undefined, and
    // treating it as infinite would route the most routine event there is.
    expect(isMaterialVariance(3, 0)).toBe(false)
    expect(decideCountOutcome({ varianceQty: 3, systemQty: 0, actor: 'owner' }).outcome).toBe('commit')
    // ...but the unit arm still applies.
    expect(isMaterialVariance(MATERIAL_QTY_UNITS, 0)).toBe(true)
    expect(Number.isFinite(0 / 0)).toBe(false)  // the trap this avoids
  })

  it('non-numeric input degrades to no_change rather than throwing or committing', () => {
    for (const v of [NaN, undefined as unknown as number, null as unknown as number]) {
      expect(decideCountOutcome({ varianceQty: v, systemQty: 10, actor: 'owner' }).outcome).toBe('no_change')
    }
  })
})

describe('the disclosure — GROUNDING-TEETH', () => {
  it('states the threshold is in units AND gives the TRUE reason it is not in dollars', () => {
    // ⚠ THIS TEST PREVIOUSLY ASSERTED A FALSE CLAIM, and passed while doing so.
    //
    // Phase 2 shipped a disclosure saying costs "have not been entered yet", taken from a sprint
    // brief rather than measured. Phase 3 measured it: Sip has 74 active tracked products and 72
    // carry a cost_price ($1.60–$9.60). The claim was false and had been propagating for weeks.
    //
    // The threshold stays in units for a NARROWER, true reason: those costs resolve at
    // resolve-cost.ts tier 5 (pos_products.cost_price), whose provenance is source:'catalogue' and
    // grounding:'estimated' — a maintained reference figure tied to no transaction. Thresholding
    // money on an estimate manufactures a confident boundary from an unverified number.
    expect(THRESHOLD_DISCLOSURE).toMatch(/units/i)
    expect(THRESHOLD_DISCLOSURE).toMatch(/catalogue estimates/i)
    expect(THRESHOLD_DISCLOSURE).toMatch(/not verified purchase costs/i)
    // The retracted claim must not come back.
    expect(THRESHOLD_DISCLOSURE).not.toMatch(/have not been entered/i)
  })

  it('quotes the live constants, so it cannot drift from the policy it describes', () => {
    expect(THRESHOLD_DISCLOSURE).toContain(String(MATERIAL_QTY_UNITS))
    expect(THRESHOLD_DISCLOSURE).toContain(String(Math.round(MATERIAL_PCT_OF_BOOK * 100)) + '%')
  })

  it('carries no dollar figure at all', () => {
    // If a "$" ever appears here without INV-COST-1 having landed, it was invented.
    expect(THRESHOLD_DISCLOSURE).not.toContain('$')
  })
})
