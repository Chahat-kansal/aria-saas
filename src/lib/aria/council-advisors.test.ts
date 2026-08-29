import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  renderAdvisorSection, lostAdvisors, lostAdvisorRule, advisorShortfallNote,
  type AdvisorLike,
} from './council-advisors'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ok = (role: string): AdvisorLike => ({
  role, observations: ['Takings are down on Tuesdays'], recommendations: ['Trial a 3pm offer'],
  confidence: 'high', succeeded: true, outcome: 'ok',
})
const lost = (role: string, outcome: AdvisorLike['outcome']): AdvisorLike => ({
  role, observations: [], recommendations: [], confidence: 'low', succeeded: false, outcome,
})

describe('S8 phase 2 · a lost advisor reads as lost, not as "found nothing"', () => {
  it('THE BUG: a failed advisor used to render two blank fields under a confident heading', () => {
    const out = renderAdvisorSection('RISK', lost('risk', 'truncated_mid_structure'))
    // The exact shape that caused it — a header with an empty body, in a prompt instead of a panel.
    expect(out).not.toMatch(/Observations:\s*$/m)
    expect(out).not.toContain('Observations: \n')
    expect(out).not.toContain('confidence: low')
    expect(out).toContain('NOT AVAILABLE')
    expect(out).toContain('ran out of room before it finished writing')
  })

  it('each reason is named, so nobody has to guess which of four things happened', () => {
    expect(renderAdvisorSection('RISK', lost('risk', 'truncated_mid_structure'))).toContain('ran out of room')
    expect(renderAdvisorSection('RISK', lost('risk', 'unparseable'))).toContain('did not return a usable answer')
    expect(renderAdvisorSection('RISK', lost('risk', undefined))).toContain('did not report back')
  })

  it('a working advisor is completely unchanged — this is not a rewrite of the good path', () => {
    const out = renderAdvisorSection('GROWTH', ok('growth'))
    expect(out).toContain('GROWTH BRAIN (confidence: high):')
    expect(out).toContain('Observations: Takings are down on Tuesdays')
    expect(out).toContain('Recommendations: Trial a 3pm offer')
    expect(out).not.toContain('NOT AVAILABLE')
    // The strategy brain's extra line still renders, and only for a working advisor.
    expect(renderAdvisorSection('STRATEGY', ok('strategy'), 'Primary lever: price')).toContain('Primary lever: price')
    expect(renderAdvisorSection('STRATEGY', lost('strategy', 'unparseable'), 'Primary lever: price'))
      .not.toContain('Primary lever')
  })

  it('the roster names WHICH advisors were lost, not just how many', () => {
    const brains = [ok('growth'), lost('risk', 'truncated_mid_structure'), ok('strategy'), lost('context', 'unparseable')]
    expect(lostAdvisors(brains)).toEqual([
      { role: 'risk', reason: 'truncated_mid_structure' },
      { role: 'context', reason: 'unparseable' },
    ])
    expect(lostAdvisors([ok('growth')])).toEqual([])
  })

  it('THE RULE tells the model the missing fact — RULE 19, not a prohibition', () => {
    const rule = lostAdvisorRule([{ role: 'risk' }, { role: 'context' }])
    expect(rule).toContain('risk, context')
    expect(rule).toContain('did not examine anything')
    expect(rule).toContain('is NOT a finding')
    // A complete council carries no rule at all — never noise about a problem that is not happening.
    expect(lostAdvisorRule([])).toBe('')
  })

  it('the owner is told, in one sentence, with no invented number', () => {
    expect(advisorShortfallNote(0)).toBeNull()
    expect(advisorShortfallNote(1)).toContain('One of Aria’s four advisors')
    expect(advisorShortfallNote(2)).toContain('2 of Aria’s four advisors')
    // "narrower", never "wrong" — a council of two is narrower, not false.
    expect(advisorShortfallNote(2)).toContain('narrower')
    expect(advisorShortfallNote(2)).not.toMatch(/wrong|incorrect|unreliable/i)
    // GROUNDING-TEETH: no percentage, no confidence score the owner cannot act on.
    expect(advisorShortfallNote(2)).not.toMatch(/\d+%|score/i)
  })
})

describe('S8 phase 2 · the failure reaches the prompt and the owner', () => {
  it('council.ts renders every advisor through the guarded renderer', () => {
    const src = strip(read('src/lib/aria/council.ts'))
    for (const label of ['GROWTH', 'RISK', 'STRATEGY', 'CONTEXT']) {
      expect(src, label + ' is not rendered through renderAdvisorSection')
        .toContain("renderAdvisorSection('" + label + "'")
    }
    // ANTI-VACUITY: the old unconditional form must be gone, not merely supplemented. If both
    // existed this test would pass while the bug stayed.
    expect(src).not.toMatch(/GROWTH BRAIN \(confidence: \$\{/)
    expect(src).not.toMatch(/Observations: \$\{(growth|risk|strategy|context)\.observations/)
  })

  it('the route carries advisors_lost, and always as an array', () => {
    const src = strip(read('src/app/api/aria/ask/route.ts'))
    expect(src).toContain('advisors_lost:')
    // `?? []` — never omitted, so a client cannot read "absent" as "fine".
    expect(src).toMatch(/advisors_lost: \(council\.advisors_lost \?\? \[\]\)/)
  })

  it('the surface renders it, and does NOT fold it into `incomplete`', () => {
    const src = strip(read('src/components/ask-aria-ax/AskAriaTransition.tsx'))
    expect(src).toContain('advisorsLost')
    expect(src).toContain('advisors_lost')
    // `incomplete` means the owner pressed stop. Conflating the two makes both unreadable.
    expect(src).toMatch(/incomplete: Boolean\(result\?\.incomplete \?\? result\?\.stopped\)/)
  })

  it('MUTATION PROBE — swallowing the failure goes red', () => {
    // Restore the old behaviour: render a failed advisor as if it had reported.
    const swallowed = (b: AdvisorLike) =>
      b.role.toUpperCase() + ' BRAIN (confidence: ' + b.confidence + '):\nObservations: '
      + b.observations.join(' | ') + '\nRecommendations: ' + b.recommendations.join(' | ') + '\n'
    const bad = swallowed(lost('risk', 'truncated_mid_structure'))
    // This is what the first assertion in this file forbids, and it must genuinely violate it.
    expect(bad).toMatch(/Observations: \n/)
    expect(bad).not.toContain('NOT AVAILABLE')
    expect(bad).toContain('confidence: low')

    const good = renderAdvisorSection('RISK', lost('risk', 'truncated_mid_structure'))
    expect(good).not.toBe(bad)
  })

  it('MUTATION PROBE — dropping the rule leaves the model with nothing to go on', () => {
    const lostTwo = [{ role: 'risk' }, { role: 'context' }]
    expect(lostAdvisorRule(lostTwo).length).toBeGreaterThan(50)
    expect(lostAdvisorRule([]).length).toBe(0)   // the empty case is the mutation, and it differs
    expect(lostAdvisorRule(lostTwo)).not.toBe(lostAdvisorRule([]))
  })
})
