import { describe, it, expect } from 'vitest'
import {
  computeItemImpact,
  recoveryPct,
  isCostUsableForMargin,
  type ItemInput,
} from './item-card-impact'
import type { ResolvedCost } from '@/lib/inventory/resolve-cost'

/**
 * M14 PHASE 2 — THE MARGIN HIT, PER ITEM.
 *
 * ⚠️ Every assertion calls the engine. Nothing here reads a source file.
 *
 * The point these tests defend: **Sip's 72 recorded costs are all exactly `price × 0.4`**, and an
 * engine that read the column would have produced 72 confident, fabricated margins. Margin is
 * `not_connected` for those; the recovery figure — which is the number the owner actually needs —
 * is fully grounded without any cost at all.
 */
const catalogueCost = (cost: number): ResolvedCost => ({ cost, source: 'catalogue', grounding: 'estimated' })
const realCost = (cost: number): ResolvedCost => ({ cost, source: 'outlet', grounding: 'verified' })

/** A Sip-shaped product: cost is exactly 40% of price, as all 72 of them are. */
const sipItem = (name: string, price: number, units: number | null = 10): ItemInput =>
  ({ id: name, name, price, units_sold: units, resolved_cost: catalogueCost(price * 0.4) })

describe('M14 phase 2 · the recovery figure needs no cost data at all', () => {
  it('a 1.5% surcharge on an 88% card venue is a 1.32% hole, and a 1.32% rise fills it', () => {
    expect(recoveryPct(1.5, 88)).toBe(1.32)
    expect(recoveryPct(2, 100)).toBe(2)
    expect(recoveryPct(1.5, 50)).toBe(0.75)
  })

  it('a venue that does not surcharge needs no rise, and that is 0 rather than unknown', () => {
    // Sip. Nothing is taken away, so nothing has to be recovered — a real zero, not a missing value.
    expect(recoveryPct(0, 88.2)).toBe(0)
  })

  it('an unknown surcharge or card share yields null — never a default', () => {
    expect(recoveryPct(null, 88)).toBeNull()
    expect(recoveryPct(1.5, null)).toBeNull()
    expect(recoveryPct(null, null)).toBeNull()
  })

  it('the per-item recovering price is the rise applied to that item, to the cent', () => {
    const r = computeItemImpact({
      items: [sipItem('Flat White', 5.0, 100), sipItem('Toastie', 12.5, 20)],
      surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified',
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.recovery_pct).toBe(1.32)
    const fw = r.data.items.find(i => i.name === 'Flat White')!
    expect(fw.recovering_price).toBe(5.07)          // 5.00 × 1.0132
    expect(fw.revenue).toBe(500)
    expect(fw.surcharge_revenue_lost).toBe(6.6)     // 500 × 1.32%
    const t = r.data.items.find(i => i.name === 'Toastie')!
    expect(t.recovering_price).toBe(12.67)
    expect(r.data.total_surcharge_lost).toBe(9.9)   // 6.60 + 3.30
  })
})

describe('M14 phase 2 · ⚠️ a fabricated cost buys no margin claim', () => {
  it('a catalogue cost that is exactly 40% of price is NOT usable', () => {
    expect(isCostUsableForMargin(5.0, catalogueCost(2.0))).toBe(false)
    expect(isCostUsableForMargin(12.5, catalogueCost(5.0))).toBe(false)
  })

  it('a real recorded cost IS usable, even at 40%', () => {
    // The tier is what matters, not the ratio: an outlet-recorded cost that happens to sit at 40%
    // is a measured number and earns a margin.
    expect(isCostUsableForMargin(5.0, realCost(2.0))).toBe(true)
    // And a catalogue cost that does NOT match the signature is a genuine estimate, so it counts.
    expect(isCostUsableForMargin(6.0, catalogueCost(2.5))).toBe(true)   // 41.7%, Apple Juice's real one
  })

  it('no cost, zero cost and a negative cost are all "not usable", not "free"', () => {
    expect(isCostUsableForMargin(5, null)).toBe(false)
    expect(isCostUsableForMargin(5, { cost: null, source: 'unknown', grounding: null })).toBe(false)
    expect(isCostUsableForMargin(5, realCost(0))).toBe(false)
    expect(isCostUsableForMargin(5, realCost(-1))).toBe(false)
  })

  it('SIP-SHAPED: every margin comes back null and not_connected, and says why', () => {
    const r = computeItemImpact({
      items: [sipItem('Flat White', 5.0), sipItem('Latte', 5.5), sipItem('Toastie', 12.5)],
      surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'estimated',
    })
    if (!r.ok) throw new Error(r.reason)
    for (const i of r.data.items) {
      expect(i.margin_dollars, i.name).toBeNull()
      expect(i.margin_tier, i.name).toBe('not_connected')
      expect(i.cost_note).toContain('back-calculated')
    }
    expect(r.data.cost_quality).toEqual({ total: 3, usable: 0, back_calculated: 3, missing: 0 })
    expect(r.data.unknowns.join(' ')).toContain('3 of 3 products have a cost that is exactly 40% of the price')
    // ⚠️ And the recovery figure survives regardless — that is the whole point.
    expect(r.data.recovery_pct).toBe(1.32)
  })

  it('⚠️ MUTATION — reading cost_price directly is exactly what goes red', () => {
    // The engine a naive implementation would have written: trust the column, compute the margin.
    const items = [sipItem('Flat White', 5.0), sipItem('Toastie', 12.5)]
    const naive = items.map(i => ({ name: i.name, margin: i.price - (i.resolved_cost!.cost as number) }))
    expect(naive).toEqual([{ name: 'Flat White', margin: 3 }, { name: 'Toastie', margin: 7.5 }])

    const r = computeItemImpact({ items, surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified' })
    if (!r.ok) throw new Error(r.reason)
    const honest = r.data.items.map(i => ({ name: i.name, margin: i.margin_dollars }))
    expect(honest).toEqual([{ name: 'Flat White', margin: null }, { name: 'Toastie', margin: null }])
    // Two confident numbers against two honest nulls. That is the finding, in one assertion.
    expect(honest).not.toEqual(naive)
  })

  it('a real cost DOES produce a margin, so the rail is not simply always-null', () => {
    const r = computeItemImpact({
      items: [{ id: 'a', name: 'Beans 1kg', price: 30, units_sold: 4, resolved_cost: realCost(18) }],
      surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified',
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.items[0].margin_dollars).toBe(12)
    expect(r.data.items[0].margin_tier).toBe('verified')
    expect(r.data.items[0].cost_note).toBe('from your recorded outlet cost')
    expect(r.data.cost_quality).toEqual({ total: 1, usable: 1, back_calculated: 0, missing: 0 })
  })
})

describe('M14 phase 2 · it renders honestly on thin data', () => {
  it('an item with no sales gets a null revenue, not a zero', () => {
    const r = computeItemImpact({
      items: [sipItem('Never Sold', 4.0, null)],
      surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified',
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.items[0].revenue).toBeNull()
    expect(r.data.items[0].revenue_tier).toBe('not_connected')
    expect(r.data.items[0].surcharge_revenue_lost).toBeNull()
    // But the recovering PRICE is still computable — it needs no sales at all.
    expect(r.data.items[0].recovering_price).toBe(4.05)
  })

  it('zero units sold is a real answer and reads as zero revenue, not unknown', () => {
    const r = computeItemImpact({
      items: [sipItem('Slow Mover', 4.0, 0)],
      surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified',
    })
    if (!r.ok) throw new Error(r.reason)
    expect(r.data.items[0].revenue).toBe(0)
    expect(r.data.items[0].revenue_tier).toBe('verified')
  })

  it('no products at all is InsufficientData, and says nothing is hidden', () => {
    const r = computeItemImpact({ items: [], surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified' })
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected insufficient')
    expect(r.reason).toContain('nothing to price')
  })

  it('the recovery tier is inherited from the card share, never invented', () => {
    const est = computeItemImpact({ items: [sipItem('x', 5)], surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'estimated' })
    if (!est.ok) throw new Error(est.reason)
    expect(est.data.recovery_tier).toBe('estimated')

    const none = computeItemImpact({ items: [sipItem('x', 5)], surcharge_pct: 1.5, card_share_pct: null, card_share_tier: 'not_connected' })
    if (!none.ok) throw new Error(none.reason)
    expect(none.data.recovery_tier).toBe('not_connected')
    expect(none.data.items[0].recovering_price).toBeNull()
  })

  it('ANTI-VACUITY — the engine returns different answers for different venues', () => {
    const surcharging = computeItemImpact({ items: [sipItem('x', 5)], surcharge_pct: 1.5, card_share_pct: 88, card_share_tier: 'verified' })
    const notSurcharging = computeItemImpact({ items: [sipItem('x', 5)], surcharge_pct: 0, card_share_pct: 88.2, card_share_tier: 'estimated' })
    if (!surcharging.ok || !notSurcharging.ok) throw new Error('expected both ok')
    expect(surcharging.data.recovery_pct).toBe(1.32)
    expect(notSurcharging.data.recovery_pct).toBe(0)
    expect(notSurcharging.data.items[0].recovering_price).toBe(5)   // unchanged, because nothing is lost
    expect(surcharging.data.items[0].recovering_price).not.toBe(notSurcharging.data.items[0].recovering_price)
  })
})
