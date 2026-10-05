import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18B · PHASE 2 — THE OUTAGE LANE: MEASURED, NOT CHANGED.
 *
 * 156 conversations have ended in the every-provider-down reply — **19.9% of all 785**. Measured over
 * those 156, against `aria_ai_calls`:
 *
 *   · **155** had a REAL model call succeed (`google`/`openai`/`anthropic`) within ±2 minutes
 *   · **144** within ±30 SECONDS — `google` working in 125 of them
 *
 * So the owner was told every provider was down while one was demonstrably answering, over and over.
 *
 * ⚠️ AND THIS SPRINT DOES NOT FIX IT. Changing the condition alters what a fifth of conversations say,
 * which is the founder's call (M18C), not a side effect of a spend sprint. What this phase adds is the
 * record: which providers were tried and what each returned. **The copy is asserted byte-identical
 * below**, because "logging only" is a claim that has to be checkable.
 */

const anthropicCreate = vi.fn()
const openaiCreate = vi.fn()
const fetchMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: (...a: unknown[]) => anthropicCreate(...a) as unknown } },
}))
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: (...a: unknown[]) => openaiCreate(...a) as unknown } } },
}))
vi.mock('@/lib/supabase-lazy', () => ({ makeLazyServiceRoleClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }))
vi.mock('@/lib/aria/cost', () => ({ computeCostCentsOrNull: () => null }))
vi.mock('@/lib/aria/circuit-breaker', () => ({
  isAnthropicCircuitOpen: async () => ({ open: false }),
  isHardProviderError: () => false,
  isAnthropicUnreachable: () => true,
  recordAnthropicHardDown: async () => ({ tripped: false }),
  recordAnthropicFailure: async () => ({ tripped: false }),
  recordAnthropicSuccess: async () => {},
  recordAnthropicFallbackProvider: async () => {},
}))

const { ariaChatWithProvider } = await import('@/lib/ai-router')
const { degradedGroundedAnswer } = await import('./degraded-answer')

/**
 * ⚠️ THE EXACT STRING `degraded-answer.ts` RETURNS WHEN EVERY PROVIDER IS DOWN, pinned here.
 *
 * The sprint's hard rule is that nothing an owner sees may change. A test that checked "some reply was
 * returned" would pass through any rewording, which is precisely the regression the rule forbids. So
 * this is the literal text, and the assertion is `toBe`, not `toContain`.
 */
const ALL_DOWN_REPLY =
  'Aria\'s thinking cap is off for a moment — your data is safe and everything else keeps working. Give it another go in a bit.'

beforeEach(() => {
  anthropicCreate.mockReset()
  openaiCreate.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.GEMINI_API_KEY = 'test-key-not-real'
})

/** Every leg fails — the shape that produces the outage reply. */
function everythingDown() {
  anthropicCreate.mockRejectedValue(new Error('Could not resolve authentication method'))
  openaiCreate.mockRejectedValue(new Error('401 Incorrect API key provided'))
  fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}), text: async () => 'API key not valid' })
}

