import { describe, it, expect } from 'vitest'
import {
  buildCouncilNarrative,
  summariseAgentHealth,
  readStoredAgentHealth,
  type AgentFailure,
} from './proposal-council'

/**
 * M13C PHASE 3 — THE SENTENCE THE OWNER READS.
 *
 * For 94 mornings the council said *"No agent proposals today — all systems are in steady state."*
 * while 12 of its 14 agents were failing silently. Two branches served at least five different
 * nights, and the two that mattered most — a genuinely calm night and a total collapse — rendered
 * IDENTICALLY.
 *
 * ⚠️ Every assertion here CALLS `buildCouncilNarrative` and reads the string it returns. None of them
 * looks for text in a source file. That distinction is this sprint's standing rule and it exists
 * because M13's presence test passed for weeks over a function that never worked.
 */
const fail = (agent_type: string, kind: AgentFailure['kind'] = 'threw', reason = 'boom'): AgentFailure =>
  ({ agent_type, kind, reason })

const health = (o: Partial<Parameters<typeof summariseAgentHealth>[0]> = {}) =>
  summariseAgentHealth({ total: 14, reported: [], skipped: [], failures: [], ...o })

const allFourteen = Array.from({ length: 14 }, (_, i) => 'agent' + i)

describe('M13C phase 3 · the three cases that used to be one sentence', () => {
  it('QUIET — every check ran and found nothing. The only calm case there is', () => {
    const n = buildCouncilNarrative(health({ reported: allFourteen }), 0)
    expect(n.case).toBe('quiet')
    expect(n.text).toBe('All 14 overnight checks reported and nothing needs you today.')
  })

  it('INCOMPLETE — some did not report, and it says so instead of calling it calm', () => {
    const n = buildCouncilNarrative(
      health({ reported: ['bas_compliance', 'inventory_financing'], failures: allFourteen.slice(2).map(a => fail(a)) }), 0)
    expect(n.case).toBe('incomplete')
    expect(n.text).toContain('2 of 14 overnight checks reported')
    expect(n.text).toContain('The other 12 did not')
    expect(n.text).toContain('incomplete')
  })

  it('PROPOSED — work to look at, and it does not pretend the check was complete', () => {
    const complete = buildCouncilNarrative(health({ reported: allFourteen }), 3)
    expect(complete.case).toBe('proposed')
    expect(complete.text).toBe('Reviewed 3 recommendations and approved the highest-impact actions for today.')

    const partial = buildCouncilNarrative(
      health({ reported: allFourteen.slice(0, 10), failures: allFourteen.slice(10).map(a => fail(a)) }), 3)
    expect(partial.case).toBe('incomplete')
    expect(partial.text).toContain('4 of 14 checks did not report')
    expect(partial.text).toContain('not the full picture')
  })

  it('⚠️ THE HEADLINE — none of these three is the old sentence, and no two are the same', () => {
    const texts = [
      buildCouncilNarrative(health({ reported: allFourteen }), 0).text,
      buildCouncilNarrative(health({ reported: ['a'], failures: allFourteen.slice(1).map(x => fail(x)) }), 0).text,
      buildCouncilNarrative(health({ reported: allFourteen }), 3).text,
    ]
    expect(new Set(texts).size).toBe(3)
    for (const t of texts) expect(t).not.toContain('steady state')
  })
})

describe('M13C phase 3 · the cases the old sentence could not express at all', () => {
  it('NOTHING_RAN — zero reported is a fault, and is stated as one', () => {
    const n = buildCouncilNarrative(health({ failures: allFourteen.map(a => fail(a, 'timed_out', 'timeout')) }), 0)
    expect(n.case).toBe('nothing_ran')
    expect(n.text).toContain('None of the 14 overnight checks reported back')
    expect(n.text).toContain('That is a fault, not a quiet night')
  })

  it('LOST — proposals produced and REJECTED is the worst night, not the calmest', () => {
    // Before phase 2 this was an empty array, indistinguishable from finding nothing.
    const n = buildCouncilNarrative(
      health({ reported: allFourteen, proposalPersistError: 'new row violates row-level security policy' }), 0)
    expect(n.case).toBe('lost')
    expect(n.text).toContain('could not be saved')
    expect(n.text).toContain('not a quiet night')
    // It takes priority over every other case — the owner is missing something that really existed.
    const alsoFailing = buildCouncilNarrative(
      health({ failures: allFourteen.map(a => fail(a)), proposalPersistError: 'permission denied' }), 0)
    expect(alsoFailing.case).toBe('lost')
  })

  it('UNKNOWN — a session that recorded nothing says so, and invents no counts', () => {
    // The 96 historical sessions. GROUNDING-TEETH: never render -1 as 0.
    const legacy = readStoredAgentHealth({ decisions: [], plan_narrative: 'old' })
    const n = buildCouncilNarrative(legacy, 0)
    expect(n.case).toBe('unknown')
    expect(n.text).toContain('did not record which overnight checks ran')
    expect(n.text).not.toMatch(/\b0 of\b|-1/)
    // With proposals it still refuses to claim a check count it does not have.
    const withProposals = buildCouncilNarrative(legacy, 2)
    expect(withProposals.case).toBe('unknown')
    expect(withProposals.text).toContain('did not record which checks ran')
    expect(withProposals.text).not.toMatch(/-1/)
  })
})

