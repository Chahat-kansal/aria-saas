import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { countStocktakeLine } from '@/lib/inventory/stocktake'

// INV-BASELINE-1 PHASE 4 — the cache must never drift from the ledger.
//
// SOURCE OF TRUTH: pos_stock_take_items.counted_at (per session, per product, attributed).
// CACHE:           pos_outlet_inventory.last_counted_at = max(counted_at) for that product+outlet.
//
// The cache existed before this phase with ONE writer (the auto-correcting route deleted in phase 1)
// and ZERO readers, while the cycle list re-derived the same fact from a 10,000-row join. Now the
// cycle list reads the cache and the engine maintains it. That is a second copy of a fact, and the
// only thing standing between "cheap" and "wrong" is that they are written together — so this file
// asserts they are, and fails loudly if a future edit separates them.

type Row = Record<string, unknown>

/** Records every write, and serves the reads countStocktakeLine makes, in call order. */
function fakeDb(opts: { session: Row; inventory: Row | null; existingLine: Row | null }) {
  const writes: Array<{ table: string; op: string; values: Row }> = []

  const chain = (rows: Row[]) => {
    const b = {
      select: () => chain(rows),
      eq: () => chain(rows),
      is: () => chain(rows),
      not: () => chain(rows),
      order: () => chain(rows),
      limit: () => chain(rows),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: undefined as unknown,
    }
    return b
  }

  const db = {
    from(table: string) {
      const reads: Record<string, Row[]> = {
        pos_stock_takes: [opts.session],
        pos_outlet_inventory: opts.inventory ? [opts.inventory] : [],
        pos_products: [{ name: 'Flat White' }],
        pos_stock_take_items: opts.existingLine ? [opts.existingLine] : [],
      }
      return {
        ...chain(reads[table] ?? []),
        insert: (values: Row) => {
          writes.push({ table, op: 'insert', values })
          return { select: () => chain([]), then: (r: (v: unknown) => void) => r({ error: null }) }
        },
        update: (values: Row) => {
          writes.push({ table, op: 'update', values })
          const res = { error: null }
          const eqChain = { eq: () => eqChain, then: (r: (v: unknown) => void) => r(res) }
          return eqChain
        },
      }
    },
  }
  return { db, writes }
}

const SESSION = { outlet_id: 'outlet-1', status: 'in_progress' }

async function countOnce(existingLine: Row | null = null) {
  const f = fakeDb({ session: SESSION, inventory: { items_on_hand: 10 }, existingLine })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const line = await countStocktakeLine(f.db as any, 'biz-1', 'sess-1', 'prod-1', 7, 'staff-1')
  const ledger = f.writes.find(w => w.table === 'pos_stock_take_items')
  const cache = f.writes.find(w => w.table === 'pos_outlet_inventory')
  return { line, ledger, cache, writes: f.writes }
}

describe('last_counted_at cache tracks the ledger exactly', () => {
  it('a counted line writes BOTH the ledger row and the cache', () => {
    return countOnce().then(({ ledger, cache }) => {
      expect(ledger, 'ledger row must be written').toBeTruthy()
      expect(cache, 'cache must be refreshed in the same operation').toBeTruthy()
      expect(cache!.values.last_counted_at).toBeTruthy()
    })
  })

  // ── THE DRIFT ASSERTION ──────────────────────────────────────────────────────────────────────
  it('the cache value EQUALS the ledger counted_at — not merely close to it', () => {
    // The failure this prevents is subtle: two separate nowIso() calls produce timestamps that
    // differ by a millisecond, so max(counted_at) and the cache disagree forever after. Equality,
    // not proximity, is the invariant — the engine reuses one value for both writes.
    return countOnce().then(({ ledger, cache }) => {
      expect(cache!.values.last_counted_at).toBe(ledger!.values.counted_at)
    })
  })

  it('the returned line reports the same instant it stored', () => {
    return countOnce().then(({ line, ledger }) => {
      expect(line!.counted_at).toBe(ledger!.values.counted_at)
    })
  })

  it('a RECOUNT moves both together', () => {
    // Recount overwrites the line rather than adding one, so max(counted_at) becomes the new value
    // and the cache must follow it in the same write.
    return countOnce({ id: 'line-1', recount_count: 0 }).then(({ ledger, cache }) => {
      expect(ledger!.op).toBe('update')
      expect(ledger!.values.recount_count).toBe(1)
      expect(cache!.values.last_counted_at).toBe(ledger!.values.counted_at)
    })
  })

  it('never touches items_on_hand while caching — a count still does not move stock', () => {
    // The cache lives on the same row as book stock. Writing the timestamp must not become a
    // backdoor for the auto-correction phase 1 removed.
    return countOnce().then(({ cache }) => {
      expect(Object.keys(cache!.values)).toEqual(['last_counted_at'])
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Structural invariants — the parts a fake DB cannot observe.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('cache and ledger cannot be separated by a later edit', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'inventory', 'stocktake.ts'), 'utf8')
  const code = src.split('\n')
    .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')

  // ⚠ THIS IS THE PRIMARY DETECTOR FOR DRIFT, NOT A BELT-AND-BRACES DUPLICATE OF THE EQUALITY
  // TEST ABOVE. Do not delete it as redundant.
  //
  // Measured during the phase-4 mutation check: replacing `last_counted_at: countedAt` with a
  // second `nowIso()` call — the exact drift bug — was caught by the behavioural equality assertion
  // in only 1 of 3 runs, because two nowIso() calls separated by a few microtasks usually land in
  // the SAME millisecond and compare equal by luck. This structural assertion caught it 3 of 3.
  //
  // Millisecond-resolution timestamps make "did these two writes share one value?" behaviourally
  // undetectable most of the time. The property is about the code, so it is asserted about the code.
  it('one timestamp is computed and used for both writes', () => {
    expect(code).toContain('const countedAt = nowIso()')
    expect(code).toContain('last_counted_at: countedAt')
    expect(code).toContain('counted_at: countedAt')
  })

  it('the cycle list reads the cache column, not a re-derived join', () => {
    expect(code).toContain('last_counted_at, pos_products!inner')
    // The join it replaced: pos_stock_take_items back through pos_stock_takes for the same fact.
    expect(code).not.toContain("pos_stock_takes!inner(outlet_id)")
  })

  it('the cache has exactly ONE writer in the engine', () => {
    // Counts DB WRITES only — `.update({ last_counted_at` — not the CycleItem type or the value it
    // returns, both of which legitimately name the column without writing it. A second writer is
    // exactly how a cache stops agreeing with its source, which is the whole risk this phase takes
    // on by introducing a second copy of the fact.
    const writes = (code.match(/update\(\{\s*last_counted_at/g) ?? []).length
    expect(writes).toBe(1)
  })

  it('no OTHER file writes the cache', () => {
    // The old auto-correcting route was the previous sole writer and phase 1 deleted it. If a
    // second writer appears anywhere, the equality asserted above stops being an invariant.
    const others = [
      join('src', 'app', 'api', 'pos', 'stock-takes', 'route.ts'),
      join('src', 'lib', 'inventory', 'count.ts'),
      join('src', 'lib', 'inventory', 'outlet-stock.ts'),
    ]
    for (const rel of others) {
      const other = readFileSync(join(process.cwd(), rel), 'utf8')
        .split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n')
      expect(other, rel).not.toMatch(/update\(\{\s*last_counted_at/)
    }
  })
})
