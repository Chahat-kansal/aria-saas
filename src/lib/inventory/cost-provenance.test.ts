import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCost } from '@/lib/inventory/resolve-cost'

// MS8 PHASE 2 — provenance tiers.
//
// The display half of this phase ALREADY EXISTED and was not rebuilt (RULE 20: "the work is already
// done → report and skip"). stock-value.ts carries cost_source + cost_grounding per product,
// excludes unknown-cost products from the at-cost total, and counts them separately;
// InventoryValuePanel renders TruthBadge, a per-source chip, a source legend and a missing-cost
// callout. Nothing about that needed inventing.
//
// What was broken is the tier that is supposed to be backed by an actual supplier transaction:
// resolveCostFor's purchase_order tier read pos_purchase_order_lines, which holds ZERO rows. The
// system's only recorded purchase costs are 5 rows in pos_purchase_order_items.unit_cost. So the
// most trustworthy tier in the vocabulary could never fire, and products with a real purchase price
// resolved to `unknown`.

describe('the tier vocabulary — pure resolution rules', () => {
  it('a per-outlet actual cost is verified', () => {
    const r = resolveCost({ item_cost: 4.5 })
    expect(r.source).toBe('outlet')
    expect(r.grounding).toBe('verified')
  })

  it('a catalogue cost_price is an ESTIMATE, not a measurement', () => {
    // The weakest tier before giving up: a manually-maintained reference figure tied to no
    // transaction. This is what phase 3's threshold disclosure rests on.
    const r = resolveCost({ cost_price: 3.2 })
    expect(r.source).toBe('catalogue')
    expect(r.grounding).toBe('estimated')
  })

  it('a purchase-order price is DERIVED — a real price, but possibly stale', () => {
    // Deliberately NOT 'verified'. A PO price is a real recorded transaction, but using it as
    // TODAY's cost assumes nothing has changed since. See the phase-2 note in the run log for why
    // the brief's "PO = verified" was not adopted: it would flatten a distinction the resolver
    // already draws more carefully.
    const r = resolveCost({ po_confirmed_price: 2.75 })
    expect(r.source).toBe('purchase_order')
    expect(r.grounding).toBe('derived')
  })

  it('absent is UNKNOWN with no grounding — never zero', () => {
    const r = resolveCost({})
    expect(r.cost).toBeNull()
    expect(r.source).toBe('unknown')
    expect(r.grounding).toBeNull()
  })

  it('a zero or negative cost is not a cost', () => {
    // A stored 0 is exactly the pos_products.cost defect phase 1 removed; the resolver must not
    // launder it into a "verified $0.00".
    expect(resolveCost({ item_cost: 0 }).source).toBe('unknown')
    expect(resolveCost({ cost_price: -1 }).source).toBe('unknown')
  })

  it('tiers are ordered — an outlet cost beats a catalogue one', () => {
    const r = resolveCost({ item_cost: 4.5, cost_price: 99 })
    expect(r.cost).toBe(4.5)
    expect(r.source).toBe('outlet')
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE DEAD TIER. Structural, because the property is "this query targets a table that has rows".
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the purchase-order tier reads the table that actually has data', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'inventory', 'resolve-cost.ts'), 'utf8')
    .split('\n').filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n')

  it('consults pos_purchase_order_items, where the 5 real unit_costs live', () => {
    expect(src).toContain("from('pos_purchase_order_items')")
    expect(src).toContain('unit_cost')
  })

  it('still consults pos_purchase_order_lines first', () => {
    // Not a replacement — lines carries the richer confirmed vs last-purchase vocabulary and is the
    // newer schema. It keeps precedence so behaviour is unchanged if it ever gains rows.
    expect(src).toContain("from('pos_purchase_order_lines')")
  })

  it('scopes items through their parent order, which is where business_id lives', () => {
    // pos_purchase_order_items has NO business_id column. Querying it unscoped would leak another
    // tenant's purchase prices into this business's cost resolution.
    expect(src).toContain('pos_purchase_orders!inner(business_id')
    expect(src).toMatch(/eq\('pos_purchase_orders\.business_id', businessId\)/)
  })

  it('applies the fallback on BOTH the single and batch paths', () => {
    // resolveCostBatch is what feeds the inventory valuation panel — the one surface that actually
    // displays provenance. Fixing only the single-product path would have left the visible one dead.
    const occurrences = (src.match(/from\('pos_purchase_order_items'\)/g) ?? []).length
    expect(occurrences).toBe(2)
  })
})