describe('M18B phase 2 · the attempt trail', () => {
  it('⚠️ RECORDS EVERY LEG THAT WAS TRIED AND WHAT EACH RETURNED — the thing nothing recorded before', async () => {
    everythingDown()

    const out = await ariaChatWithProvider('chat', 'how are we doing?', 200, { businessId: 'b1', agentKey: 'degraded_grounded_answer' })

    expect(out.provider).toBe('none')
    // ⚠️ ALL FOUR LEGS, in chain order. `TASK_PROVIDERS.chat === 'claude'`, so the sequence is
    // [claude, gemini, openai, haiku]. Before this phase, the outage log said only `{cached:false}`.
    expect(out.attempts.map(a => a.provider)).toEqual(['claude', 'gemini', 'openai', 'haiku'])
    expect(out.attempts.every(a => a.ok === false)).toBe(true)
    // And WHAT each returned, not merely that it failed — the difference between "it broke" and a
    // diagnosis. An auth error and a bad-key 400 are different faults with different fixes.
    expect(out.attempts.find(a => a.provider === 'claude')?.error).toContain('Could not resolve authentication')
    expect(out.attempts.find(a => a.provider === 'openai')?.error).toContain('Incorrect API key')
  })

  it('⚠️ RECORDS THE SUCCESS TOO, so a trail of all-failures is distinguishable from a short one', async () => {
    // Anti-vacuity: if `attempts` only ever listed failures, a one-entry trail would be ambiguous
    // between "the first provider worked" and "we only tried one".
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Claude answered.' }], usage: { input_tokens: 1, output_tokens: 1 } })

    const out = await ariaChatWithProvider('chat', 'q', 200, {})

    expect(out.provider).toBe('claude')
    expect(out.attempts).toEqual([{ provider: 'claude', ok: true }])
  })

  it('records the failures BEFORE the success, in order', async () => {
    anthropicCreate.mockRejectedValueOnce(new Error('529 overloaded_error'))
    fetchMock.mockResolvedValue({
      ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gemini answered.' }] } }] }), text: async () => 'ok',
    })

    const out = await ariaChatWithProvider('chat', 'q', 200, {})

    expect(out.provider).toBe('gemini')
    expect(out.attempts.map(a => a.provider + ':' + a.ok)).toEqual(['claude:false', 'gemini:true'])
  })
})

describe('M18B phase 2 · the owner-facing copy is BYTE-IDENTICAL', () => {
  it('⚠️ THE ALL-PROVIDERS-DOWN REPLY IS UNCHANGED, CHARACTER FOR CHARACTER', async () => {
    everythingDown()

    const deg = await degradedGroundedAnswer({ groundTruth: 'revenue today: $22.50', message: 'how are we doing?', businessId: 'b1' })

    // `toBe`, not `toContain`. The sprint's hard rule is that nothing an owner sees may change, and a
    // substring check would pass through any rewording.
    expect(deg.reply).toBe(ALL_DOWN_REPLY)
    expect(deg.provider).toBe('none')
    // The diagnostics ride ALONGSIDE the unchanged reply — that is the whole shape of this phase.
    expect(deg.attempts.map(a => a.provider)).toEqual(['claude', 'gemini', 'openai', 'haiku'])
  })

  it('⚠️ A WORKING PROVIDER STILL ANSWERS NORMALLY — the outage copy is not newly reachable', async () => {
    // The other half of the hard rule. If adding diagnostics had changed WHEN the outage text appears,
    // this is the test that catches it: Gemini works, so the owner gets Gemini's answer, not the reply.
    anthropicCreate.mockRejectedValue(new Error('Could not resolve authentication method'))
    fetchMock.mockResolvedValue({
      ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'You took $22.50 today.' }] } }] }), text: async () => 'ok',
    })

    const deg = await degradedGroundedAnswer({ groundTruth: 'revenue today: $22.50', message: 'how are we doing?', businessId: 'b1' })

    expect(deg.provider).toBe('gemini')
    expect(deg.reply).toBe('You took $22.50 today.')
    expect(deg.reply).not.toBe(ALL_DOWN_REPLY)
    // ⚠️ THE TRAIL IS CARRIED OUT ON THE SUCCESS PATH TOO. Added because the mutation check caught its
    // absence: `return { reply: text, provider, attempts: [] }` stayed GREEN, which would have meant a
    // failover that worked recorded nothing about the leg it had to skip to get there — the single most
    // useful line for diagnosing why a provider is being skipped at all.
    expect(deg.attempts.map(a => a.provider + ':' + a.ok)).toEqual(['claude:false', 'gemini:true'])
    expect(deg.attempts.find(a => a.provider === 'claude')?.error).toContain('Could not resolve authentication')
  })
})
