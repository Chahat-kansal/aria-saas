import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// MS8 PHASE 1 — one canonical product-cost column.
//
// pos_products has SEVEN cost-ish columns. `cost` holds a NON-NULL ZERO on 87 rows while
// `cost_price` holds the real figure — so anything reading `cost` got $0.00 presented as fact.
// That is the fabricated-zero pattern removed from variance reporting in INV-BASELINE-1 phase 3,
// still live on the money primitive itself.
//
// The sweep that scoped this phase (reads counted inside `.select(...)`, writes as insert/update
// payload keys, across src/ and scripts/):
//
//   cost_price          65 reads   8 writes   ← CANONICAL
//   cost                 2 reads   4 writes   ← the fabricated zero; both readers fixed here
//   item_cost            4 reads   4 writes   (per-outlet, resolve-cost.ts tiers 1-2)
//   last_item_cost       4 reads   5 writes   (per-outlet)
//   last_case_cost       1 read    0 writes
//   case_cost            0 reads   1 write    ← write-only
//   cost_price_cents     0 reads   0 writes   ← dead
//   costing_method       0 reads   0 writes   ← dead in app code, set on 106 DB rows
//
// The columns are NOT dropped (RULE 0). They are simply no longer read.

function code(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')
}

const COUNTERFACTUAL = code('src', 'lib', 'aria', 'hypothesis', 'counterfactual.ts')
const GENERATE = code('src', 'lib', 'aria', 'hypothesis', 'generate.ts')

describe('nothing reads pos_products.cost any more', () => {
  it('counterfactual selects cost_price, not cost', () => {
    expect(COUNTERFACTUAL).toContain("select('name,price,cost_price')")
    expect(COUNTERFACTUAL).not.toMatch(/select\('name,price,cost'\)/)
  })

  it('generate selects cost_price, not cost', () => {
    expect(GENERATE).toContain('cost_price,stock_quantity')
    expect(GENERATE).not.toMatch(/select\('name,price,cost,/)
  })

  it('neither file selects the bare `cost` column from pos_products', () => {
    // A `.select()` list containing a standalone `cost` field. cost_price/item_cost etc are fine.
    const bareCost = /\.select\('[^']*(^|,)cost(,|')/
    expect(bareCost.test(COUNTERFACTUAL)).toBe(false)
    expect(bareCost.test(GENERATE)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE DETECTOR THAT NEVER FIRED. This is the real damage the zero column did — not a wrong number
// on a screen, but a whole feature that silently found nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the low-margin detector', () => {
  it('no longer gates on a falsy `p.cost`', () => {
    // `p.cost && ...` was ALWAYS false, because cost is 0 on every costed row. The filter excluded
    // every product and the detector reported "no low-margin products" for a business with 87
    // real costs.
    expect(GENERATE).not.toMatch(/\.filter\(p => p\.cost &&/)
  })

  it('skips products with no known cost instead of treating them as zero-cost', () => {
    // A missing cost means the margin is UNKNOWN, not 100%. Treating null as 0 would flag every
    // uncosted product as a perfect-margin item — the same fabricated-zero error in the opposite
    // direction. Same rule INV-BASELINE-1 phase 3 established for variance value.
    expect(GENERATE).toMatch(/if \(cost == null \|\| cost <= 0/)
  })

  it('still uses the same 20% margin threshold', () => {
    // RULE 0 — the detection rule is unchanged; only the column it reads and the unknown-handling.
    expect(GENERATE).toMatch(/< 0\.2/)
  })
})

describe('the LLM is not told a cost it does not have', () => {
  it('sends null for an unknown cost, never 0', () => {
    // GROUNDING-TEETH at the source: a prompt containing "cost": 0 for every product invites the
    // model to reason about margins that were never measured.
    expect(COUNTERFACTUAL).toMatch(/Number\(p\.cost_price\) > 0 \? Number\(p\.cost_price\) : null/)
  })

  it('tells the model explicitly that null means unknown', () => {
    expect(COUNTERFACTUAL).toMatch(/treat null as/i)
    expect(COUNTERFACTUAL).toMatch(/UNKNOWN/)
  })
})
