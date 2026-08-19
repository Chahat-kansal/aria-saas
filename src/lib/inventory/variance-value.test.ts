import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { varianceValueCents, totalVarianceValue } from '@/lib/inventory/variance-value'

// INV-BASELINE-1 PHASE 3 — the cents bug.
//
// total_variance_cents was being fed a QUANTITY (phase 1 removed that), and where a cost genuinely
// could not be resolved every caller flattened resolve-cost.ts's honest NULL to 0. Both produce a
// number in a money column that nobody measured. GROUNDING-TEETH: "an honest unknown beats a
// plausible number."

describe('varianceValueCents — a null cost can never become a number', () => {
  it('returns null when the cost is unknown, for every shape of unknown', () => {
    for (const cost of [null, undefined, NaN]) {
      expect(varianceValueCents(-7, cost as number | null)).toBeNull()
    }
  })

  it('values a variance when the cost IS known', () => {
    expect(varianceValueCents(-7, 1.6)).toBe(-1120)   // 7 short at $1.60
    expect(varianceValueCents(3, 9.6)).toBe(2880)     // 3 over at $9.60
  })

  it('keeps the sign — a shortfall and a surplus are not the same event', () => {
    expect(varianceValueCents(-2, 5)).toBeLessThan(0)
    expect(varianceValueCents(2, 5)).toBeGreaterThan(0)
  })

  it('a genuine zero cost is still a KNOWN value of zero', () => {
    // resolve-cost.ts only returns a cost when it is > 0, so this is defensive rather than live —
    // but "the cost is 0" and "there is no cost" must not converge again here of all places.
    expect(varianceValueCents(-4, 0)).toBe(0)
    expect(varianceValueCents(-4, 0)).not.toBeNull()
  })
})

describe('totalVarianceValue — unknowns are excluded, never added as zero', () => {
  it('sums only what is priced and counts the rest', () => {
    const t = totalVarianceValue([-1120, null, 2880, null])
    expect(t.knownCents).toBe(1760)
    expect(t.unknownLines).toBe(2)
    expect(t.totalCents).toBe(1760)
  })

  // ── THE ONE THAT MATTERS ─────────────────────────────────────────────────────────────────────
  it('returns NULL — not 0 — when nothing could be priced', () => {
    // This is the case that reached an owner's shrinkage panel as "$0.00" and an AI action as
    // priority 'routine'. Both read as "nothing to worry about", asserted from an absence of data.
    const t = totalVarianceValue([null, null, null])
    expect(t.totalCents).toBeNull()
    expect(t.totalCents).not.toBe(0)
    expect(t.unknownLines).toBe(3)
  })

  it('an empty set totals 0, not unknown — there was nothing to value', () => {
    // A count with no variances legitimately cost nothing. Only lines that EXIST and cannot be
    // priced make the total unknown.
    expect(totalVarianceValue([]).totalCents).toBe(0)
  })

  it('a real zero among unknowns still counts as known', () => {
    const t = totalVarianceValue([0, null])
    expect(t.totalCents).toBe(0)
    expect(t.unknownLines).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INVARIANTS AGAINST THE SOURCE. The flattening bug was a one-token default (`= 0`, `?? 0`) in four
// separate files; a pure test cannot prove it has not come back. These assert it has not.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
function code(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')
}

describe('no caller re-flattens an unknown cost to zero', () => {
  it('stocktake.ts initialises variance value as null', () => {
    const src = code('src', 'lib', 'inventory', 'stocktake.ts')
    expect(src).toContain('let varianceCents: number | null = null')
    expect(src).not.toContain('let varianceCents = 0')
  })

  // CHANGED BY MS7 PHASE 1 — the assertion moved because the responsibility moved.
  //
  // This used to require `count.ts` to initialise its own varianceCents to null. count.ts no longer
  // computes a variance value at all: a perpetual spot count now goes through countStocktakeLine,
  // so the engine prices the line and count.ts has no cost lookup left to get wrong. Asserting the
  // old shape would have forced a dead local variable back into the file to keep a test green.
  //
  // The invariant itself is unchanged and is now asserted where it lives (the stocktake.ts case
  // above). What is asserted HERE is the stronger property: count.ts cannot re-flatten an unknown
  // cost, because it no longer resolves costs.
  it('count.ts no longer computes a variance value at all — the engine does', () => {
    const src = code('src', 'lib', 'inventory', 'count.ts')
    expect(src).not.toContain('let varianceCents = 0')
    expect(src).not.toContain('resolveCostFor')
    expect(src).toContain('countStocktakeLine')
  })

  it('stocktake-intelligence resolves cost through resolveCostFor, not cost_price ?? 0', () => {
    const src = code('src', 'app', 'api', 'aria', 'stocktake-intelligence', 'route.ts')
    expect(src).toContain('resolveCostFor')
    // The bypass: only tier 5 of a five-tier chain, with a fabricating default.
    expect(src).not.toContain('prod?.cost_price ?? 0')
  })

  it('the POS stocktake page no longer computes a client-side cents figure from quantities', () => {
    const src = code('src', 'app', 'pos', 'inventory', 'stocktake', 'new', 'page.tsx')
    expect(src).not.toContain('total_variance_cents')
  })
})
