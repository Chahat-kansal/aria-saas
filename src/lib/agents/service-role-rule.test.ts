import { describe, it, expect } from 'vitest'
import {
  isAgentServiceRoleViolation,
  AGENT_SERVICE_ROLE_HOMES,
  AGENT_SERVICE_ROLE_ALLOWLIST,
} from './service-role-rule'

/**
 * M13D PHASE 3 — WALL 8, DRIVEN BY CALLING IT.
 *
 * The rule: only a cron may hand an agent the service-role client. These agents are constructed
 * from **ten user-facing routes** as well as fifteen crons, and a service-role client inside a route
 * makes that route bypass RLS for every read and write the agent performs — a silent authorisation
 * hole in place of a silent failure, which is strictly worse than the bug M13D fixes.
 *
 * ⚠️ Every assertion below CALLS `isAgentServiceRoleViolation` and reads its boolean. The guard
 * script imports the same function, so the rule enforced in CI and the rule tested here cannot
 * drift apart — and no assertion in this file greps a source file.
 *
 * The guard was also proven by observation, both directions, with byte-identical probe lines:
 *   src/app/api/probes3/route.ts:3      [agent-service-role-outside-cron]   ← fired
 *   src/app/api/cron/probe4/route.ts:3  (silent)                            ← allowed
 */
const CTOR = 'const agent = new ReorderAgent(supabaseAdmin)'
const RUN = "runAgent(type as AgentType, bid, supabaseAdmin),"

describe('M13D phase 3 · wall 8 — service role into an agent is a cron-only move', () => {
  it('FIRES on a user-facing route — every one of the ten', () => {
    for (const f of [
      'src/app/api/agents/bas/draft/route.ts',
      'src/app/api/agents/clv/trigger/route.ts',
      'src/app/api/agents/financing/run/route.ts',
      'src/app/api/agents/flash-revenue/route.ts',
      'src/app/api/agents/menu-engineering/actions/route.ts',
      'src/app/api/agents/negotiation/briefs/route.ts',
      'src/app/api/agents/acquisition/run/route.ts',
      'src/app/api/agents/acquisition/content/route.ts',
      'src/app/api/finance/generate/route.ts',
      'src/app/api/pos/agents/[type]/route.ts',
    ]) {
      expect(isAgentServiceRoleViolation(f, CTOR), f).toBe(true)
    }
  })

  it('ALLOWS the identical line under api/cron/ — the same text, a different home', () => {
    // This pair is the rule. Same characters; only the path differs.
    expect(isAgentServiceRoleViolation('src/app/api/cron/bas-monitor/route.ts', CTOR)).toBe(false)
    expect(isAgentServiceRoleViolation('src/app/api/cron/[task]/route.ts', RUN)).toBe(false)
    expect(isAgentServiceRoleViolation('src/app/api/probes/route.ts', CTOR)).toBe(true)
  })

  it('ALLOWS the council, which is a library with exactly one cron importer', () => {
    expect(isAgentServiceRoleViolation('src/lib/agents/proposal-council.ts', 'new AgentClass(supabaseAdmin).run(business_id),')).toBe(false)
    // …and no other library. A sibling in the same directory is NOT covered by it.
    expect(isAgentServiceRoleViolation('src/lib/agents/orchestrator.ts', CTOR)).toBe(true)
    expect(isAgentServiceRoleViolation('src/lib/agents/council-executor.ts', CTOR)).toBe(true)
  })

  it('catches BOTH shapes, and the runAgent one wherever the client sits', () => {
    const route = 'src/app/api/pos/agents/[type]/route.ts'
    expect(isAgentServiceRoleViolation(route, RUN)).toBe(true)
    expect(isAgentServiceRoleViolation(route, 'await runAgent(t, bid, supabaseAdmin)')).toBe(true)
    expect(isAgentServiceRoleViolation(route, 'new CustomerAcquisitionAgent(supabaseAdmin)')).toBe(true)
    expect(isAgentServiceRoleViolation(route, 'new BasAgent( supabaseAdmin )')).toBe(true)
  })

  it('⚠️ DOES NOT FIRE on the legitimate session-client line, which is the whole fix', () => {
    // If this went red, M13D phase 2 would be unshippable — every route passes exactly this.
    const route = 'src/app/api/agents/bas/draft/route.ts'
    expect(isAgentServiceRoleViolation(route, 'const agent = new BasAgent(supabase)')).toBe(false)
    expect(isAgentServiceRoleViolation(route, 'runAgent(type as AgentType, bid, supabase),')).toBe(false)
    // Nor on an unrelated use of the admin client — this rule is about AGENTS, not about
    // supabaseAdmin in general, and over-firing would push people to work around it.
    expect(isAgentServiceRoleViolation(route, "const { data } = await supabaseAdmin.from('x').select()")).toBe(false)
    expect(isAgentServiceRoleViolation(route, "import { supabaseAdmin } from '@/lib/supabase-admin'")).toBe(false)
  })

  it('a test file is exempt — building an agent in a test is not granting production access', () => {
    expect(isAgentServiceRoleViolation('src/lib/agents/base-agent-injection.test.ts', CTOR)).toBe(false)
    expect(isAgentServiceRoleViolation('src/lib/agents/whatever.spec.ts', CTOR)).toBe(false)
  })

  it('ANTI-VACUITY — the predicate can return both answers, and the lists are real', () => {
    // A rule that always returns false passes every "does not fire" assertion above.
    expect(isAgentServiceRoleViolation('src/app/api/probes/route.ts', CTOR)).toBe(true)
    expect(isAgentServiceRoleViolation('src/app/api/cron/x/route.ts', CTOR)).toBe(false)
    // An empty path must not be treated as an allowed home.
    expect(isAgentServiceRoleViolation('', CTOR)).toBe(false)
    expect(AGENT_SERVICE_ROLE_HOMES).toEqual(['src/app/api/cron/'])
    // Exactly one exception, deliberately. A second would mean the rule had been routed around.
    expect(AGENT_SERVICE_ROLE_ALLOWLIST).toHaveLength(1)
    expect(AGENT_SERVICE_ROLE_ALLOWLIST[0]).toBe('src/lib/agents/proposal-council.ts')
  })

  it('MUTATION — a rule without the home check condemns every cron, and that goes red', () => {
    // The mutation is a genuinely new predicate, not a reverted line: M13C established that a
    // diff-scanning guard cannot see a reintroduction, so the probe must be new code.
    const withoutHomes = (file: string, line: string) =>
      !/\.(test|spec)\.tsx?$/.test(file) && /new\s+[A-Z]\w*Agent\s*\(\s*supabaseAdmin/.test(line)
    expect(withoutHomes('src/app/api/cron/bas-monitor/route.ts', CTOR)).toBe(true)   // the mutant
    expect(isAgentServiceRoleViolation('src/app/api/cron/bas-monitor/route.ts', CTOR)).toBe(false)
  })
})
