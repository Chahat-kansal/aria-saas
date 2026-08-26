import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * S2B PHASES 1 & 2 — the thread list, and soft delete.
 *
 * The behavioural proof for soft delete was run against the LIVE database as a rolled-back block
 * (recorded in RUN-S2B.md): list 174->173, search 1->0, row_survives=1, msgs 3->3. This file is the
 * rail that keeps those properties true, and it guards the two things that actually regress:
 * a hard DELETE creeping back, and a query losing its business scope.
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const DELETE_ROUTE = read('src/app/api/aria/ask/delete/route.ts')
const HISTORY_ROUTE = read('src/app/api/aria/ask/history/route.ts')

/** Source with comments stripped — prose explaining a rule must not satisfy the rule. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('S2B phase 2 · delete is a tombstone, never a DELETE', () => {
  it('the delete path contains NO hard delete', () => {
    // The defect this phase exists to remove: a mis-click permanently destroyed a conversation and
    // every message in it, with no undo and no recovery short of a backup.
    expect(code(DELETE_ROUTE)).not.toMatch(/\.delete\(\)/)
  })

  it('it writes deleted_at instead', () => {
    expect(code(DELETE_ROUTE)).toMatch(/\.update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/)
  })

  it('the tombstone write carries its OWN business scope', () => {
    // supabaseAdmin bypasses RLS, so a destructive-looking write is the last place to rely on an
    // ownership check three lines further up.
    const at = code(DELETE_ROUTE).indexOf('deleted_at: new Date()')
    const stmt = code(DELETE_ROUTE).slice(at, at + 260)
    expect(stmt).toMatch(/\.eq\('business_id', conv\.business_id\)/)
    expect(stmt).toMatch(/\.is\('deleted_at', null\)/)
  })

  it('the ownership gate is still there and still returns 403', () => {
    // Soft-deleting someone else's thread is still a write to their data.
    expect(DELETE_ROUTE).toMatch(/status: 403/)
    expect(DELETE_ROUTE).toMatch(/\.eq\('user_id', user\.id\)/)
  })

  it('MUTATION PROBE — restoring the hard delete is caught', () => {
    const mutated = DELETE_ROUTE.replace(
      ".update({ deleted_at: new Date().toISOString() })",
      '.delete()',
    )
    expect(mutated).not.toBe(DELETE_ROUTE)
    expect(code(mutated)).toMatch(/\.delete\(\)/)
  })
})

describe('S2B phases 1 & 2 · tombstoned threads are unreachable', () => {
  it('the LIST excludes them', () => {
    expect(code(HISTORY_ROUTE)).toMatch(/\.is\('deleted_at', null\)/)
  })

  it('the SINGLE-THREAD read excludes them too', () => {
    // Without this a deleted thread would vanish from the list but still reopen by id — worse than
    // not deleting it, because the owner would believe it was gone.
    const c = code(HISTORY_ROUTE)
    const occurrences = (c.match(/\.is\('deleted_at', null\)/g) ?? []).length
    expect(occurrences, 'both the single read and the list must exclude tombstones').toBeGreaterThanOrEqual(2)
  })

  it('MUTATION PROBE — dropping the tombstone filter is caught', () => {
    const mutated = HISTORY_ROUTE.replace(/\.is\('deleted_at', null\)/, '')
    expect(mutated).not.toBe(HISTORY_ROUTE)
    const occurrences = (code(mutated).match(/\.is\('deleted_at', null\)/g) ?? []).length
    expect(occurrences).toBeLessThan(2)
  })
})

describe('S2B phase 1 · the thread list', () => {
  it('is pinned first, then newest first', () => {
    const c = code(HISTORY_ROUTE)
    expect(c).toMatch(/\.order\('pinned_at', \{ ascending: false, nullsFirst: false \}\)/)
    expect(c).toMatch(/\.order\('last_message_at', \{ ascending: false \}\)/)
    // that ordering is exactly what aria_conversations_biz_recent_idx is built for
    const pinAt = c.indexOf("order('pinned_at'")
    const recentAt = c.indexOf("order('last_message_at'")
    expect(pinAt).toBeGreaterThan(-1)
    expect(recentAt).toBeGreaterThan(pinAt)
  })

  it('EVERY query in the route carries an explicit business_id filter', () => {
    const c = code(HISTORY_ROUTE)
    const queries = c.split("from('aria_conversations')").slice(1)
    expect(queries.length).toBeGreaterThanOrEqual(2)
    for (const [i, q] of queries.entries()) {
      expect(q.slice(0, 400), 'query #' + i + ' is unscoped').toMatch(/\.eq\('business_id', bid\)/)
    }
  })

  it('MUTATION PROBE — removing a business filter is caught', () => {
    const mutated = HISTORY_ROUTE.replace(".eq('business_id', bid)", '')
    expect(mutated).not.toBe(HISTORY_ROUTE)
    const queries = code(mutated).split("from('aria_conversations')").slice(1)
    expect(queries.some(q => !/\.eq\('business_id', bid\)/.test(q.slice(0, 400)))).toBe(true)
  })

  it('a restored thread pages instead of returning the whole blob', () => {
    const c = code(HISTORY_ROUTE)
    expect(c).toMatch(/msg_offset/)
    expect(c).toMatch(/msg_limit/)
    expect(c).toMatch(/has_more/)
    expect(c).toMatch(/message_total/)
  })

  it('paging counts only what the owner can SEE — superseded turns are filtered first', () => {
    // S1 phases 2-3 leave superseded branches in the array on purpose. Paging over them would
    // return windows full of messages that never render.
    expect(code(HISTORY_ROUTE)).toMatch(/renderPath\(/)
  })
})
