import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decideEventAction, priceIdToTier } from '@/lib/billing/webhook-guards'

// MS12 PHASE 4 — THE SUBSCRIPTION LIFECYCLE, INERT. Signature-verified (pre-existing),
// idempotent BY EVENT ID and now FAIL-CLOSED, writing status/period fields only. No checkout
// flow, no charging, no enforcement was added — the brief's NOT-SCOPE.

const WEBHOOK = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'stripe', 'webhook', 'route.ts'), 'utf8')

describe('replaying the same event changes nothing the second time', () => {
  it('a processed event skips', () => {
    expect(decideEventAction({ processed: true }, null)).toBe('skip')
  })

  it('an unseen event processes', () => {
    expect(decideEventAction(null, null)).toBe('process')
  })

  it('a crashed-mid-processing event (row exists, processed=false) re-processes — Stripe retry semantics', () => {
    expect(decideEventAction({ processed: false }, null)).toBe('process')
  })

  it('an unreadable idempotency store FAILS CLOSED — never processes without a dedupe record', () => {
    // Processing an event that cannot be recorded is how a double-apply happens. The old code
    // discarded this error (RULE 7) and processed anyway.
    expect(decideEventAction(null, { message: 'relation unreachable' })).toBe('fail_closed')
    expect(decideEventAction({ processed: true }, { message: 'timeout' })).toBe('fail_closed')
  })

  it('the route wires the decision in: 500 on fail_closed, skip returns received', () => {
    expect(WEBHOOK).toMatch(/decideEventAction\(existing, idemReadErr\)/)
    expect(WEBHOOK).toMatch(/idempotency_store_unavailable/)
    expect(WEBHOOK).toMatch(/status: 500/)
    // The marker WRITE is also checked — an unwritable marker refuses processing too.
    expect(WEBHOOK).toMatch(/idemWriteErr/)
  })
})

describe('refuse, don’t guess — price IDs (the uom.ts rule applied to money)', () => {
  it('with no env configured (true today), every price ID refuses — nothing becomes starter', () => {
    expect(priceIdToTier('price_live_whatever', {})).toBeNull()
    expect(priceIdToTier(undefined, {})).toBeNull()
  })

  it('a configured price ID resolves to its tier', () => {
    const env = { STRIPE_PRICE_ID_PRO: 'price_pro', STRIPE_PRICE_ID_GROWTH: 'price_gro', STRIPE_PRICE_ID_STARTER: 'price_sta' }
    expect(priceIdToTier('price_pro', env)).toBe('pro')
    expect(priceIdToTier('price_gro', env)).toBe('growth')
    expect(priceIdToTier('price_sta', env)).toBe('starter')
    expect(priceIdToTier('price_unknown', env)).toBeNull()
  })

  it('the route leaves tier/plan alone when the mapping refuses', () => {
    expect(WEBHOOK).toMatch(/\.\.\.\(tier !== null \? \{ tier \} : \{\}\)/)
    expect(WEBHOOK).toMatch(/if \(tier !== null\) \{\s*\n\s*await supabaseAdmin\.from\('businesses'\)/)
    // The old silent default is gone.
    expect(WEBHOOK).not.toMatch(/return 'starter'\s*\n\}/)
  })
})

describe('inert: nothing in the webhook can move money', () => {
  it('the handler never creates charges, payment intents, refunds, or checkout sessions', () => {
    for (const forbidden of ['charges.create', 'paymentIntents.create', 'refunds.create', 'checkout.sessions.create', 'invoiceItems.create', 'subscriptions.create']) {
      expect(WEBHOOK).not.toContain(forbidden)
    }
  })

  it('the full lifecycle is covered: created, updated, cancelled, payment failed, trial ending', () => {
    for (const evt of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed', 'customer.subscription.trial_will_end']) {
      expect(WEBHOOK).toContain(evt)
    }
  })
})
