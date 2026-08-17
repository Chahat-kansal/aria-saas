import { describe, it, expect } from 'vitest'
import { linkLoyaltyIdentity } from '@/lib/loyalty/link-identity'

// ARIA-LOYALTY-FIX-1 §1 — the semantics that matter, against a fake db.
//
// The audit's day-one blocker was that a customer added AT THE TILL never got a loyalty identity,
// so counter enrolment built no loyalty base: 48 of 51 unlinked. This covers the three ways the fix
// could be wrong in production and never be noticed: minting duplicates, blocking the cashier, and
// silently doing nothing for a name-only record.
//
// ARIA-LOYALTY-CLOSEOUT-1 §1 adds a fourth, which turned out to be live: the link UPDATE's error was
// discarded, so a write the database REFUSED was reported as {reason:'linked'} with a real
// identityId. See the bottom block.

type Row = { id: string; email?: string; phone?: string }

/** A live or soft-deleted pos_customers row, as the holder lookup sees it. */
type CustomerRow = {
  id: string
  business_id: string
  loyalty_identity_id?: string | null
  created_at?: string
  deleted_at?: string | null
}

/**
 * Tiny chainable stand-in for a PostgREST select. Real enough that the helper's filter chain —
 * .eq().eq().is().order().limit().maybeSingle() — has to actually be correct to pass, rather than
 * matching whatever shape the fake happens to expose.
 */
function selectChain(rows: CustomerRow[]) {
  return {
    eq: (col: string, val: unknown) =>
      selectChain(rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)),
    is: (col: string, val: unknown) =>
      selectChain(rows.filter((r) => ((r as unknown as Record<string, unknown>)[col] ?? null) === val)),
    order: (col: string, opts?: { ascending?: boolean }) =>
      selectChain([...rows].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[col] ?? '')
        const bv = String((b as unknown as Record<string, unknown>)[col] ?? '')
        return opts?.ascending === false ? bv.localeCompare(av) : av.localeCompare(bv)
      })),
    limit: (n: number) => selectChain(rows.slice(0, n)),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
  }
}

/** Minimal in-memory stand-in for the two tables this helper touches. */
function fakeDb(seed: Row[] = [], customers: CustomerRow[] = []) {
  const identities: Row[] = [...seed]
  const updates: Array<{ id: string; loyalty_identity_id: string }> = []
  let inserts = 0
  let throwOn: string | null = null
  let updateError: { code?: string; message?: string } | null = null

  const db = {
    from(table: string) {
      if (table === 'loyalty_identity') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => {
                if (throwOn === 'select') throw new Error('db down')
                const hit = identities.find((r) => (r as Record<string, unknown>)[col] === val)
                return { data: hit ? { id: hit.id } : null }
              },
            }),
          }),
          insert: (values: Record<string, string>) => ({
            select: () => ({
              single: async () => {
                if (throwOn === 'insert') throw new Error('db down')
                inserts++
                const row: Row = { id: 'id-' + inserts, ...values }
                identities.push(row)
                return { data: { id: row.id } }
              },
            }),
          }),
        }
      }
      return {
        update: (values: Record<string, string>) => ({
          eq: async (_col: string, id: string) => {
            // The real client returns { error } rather than throwing on a constraint violation,
            // which is exactly why the old code could discard it without anything going bang.
            if (updateError) return { data: null, error: updateError }
            updates.push({ id, loyalty_identity_id: values.loyalty_identity_id })
            return { data: null, error: null }
          },
        }),
        select: () => selectChain(customers),
      }
    },
  }
  return {
    db, identities, updates,
    inserts: () => inserts,
    fail: (w: string) => { throwOn = w },
    failUpdate: (e: { code?: string; message?: string }) => { updateError = e },
  }
}

