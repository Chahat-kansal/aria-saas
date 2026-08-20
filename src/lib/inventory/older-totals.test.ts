import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// MS11 PHASE 2 — THE OLDER TOTALS. MS10 established that a total must state what it covers
// (draft POs); these are the surfaces that predate the rule: stock value, COGS, profit, report
// totals, and the bundle pricer. The discipline is uniform: unknown-cost lines are COUNTED AND
// NAMED, never summed as $0.00 into a figure presented as complete.
//
// These are source-level assertions: the mechanism is proven at the code layer, not exercised
// over HTTP in this environment (stated per the verification standard — the response fields are
// additive, so no existing consumer changes shape).

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

const REPORTS = src('src', 'app', 'api', 'pos', 'reports', '[type]', 'route.ts')
const CLOSURE = src('src', 'app', 'api', 'pos', 'reports', 'closure', '[id]', 'route.ts')
const DEAD = src('src', 'app', 'api', 'pos', 'dead-stock', 'route.ts')
const PAGE_INSIGHT = src('src', 'app', 'api', 'aria', 'page-insight', 'route.ts')
const BUNDLE = src('src', 'app', 'api', 'aria', 'bundle-builder', 'route.ts')

describe('inventory + product reports: resolved cost, flagged unknowns', () => {
  it('no longer selects the fabricated catalogue column', () => {
    expect(REPORTS).not.toMatch(/\.select\(\s*['"`][^'"`]*\bcost_price\b/)
    expect(REPORTS).toContain('resolveCostBatch')
  })

  it('stock value rows carry cost_unknown, and the response counts them', () => {
    expect(REPORTS).toMatch(/cost_unknown: \(invCostMap\.get\(p\.id\)\?\.cost \?\? 0\) <= 0/)
    expect(REPORTS).toMatch(/uncosted_item_count: uncostedCount/)
  })

  it('product profit rows flag an unknown cost instead of asserting profit over $0.00', () => {
    expect(REPORTS).toMatch(/cost_unknown: resolvedProdCost == null \|\| resolvedProdCost <= 0/)
  })
})

describe('closure COGS: snapshot source kept, exclusions named', () => {
  it('keeps the sale-line snapshot (the correct historical source) — no resolver here', () => {
    // The snapshot is what the item cost WHEN SOLD; re-resolving from today's catalogue would
    // rewrite history. The fix is disclosure, not a source change.
    expect(CLOSURE).not.toContain('resolveCostBatch')
    expect(CLOSURE).toMatch(/uncostedLineCount \+= saleItems\.filter/)
  })

  it('the response names how many lines the cogs/profit figures exclude', () => {
    expect(CLOSURE).toMatch(/uncosted_line_count: uncostedLineCount/)
  })
})

describe('dead stock: totals cover priced items only, and say so', () => {
  it('items carry cost_unknown and the response counts them', () => {
    expect(DEAD).toMatch(/cost_unknown: \(p\.cost_price \?\? 0\) <= 0/)
    expect(DEAD).toMatch(/uncosted_item_count: uncostedItemCount/)
  })

  it('the LLM context states the exclusion, so the insight cannot present the total as complete', () => {
    expect(DEAD).toMatch(/value covers costed items only/)
  })
})

describe('page-insight variance: the $ figure states what it excludes', () => {
  it('counts uncosted adjustments and tells the model not to treat the figure as complete', () => {
    expect(PAGE_INSIGHT).toMatch(/uncostedAdj/)
    expect(PAGE_INSIGHT).toMatch(/excluded from that \$ figure/)
  })
})

describe('bundle builder: refuse, don’t guess', () => {
  it('a bundle with ANY unknown-cost member is skipped, never priced against $0.00', () => {
    // `cost_price ?? 0` UNDERSTATED bundle cost, which OVERSTATED margin — the exact wrong
    // direction for a discounting feature with a 25% margin floor.
    expect(BUNDLE).toMatch(/memberCosts\.some\(c => c == null \|\| c <= 0\)\) \{ skippedUnknownCost\+\+; continue \}/)
    expect(BUNDLE).not.toMatch(/Number\(p\.cost_price \?\? 0\)/)
  })

  it('skipped bundles are counted in the response, not silently dropped', () => {
    expect(BUNDLE).toMatch(/skipped_unknown_cost: skippedUnknownCost/)
  })
})
