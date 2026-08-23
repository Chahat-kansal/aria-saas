import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLANS } from '@/lib/billing/plans'

// MS13 PHASE 6 (shipped half) — TIER CAPS ON OWNER-BUILT AGENTS.
//
// 2 / 5 / unlimited per the brief, riding the canonical entitlement path MS12 established
// (businesses.plan → getEffectivePlan → PLANS → getEntitlement), enforced SERVER-SIDE at the one
// creation point. The RLS-scoped-agent-reads half of this phase is PARKED — see RUN-MS13.md.

const EXECUTOR = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'ask', 'action-executor.ts'), 'utf8')

describe('the caps are on the canonical entitlement path', () => {
  it('the brief’s numbers, exactly: starter 2, growth 5, pro unlimited', () => {
    expect(PLANS.starter.max_agents).toBe(2)
    expect(PLANS.growth.max_agents).toBe(5)
    expect(PLANS.pro.max_agents).toBeNull() // null = unlimited, the file’s existing convention
  })

  it('routine caps mirror agent caps — the brief gave no routine numbers, so none were invented', () => {
    for (const key of ['starter', 'growth', 'pro'] as const) {
      expect(PLANS[key].max_routines).toBe(PLANS[key].max_agents)
    }
  })

  it('getEntitlement surfaces them, so a tier change moves them with everything else', () => {
    const ent = readFileSync(join(process.cwd(), 'src', 'lib', 'billing', 'entitlement.ts'), 'utf8')
    expect(ent).toMatch(/max_agents: planDef\.max_agents/)
    expect(ent).toMatch(/max_routines: planDef\.max_routines/)
  })
})

describe('the cap is enforced server-side at the creation point', () => {
  async function runCreate(existingAgents: number, plan: 'starter' | 'growth' | 'pro') {
    vi.resetModules()
    const writes: string[] = []
    vi.doMock('@/lib/billing/entitlement', () => ({
      getEntitlement: async () => ({
        plan_key: plan, status: 'active', sections: [], ai_budget_usd: 20, is_trial: false,
        max_outlets: null, max_staff: null,
        max_agents: PLANS[plan].max_agents, max_routines: PLANS[plan].max_routines,
      }),
    }))
    vi.doMock('@/lib/supabase-admin', () => {
      const makeChain = (table: string): Record<string, unknown> => {
        const chain: Record<string, unknown> = {
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: table === 'aria_skills' ? existingAgents : 0 }).then(res),
          single: async () => ({ data: { id: 'agent-1' }, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }
        for (const m of ['select', 'eq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'ilike', 'order', 'limit']) chain[m] = () => chain
        chain.insert = () => { writes.push(table); return chain }
        chain.update = () => chain
        chain.upsert = () => chain
        chain.delete = () => chain
        return chain
      }
      return { supabaseAdmin: { from: (t: string) => makeChain(t) } }
    })
    const { executeAction } = await import('@/lib/aria/ask/action-executor')
    const { planCreateAgent } = await import('./composer')
    const result = await executeAction(planCreateAgent('create an agent called Capped that lists stock'), 'biz-test', 'user-test')
    vi.doUnmock('@/lib/billing/entitlement')
    vi.doUnmock('@/lib/supabase-admin')
    return { result, agentInserts: writes.filter(t => t === 'aria_skills').length }
  }

  it('starter at the cap is REFUSED, and no row is written', async () => {
    const { result, agentInserts } = await runCreate(2, 'starter')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/starter plan includes 2 agents/)
    expect(agentInserts).toBe(0) // the refusal precedes the insert — nothing partial
  })

  it('starter below the cap proceeds', async () => {
    const { result, agentInserts } = await runCreate(1, 'starter')
    expect(result.ok).toBe(true)
    expect(agentInserts).toBe(1)
  })

  it('pro is unlimited — a large existing count still proceeds', async () => {
    const { result } = await runCreate(500, 'pro')
    expect(result.ok).toBe(true)
  })

  it('the check counts only kind=agent rows, not the 18 legacy skills', () => {
    expect(EXECUTOR).toMatch(/\.eq\('business_id', businessId\)\.eq\('kind', 'agent'\)/)
  })
})
