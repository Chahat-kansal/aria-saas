import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// MS7 PHASE 1 — a perpetual spot count writes a real ledger line.
//
// submitCount used to insert a pos_stock_takes header with `items_counted: 1` HARDCODED and no
// pos_stock_take_items row behind it. Three shipped June headers still carry that untrue claim.
// Since INV-BASELINE-1 phase 4 the consequence compounded: no ledger line means no
// last_counted_at, so a spot-counted product reads "never counted" forever, stays pinned to the top
// of the ABC cycle rotation, and staff are sent to recount it repeatedly.
//
// The property is structural — "this function no longer writes its own header, and delegates to the
// engine that writes lines" — so it is asserted against the source, the same way phase 1 of
// INV-BASELINE-1 asserted the stocktake route no longer writes stock. A fake-DB behavioural test
// would only re-test the engine, which already has its own suites (last-counted-cache, count-policy).

function code(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')
}

describe('submitCount writes through the canonical engine', () => {
  const src = code('src', 'lib', 'inventory', 'count.ts')

  // ── THE HARDCODED LIE ────────────────────────────────────────────────────────────────────────
  it('no longer hardcodes items_counted', () => {
    // `items_counted: 1` was true only by coincidence and false whenever the write failed. The
    // engine computes it from the lines that actually persisted.
    expect(src).not.toMatch(/items_counted:\s*1/)
  })

  it('no longer inserts its own pos_stock_takes header', () => {
    // A second header writer is how the count system ended up with three implementations.
    expect(src).not.toMatch(/from\(['"]pos_stock_takes['"]\)/)
  })

  it('delegates to the engine that writes ledger lines', () => {
    expect(src).toContain("from '@/lib/inventory/stocktake'")
    expect(src).toContain('openStocktake')
    expect(src).toContain('countStocktakeLine')   // ← this is what writes pos_stock_take_items
    expect(src).toContain('submitStocktake')
  })

  it('opens the session as a PERPETUAL count, not a full one', () => {
    // count_type is CHECK-constrained to full|cycle|perpetual, and the cycle-count cadence reads it.
    // Filing a spot count as 'full' would misreport a one-item count as a whole-outlet stocktake.
    expect(src).toMatch(/'perpetual'/)
  })

  it('refuses to report a count as recorded when the line did not persist', () => {
    // countStocktakeLine returns null on a failed line write. Reporting success there would recreate
    // the exact defect this phase removes — a claim with no row behind it.
    expect(src).toContain('if (!line)')
  })

  it('still never touches items_on_hand', () => {
    // The locked principle, unchanged: a count produces a variance; only an owner accepting a review
    // moves stock. adjustOutletStock stays referenced-but-uncalled as the explicit assertion.
    expect(src).toContain('void adjustOutletStock')
    expect(src).not.toMatch(/adjustOutletStock\(/)
  })

  it('keeps the same-day dedupe BEFORE any write', () => {
    // Preserved from the original (RULE 0). It must run before openStocktake, or every duplicate
    // submit leaves an empty in_progress session behind.
    const dedupeAt = src.indexOf("flag_type', 'count_variance'")
    const openAt = src.indexOf('openStocktake(')
    expect(dedupeAt).toBeGreaterThan(-1)
    expect(openAt).toBeGreaterThan(-1)
    expect(dedupeAt).toBeLessThan(openAt)
  })

  it('no longer files its own review row — the engine decides via the materiality policy', () => {
    // Two review writers would double-file. count-policy routes every staff count to review, which
    // is the same outcome this function always produced, reached through one implementation.
    expect(src).not.toMatch(/from\(['"]inventory_review_queue['"]\)\s*\.insert/)
  })
})

describe('the header writers are down to one', () => {
  it('only the canonical engine inserts a pos_stock_takes header', () => {
    // Sweep, asserted rather than reported: count.ts and stocktake.ts were the two writers; the POS
    // route's own header insert went in INV-BASELINE-1 phase 1.
    // INSERTS only. The POS route legitimately still READS the table for its GET listing — the
    // first version of this assertion forbade any reference and failed on that read, which would
    // have pushed a later edit toward deleting a working list endpoint to make a test pass.
    const inserts = (src: string) => (src.match(/from\(['"]pos_stock_takes['"]\)\s*\.insert/g) ?? []).length
    expect(inserts(code('src', 'lib', 'inventory', 'stocktake.ts'))).toBe(1)
    expect(inserts(code('src', 'lib', 'inventory', 'count.ts'))).toBe(0)
    expect(inserts(code('src', 'app', 'api', 'pos', 'stock-takes', 'route.ts'))).toBe(0)
  })
})
