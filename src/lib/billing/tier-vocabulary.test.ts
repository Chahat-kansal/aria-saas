import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePlan, isTrialing, getEffectivePlan } from '@/lib/plans/resolve-plan'
import { PLANS } from '@/lib/billing/plans'

// MS12 PHASE 2 — ONE TIER VOCABULARY, PROVEN AGAINST THE LIVE VALUES.
//
// MCP-verified 2026-08-21: businesses.plan ∈ {pro, starter}; business_subscriptions.tier ∈
// {autonomous, starter, NULL}; statuses ∈ {active, trial, trialing, NULL}. `autonomous` appears
// in no plan file — it resolves ONLY through resolve-plan's alias (founder-locked 2026-07-28:
// alias of pro, sharing pro's price point; the MS12 brief's "add it as a real tier" is
// superseded by that in-code decision — what must hold is that every live string RESOLVES).
// A tier that exists in data but not in code is an enforcement lockout waiting to happen; these
// tests are the tripwire.

const LIVE_PLAN_STRINGS = ['pro', 'starter', 'autonomous', null, '', undefined] as const
const LIVE_STATUSES = ['active', 'trial', 'trialing', null] as const

describe('every live tier string resolves to a defined plan', () => {
  it.each(LIVE_PLAN_STRINGS.map(v => [String(v), v] as const))('normalizePlan(%s) lands in the registry', (_l, v) => {
    const plan = normalizePlan(v as string | null | undefined)
    expect(PLANS[plan]).toBeDefined()
    expect(PLANS[plan].sections.length).toBeGreaterThan(0)
  })

  it('autonomous resolves to pro — the founder-locked alias, not a lockout', () => {
    expect(normalizePlan('autonomous')).toBe('pro')
  })

  it('a null/unknown tier falls to starter, never to undefined entitlements', () => {
    expect(normalizePlan(null)).toBe('starter')
    expect(normalizePlan('some-future-tier')).toBe('starter')
  })

  it('every live status is understood by the trial logic', () => {
    for (const s of LIVE_STATUSES) {
      // isTrialing must return a boolean for every live value — both 'trial' (column default)
      // and 'trialing' (Stripe vocabulary) count as trials.
      expect(typeof isTrialing(s)).toBe('boolean')
    }
    expect(isTrialing('trial')).toBe(true)
    expect(isTrialing('trialing')).toBe(true)
    expect(isTrialing('active')).toBe(false)
  })

  it('the registry itself defines all three plans with the founder-confirmed shape', () => {
    for (const key of ['starter', 'growth', 'pro'] as const) {
      expect(PLANS[key].plan_key).toBe(key)
      expect(PLANS[key].price_usd).toBeGreaterThan(0)
      expect(Array.isArray(PLANS[key].sections)).toBe(true)
    }
  })
})

describe('a live business resolves identically through the entitlement path', () => {
  it('the Sip-shaped row (plan=pro, status=trial, expired) resolves without throwing', () => {
    const plan = getEffectivePlan({ plan: 'pro', subscription_status: 'trial', trial_ends_at: '2026-01-01T00:00:00Z', stripe_subscription_id: null, plan_override_by: null })
    expect(PLANS[plan]).toBeDefined()
  })
})

describe('the dead plan file stays dead', () => {
  it('src/lib/plans.ts keeps its tombstone header', () => {
    const dead = readFileSync(join(process.cwd(), 'src', 'lib', 'plans.ts'), 'utf8')
    expect(dead).toContain('@deprecated DO NOT IMPORT')
  })

  it('nothing imports it', () => {
    // The tombstone only holds if the importer count stays zero (it is also guarded by
    // no-restricted-imports; this is the belt to that brace).
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const out = execSync('git grep -l "from \'@/lib/plans\'" -- src/ || true', { encoding: 'utf8', cwd: process.cwd() })
    const importers = out.split('\n').filter(l => l.trim() && !l.includes('plans/resolve-plan'))
    expect(importers).toEqual([])
  })
})
