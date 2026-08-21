/**
 * MS12 PHASE 4 — the pure decision layer under the Stripe webhook handlers.
 *
 * Three handlers exist (/api/stripe/webhook — canonical; /api/billing/[action]?action=webhook
 * and /api/stripe/route.ts POST — duplicates kept per RULE 0). All three share the
 * stripe_events idempotency table. ONLY THE CANONICAL ONE gets registered in Stripe (see
 * BILLING-MODEL.md); these helpers make the decisions testable and identical wherever used.
 *
 * Money discipline: no path here can charge, refund, or alter an amount. These functions decide
 * whether to process at all, and which tier label a price ID maps to — nothing else.
 */

export type EventDecision = 'process' | 'skip' | 'fail_closed'

/**
 * Idempotency, fail-closed. If the idempotency store cannot be READ, the only safe answer is to
 * refuse (500 → Stripe retries later): processing without a dedupe record is how an event
 * double-applies. A processed row skips; anything else processes.
 */
export function decideEventAction(
  existing: { processed?: boolean | null } | null | undefined,
  fetchError: { message?: string } | null | undefined,
): EventDecision {
  if (fetchError) return 'fail_closed'
  if (existing?.processed) return 'skip'
  return 'process'
}

export type StripeTier = 'starter' | 'growth' | 'pro'

/**
 * REFUSE, DON'T GUESS (same rule as uom.ts, applied to money): an unknown price ID returns
 * null — the caller must then leave the stored tier alone and log loudly. The previous copies
 * of this mapping defaulted to 'starter', which with unset env vars (true today) would have
 * written tier='starter' for every subscription regardless of what the customer pays.
 */
export function priceIdToTier(
  priceId: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): StripeTier | null {
  if (!priceId) return null
  if (env.STRIPE_PRICE_ID_PRO && priceId === env.STRIPE_PRICE_ID_PRO) return 'pro'
  if (env.STRIPE_PRICE_ID_GROWTH && priceId === env.STRIPE_PRICE_ID_GROWTH) return 'growth'
  if (env.STRIPE_PRICE_ID_STARTER && priceId === env.STRIPE_PRICE_ID_STARTER) return 'starter'
  return null
}
