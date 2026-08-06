import { describe, it, expect } from 'vitest'
import { onlineSaleInitialStatus, POS_SALE_STATUSES } from '@/lib/pos/online-sale-status'
import { GROSS_STATUSES, DEDUCTION_STATUSES, EXCLUDED_STATUSES, classifySale } from '@/lib/pos/revenue'

// FIX-ONLINE-PAY-1 A2 — the money rule, pinned.
//
// What it prevents recurring: place-order created EVERY online sale 'completed' at placement,
// before any money moved. Live when this was written: 20 sales, all 'completed', exactly ONE order
// with stripe_payment_status='succeeded'. Revenue is read two ways across the codebase and these
// rows counted under both.

describe('onlineSaleInitialStatus', () => {
  it('card orders start pending — not revenue until Stripe confirms', () => {
    expect(onlineSaleInitialStatus(true)).toBe('pending')
  })

  it('cash / pay-at-counter stays completed — unchanged from today', () => {
    // These never get a PaymentIntent (place-order only creates one when isCardPayment), so
    // waiting for a confirmation that will never arrive would strand every counter order unpaid.
    expect(onlineSaleInitialStatus(false)).toBe('completed')
  })

  it('never returns a status the DB CHECK would reject', () => {
    // pos_sales_status_check, dumped live: pending|draft|open|partial_paid|completed|voided|refunded
    expect(POS_SALE_STATUSES).toContain(onlineSaleInitialStatus(true))
    expect(POS_SALE_STATUSES).toContain(onlineSaleInitialStatus(false))
  })

  it('the permitted set matches the live CHECK constraint exactly', () => {
    // If a migration widens or narrows the constraint, this fails and the mismatch is caught here
    // rather than as a runtime insert violation on a customer's order.
    expect([...POS_SALE_STATUSES].sort()).toEqual(
      ['completed', 'draft', 'open', 'partial_paid', 'pending', 'refunded', 'voided'],
    )
  })
})

// FIX-SPLIT-DEAD-ROUTE-1 §4 — the revenue rail must not classify statuses that cannot exist,
// EXCEPT where a value is deliberately kept as a tripwire and says so.
//
// This lives here, extending the existing CHECK-constraint test, rather than in a second file with
// its own copy of the permitted list. POS_SALE_STATUSES is already the single transcription of
// pos_sales_status_check; a rival constant is how the two drift.
const DELIBERATELY_IMPOSSIBLE = [
  // Not CHECK-permitted, kept as tripwires so an unexpected write lands in 'excluded' rather than
  // falling through unclassified. Both are documented as impossible in revenue.ts.
  'split',      // the dead route that would have written it never had a caller; now a 410 tombstone
  'rewarded',   // a loyalty_referrals status, never a pos_sales one — carries a console.warn
] as const

describe('the revenue rail only classifies statuses that can actually exist', () => {
  const all = [...GROSS_STATUSES, ...DEDUCTION_STATUSES, ...EXCLUDED_STATUSES]

  it('every rail status is CHECK-permitted, or deliberately listed as impossible', () => {
    for (const s of all) {
      const permitted = (POS_SALE_STATUSES as readonly string[]).includes(s)
      const knownImpossible = (DELIBERATELY_IMPOSSIBLE as readonly string[]).includes(s)
      expect(
        permitted || knownImpossible,
        s + ' is in the revenue rail but is neither CHECK-permitted nor a documented tripwire',
      ).toBe(true)
    }
  })

  it("does not carry 'refund' — it was never CHECK-permitted, so no row can have it", () => {
    // The rail held both spellings on the mistaken belief that two live writers meant two live
    // values. What writers ATTEMPT and what the DB ACCEPTS are different questions.
    expect(all).not.toContain('refund')
  })

  it('classifies every CHECK-permitted status deliberately, none by falling through', () => {
    // A permitted status that the rail never names still returns 'excluded' from classifySale's
    // default — which is right today and one refactor away from being wrong silently.
    for (const s of POS_SALE_STATUSES) {
      expect(all, s + ' is permitted by the DB but unnamed in the rail').toContain(s)
    }
  })

  it('partial_paid is excluded — the split parent is counted once, at the end', () => {
    expect(classifySale('partial_paid')).toBe('excluded')
    expect(classifySale('open')).toBe('excluded')
    expect(classifySale('completed')).toBe('gross')
    expect(classifySale('refunded')).toBe('deduction')
  })
})

// FIX-REFUND-STATUS-1 §3 — every status the application WRITES must be one the DB accepts.
//
// This is the direction that was missing. The rail assertion above checks what we CLASSIFY; this
// checks what we INSERT. 'refund' passed the first check trivially (it was in no rail list) while
// being written by two live routes, so every refund returned 500 'Refund could not be recorded'
// and zero refunds have ever been recorded through either path.
//
// Reuses POS_SALE_STATUSES — the single transcription of pos_sales_status_check — deliberately.
// A second copy of the permitted list is how the two drift apart.
const STATUSES_THE_CODE_WRITES = [
  'completed',     // create-sale.ts default; the in-store and cash-order path
  'pending',       // FIX-ONLINE-PAY-A: card orders, until Stripe confirms
  'refunded',      // FIX-REFUND-STATUS-1: sales/[id]/refund and refund-unlinked
  'voided',        // void paths, and create-sale's items-insert rollback
  'draft',         // held / parked carts
  'open',          // the live split system parks the parent here while splits are outstanding
] as const

describe('every status the code writes is accepted by the DB', () => {
  it.each(STATUSES_THE_CODE_WRITES)('%s is CHECK-permitted', (status) => {
    expect(
      (POS_SALE_STATUSES as readonly string[]).includes(status),
      status + ' is written by application code but pos_sales_status_check rejects it — that insert '
        + 'fails at runtime, which is exactly how refunds were 100% broken',
    ).toBe(true)
  })

  it("'refund' is NOT written anywhere — it was never permitted", () => {
    // The bug this file now guards: two routes wrote the present-tense spelling for months.
    expect(STATUSES_THE_CODE_WRITES as readonly string[]).not.toContain('refund')
    expect(POS_SALE_STATUSES as readonly string[]).not.toContain('refund')
  })
})
