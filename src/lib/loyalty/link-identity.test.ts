import { describe, it, expect } from 'vitest'
import { linkLoyaltyIdentity } from '@/lib/loyalty/link-identity'

// ARIA-LOYALTY-FIX-1 §1 — the semantics that matter, against a fake db.
//
// The audit's day-one blocker was that a customer added AT THE TILL never got a loyalty identity,
// so counter enrolment built no loyalty base: 48 of 51 unlinked. This covers the three ways the fix
// could be wrong in production and never be noticed: minting duplicates, blocking the cashier, and
// silently doing nothing for a name-only record.

type Row = { id: string; email?: string; phone?: string }

/** Minimal in-memory stand-in for the two tables this helper touches. */
function fakeDb(seed: Row[] = []) {
  const identities: Row[] = [...seed]
  const updates: Array<{ id: string; loyalty_identity_id: string }> = []
  let inserts = 0
  let throwOn: string | null = null

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
            updates.push({ id, loyalty_identity_id: values.loyalty_identity_id })
            return { data: null }
          },
        }),
      }
    },
  }
  return { db, identities, updates, inserts: () => inserts, fail: (w: string) => { throwOn = w } }
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
