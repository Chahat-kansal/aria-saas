import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// MS9 PHASE 6 — the honest empty state.
//
// Sip's live data: one completed sale since mid-July, max velocity 0.07 units/day, most products
// never sold. The "what runs out this week" list is therefore legitimately empty — and there are
// two completely different reasons a list like that can be empty:
//
//   "everything is above its reorder point"   ← a verified all-clear
//   "we do not have the data to tell you"     ← an absence of evidence
//
// The panel used to show the first message for both. For a business with no usable history that is
// a false all-clear built on nothing, which is the same fabricated-confidence failure GROUNDING-
// TEETH exists to stop — just in prose instead of a number.

const PANEL = readFileSync(join(process.cwd(), 'src', 'components', 'dashboard', 'InventoryReorderPanel.tsx'), 'utf8')

describe('the two empty states are distinct', () => {
  it('an unforecastable business is told the truth, not given an all-clear', () => {
    expect(PANEL).toContain('Not enough sales history to forecast yet')
    // Gated on forecastable === 0, not on the list merely being empty.
    expect(PANEL).toMatch(/below\.length === 0 && forecastable === 0/)
  })

  it('the genuine all-clear still exists for businesses with real history', () => {
    expect(PANEL).toContain('Everything is above its reorder point')
  })

  it('forecastable requires history AND velocity — never-sold products cannot vouch', () => {
    expect(PANEL).toMatch(/!r\.no_history && r\.units_per_day > 0/)
  })
})

describe('the empty state is actionable, not decorative', () => {
  it('says what fills it (selling), and what helps (a stocktake)', () => {
    expect(PANEL).toMatch(/sell through the till/i)
    expect(PANEL).toMatch(/stocktake/i)
  })

  it('says nothing is broken — an empty forecast is not an error state', () => {
    expect(PANEL).toMatch(/Nothing is broken/i)
  })

  it('counts the never-sold products instead of hiding them', () => {
    expect(PANEL).toContain('neverSold')
  })
})
