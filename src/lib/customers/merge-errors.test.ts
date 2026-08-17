import { describe, it, expect } from 'vitest'
import { mergeErrorResponse } from '@/lib/customers/merge-errors'

// ARIA-MERGE-FIX-1 — the error handling whose ABSENCE destroyed customer records.
//
// /api/customers/merge issued five writes and checked none of them. When the unique phone index
// rejected the write that copied the secondary's phone onto the primary, the route carried on and
// soft-deleted the secondary anyway: the merged data was never written and the row it came from was
// gone. The caller got a 200.
//
// The ordering half of that fix lives in SQL and is proven by a rolled-back probe against the real
// index — a fake database has no partial unique index, so a unit test of the ordering would only be
// testing my model of the bug. What IS unit-testable, and what actually regressed in production, is
// whether a failure is allowed to be reported as success. That is this file.

describe('mergeErrorResponse — a failed merge must never look like a successful one', () => {
  it('returns null ONLY when there is genuinely no error', () => {
    expect(mergeErrorResponse(null)).toBeNull()
    expect(mergeErrorResponse(undefined)).toBeNull()
  })

  // ── THE ONE THAT MATTERS ─────────────────────────────────────────────────────────────────────
  it('never returns null for an error — the original bug in its general form', () => {
    // Any non-null error means the transaction rolled back and BOTH customers are intact. Reporting
    // success here tells the owner their records were consolidated when nothing happened.
    const errors = [
      { code: '23505', message: 'duplicate key value violates unique constraint "pos_customers_phone_uniq"' },
      { code: '42703', message: 'column "phone" does not exist' },
      { message: 'merge_not_found' },
      { message: 'merge_self' },
      { message: '' },
      {},
      { code: null, message: null },
    ]
    for (const e of errors) {
      const r = mergeErrorResponse(e)
      expect(r, JSON.stringify(e)).not.toBeNull()
      expect(r!.status).toBeGreaterThanOrEqual(400)
    }
  })

  it('maps the phone-index rejection to a 409 that says nothing was changed', () => {
    // The exact error the production route discarded. It is now reachable only if a new unique
    // index is added whose predicate does not exclude soft-deleted rows.
    const r = mergeErrorResponse({
      code: '23505',
      message: 'duplicate key value violates unique constraint "pos_customers_phone_uniq"',
    })
    expect(r).toEqual({
      status: 409,
      error: 'Merge conflicts with a unique constraint on the surviving customer; nothing was changed',
    })
  })

  it('recognises 23505 from the message alone, not just the code field', () => {
    // Not every client surface populates `code`; losing the classification would downgrade a
    // known, explainable conflict into an opaque 500.
    expect(mergeErrorResponse({ message: 'duplicate key value violates unique constraint "x"' })?.status).toBe(409)
  })

  it('preserves the two statuses the route returned before this change (RULE 0)', () => {
    expect(mergeErrorResponse({ message: 'merge_not_found' }))
      .toEqual({ status: 404, error: 'One or both customers not found' })
    expect(mergeErrorResponse({ message: 'merge_self' }))
      .toEqual({ status: 400, error: 'Cannot merge a customer with itself' })
  })

  it('falls back to 500 with the real message, not a swallowed empty string', () => {
    expect(mergeErrorResponse({ message: 'connection reset' })).toEqual({ status: 500, error: 'connection reset' })
    // An error with no message is still an error; the status is what matters.
    expect(mergeErrorResponse({}))?.toEqual({ status: 500, error: 'Merge failed' })
  })

  it('the plpgsql exception text is matched as a substring, since Postgres decorates it', () => {
    // Real shape: 'merge_not_found' arrives wrapped by PostgREST with context appended.
    expect(mergeErrorResponse({ message: 'merge_not_found\nCONTEXT: PL/pgSQL function ...' })?.status).toBe(404)
  })
})
