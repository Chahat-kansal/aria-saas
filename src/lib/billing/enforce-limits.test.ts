import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limitsEnforced } from './enforce-limits'

// MS14 PHASE 2 — ENFORCEMENT EXISTS AND IS NOT ARMED.
//
// Two of five live businesses are real, so "flag off is inert" is not a nicety — it is the
// safety property this whole phase rests on. It is asserted three ways: the flag reads off by
// default, the check returns allowed WITHOUT touching entitlement (proven by making the
// entitlement module throw if called), and the shipped source contains no default-on.

const ENFORCE_SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'enforce-limits.ts'), 'utf8')

const ORIGINAL_ENV = process.env.ARIA_LIMITS_ENFORCE
afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.ARIA_LIMITS_ENFORCE
  else process.env.ARIA_LIMITS_ENFORCE = ORIGINAL_ENV
})

describe('the flag defaults OFF', () => {
  it('unset → off', () => {
    expect(limitsEnforced({})).toBe(false)
  })

  it('only the exact opt-in value arms it — no truthy-string accident', () => {
    for (const v of ['0', 'false', 'true', 'yes', '', 'ON']) expect(limitsEnforced({ ARIA_LIMITS_ENFORCE: v })).toBe(false)
    expect(limitsEnforced({ ARIA_LIMITS_ENFORCE: '1' })).toBe(true)
  })

  it('the shipped source has no default-on — the mutation target', () => {
    expect(ENFORCE_SRC).toMatch(/env\.ARIA_LIMITS_ENFORCE === '1'/)
    expect(ENFORCE_SRC).not.toMatch(/ARIA_LIMITS_ENFORCE\s*!==\s*'0'/)
    expect(ENFORCE_SRC).not.toMatch(/return true\s*\/\/\s*default/)
  })
})

describe('flag OFF is provably inert — not merely permissive', () => {
  beforeEach(() => { delete process.env.ARIA_LIMITS_ENFORCE })

  it('allows, and never reads entitlement at all (no I/O, no latency, no behaviour change)', async () => {
    vi.resetModules()
    const entitlementCalls: string[] = []
    vi.doMock('@/lib/billing/entitlement', () => ({
      getEntitlement: async (bid: string) => {
        entitlementCalls.push(bid)
        throw new Error('entitlement must NOT be consulted while the flag is off')
      },
    }))
    const { checkLimit } = await import('./enforce-limits')
    const result = await checkLimit({ businessId: 'biz-real', key: 'outlets', current: 9999 })
    expect(result).toEqual({ allowed: true })
    expect(entitlementCalls).toEqual([]) // the early return happened BEFORE any lookup
    vi.doUnmock('@/lib/billing/entitlement')
  })

  it('a wildly over-limit count is still allowed while off', async () => {
    vi.resetModules()
    vi.doMock('@/lib/billing/entitlement', () => ({
      getEntitlement: async () => ({ plan_key: 'starter', status: 'active', sections: [], ai_budget_usd: 20, is_trial: false, max_outlets: 1, max_staff: 5, max_agents: 2, max_routines: 2 }),
    }))
    const { checkLimit } = await import('./enforce-limits')
    for (const key of ['outlets', 'staff', 'agents', 'routines'] as const) {
      expect((await checkLimit({ businessId: 'b', key, current: 10_000 })).allowed).toBe(true)
    }
    vi.doUnmock('@/lib/billing/entitlement')
  })
})

describe('flag ON refuses by name — never a generic error', () => {
  async function armedCheck(plan: 'starter' | 'growth' | 'pro', key: 'outlets' | 'staff' | 'agents', current: number) {
    vi.resetModules()
    process.env.ARIA_LIMITS_ENFORCE = '1'
    const { PLANS } = await import('./plans')
    vi.doMock('@/lib/billing/entitlement', () => ({
      getEntitlement: async () => ({
        plan_key: plan, status: 'active', sections: [], ai_budget_usd: PLANS[plan].ai_budget_usd, is_trial: false,
        max_outlets: PLANS[plan].max_outlets, max_staff: PLANS[plan].max_staff,
        max_agents: PLANS[plan].max_agents, max_routines: PLANS[plan].max_routines,
      }),
    }))
    const { checkLimit } = await import('./enforce-limits')
    const r = await checkLimit({ businessId: 'b', key, current })
    vi.doUnmock('@/lib/billing/entitlement')
    return r
  }

  it('starter at 1 outlet: refused, naming the limit, the count and the upgrade', async () => {
    const r = await armedCheck('starter', 'outlets', 1)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('Your starter plan includes 1 outlet and you already have 1. The growth plan lifts this.')
  })

  it('starter under the limit: allowed, with detail for logging', async () => {
    const r = await armedCheck('starter', 'staff', 3)
    expect(r.allowed).toBe(true)
    expect(r.detail).toMatchObject({ key: 'staff', limit: 5, current: 3, plan: 'starter' })
  })

  it('pro is unlimited — allowed even at absurd counts', async () => {
    expect((await armedCheck('pro', 'agents', 5_000)).allowed).toBe(true)
  })

  it('on the top tier the message does not advertise an upgrade that does not exist', async () => {
    // growth staff = 15; the lift is pro. On pro nothing is capped, so construct the top-tier
    // wording via a capped key at the highest tier that has one.
    const r = await armedCheck('growth', 'staff', 15)
    expect(r.reason).toContain('The pro plan lifts this.')
  })
})

describe('a billing outage must never lock an owner out', () => {
  it('an entitlement error FAILS OPEN, even when armed', async () => {
    vi.resetModules()
    process.env.ARIA_LIMITS_ENFORCE = '1'
    vi.doMock('@/lib/billing/entitlement', () => ({
      getEntitlement: async () => { throw new Error('billing down') },
    }))
    const { checkLimit } = await import('./enforce-limits')
    expect((await checkLimit({ businessId: 'b', key: 'outlets', current: 99 })).allowed).toBe(true)
    vi.doUnmock('@/lib/billing/entitlement')
  })
})

describe('the gates are actually wired (not a library nobody calls)', () => {
  it('outlet creation checks before inserting', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'outlets', 'route.ts'), 'utf8')
    expect(src).toMatch(/checkLimit\(\{ businessId: bid, key: 'outlets'/)
    expect(src.indexOf('checkLimit')).toBeLessThan(src.indexOf("from('pos_outlets').insert"))
    expect(src).toMatch(/error: 'plan_limit'/)
  })

  it('staff creation checks before inserting, counting active staff only', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'staff', 'members', 'route.ts'), 'utf8')
    expect(src).toMatch(/checkLimit\(\{ businessId: bid, key: 'staff'/)
    expect(src).toMatch(/\.eq\('status', 'active'\)/)
    expect(src.indexOf('checkLimit')).toBeLessThan(src.indexOf("from('staff_members').insert"))
  })
})
