import { describe, it, expect } from 'vitest'
import { verifyResponse, type GroundTruth } from './verifier'

// MS15 PHASE 3 — THE VERIFIER. Every rule is tested against the real failure it exists to stop,
// and the control case (a correct answer passes UNTOUCHED) is tested just as hard — a verifier
// that blocks good answers is worse than none, because it teaches people to switch it off.

const ground: GroundTruth = {
  anchors: [741, 4419.90, 2.70, 68, 12],
  entities: {
    products: ['Flat White', 'Cortado', 'Turmeric Latte'],
    suppliers: ['Bean Alliance'],
    staff: ['Sam Turner'],
  },
  costProvenance: {
    'Flat White': 'catalogue',      // the fabricated price*0.4 tier
    Cortado: 'purchase_order',      // a real recorded cost
    'Turmeric Latte': 'unknown',
  },
  houseRules: ['never discount coffee'],
}

describe('a correct answer passes UNTOUCHED', () => {
  it('figures that trace to anchors, entities that exist', () => {
    const r = verifyResponse({
      response: 'You made $741 this week, against $4,419.90 for the same week last month.',
      question: 'how did this week go',
      ground,
    })
    expect(r.ok).toBe(true)
    expect(r.action).toBe('pass')
    expect(r.findings).toEqual([])
    expect(r.safeResponse).toBeUndefined()
  })

  it('rounding a real figure is not a fabrication', () => {
    const r = verifyResponse({ response: 'About $4,420 last month.', ground })
    expect(r.ok).toBe(true)
  })

  it('a zero states an absence, not a measurement', () => {
    const r = verifyResponse({ response: 'Revenue today is $0.00 — no sales yet.', ground })
    expect(r.ok).toBe(true)
  })

  it('prose with no figures and no names passes', () => {
    const r = verifyResponse({ response: 'Tuesdays are quieter than the rest of your week.', ground })
    expect(r.ok).toBe(true)
  })
})

describe('RULE 1 — a number that exists nowhere in the data is blocked', () => {
  it('the fabricated $999,999 target (a real past failure) is refused', () => {
    const r = verifyResponse({ response: 'You are tracking against your $999,999 target.', ground })
    expect(r.ok).toBe(false)
    expect(r.action).toBe('refuse')
    expect(r.findings[0].code).toBe('unverified_number')
    expect(r.findings[0].evidence).toContain('999,999')
  })

  it('the refusal never repeats the unverified figure', () => {
    const r = verifyResponse({ response: 'Your leak is costing $480/month.', ground })
    expect(r.action).toBe('refuse')
    expect(r.safeResponse).toBeDefined()
    expect(r.safeResponse).not.toContain('480')
  })

  it('an invented percentage is caught too', () => {
    const r = verifyResponse({ response: 'Revenue is down 83.7% on last week.', ground })
    expect(r.ok).toBe(false)
    expect(r.findings.some(f => f.code === 'unverified_number')).toBe(true)
  })
})

describe('RULE 2 — a product, supplier or staff member that does not exist', () => {
  it('a fabricated supplier is refused', () => {
    const r = verifyResponse({ response: 'Your best terms are from Kowalski Coffee Imports.', ground })
    expect(r.ok).toBe(false)
    expect(r.findings.some(f => f.code === 'unknown_entity')).toBe(true)
  })

  it('a real supplier passes', () => {
    const r = verifyResponse({ response: 'Your best terms are from Bean Alliance.', ground })
    expect(r.ok).toBe(true)
  })

  it('ordinary Title-Case prose is not mistaken for an entity', () => {
    const r = verifyResponse({ response: 'Last Tuesday was slow, and Fair Work rates rose in July.', ground })
    expect(r.findings.filter(f => f.code === 'unknown_entity')).toEqual([])
  })
})