describe('M13C phase 3 · the counts come from the data, never from a constant', () => {
  it('a fifteenth agent changes the sentence with no code edit', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => 'a' + i)
    const n = buildCouncilNarrative(summariseAgentHealth({ total: 15, reported: fifteen, skipped: [], failures: [] }), 0)
    expect(n.text).toContain('All 15 overnight checks')
  })

  it('an agent the owner switched off is excluded from the total, and said so', () => {
    const n = buildCouncilNarrative(
      health({ reported: allFourteen.slice(0, 12), skipped: ['pricing', 'clv'] }), 0)
    expect(n.case).toBe('quiet')
    // 12 expected, not 14 — a disabled agent is not a missing one.
    expect(n.text).toBe('All 12 overnight checks reported (2 are switched off) and nothing needs you today.')
  })

  it('singular reads like English, not like a template', () => {
    const one = buildCouncilNarrative(summariseAgentHealth({ total: 1, reported: ['x'], skipped: [], failures: [] }), 0)
    expect(one.text).toBe('All 1 overnight check reported and nothing needs you today.')
    const oneProposal = buildCouncilNarrative(health({ reported: allFourteen }), 1)
    expect(oneProposal.text).toContain('1 recommendation and')
    const oneOff = buildCouncilNarrative(health({ reported: allFourteen.slice(0, 13), skipped: ['clv'] }), 0)
    expect(oneOff.text).toContain('(1 is switched off)')
  })

  it('MUTATION — collapsing the cases back to the old two-branch sentence goes red', () => {
    // The pre-M13C implementation, reproduced exactly.
    const old = (proposalsCount: number) => proposalsCount === 0
      ? 'No agent proposals today — all systems are in steady state.'
      : 'Aria reviewed ' + proposalsCount + ' proposals and approved the highest-impact actions for today.'

    const collapsed = new Set([
      old(0),  // a genuinely quiet night
      old(0),  // 12 of 14 agents dead
      old(0),  // nothing ran at all
      old(0),  // proposals produced and lost
    ])
    // Four different nights, ONE sentence. That is the bug, in one assertion.
    expect(collapsed.size).toBe(1)

    const now = new Set([
      buildCouncilNarrative(health({ reported: allFourteen }), 0).text,
      buildCouncilNarrative(health({ reported: ['a', 'b'], failures: allFourteen.slice(2).map(x => fail(x)) }), 0).text,
      buildCouncilNarrative(health({ failures: allFourteen.map(x => fail(x)) }), 0).text,
      buildCouncilNarrative(health({ reported: allFourteen, proposalPersistError: 'rls' }), 0).text,
    ])
    expect(now.size).toBe(4)
  })

  it('ANTI-VACUITY — "steady state" appears in no branch this function can reach', () => {
    const every = [
      buildCouncilNarrative(health({ reported: allFourteen }), 0),
      buildCouncilNarrative(health({ reported: allFourteen }), 5),
      buildCouncilNarrative(health({ reported: ['a'], failures: [fail('b')] }), 0),
      buildCouncilNarrative(health({ reported: ['a'], failures: [fail('b')] }), 5),
      buildCouncilNarrative(health({ failures: allFourteen.map(x => fail(x)) }), 0),
      buildCouncilNarrative(health({ reported: allFourteen, proposalPersistError: 'x' }), 0),
      buildCouncilNarrative(readStoredAgentHealth(null), 0),
    ]
    // Every case reachable, every one distinct in kind, none of them the old claim.
    expect(new Set(every.map(e => e.case)).size).toBe(6)
    for (const e of every) {
      expect(e.text, e.case).not.toContain('steady state')
      expect(e.text.length, e.case).toBeGreaterThan(20)
    }
  })
})
