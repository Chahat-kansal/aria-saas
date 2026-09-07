import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BaseAgent } from './base-agent'
import type { AgentType, AgentRunResult } from './types'

/**
 * M13D PHASE 2 — THE CLIENT IS INJECTED, AND THERE IS NO DEFAULT.
 *
 * `BaseAgent` built its own client from a module-scope `createServerSupabaseClient()` — the anon key
 * plus request cookies. A cron has no cookies, RLS is on, and so every `agent_decisions` and
 * `agent_runs` write has been REJECTED since 4 June 2026. It was never a failing insert; it was an
 * unauthorised one.
 *
 * ⚠️ THESE TESTS CONSTRUCT AGENTS AND ASSERT ON WHAT HAPPENS. Nothing here reads source text. The
 * standing rule exists because M13's presence test passed for weeks over a function that never
 * worked, and because a source scan cannot tell a constructor that throws from one that pretends to.
 */

/** A stand-in for a real client. Identity is all these tests need — nothing is queried. */
const fakeClient = (tag: string) => ({ __tag: tag } as unknown as SupabaseClient)

class ProbeAgent extends BaseAgent {
  type = 'reorder' as AgentType
  async run(): Promise<AgentRunResult> { return { decisions: [], errors: [], duration_ms: 0 } }
  /** The whole point of the injection: whatever was handed in is what gets used. */
  clientTag() { return (this.supabase as unknown as { __tag: string }).__tag }
}

describe('M13D phase 2 · the constructor demands a client', () => {
  it('the client handed in is the client the agent uses — no substitution, no default', () => {
    expect(new ProbeAgent(fakeClient('service-role')).clientTag()).toBe('service-role')
    expect(new ProbeAgent(fakeClient('session')).clientTag()).toBe('session')
  })

  it('⚠️ TWO AGENTS BUILT WITH DIFFERENT CLIENTS DO NOT SHARE ONE', () => {
    // The pre-M13D field was a module-scope initialiser, so every agent in the process resolved the
    // same anon client no matter who built it. That is the property being removed, and this is the
    // assertion that would have caught it.
    const cron = new ProbeAgent(fakeClient('service-role'))
    const route = new ProbeAgent(fakeClient('session'))
    expect(cron.clientTag()).not.toBe(route.clientTag())
  })

  it('a missing client THROWS, and the message says what to pass', () => {
    // tsc refuses this at every TypeScript call site. This catches the ones it cannot see: plain JS,
    // an `as any`, a hand-built mock, a dynamic registry. A silent undefined is exactly the shape
    // that hid the original defect for 94 days.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new ProbeAgent(undefined as any)).toThrow(/Supabase client is required/)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new ProbeAgent(null as any)).toThrow(/supabaseAdmin from a cron/)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new ProbeAgent(undefined as any)).toThrow(/no default/)
  })

  it('MUTATION — a default client is what goes red, either way round', () => {
    // Both defaults are reproduced, because both are wrong for a different reason:
    //   defaulting to the service-role client -> the ten user-facing routes silently bypass RLS
    //   defaulting to the anon client         -> the original bug, verbatim
    // A constructor that accepted either would pass a test that only checked "an agent can be
    // built". This asserts the opposite: that it CANNOT be built without a decision.
    class DefaultedAgent extends BaseAgent {
      type = 'reorder' as AgentType
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(supabase: SupabaseClient = fakeClient('silently-defaulted') as any) { super(supabase) }
      async run(): Promise<AgentRunResult> { return { decisions: [], errors: [], duration_ms: 0 } }
      clientTag() { return (this.supabase as unknown as { __tag: string }).__tag }
    }
    // The defaulted subclass builds happily with no argument — the defect, reproduced.
    expect(new DefaultedAgent().clientTag()).toBe('silently-defaulted')
    // The real base class does not.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => new ProbeAgent(undefined as any)).toThrow()
  })

  it('ANTI-VACUITY — the probe agent is a real BaseAgent, not a lookalike', () => {
    const a = new ProbeAgent(fakeClient('x'))
    expect(a).toBeInstanceOf(BaseAgent)
    expect(typeof a.run).toBe('function')
    expect(a.type).toBe('reorder')
    // And the base class genuinely requires the argument — a zero-arity constructor would make
    // every assertion above vacuous.
    expect(BaseAgent.length).toBe(1)
  })
})