describe('RULE 3 — a margin is only as good as the cost under it', () => {
  it('a margin from a catalogue-tier cost is hedged, not shipped bare', () => {
    // The real failure: cost_price = price*0.4 storewide, so every margin read exactly 60%.
    const r = verifyResponse({
      response: 'Flat White is running at a healthy margin.',
      ground,
      subjectProducts: ['Flat White'],
    })
    expect(r.ok).toBe(false)
    expect(r.action).toBe('hedge')
    expect(r.findings[0].code).toBe('weak_cost_provenance')
    expect(r.safeResponse).toMatch(/caveat/i)
  })

  it('a margin from a purchase-order cost passes', () => {
    const r = verifyResponse({
      response: 'Cortado’s margin is solid.',
      ground,
      subjectProducts: ['Cortado'],
    })
    expect(r.ok).toBe(true)
  })

  it('an unknown-cost product cannot support a margin claim', () => {
    const r = verifyResponse({
      response: 'Turmeric Latte has the better gross profit.',
      ground,
      subjectProducts: ['Turmeric Latte'],
    })
    expect(r.findings.some(f => f.code === 'weak_cost_provenance')).toBe(true)
  })
})

describe('RULE 4 — never contradict an active house rule', () => {
  it('proposing a coffee discount is caught when the owner forbade it', () => {
    const r = verifyResponse({ response: 'Try 15% off coffee on Tuesdays.', ground })
    expect(r.ok).toBe(false)
    expect(r.findings.some(f => f.code === 'house_rule_conflict')).toBe(true)
  })

  it('with no such rule, the same suggestion passes the rule check', () => {
    const r = verifyResponse({ response: 'Try a discount on coffee.', ground: { ...ground, houseRules: [] } })
    expect(r.findings.filter(f => f.code === 'house_rule_conflict')).toEqual([])
  })
})

describe('RULE 5 — allergen and dietary safety are never answered', () => {
  it.each([
    'is the flat white gluten free',
    'does the muffin contain nuts',
    'which items are vegan',
    'is this safe for a coeliac customer',
  ])('refuses: %s', question => {
    const r = verifyResponse({ response: 'Yes, it is safe.', question, ground })
    expect(r.action).toBe('refuse')
    expect(r.findings[0].code).toBe('allergen_refusal')
    // The refusal must not answer the question even accidentally.
    expect(r.safeResponse).not.toMatch(/\byes\b|\bno\b.*safe/i)
    expect(r.safeResponse).toMatch(/labelling/)
  })

  it('fires on the QUESTION even when the answer looks harmless', () => {
    const r = verifyResponse({ response: 'I have checked the menu.', question: 'any allergens in the banana bread?', ground })
    expect(r.action).toBe('refuse')
  })

  it('an ordinary question about the same product is unaffected', () => {
    const r = verifyResponse({ response: 'Flat White sells well.', question: 'how is the flat white doing', ground })
    expect(r.ok).toBe(true)
  })
})

describe('the verifier refuses rather than passing something through unverified', () => {
  it('with NO ground truth, every figure is unverifiable and nothing ships', () => {
    const r = verifyResponse({ response: 'Revenue was $1,234.', ground: { anchors: [], entities: {} } })
    expect(r.ok).toBe(false)
    expect(r.action).toBe('refuse')
  })

  it('multiple faults are all reported, not just the first', () => {
    // FRAMED as a supplier ("from X"), so both the entity and the figure are caught.
    const r = verifyResponse({ response: 'You were billed $88,888 from Kowalski Imports.', ground })
    expect(r.findings.length).toBeGreaterThanOrEqual(2)
    expect(r.findings.map(f => f.code)).toContain('unverified_number')
    expect(r.findings.map(f => f.code)).toContain('unknown_entity')
  })

  it('STATED EDGE — the edge moved, and it is narrower now', () => {
    // This test originally documented that "Kowalski Imports billed you $88,888" was NOT flagged
    // as an entity, because the response named no relationship the rule recognised. Building the
    // eval set closed that gap: "billed" is now an attributing verb, so it IS caught.
    const r = verifyResponse({ response: 'Kowalski Imports billed you $88,888.', ground })
    expect(r.findings.map(f => f.code)).toContain('unknown_entity')

    // The edge that REMAINS is single-word names: "Your Fitzroy store" carries a frame but only
    // one capitalised word, and widening the pattern to single words would flag every ordinary
    // capitalised word (Tuesday, Google, Fair Work). Carried as a named gap in the eval set
    // rather than half-solved here.
    const single = verifyResponse({ response: 'Your Fitzroy store is outperforming.', ground })
    expect(single.findings.map(f => f.code)).not.toContain('unknown_entity')
  })
})
