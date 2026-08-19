import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCost } from '@/lib/inventory/resolve-cost'

// MS9 PHASE 1 — a recorded transaction beats a catalogue estimate.
//
// The pure resolver has ALWAYS ordered purchase-order prices (tiers 3–4) above the catalogue
// cost_price (tier 5) — its header calls the order "documented + locked". The defect was in the
// orchestrators: resolveCostFor and resolveCostBatch only FETCHED the PO price after outlet AND
// catalogue had both failed, so whenever a catalogue figure existed the recorded transaction was
// never loaded and the estimate won by default.
//
// Why that mattered on live data: cost_price is a fabricated back-calculation (price × 0.4) on 73
// of Sip's 83 costed products — residue of the price*0.6 fallback INTEL-COMPUTE removed from the
// CODE in July, whose already-written data was never corrected. Every margin through the resolver
// was definitionally ~60%.

describe('the locked order, asserted with the live numbers', () => {
  it('Cortado: the $2.70 PO price beats the $1.80 fabricated catalogue figure', () => {
    // price $4.50 → reported margin was (4.50-1.80)/4.50 = 60.0%; real is (4.50-2.70)/4.50 = 40.0%.
    const r = resolveCost({ po_confirmed_price: 2.70, cost_price: 1.80 })
    expect(r.cost).toBe(2.70)
    expect(r.source).toBe('purchase_order')
    const price = 4.50
    const margin = Math.round(((price - r.cost!) / price) * 1000) / 10
    expect(margin).toBe(40.0)
    expect(margin).not.toBe(60.0)
  })

  it('Turmeric Latte: $3.20 PO beats $2.40 catalogue — margin 46.7%, not 60.0%', () => {
    const r = resolveCost({ po_confirmed_price: 3.20, cost_price: 2.40 })
    expect(r.cost).toBe(3.20)
    const margin = Math.round(((6.00 - r.cost!) / 6.00) * 1000) / 10
    expect(margin).toBe(46.7)
  })

  it('an outlet cost still beats everything — the strongest evidence stays on top', () => {
    const r = resolveCost({ item_cost: 2.50, po_confirmed_price: 9.99, cost_price: 1.00 })
    expect(r.cost).toBe(2.50)
    expect(r.source).toBe('outlet')
  })

  it('catalogue still answers when no transaction exists — an estimate beats nothing', () => {
    const r = resolveCost({ cost_price: 1.80 })
    expect(r.cost).toBe(1.80)
    expect(r.source).toBe('catalogue')
    expect(r.grounding).toBe('estimated')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ORCHESTRATOR GATING — where the actual bug lived. The pure order was always right; what has
// to be asserted is that the fetch path can no longer let catalogue answer before the PO price has
// been looked for. Structural, because the property is about which query runs when.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the orchestrators no longer let catalogue pre-empt the PO fetch', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'inventory', 'resolve-cost.ts'), 'utf8')
  const code = src.split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')

  it('the outlet-only pass resolves WITHOUT cost_price', () => {
    // This is the fix in one line: the first resolve call must not carry the catalogue figure, or
    // it short-circuits at 'catalogue' and the PO branch is never reached.
    expect(code).toMatch(/resolveCost\(\{ item_cost: oi\.item_cost, last_item_cost: oi\.last_item_cost \}\)/)
    // The old shape — outlet AND catalogue in the same first pass — must not exist anywhere.
    expect(code).not.toMatch(/resolveCost\(\{ item_cost: oi\.item_cost, last_item_cost: oi\.last_item_cost, cost_price/)
  })

  it('the final pass hands the pure resolver PO and catalogue TOGETHER', () => {
    // The decision belongs to the locked order, not to fetch sequencing.
    expect(code).toMatch(/po_confirmed_price:[\s\S]{0,120}cost_price:/)
  })

  it('the batch second pass keys off outlet misses, not total unknowns', () => {
    // 'stillUnknown' was the old gating variable (unknown AFTER catalogue). Its absence is the
    // simplest proof the batch no longer computes that set.
    expect(code).toContain('needPo')
    expect(code).not.toContain('stillUnknown')
  })
})
