import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCost, COST_SOURCE_LABEL } from '@/lib/inventory/resolve-cost'

// MS10 PHASE 2 — the LLM routes go first, because Aria's brain is the surface an owner BELIEVES.
//
// After MS9, the valuation panel showed Cortado's true 40% margin while these routes still fed the
// fabricated 60% into model prompts — two answers to one question, worse than the original bug
// because it looks fixed. Migrated here: price-check, product-insights, price-intelligence. Each
// now resolves cost through the rail and carries the provenance tier INTO the prompt, so the model
// can hedge an estimate instead of asserting it.

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

const PRICE_CHECK = src('src', 'app', 'api', 'aria', 'price-check', 'route.ts')
const PRODUCT_INSIGHTS = src('src', 'app', 'api', 'aria', 'product-insights', 'route.ts')
const PRICE_INTEL = src('src', 'app', 'api', 'aria', 'price-intelligence', 'route.ts')
const GUARD = src('scripts', 'canon-rail-guard.ts')

describe('the brief’s verify: a PO-costed product reaches the prompt with the true figure and tier', () => {
  it('the resolver produces the true cost and a tier label for the Cortado fixture', () => {
    // The end-to-end datum: PO $2.70 beats fabricated catalogue $1.80, and the label the routes
    // interpolate says where it came from.
    const r = resolveCost({ po_confirmed_price: 2.70, cost_price: 1.80 })
    expect(r.cost).toBe(2.70)
    expect(COST_SOURCE_LABEL[r.source]).toBe('from your purchase order')
  })

  it('price-check interpolates the tier label into the prompt and tells the model to hedge', () => {
    expect(PRICE_CHECK).toContain('COST_SOURCE_LABEL[resolvedCost.source]')
    expect(PRICE_CHECK).toMatch(/hedge margin claims/i)
    expect(PRICE_CHECK).toMatch(/unknown — no cost recorded/)
  })

  it('product-insights does the same, and its guard allow-list no longer smuggles a zero', () => {
    expect(PRODUCT_INSIGHTS).toContain('COST_SOURCE_LABEL[resolvedCost.source]')
    // The old line pushed `Number(product.cost_price) || 0` into the fabrication guard's allowed
    // numbers — whitelisting 0 as a legitimate cost figure for the model to repeat.
    expect(PRODUCT_INSIGHTS).not.toMatch(/Number\(product\.cost_price\)/)
    expect(PRODUCT_INSIGHTS).toMatch(/if \(costCents != null\) allowed\.push/)
  })

  it('price-intelligence resolves per cart through ONE batch call, not N+1', () => {
    expect(PRICE_INTEL).toContain('resolveCostBatch')
    expect(PRICE_INTEL).toMatch(/costMap\.get\(p\.id/)
  })
})

describe('no migrated route still reads the raw column', () => {
  it.each([
    ['price-check', PRICE_CHECK],
    ['product-insights', PRODUCT_INSIGHTS],
    ['price-intelligence', PRICE_INTEL],
  ])('%s has no cost_price in any .select()', (_name, code) => {
    expect(code).not.toMatch(/\.select\(\s*['"`][^'"`]*\bcost_price\b/)
  })

  it('margins are null when the cost is unknown — never a figure over a zero', () => {
    expect(PRICE_CHECK).toMatch(/costPrice != null && costPrice > 0/)
    expect(PRODUCT_INSIGHTS).toMatch(/costCents != null \? \(\(priceCents - costCents\)/)
    expect(PRICE_INTEL).toMatch(/resolvedUnitCost != null && resolvedUnitCost > 0/)
  })
})

describe('the allowlist shrank, measurably', () => {
  it('the three migrated files are gone from COST_READ_ALLOWLIST', () => {
    const i = GUARD.indexOf('COST_READ_ALLOWLIST = [')
    const j = GUARD.indexOf('\n]', i)
    const list = GUARD.slice(i, j)
    expect(list).not.toContain('price-check')
    expect(list).not.toContain('product-insights')
    expect(list).not.toContain('price-intelligence')
  })

  it('the allowlist holds exactly 50 files', () => {
    // Counted against the closing bracket on its own line — a naive indexOf(']') lands inside the
    // first [id] route path and reports 1, which is exactly the measurement error that produced
    // false findings twice before (failure pattern #5). The parser bug is memorialised here.
    const i = GUARD.indexOf('COST_READ_ALLOWLIST = [')
    const j = GUARD.indexOf('\n]', i)
    const n = (GUARD.slice(i, j).match(/^  'src\//gm) ?? []).length
    expect(n).toBe(50)
  })
})
