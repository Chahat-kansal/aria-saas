import { describe, it, expect } from 'vitest'
import { thresholdDisclosureFor, THRESHOLD_DISCLOSURE, MATERIAL_QTY_UNITS } from '@/lib/inventory/count-policy'

// MS8 PHASE 3 — the threshold disclosure, stated for THIS business.
//
// The static wording was already true: "measured in units because recorded costs are catalogue
// estimates, not verified purchase costs". But it is a claim about the world, not about the owner's
// own data — and an owner reading it cannot tell whether it means "you have no costs" or "your
// costs are the wrong kind". Those imply completely different next actions: one is data entry, the
// other is receiving deliveries against POs.
//
// Kept PURE and fed a mix, so the wording is testable without a database and a policy module cannot
// start issuing queries.

const mix = (verified: number, estimated: number, unknown: number) =>
  ({ verified, estimated, unknown, total: verified + estimated + unknown })

describe('the disclosure describes the owner’s own data', () => {
  it("names the actual counts, not a general claim", () => {
    // Sip's real shape at the time of writing: 72 catalogue estimates, 2 with no cost.
    const d = thresholdDisclosureFor(mix(0, 72, 2))
    expect(d).toContain('74 products')
    expect(d).toContain('72 catalogue estimates')
    expect(d).toContain('2 with no cost recorded')
  })

  it('still states the threshold itself', () => {
    // The numbers the owner actually needs must survive every branch.
    const d = thresholdDisclosureFor(mix(0, 72, 2))
    expect(d).toContain(String(MATERIAL_QTY_UNITS))
    expect(d).toContain('10%')
    expect(d).toContain('owner review')
  })

  it('omits a tier that is empty rather than saying "0 verified"', () => {
    const d = thresholdDisclosureFor(mix(0, 72, 2))
    expect(d).not.toContain('0 verified')
  })

  it('changes when the mix changes — that is the whole point', () => {
    expect(thresholdDisclosureFor(mix(0, 72, 2))).not.toBe(thresholdDisclosureFor(mix(40, 30, 4)))
  })
})

describe('the all-verified case points at the sprint that unblocks dollars', () => {
  it('says a dollar threshold is now possible', () => {
    // The condition INV-COST-1 waits on: every product carrying a verified per-outlet cost.
    const d = thresholdDisclosureFor(mix(74, 0, 0))
    expect(d).toContain('verified cost')
    expect(d).toContain('INV-COST-1')
  })

  it('does NOT claim the threshold has already switched to dollars', () => {
    // The policy is unchanged by this phase — only the sentence describing it.
    const d = thresholdDisclosureFor(mix(74, 0, 0))
    expect(d).toMatch(/still measured in units/i)
  })
})

describe('falls back rather than saying something absurd', () => {
  it('uses the general wording when the mix is unavailable', () => {
    // A failed lookup must not fail a stocktake submit, and must not invent a mix.
    expect(thresholdDisclosureFor(null)).toBe(THRESHOLD_DISCLOSURE)
    expect(thresholdDisclosureFor(undefined)).toBe(THRESHOLD_DISCLOSURE)
  })

  it('uses the general wording for a business with no products', () => {
    // "of your 0 products" would be worse than the honest generality it replaced.
    expect(thresholdDisclosureFor(mix(0, 0, 0))).toBe(THRESHOLD_DISCLOSURE)
  })
})

describe('GROUNDING-TEETH still holds', () => {
  it('carries no dollar figure in any branch', () => {
    for (const m of [mix(0, 72, 2), mix(74, 0, 0), mix(1, 1, 1), null]) {
      expect(thresholdDisclosureFor(m)).not.toContain('$')
    }
  })
})
