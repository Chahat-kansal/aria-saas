import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { summariseCostQuality } from '@/lib/inventory/resolve-cost'

// MS11 PHASE 3 — WHAT THE OWNER SEES ABOUT THEIR OWN COSTS.
//
// 72 of 76 active costed products carry cost_price = price × 0.4 to the cent (MCP-verified
// 2026-08-19) and the owner had never been told. The disclosure banner's count MUST come from a
// live query at render time — the number 72 may appear in comments and commit messages, but
// never in shipped code.

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

function fakeSb(rows: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ limit: async () => ({ data: rows }) }),
        }),
      }),
    }),
  } as never
}

describe('summariseCostQuality — the live aggregate', () => {
  it('counts exactly the ×0.4 signatures, not every costed product', async () => {
    const q = await summariseCostQuality(fakeSb([
      { id: 'a', name: 'Latte', price: 5.5, cost_price: 2.2 },      // 5.5×0.4 — derived
      { id: 'b', name: 'Muffin', price: 6.0, cost_price: 2.4 },     // 6.0×0.4 — derived
      { id: 'c', name: 'Cortado', price: 4.5, cost_price: 2.7 },    // real PO figure — NOT ×0.4
      { id: 'd', name: 'Water', price: 3.0, cost_price: null },     // no cost at all
    ]), 'biz')
    expect(q.active_products).toBe(4)
    expect(q.active_costed).toBe(3)
    expect(q.derived_count).toBe(2)
    expect(q.no_cost_count).toBe(1)
    expect(q.derived.map(d => d.name)).toEqual(['Muffin', 'Latte']) // sorted by price desc
  })

  it('an honest catalogue produces a zero count — the banner has a true empty state', async () => {
    const q = await summariseCostQuality(fakeSb([
      { id: 'a', name: 'Latte', price: 5.5, cost_price: 2.35 },
    ]), 'biz')
    expect(q.derived_count).toBe(0)
  })
})

describe('the count is live, never hardcoded', () => {
  it('neither the panel nor the route ships the number 72', () => {
    // 72 is today's LIVE count. If it ever appears as a literal in the surface, the disclosure
    // has been frozen against the database it claims to describe.
    const panel = src('src', 'components', 'dashboard', 'InventoryValuePanel.tsx')
    const route = src('src', 'app', 'api', 'pos', 'inventory', 'cost', 'route.ts')
    for (const code of [panel, route]) {
      const stripped = code.split('\n').filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n')
      expect(stripped).not.toMatch(/\b72\b/)
    }
  })

  it('the panel renders the count from the API payload', () => {
    const panel = src('src', 'components', 'dashboard', 'InventoryValuePanel.tsx')
    expect(panel).toMatch(/cq\.derived_count/)
    expect(panel).toMatch(/summariseCostQuality|cost_quality/)
  })

  it('the route computes the aggregate per request', () => {
    const route = src('src', 'app', 'api', 'pos', 'inventory', 'cost', 'route.ts')
    expect(route).toMatch(/summariseCostQuality\(supabaseAdmin, bid\)/)
    expect(route).toMatch(/cost_quality: costQuality/)
  })
})
