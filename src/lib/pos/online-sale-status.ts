// FIX-ONLINE-PAY-1 A2 — what status an online order's sale is created in.
//
// THE BUG THIS CLOSES: place-order created every sale 'completed' at placement, before any money
// moved. Live at the time of writing: 22 online orders, 20 sales, ALL 20 'completed', and exactly
// ONE order with stripe_payment_status='succeeded'. Revenue is read two ways across the codebase
// (eq(status,'completed') and neq(status,'voided')) and these rows counted under BOTH.
//
// A pure function rather than an inline ternary because it is a money rule, and a money rule that
// cannot be tested is one that quietly stops holding.

/** Statuses permitted by pos_sales_status_check, dumped live before this was written. */
export const POS_SALE_STATUSES = [
  'pending', 'draft', 'open', 'partial_paid', 'completed', 'voided', 'refunded',
] as const

/**
 * Card orders start 'pending' — the row must exist at placement (PLACE-ORDER-FIX-1: the accept
 * flow, KDS gating and pos_sale_items all depend on it) but it is not revenue until Stripe says so.
 *
 * Cash / pay-at-counter keeps TODAY'S behaviour exactly: no Stripe intent is ever created for it
 * (place-order only creates one when isCardPayment), so waiting for a confirmation that will never
 * arrive would strand every counter order as unpaid forever.
 */
export function onlineSaleInitialStatus(isCardPayment: boolean): 'pending' | 'completed' {
  return isCardPayment ? 'pending' : 'completed'
}
