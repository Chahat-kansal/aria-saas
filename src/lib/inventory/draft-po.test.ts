import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draftTotals } from '@/lib/inventory/buying'

// MS10 PHASES 4/5/6 — DRAFT, DON'T SEND, AND NEVER SUM AN UNKNOWN AS ZERO.
//
// Phase 5's engine already existed (reorderSuggestions → createDraftPO, built for the staff buying
// app) — the fourth time this sprint-series has found the requested feature already present
// (failure pattern #3). What did NOT exist: an owner-side entry (the dashboard's "Order N" button
// had no onClick since the day it was built), and honest totals (createDraftPO summed
// `Number(unit_cost) || 0`, so an unknown cost contributed $0.00 to a stored header total the
// owner is asked to approve).

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

const ROUTE = src('src', 'app', 'api', 'pos', 'inventory', 'reorder', 'route.ts')
const PANEL = src('src', 'components', 'dashboard', 'InventoryReorderPanel.tsx')
const BUYING = src('src', 'lib', 'inventory', 'buying.ts')

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 6 — draftTotals is pure, so the no-fabrication rule is assertable without a database.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('draftTotals — unknown-cost lines are counted, never zeroed into the total', () => {
  it('sums only the priced lines and counts the unpriced ones', () => {
    const t = draftTotals([
      { product_id: 'a', product_name: 'Beans', quantity: 3, unit_cost: 12.5 },
      { product_id: 'b', product_name: 'Milk', quantity: 10, unit_cost: null },
      { product_id: 'c', product_name: 'Cups', quantity: 2, unit_cost: 4.25 },
    ])
    expect(t.priced_total).toBe(46)   // 3×12.50 + 2×4.25 — Milk contributes NOTHING, not $0.00
    expect(t.priced_count).toBe(2)
    expect(t.unpriced_count).toBe(1)
  })

  it('an all-unpriced draft has NO total — null, not $0.00', () => {
    // $0.00 for a draft of unknown-cost lines is a claim, not a measurement. Same rule as
    // variance value (INV-BASELINE-1) and stock value (INV-COST-1).
    const t = draftTotals([
      { product_id: 'a', product_name: 'Beans', quantity: 3, unit_cost: null },
      { product_id: 'b', product_name: 'Milk', quantity: 10, unit_cost: 0 },
    ])
    expect(t.priced_total).toBeNull()
    expect(t.unpriced_count).toBe(2)
  })

  it('zero and negative quantities are ignored, and an empty draft totals 0 with no unpriced', () => {
    const t = draftTotals([{ product_id: 'a', product_name: 'X', quantity: 0, unit_cost: 5 }])
    expect(t).toEqual({ priced_total: 0, priced_count: 0, unpriced_count: 0 })
    expect(draftTotals([])).toEqual({ priced_total: 0, priced_count: 0, unpriced_count: 0 })
  })

  it('cost of 0 is treated as unknown, not free stock', () => {
    // The `cost` column's non-null zero is exactly how the fabrication story started (MS8).
    const t = draftTotals([{ product_id: 'a', product_name: 'X', quantity: 5, unit_cost: 0 }])
    expect(t.priced_total).toBeNull()
    expect(t.unpriced_count).toBe(1)
  })

  it('createDraftPO stores the honest subtotal and discloses unpriced lines in the notes', () => {
    expect(BUYING).toMatch(/const totals = draftTotals\(clean\)/)
    expect(BUYING).not.toMatch(/reduce\(\(s, l\) => s \+ \(Number\(l\.unit_cost\) \|\| 0\)/)
    expect(BUYING).toMatch(/lines have no recorded cost/)
    expect(BUYING).toMatch(/unpriced_lines: totals\.unpriced_count/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 5 — DRAFT, DON'T SEND. The mutation the brief names: "allow a send path → red."
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the owner draft action cannot send, spend, or contact anyone', () => {
  it('the reorder route never touches the send path', () => {
    // approveAndSendPO is the ONLY code path that moves a PO out of draft; it lives behind the
    // money-gated approval in the buying flow. The owner route must not import or call it.
    expect(ROUTE).not.toContain('approveAndSendPO')
  })

  it('the route creates drafts only — no status transition to sent/received appears anywhere', () => {
    expect(ROUTE).not.toMatch(/['"`]sent['"`]/)
    expect(ROUTE).not.toMatch(/status:\s*['"`](?!draft)/)
  })

  it('the route has no outbound comms surface', () => {
    // No SMS/email/webhook from a drafting action: nothing is contacted.
    expect(ROUTE).not.toMatch(/clicksend|sendSms|sendEmail|resend|fetch\(\s*['"`]http/i)
  })

  it('items with no supplier are reported, not silently dropped', () => {
    expect(ROUTE).toMatch(/items_needing_supplier/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PHASE 4 — the dead button. Nothing on the panel may look functional without being so.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the reorder panel has no dead controls', () => {
  it('the per-row "Order N" button is gone', () => {
    expect(PANEL).not.toMatch(/>Order \{r\.suggested_qty\}</)
  })

  it('every button on the panel has an onClick', () => {
    // A <button> with no handler is the exact defect this phase removes. Match each opening
    // <button ...> tag and require onClick inside it.
    const buttons = PANEL.match(/<button[^>]*>/gs) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).toContain('onClick')
  })

  it('the draft action surfaces unpriced lines beside the total — never a bare figure', () => {
    expect(PANEL).toMatch(/unpriced_lines/)
    expect(PANEL).toMatch(/Nothing has been sent/)
  })
})
