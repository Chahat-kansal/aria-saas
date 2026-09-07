import { describe, it, expect } from 'vitest'
import {
  classifyAgentFailure,
  summariseAgentHealth,
  readStoredAgentHealth,
  type AgentFailure,
} from './proposal-council'

/**
 * M13C PHASE 1 — THE UNREAD ARRAY.
 *
 * `proposal-council.ts` collected every agent failure into `const agentErrors: string[]`, pushed to
 * at two sites and READ AT NEITHER. Ninety-four nights of failures went in and nothing came out:
 * not logged, not stored, not returned. That one line is why "12 of 14 agents did not report" was
 * unanswerable from production, and why 96 of 97 sessions could claim steady state.
 *
 * ⚠️ THESE TESTS CALL THE FUNCTIONS. M13's truncation test asserted a string was present in source
 * and passed for weeks while the function it named returned `{hitCeiling:false}` on every call.
 * A presence test passes on dead code; this file's assertions are on returned values.
 */
describe('M13C phase 1 · a failure is classified, not lumped', () => {
  it('a 25-second guard firing is a TIMEOUT, and a crash is not', () => {
    // Promise.race rejects with the literal message 'timeout' when the council's guard fires.
    expect(classifyAgentFailure(new Error('timeout'))).toBe('timed_out')
    expect(classifyAgentFailure(new Error('Cannot read properties of undefined'))).toBe('threw')
    expect(classifyAgentFailure(new Error('fetch failed'))).toBe('threw')
  })

  it('a non-Error rejection still classifies rather than crashing the collector', () => {
    // An agent that rejects with a string or undefined must not take the whole council with it.
    expect(classifyAgentFailure('timeout')).toBe('timed_out')
    expect(classifyAgentFailure(undefined)).toBe('threw')
    expect(classifyAgentFailure(null)).toBe('threw')
  })

  it('MUTATION — treating every failure as one kind is exactly what goes red', () => {
    const lumped = () => 'threw' as const
    expect(classifyAgentFailure(new Error('timeout'))).not.toBe(lumped())
  })
})

