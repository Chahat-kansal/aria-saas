import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveLimits, isCompleteLimitSet, tierThatLifts, limitsTable, LIMIT_KEYS, PARKED_LIMITS } from './limits'
import { PLANS } from './plans'

// MS14 PHASE 1 — every live tier resolves to a COMPLETE limit set.
//
// The tier strings below are the ones that actually appear in the database (MCP-verified during
// MS12: businesses.plan ∈ {pro, starter}; business_subscriptions.tier ∈ {autonomous, starter,
// NULL}), plus the degenerate inputs a real row can carry. `autonomous` is the one that matters:
// it appears in NO plan file and resolves only through normalizePlan's alias. If it ever resolved
// to an incomplete set, enforcement would lock a paying business out of its own account.

const LIVE_TIER_STRINGS = ['pro', 'starter', 'growth', 'autonomous', null, undefined, '', 'PRO', 'some-future-tier'] as const

describe('every live tier resolves to a complete limit set', () => {
  it.each(LIVE_TIER_STRINGS.map(t => [String(t), t] as const))('%s', (_label, tier) => {
    const set = resolveLimits(tier as string | null | undefined)
    expect(set).not.toBeNull()
    expect(isCompleteLimitSet(set)).toBe(true)
    for (const key of LIMIT_KEYS) {
      expect(set![key] === null || typeof set![key] === 'number').toBe(true)
    }
  })

  it('autonomous — the live orphan tier — gets pro’s limits, not an empty set', () => {
    expect(resolveLimits('autonomous')).toEqual(resolveLimits('pro'))
  })

  it('the table covers all three tiers with all five limits', () => {
    const table = limitsTable()
    expect(table.map(r => r.tier)).toEqual(['starter', 'growth', 'pro'])
    for (const row of table) for (const key of LIMIT_KEYS) expect(row).toHaveProperty(key)
  })
})

describe('the numbers are DERIVED from plans.ts — never restated here', () => {
  it('limits.ts defines no numeric literal for any limit', () => {
    // The whole point: one source. A literal appearing here is a second source waiting to drift.
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'limits.ts'), 'utf8')
    const body = src.split('\n').filter(l => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//') && !l.trimStart().startsWith('/*')).join('\n')
    expect(body).not.toMatch(/(outlets|staff|agents|routines|ai_spend_usd)\s*:\s*\d/)
  })

  it('every value traces to a PLANS field', () => {
    for (const tier of ['starter', 'growth', 'pro'] as const) {
      const set = resolveLimits(tier)!
      expect(set.outlets).toBe(PLANS[tier].max_outlets)
      expect(set.staff).toBe(PLANS[tier].max_staff)
      expect(set.agents).toBe(PLANS[tier].max_agents)
      expect(set.routines).toBe(PLANS[tier].max_routines)
      expect(set.ai_spend_usd).toBe(PLANS[tier].ai_budget_usd)
    }
  })

  it('limit sets are frozen — a caller cannot change what another caller enforces', () => {
    const set = resolveLimits('starter')!
    expect(() => { (set as unknown as Record<string, unknown>).outlets = 99 }).toThrow()
  })
})

describe('the upgrade named in a refusal is real', () => {
  it('starter over 1 outlet points at growth (3), not at a tier that would not help', () => {
    expect(tierThatLifts('outlets', 2, 'starter')).toBe('growth')
  })

  it('a tier that would STILL not be enough is skipped — no false upgrade promise', () => {
    // Wanting 10 outlets: growth caps at 3, so naming growth would be a lie the owner pays for.
    // (This assertion originally contradicted its own comment and failed — the CODE was right.)
    expect(tierThatLifts('outlets', 10, 'starter')).toBe('pro')
    expect(tierThatLifts('staff', 100, 'growth')).toBe('pro')
  })

  it('on the most permissive tier there is no upgrade to advertise', () => {
    expect(tierThatLifts('agents', 999, 'pro')).toBeNull()
  })
})

describe('what was deliberately NOT given a number', () => {
  it('reels is PARKED with a reason, not invented', () => {
    const reels = PARKED_LIMITS.find(p => p.key === 'reels')
    expect(reels).toBeDefined()
    expect(reels!.reason).toMatch(/No per-tier reel allowance/)
    expect(LIMIT_KEYS).not.toContain('reels' as never)
  })
})
