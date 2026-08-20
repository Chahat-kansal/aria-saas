import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COST_SOURCE_LABEL, resolveCost, type CostSource } from '@/lib/inventory/resolve-cost'

// MS9 PHASE 2 — every cost-derived figure carries its tier, in the owner's words.
//
// The vocabulary lives in ONE exported map beside the tiers themselves, because the previous
// arrangement — InventoryValuePanel keeping a private copy — is how 'purchase_order' went missing
// from the display layer entirely. The moment phase 1 let a PO price win, any row rendering that
// source would have crashed the panel on `undefined.label`. A private copy of a vocabulary is a
// crash with a delay on it.

const ALL_SOURCES: CostSource[] = ['outlet', 'last_delivery', 'purchase_order', 'catalogue', 'unknown']

describe('one label per tier, all tiers covered', () => {
  it('every source has an owner phrase — a missing tier is the crash phase 1 armed', () => {
    for (const s of ALL_SOURCES) {
      expect(COST_SOURCE_LABEL[s], s).toBeTruthy()
      expect(typeof COST_SOURCE_LABEL[s]).toBe('string')
    }
  })

  // ── THE POINT OF THE PHASE ───────────────────────────────────────────────────────────────────
  it('the labels are DISTINCT — collapsing them removes the information', () => {
    // "How much should I trust this number" is the differentiator. Five tiers with one label is
    // zero tiers.
    const labels = ALL_SOURCES.map(s => COST_SOURCE_LABEL[s])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('the same product reads differently with and without a PO cost', () => {
    // The brief's verify criterion, end to end through the resolver: identical catalogue data,
    // presence/absence of a recorded transaction, different label.
    const withPo = resolveCost({ po_confirmed_price: 2.70, cost_price: 1.80 })
    const withoutPo = resolveCost({ cost_price: 1.80 })
    expect(COST_SOURCE_LABEL[withPo.source]).toBe('from your purchase order')
    expect(COST_SOURCE_LABEL[withoutPo.source]).toBe('estimated from your catalogue')
    expect(COST_SOURCE_LABEL[withPo.source]).not.toBe(COST_SOURCE_LABEL[withoutPo.source])
  })

  it('an estimate SAYS it is an estimate; a recording does not', () => {
    expect(COST_SOURCE_LABEL.catalogue).toMatch(/estimated/i)
    expect(COST_SOURCE_LABEL.purchase_order).not.toMatch(/estimated/i)
    expect(COST_SOURCE_LABEL.unknown).toMatch(/no cost/i)
  })
})

describe('the display layer uses the shared vocabulary', () => {
  it('InventoryValuePanel imports the labels and covers purchase_order', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'components', 'dashboard', 'InventoryValuePanel.tsx'), 'utf8')
    expect(src).toContain("import { COST_SOURCE_LABEL } from '@/lib/inventory/resolve-cost'")
    expect(src).toContain('purchase_order')
    // The private label strings the shared map replaced must not linger as a second copy.
    expect(src).not.toContain("label: 'Outlet'")
    expect(src).not.toContain("label: 'Catalogue'")
  })

  it('the staff scan card shows the phrase, not the raw enum', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'inventory', '[slug]', 'page.tsx'), 'utf8')
    expect(src).toContain('COST_SOURCE_LABEL[scanResult.cost_source')
    expect(src).not.toContain('cost basis · {scanResult.cost_source}')
  })
})
