import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePlan, getEffectivePlan } from '@/lib/plans/resolve-plan'

// MS12 PHASE 3 — MIGRATE THE READERS. The brief's VERIFY: the same business reports the same
// plan through every path. Sip's live shape is the test: businesses.plan='pro' +
// business_subscriptions.tier='autonomous' must agree once both go through the vocabulary.

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8')
}

describe('one business, one plan, every path', () => {
  it('the entitlement path and the raw-tier path agree on the live Sip shape', () => {
    const viaBusinesses = getEffectivePlan({ plan: 'pro', subscription_status: 'active', trial_ends_at: null, stripe_subscription_id: null, plan_override_by: null })
    const viaSubTier = normalizePlan('autonomous')
    expect(viaBusinesses).toBe(viaSubTier) // both 'pro'
  })

  it('a null-tier subscription row agrees with a starter business row', () => {
    expect(normalizePlan(null)).toBe(getEffectivePlan({ plan: 'starter', subscription_status: 'active', trial_ends_at: null, stripe_subscription_id: null, plan_override_by: null }))
  })
})

describe('no reader keys off a raw tier string any more', () => {
  it('dashboard/ai-usage resolves the tier before keying budget defaults', () => {
    const code = src('src', 'app', 'api', 'dashboard', 'ai-usage', 'route.ts')
    expect(code).toContain('PLAN_DEFAULTS[normalizePlan(')
    expect(code).not.toMatch(/PLAN_DEFAULTS\[\(sub\?\.tier as string\) \?\? ''\]/)
  })

  it('admin/ai-costs resolves the tier before keying budget defaults', () => {
    const code = src('src', 'app', 'api', 'admin', 'ai-costs', 'route.ts')
    expect(code).toContain('PLAN_DEFAULTS[normalizePlan(tier)]')
  })

  it('business-context normalizes the tier before the prompt sees it', () => {
    const code = src('src', 'lib', 'aria', 'ask', 'business-context.ts')
    expect(code).toMatch(/normalizePlan\(rawTier\)/)
  })

  it('checkout refuses an unknown tier instead of casting it into Stripe metadata', () => {
    const code = src('src', 'app', 'api', 'billing', 'checkout', 'route.ts')
    expect(code).toMatch(/if \(!\(rawTier in PLANS\)\)/)
    expect(code).toMatch(/unknown_tier/)
  })
})
