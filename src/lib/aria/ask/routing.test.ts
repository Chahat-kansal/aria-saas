import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/aria/ask/route.ts')
const INTENT = read('src/lib/aria/ask/intent.ts')
const ARIA_INTENT = read('src/lib/aria/ask/aria-intent.ts')
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')

/**
 * M12 PHASE 5 — THE RULE THAT CHOSE HAIKU.
 *
 * ⚠️ THE BRIEF'S FAULT #2 SAYS "the router chose Haiku for a judgement request". NO ROUTER RAN.
 *
 * `routedModel` is computed at route.ts:2272 and the general fast-path returns at :866, more than
 * fourteen hundred lines earlier. The model was `haiku` because THE LANE HARDCODES IT, not because
 * anything classified the request as simple. Establishing that from the code is what this phase was
 * for, and it changes the remedy: there was no misrouting to correct.
 */
describe('M12 phase 5 · what actually chose the model', () => {
  it('the general fast-path hardcodes haiku and returns BEFORE the router exists', () => {
    const laneAt = ROUTE.indexOf("lane: 'general-fast-path'")
    const routerAt = ROUTE.indexOf("let routedModel: 'haiku' | 'sonnet' | 'opus'")
    expect(laneAt).toBeGreaterThan(-1)
    expect(routerAt).toBeGreaterThan(-1)
    // The lane is upstream of the router. Nothing it does can be a routing decision.
    expect(laneAt).toBeLessThan(routerAt)
    expect(ROUTE).toMatch(/model: 'haiku',\s*\n\s*systemPrompt: generalSystemPrompt/)
  })

  it('the router itself defaults to haiku and escapes to sonnet only on signals', () => {
    // Recorded so the rule is readable without re-deriving it: escalate → opus; budget exhausted →
    // haiku; needsSonnet → sonnet; otherwise haiku.
    expect(ROUTE).toMatch(/if \(intent\.type === 'escalate'\) \{\s*\n\s*routedModel = 'opus'/)
    expect(ROUTE).toMatch(/\} else if \(sonnetExhausted\) \{\s*\n\s*routedModel = 'haiku'/)
    expect(ROUTE).toMatch(/\} else if \(needsSonnet\) \{\s*\n\s*routedModel = 'sonnet'/)
    expect(ROUTE).toMatch(/\} else \{\s*\n\s*routedModel = 'haiku'/)
  })

  it('HAIKU WAS NOT THE FAULT — no model was raised to make a symptom go away', () => {
    // With the constitution attached and grounding declared absent, haiku produced the correct
    // answer for the failing message (see RUN-M12.md). Raising this lane to sonnet would have cost
    // roughly three times as much and fixed nothing, because the prompt was the fault.
    // Asserted as an absence: the lane still asks for haiku.
    const laneStart = ROUTE.indexOf("lane: 'general-fast-path'")
    const laneEnd = ROUTE.indexOf('const generalResult', laneStart)
    const lane = ROUTE.slice(laneStart, laneEnd + 400)
    expect(lane).toContain("model: 'haiku'")
    expect(lane).not.toContain("model: 'sonnet'")
    expect(lane).not.toContain("model: 'opus'")
  })
})

describe('M12 phase 5 · the decision is now on the record', () => {
  it('the general lane logs its lane, model, grounding and WHICH classifier triggered it', () => {
    // It logged nothing before: the main lane's `[ask-aria] route` line is 1,400 lines downstream of
    // this lane's return, so a turn that took the fast-path left no trace of the decision at all.
    expect(ROUTE).toContain("lane: 'general-fast-path'")
    expect(ROUTE).toContain('triggered_by:')
    expect(ROUTE).toContain('routing_reason: ariaIntent.routing_reason')
    expect(ROUTE).toContain('grounded: false,')
  })

  it('triggered_by distinguishes the two classifiers, because they disagreed', () => {
    // On the failing message classifyIntent said 'smalltalk' and classifyAriaIntent said 'general',
    // and only the second is in the condition. A single boolean would have hidden that.
    expect(ROUTE).toContain("'classifyIntent'")
    expect(ROUTE).toContain("'classifyAriaIntent:general'")
    expect(ROUTE).toContain("'classifyAriaIntent:smalltalk'")
  })

  it('BOTH classifier calls now carry businessId, so they reach aria_ai_calls', () => {
    // callAnthropic gates its ledger insert on `if (params.businessId)`. Neither classifier passed
    // one, so agent_key='intent_classifier' had ZERO rows ever, across 412 ask_aria turns, while
    // running twice per turn. Not a bug in the logger — a bug in the call sites.
    expect(PROVIDER).toContain('if (params.businessId) {')
    expect(INTENT).toMatch(/businessId\?: string,/)
    expect(ARIA_INTENT).toMatch(/classifyAriaIntent\(message: string, businessId\?: string\)/)
    // Passed at every provider call site in both files, including the Gemini fallbacks.
    expect((INTENT.match(/businessId,/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((ARIA_INTENT.match(/businessId,/g) ?? []).length).toBeGreaterThanOrEqual(2)
    // And the route actually passes it.
    expect(ROUTE).toContain('classifyIntent(message, undefined, bid)')
    expect(ROUTE).toContain('classifyAriaIntent(message, bid)')
  })

  it('MUTATION — dropping businessId puts the classifiers back off the ledger', () => {
    const mutated = ROUTE.replace('classifyAriaIntent(message, bid)', 'classifyAriaIntent(message)')
    expect(mutated).not.toBe(ROUTE)
    expect(mutated).not.toContain('classifyAriaIntent(message, bid)')
    // The gate that makes it matter.
    expect(PROVIDER).toContain('if (params.businessId) {')
  })
})
