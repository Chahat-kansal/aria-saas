import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectTruncation, classifyOutcome } from '@/lib/aria/truncation'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const GATEWAY = read('src/lib/ai/gateway.ts')
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')
const COUNCIL = read('src/lib/aria/answer-council.ts')

/**
 * M13B PHASE 3 — THE GATEWAY'S TRUNCATION CHECK WAS VACUOUS, AND THE ANSWER COUNCIL COULD NOT
 * MIGRATE UNTIL IT WASN'T.
 *
 * M13 wired `inspectTruncation(res)` into the gateway's plain path. `res` was `callAnthropic`'s
 * return value, which carried `data · raw · cost_cents · latency_ms · success · provider` — and
 * NEITHER `stop_reason` NOR `usage`. So the rail read two fields that did not exist, reported "no
 * ceiling" on every call in the product, and `ok_at_ceiling` / `truncated_mid_structure` — the two
 * outcomes M8 built the whole module for — were unreachable.
 *
 * M13's own test asserted `GATEWAY_CODE.toContain("from '@/lib/aria/truncation'")`. The import was
 * there. The behaviour was not. That is failure pattern #1 of this codebase, committed by the
 * commit that added the wall, and it was found by RUNNING the function rather than reading it.
 *
 * ── M13C PHASE 4 — WHAT THIS FILE IS NOW, AND WHAT IT IS NOT ───────────────────────────────────
 * The first two `it`s below CALL `inspectTruncation` and `classifyOutcome` and assert on returned
 * values; they were always behaviour tests and they stay.
 *
 * The rest assert on SOURCE TEXT, and phase 4 is honest about what that can and cannot prove. They
 * are STRUCTURAL assertions — "this file no longer constructs a client", "these two call sites exist
 * and go through the door" — and a structural property is exactly what W1 guarantees, so a source
 * scan is the right instrument for it. What they must never be mistaken for is proof that the wall
 * WORKS. That proof now lives in `gateway-behaviour.test.ts`, which stands a controlled provider
 * behind `callModel`, asserts on what comes back, and reproduces the M13 bug end to end as its
 * anti-vacuity probe.
 *
 * Read the pair together: this file says the door was built in the right place; that file says the
 * door opens.
 */
