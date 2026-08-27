import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  adaptLegacyQueuedSale, applySyncResult, stuckSales, syncableSales,
  MAX_SYNC_ATTEMPTS, offlineIdempotencyKey, type QueuedSale,
} from './pos-offline'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/pos/sync-offline/route.ts')
const MOBILE = read('src/app/pos/mobile/page.tsx')
const TERMINAL = read('src/app/pos/(fullscreen)/terminal/page.tsx')

/** Strip comments — a prose mention must never pass for an implementation. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const q = (ref: string, attempts = 0): QueuedSale => ({
  ref, queued_at: '2026-08-27T01:00:00.000Z', attempts,
  body: {
    items: [{ product_name: 'Flat white', quantity: 1, unit_price: 5, line_total: 5 }],
    payment_method: 'cash', subtotal: 5, tax_amount: 0.5, total_amount: 5.5,
  },
})

describe('POS-OFFLINE-1a · the queue drops ONLY what the server confirms', () => {
  it('THE BUG: one success no longer clears the whole batch', () => {
    // Old behaviour was `if (d.synced > 0) clearOfflineQueue()` — 1 of 10 succeeding destroyed 9.
    const queue = [q('a'), q('b'), q('c')]
    const next = applySyncResult(queue, ['a'], [
      { ref: 'b', reason: 'boom' }, { ref: 'c', reason: 'boom' },
    ])
    expect(next.map(s => s.ref)).toEqual(['b', 'c'])
  })

  it('a confirmed sale is the ONLY thing that leaves the queue', () => {
    const next = applySyncResult([q('a')], ['a'], [])
    expect(next).toHaveLength(0)
  })

  it('a failed sale stays, with its attempt counted and the reason kept', () => {
    const next = applySyncResult([q('a')], [], [{ ref: 'a', reason: 'not-null violation' }])
    expect(next).toHaveLength(1)
    expect(next[0].attempts).toBe(1)
    expect(next[0].last_error).toBe('not-null violation')
  })

  it('a sale the server never mentioned is left completely alone', () => {
    // Never inferred as failed: an unmentioned ref must not accrue attempts toward being stuck.
    const next = applySyncResult([q('a'), q('b')], ['a'], [])
    expect(next.map(s => s.ref)).toEqual(['b'])
    expect(next[0].attempts).toBe(0)
  })

  it('an empty result set changes nothing', () => {
    const next = applySyncResult([q('a'), q('b')], [], [])
    expect(next.map(s => s.ref)).toEqual(['a', 'b'])
  })
})

describe('POS-OFFLINE-1a · a poison pill is paused, NEVER discarded', () => {
  it('stops being sent after MAX_SYNC_ATTEMPTS but remains in the queue', () => {
    let queue = [q('a')]
    for (let i = 0; i < MAX_SYNC_ATTEMPTS + 3; i++) {
      queue = applySyncResult(queue, [], [{ ref: 'a', reason: 'still broken' }])
    }
    expect(queue).toHaveLength(1)                    // the whole point
    expect(syncableSales(queue)).toHaveLength(0)     // but no longer retried
    expect(stuckSales(queue)).toHaveLength(1)        // and surfaced to the owner
  })

  it('is marked stuck exactly at the threshold, not before', () => {
    let queue = [q('a')]
    for (let i = 0; i < MAX_SYNC_ATTEMPTS - 1; i++) {
      queue = applySyncResult(queue, [], [{ ref: 'a', reason: 'x' }])
    }
    expect(stuckSales(queue)).toHaveLength(0)
    queue = applySyncResult(queue, [], [{ ref: 'a', reason: 'x' }])
    expect(stuckSales(queue)).toHaveLength(1)
  })

  it('a stuck sale that finally succeeds still leaves cleanly', () => {
    const queue = [q('a', MAX_SYNC_ATTEMPTS)]
    expect(applySyncResult(queue, ['a'], [])).toHaveLength(0)
  })
})

describe('POS-OFFLINE-1a · legacy v1 queued sales are upgraded, not lost', () => {
  const legacy = {
    id: 'offline-1756000000000',
    queued_at: '2026-08-20T03:00:00.000Z',
    total_amount: 11,
    payment_method: 'card',
    customer_id: null,
    items: [
      { product_id: 'p1', product_name: 'Latte', quantity: 2, unit_price: 4.5, line_total: 9 },
      { product_id: 'p2', product_name: 'Cookie', quantity: 1, unit_price: 1, line_total: 1 },
    ],
  }

  it('a real till may hold these RIGHT NOW — they must survive the upgrade', () => {
    // They never synced (the shape mismatch guaranteed failure), so they are real sales the owner
    // took offline and has never been paid for in the books.
    const v2 = adaptLegacyQueuedSale(legacy)!
    expect(v2.ref).toBe('offline-1756000000000')
    expect(v2.body.total_amount).toBe(11)
    expect(v2.body.items).toHaveLength(2)
  })

  it('TAX IS DERIVED FROM RECORDED FIGURES, NEVER GUESSED', () => {
    // The `legacy` fixture above is useless for this assertion: its subtotal is 10 and its total
    // 11, so derived tax (1.00) and an assumed 10% (1.00) are the SAME NUMBER and the test cannot
    // tell the two rules apart. A fixture where they diverge is the only one that proves anything.
    //
    // subtotal = 9 + 1 = 10, total = 11.50  ->  derived tax = 1.50, assumed 10% would be 1.00.
    const v2 = adaptLegacyQueuedSale({ ...legacy, total_amount: 11.5 })!
    expect(v2.body.subtotal).toBe(10)
    expect(v2.body.tax_amount).toBe(1.5)
    // A fabricated GST figure here would flow straight into BAS. GROUNDING-TEETH.
    expect(v2.body.tax_amount).not.toBe(1)
  })

  it('never produces a negative tax from a malformed row', () => {
    const v2 = adaptLegacyQueuedSale({ ...legacy, total_amount: 5 })!
    expect(v2.body.tax_amount).toBe(0)
  })

  it('a row with no items is rejected rather than synced as an empty sale', () => {
    expect(adaptLegacyQueuedSale({ ...legacy, items: [] })).toBeNull()
  })

  it('also reads the cents-denominated shape the old ROUTE expected', () => {
    const v2 = adaptLegacyQueuedSale({
      id: 'x', queued_at: 'now', total_cents: 550, payment_method: 'cash',
      items: [{ product_id: 'p', product_name: 'Tea', quantity: 1, unit_price_cents: 500, total_cents: 500 }],
    })!
    expect(v2.body.total_amount).toBe(5.5)
    expect(v2.body.items[0].unit_price).toBe(5)
  })
})

describe('POS-OFFLINE-1a · retry is only safe because replay is idempotent', () => {
  it('the key is derived from the queued ref, so a replay collides with itself', () => {
    expect(offlineIdempotencyKey('biz-1', 'ref-9')).toBe('sale-biz-1-offline-ref-9')
    expect(offlineIdempotencyKey('biz-1', 'ref-9')).toBe(offlineIdempotencyKey('biz-1', 'ref-9'))
  })

  it('different sales never collide, and neither do different businesses', () => {
    expect(offlineIdempotencyKey('b', 'r1')).not.toBe(offlineIdempotencyKey('b', 'r2'))
    expect(offlineIdempotencyKey('b1', 'r')).not.toBe(offlineIdempotencyKey('b2', 'r'))
  })

  it('the route actually passes it to createSale', () => {
    expect(code(ROUTE)).toMatch(/idempotencyKey: offlineIdempotencyKey\(bid, ref\)/)
  })
})

describe('POS-OFFLINE-1a · the route can never report a lossy batch as clean', () => {
  it('returns per-item results, not a count', () => {
    const c = code(ROUTE)
    expect(c).toMatch(/result\.synced\.push\(ref\)/)
    expect(c).toMatch(/result\.failed\.push\(\{ ref, reason/)
  })

  it('returns a non-2xx status when anything failed', () => {
    expect(code(ROUTE)).toMatch(/status: result\.ok \? 200 : 207/)
  })

  it('THE SWALLOW IS GONE — no bare errors++/continue', () => {
    const c = code(ROUTE)
    expect(c).not.toMatch(/errors\+\+/)
    expect(c).not.toMatch(/\{ synced, errors/)
  })

  it('logs the real error against the ref it belongs to', () => {
    const c = code(ROUTE)
    expect(c).toMatch(/console\.error\('\[sync-offline\] sale replay FAILED'/)
    expect(c).toMatch(/console\.error\('\[sync-offline\] sale replay THREW'/)
    expect(c).toMatch(/code: err\?\.code/)
  })

  it('an unreadable row is reported, not silently skipped', () => {
    expect(code(ROUTE)).toMatch(/reason: 'Queued sale could not be read'/)
  })

  it('MUTATION PROBE — reinstating the swallow is detectable', () => {
    const mutated = ROUTE.replace(
      'result.failed.push({ ref, reason: saleResult.error ?? \'Sale could not be created\' })',
      'errors++',
    )
    expect(mutated).not.toBe(ROUTE)
    expect(code(mutated)).toMatch(/errors\+\+/)
  })
})

describe('POS-OFFLINE-1a · the route no longer writes pos_sales itself', () => {
  it('replays through createSale, the same path an online sale takes', () => {
    const c = code(ROUTE)
    expect(c).toMatch(/await createSale\(supabase, \{/)
  })

  it('CLASS CHECK — the route names no pos_sales column at all', () => {
    // The original bug was `synced_from_offline: true` in a raw untyped insert: it compiled, and
    // the runtime that found it was built to hide it. With no raw insert here, an invented column
    // at this call site is a tsc error against the closed CreateSaleParams interface.
    const c = code(ROUTE)
    expect(c).not.toMatch(/from\('pos_sales'\)\s*\.insert/)
    expect(c).not.toMatch(/from\('pos_sale_items'\)\s*\.insert/)
    expect(c).not.toMatch(/synced_from_offline:/)
  })

  it('the offline marker is passed as a TYPED param, not a column name', () => {
    expect(code(ROUTE)).toMatch(/synced: \{ fromOffline: true, queuedAt: queued\.queued_at \}/)
  })
})

describe('POS-OFFLINE-1a · both till clients honour the new contract', () => {
  it('mobile removes only confirmed refs', () => {
    const c = code(MOBILE)
    expect(c).toMatch(/applySyncResult\(queue, synced, failed\)/)
    expect(c).not.toMatch(/clearOfflineQueue\(\)/)
  })

  it('mobile treats 207 as a result to process, not a failure to ignore', () => {
    // Discarding a 207 would leave CONFIRMED sales queued and re-send them every round.
    expect(code(MOBILE)).toMatch(/r\.status !== 207/)
  })

  it('mobile queues the exact /api/pos/sale body, not a second format', () => {
    const c = code(MOBILE)
    expect(c).toMatch(/queueSaleV2\(offlineRef, \{/)
    expect(c).toMatch(/tax_amount:\s+gstCents \/ 100/)
    expect(c).toMatch(/subtotal:\s+subtotalCents \/ 100/)
  })

  it('the terminal no longer nukes the queue on partial success', () => {
    const c = code(TERMINAL)
    expect(c).not.toMatch(/localStorage\.removeItem\('aria_offline_queue'\)/)
    expect(c).toMatch(/applySyncResult\(queue, d\.synced \?\? \[\], d\.failed \?\? \[\]\)/)
  })

  it('the terminal reads the CANONICAL queue key, not its own dead one', () => {
    // It read 'aria_offline_queue'; the module writes 'aria_pos_offline_queue'. Nothing ever wrote
    // the terminal's key, so this effect had always run against an empty array.
    const c = code(TERMINAL)
    expect(c).not.toMatch(/aria_offline_queue/)
    expect(c).toMatch(/const queue = readQueue\(\)/)
  })

  it('MUTATION PROBE — a clear-all is detectable in either client', () => {
    const mutated = MOBILE.replace('const next = applySyncResult(queue, synced, failed);', 'const next = [];')
    expect(mutated).not.toBe(MOBILE)
    expect(code(mutated)).not.toMatch(/applySyncResult\(queue, synced, failed\)/)
  })
})
