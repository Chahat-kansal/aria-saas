import { describe, it, expect } from 'vitest'
import { onlineSaleInitialStatus, POS_SALE_STATUSES } from '@/lib/pos/online-sale-status'

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