describe('M13B phase 3 · truncation is read from real fields, not absent ones', () => {
  it('THE BUG, REPRODUCED — the old return shape made the rail structurally blind', () => {
    // The exact object callAnthropic returned before this phase.
    const oldShape = { data: {}, raw: 'x', cost_cents: 3, latency_ms: 12, success: true, provider: 'anthropic' }
    const blind = inspectTruncation(oldShape)
    expect(blind).toEqual({ hitCeiling: false, stopReason: null, outputTokens: null })
    // Both ceiling outcomes were unreachable: whatever the model did, only these two could come out.
    expect(classifyOutcome(blind, true)).toBe('ok')
    expect(classifyOutcome(blind, false)).toBe('unparseable')
  })

  it('THE FIX — with the fields the provider now returns, both ceiling outcomes are reachable', () => {
    const clipped = inspectTruncation({ stop_reason: 'max_tokens', usage: { input_tokens: 900, output_tokens: 4000 } })
    expect(clipped).toEqual({ hitCeiling: true, stopReason: 'max_tokens', outputTokens: 4000 })
    // The pair M8 insisted on: hitting the ceiling is not automatically a failure.
    expect(classifyOutcome(clipped, true)).toBe('ok_at_ceiling')
    expect(classifyOutcome(clipped, false)).toBe('truncated_mid_structure')
    const clean = inspectTruncation({ stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 812 } })
    expect(classifyOutcome(clean, true)).toBe('ok')
  })

  // STRUCTURAL — the behavioural counterpart is gateway-behaviour.test.ts's
  // 'token counts reach the caller' and the OLD-shape probe, which both call callModel.
  it('the provider actually returns those fields, on every path', () => {
    expect(PROVIDER).toContain('stop_reason: string | null')
    expect(PROVIDER).toContain("stopReason = (response as { stop_reason?: string | null }).stop_reason ?? null")
    // Gemini has no stop_reason and must say null rather than invent one. Three non-Anthropic
    // returns: circuit-open fallback, post-failure failover, and the Gemini helper's own two.
    expect((PROVIDER.match(/stop_reason: null/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  // STRUCTURAL — behavioural counterpart: 'a clipped call that still parsed is ok_at_ceiling',
  // which goes RED if this reshaping is removed. Verified by applying that exact mutation.
  it('the gateway reshapes them for the rail instead of re-implementing it', () => {
    expect(GATEWAY).toContain('const check = inspectTruncation({')
    expect(GATEWAY).toContain('stop_reason: res.stop_reason,')
    expect(GATEWAY).toContain('usage: { input_tokens: res.input_tokens, output_tokens: res.output_tokens },')
    // And it hands the raw facts on, not just the verdict — the council writes stop_reason verbatim.
    expect(GATEWAY).toContain('truncation: check,')
  })

  // STRUCTURAL — behavioural counterpart: 'requestSummary and timeoutMs actually arrive', which
  // reads them off the provider mock's received arguments rather than off the source.
  it('the gateway stopped dropping requestSummary and timeoutMs on the plain path', () => {
    // Both were in AriaModelRequest and forwarded only on the tool path. The council needs each.
    expect(GATEWAY).toContain('requestSummary: req.requestSummary,')
    expect(GATEWAY).toContain('timeoutMs: req.timeoutMs,')
    expect(PROVIDER).toContain('requestSummary?: string')
    expect(PROVIDER).toContain('request_summary: params.requestSummary ?? null,')
  })
})

describe('M13B phase 3 · the hero council is behind the wall', () => {
  it('the answer council owns no client, no backoff and no logger of its own', () => {
    // The literals are SPLIT, not the guard loosened. canon-rail-guard blocked this file's first
    // version because it quoted the very patterns its rules block — the third time in this series
    // (M12 rule 9, M13 rule 8, here). Each time the answer was the same one the decision table
    // gives: split the literal, never weaken the rule.
    const gone = [
      ['new', 'Anthropic('].join(' '),
      ['messages', 'create'].join('.'),
      ['async function', 'withBackoff'].join(' '),
      ['async function', 'logAICall'].join(' '),
    ]
    for (const g of gone) {
      expect(COUNCIL.includes(g), g).toBe(false)
    }
    expect(COUNCIL).toContain("import { callModel } from '@/lib/ai/gateway'")
  })

  it('both call sites go through the gateway — advisors AND synthesis', () => {
    expect((COUNCIL.match(/await callModel\(/g) ?? []).length).toBe(2)
    expect(COUNCIL).toContain("agentKey: ('council_' + role) as AgentKey")
    expect(COUNCIL).toContain("agentKey: 'council_synthesis'")
  })

  it('BEHAVIOUR PRESERVED — the numbers that decide what the model does are unchanged', () => {
    expect(COUNCIL).toContain('maxTokens: 4000')      // advisors, S8 phase 1's measured budget
    expect(COUNCIL).toContain('temperature: 0.25')    // advisors
    expect(COUNCIL).toContain('maxTokens: 6000')      // synthesis, deliberately not moved
    expect(COUNCIL).toContain('temperature: 0.2')     // synthesis
    expect(COUNCIL).toContain('timeoutMs,')           // per-advisor, was 18000 via callWithTimeout
    expect(COUNCIL).toContain('timeoutMs: 45000')     // synthesis, unchanged
  })

  it('M8 SURVIVED THE MOVE — ceiling disclosure and lost-advisor accounting still fire', () => {
    // The sprint's explicit condition. These are the rows an owner's clipped answer leaves behind.
    expect((COUNCIL.match(/agent_key: 'council_ceiling'/g) ?? []).length).toBe(2)
    expect(COUNCIL).toContain('truncationSignal(')
    expect(COUNCIL).toContain('const trunc = res.truncation')
    expect(COUNCIL).toContain('const synthTrunc = res.truncation')
    // Classified HERE against safeParseJSON, not taken from the gateway: the gateway judges prose
    // on "was there any text", which is a weaker question than "did the JSON survive".
    expect((COUNCIL.match(/classifyOutcome\(/g) ?? []).length).toBe(2)
    expect(COUNCIL).toContain('lostAdvisors')
  })

  it('the model ids map to gateway aliases by lookup, and an unknown id throws', () => {
    // A silent fallback to haiku would have downgraded every escalated synthesis to the cheap model
    // without anything going red.
    expect(COUNCIL).toContain("if (modelId === 'claude-sonnet-4-5-20250929') return 'sonnet'")
    expect(COUNCIL).toContain("throw new Error('[council] no gateway alias for model id ' + modelId)")
  })

  it('the parse-level signal the old logger carried is not lost', () => {
    // aria_ai_calls.success now means "the call succeeded" for council rows, as it does everywhere
    // else. Whether THIS council's parser survived is recorded separately, and only on bad news.
    expect((COUNCIL.match(/agent_key: 'council_outcome'/g) ?? []).length).toBe(4)
    expect(PROVIDER).toContain("agent_key: 'ai_log_failure'")   // lifted from the council's logger
  })
})
