import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { packConversion, toBaseUnits, fromBaseUnits, applyPackSizeChange } from '@/lib/inventory/uom'

// MS11 PHASES 4–6 — THE BASE-UNIT MODEL. Stock/cost/recipes in base units; packs are a boundary
// conversion; a pack-size change can only ever write the two pack columns; a missing or
// ambiguous factor is REFUSED with a reason, never guessed.

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 4 — the model round-trips
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('base-unit round trip', () => {
  const carton = packConversion({ name: 'Sparkling Water', unit: 'each', purchase_uom: 'carton', purchase_uom_qty: 24 })

  it('a purchase in packs becomes base units on the way in', () => {
    expect(carton.ok).toBe(true)
    const inbound = toBaseUnits(2, carton)
    expect(inbound).toEqual({ ok: true, base_qty: 48 })
  })

  it('and the stored base figure converts back for display without being rewritten', () => {
    const shown = fromBaseUnits(48, carton)
    expect(shown).toEqual({ ok: true, packs: 2 })
  })

  it('numeric-string factors from the DB are accepted (Supabase returns numerics as strings)', () => {
    const conv = packConversion({ name: 'Beans', unit: 'each', purchase_uom: 'case', purchase_uom_qty: '12' })
    expect(conv.ok).toBe(true)
    if (conv.ok) expect(conv.factor).toBe(12)
  })
})

describe('one factor, not three', () => {
  it('the replenishment agent no longer reads the tombstoned items_per_case columns', () => {
    const repl = readFileSync(join(process.cwd(), 'src', 'lib', 'inventory', 'replenishment-agent.ts'), 'utf8')
    const code = repl.split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n')
    expect(code).not.toContain('items_per_case')
    expect(code).toContain('packConversion')
  })

  it('uom.ts records every tombstone by name', () => {
    const uom = readFileSync(join(process.cwd(), 'src', 'lib', 'inventory', 'uom.ts'), 'utf8')
    for (const col of ['items_per_case', 'case_quantity', 'cases_in_stock', 'sell_uom', 'warehouse_uom']) {
      expect(uom).toContain(col)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 5 — a pack-size change cannot rewrite history
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('applyPackSizeChange writes the two pack columns and NOTHING else', () => {
  it('the patch contains exactly purchase_uom and purchase_uom_qty', () => {
    const r = applyPackSizeChange('case', 24)
    expect(r.ok).toBe(true)
    if (r.ok) {
      // THE mutation target: if a change ever "propagates backwards" it must add stock/cost keys
      // to this patch — and this assertion goes red.
      expect(Object.keys(r.patch).sort()).toEqual(['purchase_uom', 'purchase_uom_qty'])
      expect(r.patch).toEqual({ purchase_uom: 'case', purchase_uom_qty: 24 })
    }
  })

  it('the route action writes only the returned patch — no stock or cost column appears in the write', () => {
    const route = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'products', '[id]', 'route.ts'), 'utf8')
    const i = route.indexOf("action === 'pack_size_change'")
    expect(i).toBeGreaterThan(-1)
    const block = route.slice(i, route.indexOf('Legacy fallback', i))
    // The ONLY update in the block spreads change.patch; stock/cost fields never appear in a write.
    expect(block).toMatch(/\.update\(\{ \.\.\.change\.patch, updated_at/)
    expect(block).not.toMatch(/update\([^)]*stock_quantity/)
    expect(block).not.toMatch(/update\([^)]*items_on_hand/)
    expect(block).not.toMatch(/update\([^)]*cost_price/)
    // Nothing pre-ticked: without apply === true the action returns before any write.
    expect(block).toMatch(/if \(body\.apply !== true\) return/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 6 — refuse, don't guess
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('conversion refusals name the product and the gap', () => {
  it("today's live shape — qty with no unit (all 106 rows) — refuses with a reason, not a number", () => {
    const conv = packConversion({ name: 'Flat White', unit: 'each', purchase_uom: null, purchase_uom_qty: '1' })
    expect(conv.ok).toBe(false)
    if (!conv.ok) {
      expect(conv.reason).toContain('Flat White')
      expect(conv.reason).toContain('purchase_uom is empty')
    }
  })

  it('a unit with no quantity refuses — never defaults to 1', () => {
    const conv = packConversion({ name: 'Beans', unit: 'each', purchase_uom: 'case', purchase_uom_qty: null })
    expect(conv.ok).toBe(false)
    if (!conv.ok) expect(conv.reason).toContain('Never defaulted to 1')
  })

  it('a factor is never inferred from a product name', () => {
    // '24pk' in the name is NOT a conversion factor.
    const conv = packConversion({ name: 'Sparkling Water 24pk', unit: 'each', purchase_uom: 'carton', purchase_uom_qty: null })
    expect(conv.ok).toBe(false)
  })

  it('zero, negative and non-numeric factors refuse', () => {
    for (const bad of [0, -6, 'a dozen', NaN]) {
      const conv = packConversion({ name: 'X', unit: 'each', purchase_uom: 'case', purchase_uom_qty: bad as never })
      expect(conv.ok).toBe(false)
    }
  })

  it('a missing base unit refuses before the pack is even considered', () => {
    const conv = packConversion({ name: 'Mystery', unit: '', purchase_uom: 'case', purchase_uom_qty: 24 })
    expect(conv.ok).toBe(false)
    if (!conv.ok) expect(conv.reason).toContain('no base unit')
  })

  it('refusals pass through the boundary helpers — no partial conversion', () => {
    const refused = packConversion({ name: 'X', unit: 'each', purchase_uom: null, purchase_uom_qty: 1 })
    expect(toBaseUnits(2, refused).ok).toBe(false)
    expect(fromBaseUnits(48, refused).ok).toBe(false)
  })

  it('applyPackSizeChange refuses an empty unit or non-positive quantity', () => {
    expect(applyPackSizeChange('', 24).ok).toBe(false)
    expect(applyPackSizeChange('case', 0).ok).toBe(false)
    expect(applyPackSizeChange('case', 'lots').ok).toBe(false)
  })
})