describe('M13C phase 1 · the council counts its own run', () => {
  const fail = (agent_type: string, kind: AgentFailure['kind'], reason = 'x'): AgentFailure =>
    ({ agent_type, kind, reason })

  it('the real shape: 2 reported, 12 failed, out of 14', () => {
    // Not hypothetical — this is what the live run of 6 Sep looked like from the outside.
    const h = summariseAgentHealth({
      total: 14,
      reported: ['bas_compliance', 'inventory_financing'],
      skipped: [],
      failures: Array.from({ length: 12 }, (_, i) => fail('agent' + i, 'threw')),
    })
    expect(h).toEqual({
      agents_total: 14,
      agents_reported: 2,
      agents_failed: 12,
      agents_skipped_disabled: 0,
      failures: h.failures,
      // M13C phase 2 added this field. Asserted rather than loosened to a partial match: a health
      // block that cannot say the proposals were lost is the shape this sprint exists to remove.
      proposal_persist_error: null,
    })
    expect(h.failures).toHaveLength(12)
  })

  it('PHASE 2 — a REJECTED proposal insert is not the same fact as a quiet night', () => {
    // Before this field, N rejected proposals and zero proposals were the identical empty array,
    // and the narrative called both steady state.
    const lost = summariseAgentHealth({
      total: 14, reported: ['reorder', 'pricing'], skipped: [], failures: [],
      proposalPersistError: 'new row violates row-level security policy',
    })
    const quiet = summariseAgentHealth({ total: 14, reported: ['reorder', 'pricing'], skipped: [], failures: [] })
    expect(lost.proposal_persist_error).toContain('row-level security')
    expect(quiet.proposal_persist_error).toBeNull()
    // The two nights are now distinguishable, which they were not.
    expect(lost).not.toEqual(quiet)
    // And the agent counts are identical in both — proving the difference is carried by this field
    // alone, not smuggled in through a count.
    expect(lost.agents_reported).toBe(quiet.agents_reported)
    expect(lost.agents_failed).toBe(quiet.agents_failed)
  })

  it('PHASE 2 — the persist error survives the round-trip to the session row', () => {
    const h = summariseAgentHealth({
      total: 14, reported: [], skipped: [], failures: [], proposalPersistError: 'permission denied for table',
    })
    const stored = JSON.parse(JSON.stringify({ decisions: [], agent_health: h }))
    expect(readStoredAgentHealth(stored).proposal_persist_error).toBe('permission denied for table')
    // A legacy session has no such field and must read null, not an invented message.
    expect(readStoredAgentHealth({ agent_health: { agents_total: 3 } }).proposal_persist_error).toBeNull()
  })

  it('a disabled agent is SKIPPED, not failed — the owner turned it off on purpose', () => {
    const h = summariseAgentHealth({
      total: 14, reported: ['reorder'], skipped: ['pricing', 'clv'], failures: [],
    })
    expect(h.agents_skipped_disabled).toBe(2)
    expect(h.agents_failed).toBe(0)
    // And it does not silently inflate "reported" either.
    expect(h.agents_reported).toBe(1)
  })

  it('the failure detail survives, with the agent NAME and the REASON', () => {
    const h = summariseAgentHealth({
      total: 14, reported: [], skipped: [],
      failures: [fail('reorder', 'timed_out', 'timeout'), fail('pricing', 'not_registered', 'no class in AGENT_REGISTRY')],
    })
    expect(h.failures.map(f => f.agent_type)).toEqual(['reorder', 'pricing'])
    expect(h.failures[0].kind).toBe('timed_out')
    expect(h.failures[1].reason).toContain('AGENT_REGISTRY')
  })

  it('MUTATION — discarding the array is what the bug WAS, and it goes red here', () => {
    // The pre-M13C behaviour, reproduced: collect the failures, return a summary that forgets them.
    const failures = [fail('reorder', 'threw', 'boom')]
    const discarded = { ...summariseAgentHealth({ total: 14, reported: [], skipped: [], failures }), agents_failed: 0, failures: [] }
    const kept = summariseAgentHealth({ total: 14, reported: [], skipped: [], failures })
    expect(kept).not.toEqual(discarded)
    expect(kept.failures).toHaveLength(1)
    expect(discarded.failures).toHaveLength(0)
  })
})

describe('M13C phase 1 · reading a stored health block back', () => {
  it('round-trips through the plan jsonb the session row actually stores', () => {
    const written = summariseAgentHealth({
      total: 14, reported: ['clv'], skipped: [], failures: [{ agent_type: 'reorder', kind: 'timed_out', reason: 'timeout' }],
    })
    // Exactly what STEP 8 persists: the chair's plan object with agent_health merged in.
    const storedPlan = JSON.parse(JSON.stringify({ decisions: [], plan_narrative: 'x', agent_health: written }))
    expect(readStoredAgentHealth(storedPlan)).toEqual(written)
  })

  it('⚠️ a session that never recorded its agents reads UNKNOWN, never zero', () => {
    // The 96 historical sessions predate this field. Rendering them as "0 of 0 agents" would be the
    // same fabrication the narrative is being fixed for — GROUNDING-TEETH: unknown beats a
    // plausible number. -1 is the sentinel phase 3 refuses to build a sentence from.
    for (const legacy of [null, undefined, {}, { decisions: [], plan_narrative: 'old' }, 'not an object']) {
      const h = readStoredAgentHealth(legacy)
      expect(h.agents_total, String(legacy)).toBe(-1)
      expect(h.agents_reported).toBe(-1)
      expect(h.failures).toEqual([])
    }
  })

  it('a malformed block degrades field by field instead of throwing', () => {
    const h = readStoredAgentHealth({ agent_health: { agents_total: 14, failures: 'not an array' } })
    expect(h.agents_total).toBe(14)
    expect(h.agents_reported).toBe(-1)      // absent, so unknown
    expect(h.failures).toEqual([])          // wrong type, so empty rather than a crash
  })

  it('ANTI-VACUITY — the reader can tell a real block from an empty one', () => {
    const real = summariseAgentHealth({ total: 14, reported: ['a', 'b'], skipped: [], failures: [] })
    expect(readStoredAgentHealth({ agent_health: real })).not.toEqual(readStoredAgentHealth(null))
  })
})