describe('linkLoyaltyIdentity', () => {
  it('creates an identity for a till customer who has a phone', async () => {
    const f = fakeDb()
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'c1', phone: '+61412345678' })
    expect(out.reason).toBe('linked')
    expect(out.created).toBe(true)
    expect(f.inserts()).toBe(1)
    // ...and actually stamps it onto the customer. Creating an orphan identity would look like
    // success while leaving the customer exactly as unlinked as before.
    expect(f.updates).toEqual([{ id: 'c1', loyalty_identity_id: out.identityId }])
  })

  // ── THE ONE THAT MATTERS: no duplicate identities ────────────────────────────────────────────
  it('reuses an existing identity — the same person at the till and online is ONE identity', async () => {
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }])
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'c2', phone: '+61412345678' })
    expect(out.identityId).toBe('existing')
    expect(out.created).toBe(false)
    expect(f.inserts()).toBe(0)
  })

  it('is idempotent — adding the same customer twice never mints a second identity', async () => {
    const f = fakeDb()
    await linkLoyaltyIdentity(f.db, { customerId: 'c1', email: 'sam@example.com' })
    await linkLoyaltyIdentity(f.db, { customerId: 'c1', email: 'sam@example.com' })
    expect(f.inserts()).toBe(1)
  })

  it('matches on email first, then phone', async () => {
    const f = fakeDb([{ id: 'by-email', email: 'sam@example.com' }, { id: 'by-phone', phone: '+61400000000' }])
    expect((await linkLoyaltyIdentity(f.db, { customerId: 'c', email: 'sam@example.com', phone: '+61400000000' })).identityId)
      .toBe('by-email')
    expect((await linkLoyaltyIdentity(f.db, { customerId: 'c', phone: '+61400000000' })).identityId)
      .toBe('by-phone')
  })

  it('normalises email case so Sam@ and sam@ are one person', async () => {
    const f = fakeDb([{ id: 'existing', email: 'sam@example.com' }])
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'c', email: '  SAM@Example.COM ' })
    expect(out.identityId).toBe('existing')
    expect(f.inserts()).toBe(0)
  })

  // ── NAME-ONLY RECORDS — the till allows them ─────────────────────────────────────────────────
  it('a customer with neither phone nor email links nothing, and says so', async () => {
    const f = fakeDb()
    for (const input of [{ customerId: 'c' }, { customerId: 'c', phone: '   ', email: '' }]) {
      const out = await linkLoyaltyIdentity(f.db, input)
      expect(out.reason).toBe('no_contact')
      expect(out.identityId).toBeNull()
    }
    // No identity invented, and no customer touched. A synthetic key here would make the row
    // unmatchable later, when the same person finally gives a phone number.
    expect(f.inserts()).toBe(0)
    expect(f.updates).toEqual([])
  })

  // ── NEVER BLOCK THE CASHIER ──────────────────────────────────────────────────────────────────
  it('a database failure returns an outcome instead of throwing', async () => {
    // The customer row already exists by the time this runs. If this threw, the till would report a
    // failure for a customer that WAS created — the cashier retries and makes a duplicate.
    const f = fakeDb()
    f.fail('select')
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'c', email: 'sam@example.com' })
    expect(out.reason).toBe('failed')
    expect(out.identityId).toBeNull()
  })

  it('an insert failure is also contained', async () => {
    const f = fakeDb()
    f.fail('insert')
    await expect(linkLoyaltyIdentity(f.db, { customerId: 'c', phone: '+61412345678' })).resolves.toMatchObject({
      reason: 'failed',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ARIA-LOYALTY-CLOSEOUT-1 §1 — THE LINK UPDATE'S ERROR.
//
// Every test in here fails against the previous implementation, which never destructured the
// update's error at all. That is the point: the old code returned {reason:'linked'} with a real
// identityId for a write the database had refused, so the caller logged nothing, the customer
// stayed unlinked forever, and no run — not the till, not the backfill's 42 rows — could tell a
// completed link from a rejected one.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('linkLoyaltyIdentity — the update can be REFUSED', () => {
  const LIVE: CustomerRow[] = [
    // The row that already holds the identity. Oldest live row wins, matching resolve-code.ts.
    { id: 'holder-old', business_id: 'biz-1', loyalty_identity_id: 'existing', created_at: '2026-01-01', deleted_at: null },
    { id: 'holder-new', business_id: 'biz-1', loyalty_identity_id: 'existing', created_at: '2026-06-01', deleted_at: null },
    // Must be ignored: soft-deleted, and a different business. Both are outside the index predicate.
    { id: 'gone', business_id: 'biz-1', loyalty_identity_id: 'existing', created_at: '2025-01-01', deleted_at: '2026-07-08' },
    { id: 'other-venue', business_id: 'biz-2', loyalty_identity_id: 'existing', created_at: '2024-01-01', deleted_at: null },
    // The customer we are trying to link, which is how the helper learns its business.
    { id: 'newbie', business_id: 'biz-1', loyalty_identity_id: null, created_at: '2026-08-01', deleted_at: null },
  ]

  it('a unique violation is reported as identity_taken, NOT as a successful link', async () => {
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }], LIVE)
    f.failUpdate({ code: '23505', message: 'duplicate key value violates unique constraint "pos_customers_identity_uniq"' })
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'newbie', phone: '+61412345678' })

    expect(out.reason).toBe('identity_taken')
    // The identity itself is real and was found — it is the LINK that was refused. A caller that
    // wants to explain the situation needs both halves.
    expect(out.identityId).toBe('existing')
    // Nothing was written. Reporting a link that did not happen is the entire defect.
    expect(f.updates).toEqual([])
  })

  it('names the row that already holds it — the oldest LIVE row in the same business', async () => {
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }], LIVE)
    f.failUpdate({ code: '23505' })
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'newbie', phone: '+61412345678' })

    // Not 'gone' (soft-deleted, and older — so an ordering-only implementation would pick it), and
    // not 'other-venue' (different business, older still). Both are outside the index's predicate.
    // The answer must equal what resolve-code.ts would resolve this identity to, or the caller is
    // handed a customer the till cannot then find.
    expect(out.reason === 'identity_taken' && out.heldByCustomerId).toBe('holder-old')
  })

  it('survives not being able to identify the holder', async () => {
    // Holder lookup finds nothing (empty customers table) — the outcome is still identity_taken,
    // because the DATABASE said so. A null holder is missing detail, not a different verdict.
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }], [])
    f.failUpdate({ code: '23505' })
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'newbie', phone: '+61412345678' })
    expect(out.reason).toBe('identity_taken')
    expect(out.reason === 'identity_taken' && out.heldByCustomerId).toBeNull()
  })

  it('any OTHER update error is failed — never linked', async () => {
    // A dropped column, an RLS refusal, a timeout. None of these wrote the link, so none of them
    // may report one. This is the general form of the bug; 23505 is just its loudest instance.
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }], LIVE)
    f.failUpdate({ code: '42703', message: 'column "loyalty_identity_id" does not exist' })
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'newbie', phone: '+61412345678' })
    expect(out.reason).toBe('failed')
    expect(f.updates).toEqual([])
  })

  it('a clean update is still linked — the happy path did not move', async () => {
    const f = fakeDb([{ id: 'existing', phone: '+61412345678' }], LIVE)
    const out = await linkLoyaltyIdentity(f.db, { customerId: 'newbie', phone: '+61412345678' })
    expect(out.reason).toBe('linked')
    expect(f.updates).toEqual([{ id: 'newbie', loyalty_identity_id: 'existing' }])
  })
})
