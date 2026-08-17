import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planStocktakePost } from '@/lib/inventory/stocktake-post'

// INV-BASELINE-1 PHASE 1 — one engine.
//
// /api/pos/stock-takes used to be a second, contradictory counting implementation: it wrote its own
// header and lines and then overwrote book stock straight from the count, while
// lib/inventory/stocktake.ts and lib/inventory/count.ts both document "a count NEVER mutates
// items_on_hand — silent auto-correction is forbidden". It now delegates to the engine.

describe('planStocktakePost — the two caller shapes are not the same request', () => {
  // ── THE DESTRUCTIVE ONE ──────────────────────────────────────────────────────────────────────
  it('the dashboard shape (counted_qty: null, no outlet) opens a session and counts NOTHING', () => {
    // This exact body used to make every item a "variance", because the old route compared
    // `counted_qty !== system_qty` and the dashboard sends counted_qty: null with no system_qty at
    // all — null !== undefined for every row. The route then ran
    // pos_products.update({ stock_quantity: null }) per product, and since that column is NULLABLE
    // the updates SUCCEEDED: opening a stocktake wiped every tracked product's stock figure.
    const plan = planStocktakePost({
      business_id: 'biz-1',
      name: 'Stocktake 18/08/2026',
      items: [
        { product_id: 'p1', product_name: 'Flat White', expected_qty: 10, counted_qty: null },
        { product_id: 'p2', product_name: 'Croissant', expected_qty: 4, counted_qty: null },
      ],
    })
    expect(plan.action).toBe('open_only')
    expect(plan.linesToCount).toEqual([])
    expect(plan.outletId).toBeNull()
  })

  it('the POS shape (counted lines) counts them and submits', () => {
    const plan = planStocktakePost({
      outlet_id: 'outlet-1',
      items: [
        { product_id: 'p1', system_qty: 10, counted_qty: 8, recount_count: 0 },
        { product_id: 'p2', system_qty: 4, counted_qty: 4, recount_count: 1 },
      ],
    })
    expect(plan.action).toBe('count_and_submit')
    expect(plan.outletId).toBe('outlet-1')
    expect(plan.linesToCount).toEqual([
      { product_id: 'p1', counted_qty: 8 },
      { product_id: 'p2', counted_qty: 4 },
    ])
  })

  it('a zero count is a real count, not a missing one', () => {
    // Counting a shelf and finding nothing is the single most important count to record — it is a
    // total loss. `!counted_qty` would have discarded it.
    const plan = planStocktakePost({ outlet_id: 'o', items: [{ product_id: 'p', counted_qty: 0 }] })
    expect(plan.action).toBe('count_and_submit')
    expect(plan.linesToCount).toEqual([{ product_id: 'p', counted_qty: 0 }])
  })

  it('carries NO client-supplied system_qty or expected_qty through', () => {
    // The engine reads live items_on_hand to establish book stock. If the client's number ever
    // reached the comparison again, a stale tab could manufacture or hide a variance at will.
    const plan = planStocktakePost({
      outlet_id: 'o',
      items: [{ product_id: 'p', system_qty: 9999, expected_qty: 9999, counted_qty: 3 }],
    })
    expect(plan.linesToCount[0]).toEqual({ product_id: 'p', counted_qty: 3 })
    expect(JSON.stringify(plan)).not.toContain('9999')
  })

  it('mixed bodies count only the counted lines', () => {
    const plan = planStocktakePost({
      outlet_id: 'o',
      items: [
        { product_id: 'a', counted_qty: 5 },
        { product_id: 'b', counted_qty: null },
        { product_id: 'c', counted_qty: '' },
        { product_id: 'd', counted_qty: 2 },
      ],
    })
    expect(plan.linesToCount.map(l => l.product_id)).toEqual(['a', 'd'])
  })

  it('is total — a malformed body yields a safe plan instead of throwing', () => {
    // A throw here would surface as a 500 on a route an owner reaches from two surfaces.
    for (const body of [null, undefined, {}, { items: null }, { items: 'nope' }, { items: [null, 7, {}] }]) {
      const plan = planStocktakePost(body)
      expect(plan.action).toBe('open_only')
      expect(plan.linesToCount).toEqual([])
    }
  })

  it('normalises counts to whole, non-negative units', () => {
    const plan = planStocktakePost({
      outlet_id: 'o',
      items: [{ product_id: 'a', counted_qty: -4 }, { product_id: 'b', counted_qty: 2.6 }],
    })
    expect(plan.linesToCount).toEqual([
      { product_id: 'a', counted_qty: 0 },
      { product_id: 'b', counted_qty: 3 },
    ])
  })

  it('ignores rows with no product_id rather than counting a blank', () => {
    const plan = planStocktakePost({ outlet_id: 'o', items: [{ counted_qty: 5 }, { product_id: '', counted_qty: 5 }] })
    expect(plan.linesToCount).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE INVARIANT THIS PHASE EXISTS TO HOLD.
//
// A pure-function test cannot prove "this route does not write stock" — the property is about what
// the route module does NOT contain. This asserts it against the source, which is exactly what goes
// red if someone restores the direct write (the phase's mutation check). It is deliberately narrow:
// it does not care how the route is written, only that book stock is not mutated here and that the
// canonical engine is the thing being called.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('/api/pos/stock-takes must never write stock itself', () => {
  const routeSrc = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'pos', 'stock-takes', 'route.ts'),
    'utf8',
  )
  // Comments explain the removed writes at length; the invariant is about executable code.
  const code = routeSrc
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')

  it('does not assign items_on_hand', () => {
    expect(code).not.toMatch(/items_on_hand\s*:/)
  })

  it('does not assign stock_quantity — the write that silently nulled every product', () => {
    expect(code).not.toMatch(/stock_quantity\s*:/)
  })

  it('does not touch pos_outlet_inventory or pos_products at all', () => {
    expect(code).not.toContain('pos_outlet_inventory')
    expect(code).not.toContain('pos_products')
  })

  it('delegates to the canonical engine instead', () => {
    expect(code).toContain("from '@/lib/inventory/stocktake'")
    expect(code).toContain('openStocktake')
    expect(code).toContain('countStocktakeLine')
    expect(code).toContain('submitStocktake')
  })

  it('no longer writes pos_stock_takes or pos_stock_take_items directly', () => {
    // Second implementations start by "just" inserting the header themselves again.
    expect(code).not.toMatch(/from\(['"]pos_stock_take_items['"]\)/)
    expect(code).not.toMatch(/insert\(\{[^}]*business_id[^}]*outlet_id/)
  })
})
