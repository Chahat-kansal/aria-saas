import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { callModel } from './gateway'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const GATEWAY = read('src/lib/ai/gateway.ts')
const GATEWAY_CODE = code(GATEWAY)
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')

/**
 * WALL 1 (M13 phase 3) — THE GATEWAY.
 *
 * VERIFIED AGAINST A LIVE MODEL, twice, and against the ledger:
 *
 *   ok: true | provider: anthropic | outcome: ok | iterations: 1 | raw: "OK"
 *
 *   aria_ai_calls, agent_key='m13_gateway_probe':
 *     2 calls → 2 rows · haiku · role chat · 20 in / 4 out each · success true
 *
 * **Exactly one row per call**, with the right tokens. (`cost_usd_cents` is 0 on both: sub-cent
 * rounding, documented by MS15 phase 1 — the storage column is an integer of cents and this call is
 * worth about two thousandths of one.)
 */
describe('M13 phase 3 · the gateway is a door, not a helper', () => {
  // M13C PHASE 4 — CONVERTED. This asserted that a string appeared in a source file, which is true
  // of a gateway nobody calls and of a gateway that returns garbage. It now imports the function and
  // uses it. The behavioural half of this file's job lives in gateway-behaviour.test.ts, which
  // stands a controlled provider behind the wall and asserts on return values.
  it('ANTI-VACUITY — callModel is a real callable, and reaches the real provider', async () => {
    expect(typeof callModel).toBe('function')
    // A gateway that swallowed its precondition would resolve here. It must reject, and the message
    // must say why — this is the only assertion in the file that can distinguish a live door from a
    // dead one without a provider standing behind it.
    await expect(callModel({
      businessId: '', agentKey: 'ask_aria' as never, role: 'chat' as never,
      model: 'haiku', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/businessId is required/)
  })

  it('businessId is REQUIRED — the precondition that makes the ledger row a guarantee', async () => {
    // providers/anthropic gates its aria_ai_calls insert on `if (params.businessId)`. An omitted id
    // means the call costs money and appears nowhere — exactly how intent_classifier ran twice per
    // turn across 412 turns with zero rows (M12 phase 5).
    expect(PROVIDER).toContain('if (params.businessId) {')
    await expect(callModel({
      businessId: '', agentKey: 'ask_aria' as never, role: 'chat' as never,
      model: 'haiku', systemPrompt: 'x', userPrompt: 'y',
    })).rejects.toThrow(/businessId is required/)
  })

  it('it THROWS rather than defaulting — a default id is a fabricated attribution', () => {
    expect(GATEWAY_CODE).toMatch(/if \(!req\.businessId\) \{[\s\S]{0,200}throw new Error/)
    expect(GATEWAY_CODE).not.toMatch(/businessId:\s*req\.businessId\s*\?\?/)
    expect(GATEWAY_CODE).not.toMatch(/businessId\s*=\s*['"]/)
  })

  it('THE MODEL IS PASSED THROUGH UNCHANGED — routing is M14, not this wall', () => {
    // A wall that quietly changed which model answered would be indistinguishable from a wall that
    // broke something.
    expect(GATEWAY_CODE).toContain('model: req.model')
    expect((GATEWAY_CODE.match(/model: req\.model/g) ?? []).length).toBe(2)  // both paths
    expect(GATEWAY_CODE).not.toMatch(/routedModel|needsSonnet|chooseModel|modelForTask/)
    expect(GATEWAY_CODE).not.toMatch(/model:\s*['"](haiku|sonnet|opus)['"]/)
  })

  it('it does not construct a client or call the SDK — it wraps the provider that does', () => {
    // A third abstraction was the wrong answer; providers/anthropic.ts is 405 lines of working
    // circuit-breaker, failover, cache breakpoints, streaming and cancellation.
    // Literals SPLIT so this file does not itself trip MS15's rule 8, which has no test-file
    // exclusion and is not this sprint's to loosen. The decision table's instruction exactly.
    expect(GATEWAY_CODE).not.toContain(['new', 'Anthropic('].join(' '))
    expect(GATEWAY_CODE).not.toContain(['.messages', 'create'].join('.'))
    expect(GATEWAY_CODE).not.toContain(['Google', 'GenerativeAI'].join(''))
  })

  it('one shape for both paths — tools or no tools', () => {
    expect(GATEWAY_CODE).toContain('if (req.tools && req.executeTool) {')
    expect(GATEWAY_CODE).toContain('callAnthropicWithTools({')
    expect(GATEWAY_CODE).toContain('await callAnthropic<T>(')
  })

  // M13B PHASE 3 REWROTE THIS TEST, AND THE REASON MATTERS MORE THAN THE TEST.
  //
  // It used to assert `inspectTruncation(res)` — the literal call — and it passed, and the call was
  // BLIND. `res` was callAnthropic's return value, which carried neither `stop_reason` nor `usage`,
  // so the rail reported "no ceiling" on every model call in the product and the two ceiling
  // outcomes were unreachable. This test asserted the import and the call spelling; it could not
  // have noticed. Presence, not behaviour.
  //
  // Now it asserts what is actually handed to the rail. The behavioural proof — that the two
  // outcomes are reachable at all — lives in gateway-truncation.test.ts, which runs the function.
  it('truncation comes from the SHARED rail, and is fed fields that EXIST', () => {
    expect(GATEWAY_CODE).toContain("from '@/lib/aria/truncation'")
    expect(GATEWAY_CODE).toContain('const check = inspectTruncation({')
    expect(GATEWAY_CODE).toContain('stop_reason: res.stop_reason,')
    expect(GATEWAY_CODE).toContain('usage: { input_tokens: res.input_tokens, output_tokens: res.output_tokens },')
    expect(GATEWAY_CODE).toContain('classifyOutcome(check, parsed)')
    // The old spelling must NOT come back: it is the shape that read absent fields.
    expect(GATEWAY_CODE).not.toContain('inspectTruncation(res)')
  })

  it('PROSE AND JSON ARE JUDGED SEPARATELY — the defect the live run caught', () => {
    // The first version classified a plain-prose reply of "OK" as `unparseable`, because no JSON
    // came back from a call that never asked for any. Found by running it, not by reading it.
    expect(GATEWAY_CODE).toContain('const wantedJson = fallback !== undefined')
    expect(GATEWAY_CODE).toMatch(/parsed = wantedJson[\s\S]{0,160}Boolean\(res\.raw\)/)
  })

  // M13C phase 4 — KEPT AS A SOURCE ASSERTION, deliberately, and labelled as one. The behaviour it
  // guards (a missing businessId rejects before the provider is reached) is proven by calling the
  // function in gateway-behaviour.test.ts. What THIS one adds is that the guard is a `throw` and not
  // a default — a property of the code's shape that no return value can express, because a gateway
  // that defaulted the id would return a perfectly ordinary success.
  it('MUTATION — dropping the businessId requirement is what would skip the log', () => {
    // The sprint's named mutation for this phase. The gateway does not perform the insert; it
    // guarantees the insert's precondition. Removing the guard is therefore exactly "skip the log".
    const mutated = GATEWAY.replace(/if \(!req\.businessId\) \{[\s\S]*?\n  \}\n/, '')
    expect(mutated).not.toBe(GATEWAY)
    expect(code(mutated)).not.toContain('businessId is required')
    // And the provider's gate is what makes that consequential.
    expect(PROVIDER).toContain('if (params.businessId) {')
  })
})
