import { describe, it, expect } from 'vitest'
import { looksBackCalculatedCost } from '@/lib/inventory/resolve-cost'

// MS9 PHASE 3 — the 60% tell.
//
// cost_price = price × 0.4 to the cent is the signature of a back-calculated figure: residue of
// the fabricated price*0.6 fallback INTEL-COMPUTE removed from the code in July, whose
// already-written rows were never corrected. 73 of Sip's 83 costed products carry it. A margin
// that is exactly 60.0% on every product is not a consistent business — it is one lie applied 73
// times.

describe('the four provable products, with their live numbers', () => {
  it('flags every one — the catalogue figure matches price × 0.4 to the cent', () => {
    expect(looksBackCalculatedCost(4.50, 1.80)).toBe(true)   // Cortado
    expect(looksBackCalculatedCost(6.00, 2.40)).toBe(true)   // Turmeric Latte
    expect(looksBackCalculatedCost(4.00, 1.60)).toBe(true)   // Still Water 600ml
    expect(looksBackCalculatedCost(6.00, 2.40)).toBe(true)   // Apple Juice (same catalogue shape)
  })

  it('does NOT flag their genuinely recorded PO costs', () => {
    // The same products' real purchase prices sit at other ratios — Apple Juice's true $2.50
    // against $6.00 is 41.7%, close to 40% but not the exact multiplication signature.
    expect(looksBackCalculatedCost(4.50, 2.70)).toBe(false)  // Cortado PO — 60% ratio? no: 2.70/4.50 = 0.6
    expect(looksBackCalculatedCost(6.00, 3.20)).toBe(false)  // Turmeric PO
    expect(looksBackCalculatedCost(4.00, 2.00)).toBe(false)  // Still Water PO — 50%
    expect(looksBackCalculatedCost(6.00, 2.50)).toBe(false)  // Apple Juice PO — 41.7%
  })
})

describe('the tolerance is exact-multiplication tight', () => {
  it('half a cent either side of ×0.4 clears', () => {
    // The fabrication was written by exact arithmetic. A REAL cost that merely lands near 40%
    // must not be accused — accusing an honest figure is worse than missing a fabricated one.
    expect(looksBackCalculatedCost(10.00, 4.00)).toBe(true)    // exactly ×0.4
    expect(looksBackCalculatedCost(10.00, 4.01)).toBe(false)   // one cent off
    expect(looksBackCalculatedCost(10.00, 3.99)).toBe(false)
  })

  it('never flags absent or zero inputs', () => {
    expect(looksBackCalculatedCost(null, 1.80)).toBe(false)
    expect(looksBackCalculatedCost(4.50, null)).toBe(false)
    expect(looksBackCalculatedCost(0, 0)).toBe(false)
    expect(looksBackCalculatedCost(4.50, 0)).toBe(false)
    expect(looksBackCalculatedCost(NaN, NaN)).toBe(false)
  })
})

describe('disclosure only — nothing is corrected', () => {
  it('the detector returns a boolean, not a suggested replacement cost', () => {
    // Guessing a replacement would be fabricating a number to fix a fabricated number.
    const r = looksBackCalculatedCost(4.50, 1.80)
    expect(typeof r).toBe('boolean')
  })
})
