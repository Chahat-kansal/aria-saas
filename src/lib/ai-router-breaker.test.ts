import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18B · PHASE 1 — A DEAD PROVIDER IS SKIPPED, NOT RETRIED.
 *
 * ⚠️ THE MEASUREMENT THIS EXISTS FOR. `ai-router.ts` never imported the circuit breaker, so every
 * `thread_title` / `ask_suggestions` / classifier turn walked into Sonnet and then Haiku before Gemini
 * answered. Since 21 September: **346 Claude attempts, 0 successes**, with the ledger showing pairs of
 * failures in the same second.
 *
 * ⚠️ THESE TESTS ASSERT CALL COUNTS, NOT JUST OUTCOMES, because the outcome was already correct — the
 * owner always got their answer from Gemini. What was wrong was how many doomed calls were made first,
 * and an outcome-only test passes just as happily with two wasted round-trips as with none.
 */

const anthropicCreate = vi.fn()
const openaiCreate = vi.fn()
const fetchMock = vi.fn()

let circuitOpen: { open: boolean; incidentId?: string; hard?: boolean } = { open: false }
const recordHardDown = vi.fn(async (..._a: unknown[]) => ({ tripped: true, incidentId: 'inc-1' }))
const recordFailure = vi.fn(async (..._a: unknown[]) => ({ tripped: false }))
const recordSuccess = vi.fn(async (..._a: unknown[]) => {})
const recordFallbackProvider = vi.fn(async (..._a: unknown[]) => {})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: (...a: unknown[]) => anthropicCreate(...a) as unknown } },
}))
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: (...a: unknown[]) => openaiCreate(...a) as unknown } } },
}))
vi.mock('@/lib/supabase-lazy', () => ({ makeLazyServiceRoleClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }))
vi.mock('@/lib/aria/cost', () => ({ computeCostCentsOrNull: () => null }))
vi.mock('@/lib/aria/circuit-breaker', () => ({
  isAnthropicCircuitOpen: async () => circuitOpen,
  // The REAL classifiers — importing the module under test must not also stub the decision being tested.
  isHardProviderError: (m: string) => /credit balance|insufficient|billing|quota|payment|could not resolve authentication|invalid x-api-key|unauthorized|401|403/.test((m ?? '').toLowerCase()) && !/429|rate.?limit|529|503|overload|timed out|timeout/.test((m ?? '').toLowerCase()),
  isAnthropicUnreachable: (m: string) => /credit balance|authentication|429|rate.?limit|529|503|timed out|timeout|overload/.test((m ?? '').toLowerCase()),
  recordAnthropicHardDown: (...a: unknown[]) => recordHardDown(...a) as unknown,
  recordAnthropicFailure: (...a: unknown[]) => recordFailure(...a) as unknown,
  recordAnthropicSuccess: (...a: unknown[]) => recordSuccess(...a) as unknown,
  recordAnthropicFallbackProvider: (...a: unknown[]) => recordFallbackProvider(...a) as unknown,
}))

const { ariaChatWithProvider } = await import('./ai-router')

/** Gemini is reached by direct REST (see ai-router.ts's note), so it is the fetch mock. */
function geminiAnswers(text = 'Gemini answered.') {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => text,
  })
}

beforeEach(() => {
  circuitOpen = { open: false }
  anthropicCreate.mockReset()
  openaiCreate.mockReset()
  fetchMock.mockReset()
  recordHardDown.mockClear(); recordFailure.mockClear(); recordSuccess.mockClear(); recordFallbackProvider.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  process.env.GEMINI_API_KEY = 'test-key-not-real'
  geminiAnswers()
})

describe('M18B phase 1 · the router consults the shared breaker', () => {
  it('⚠️ WITH THE CIRCUIT OPEN, ANTHROPIC IS NOT CALLED AT ALL — asserted by COUNT, not by outcome', async () => {
    circuitOpen = { open: true, incidentId: 'inc-1', hard: true }

    const out = await ariaChatWithProvider('insight', 'how are we doing?', 64, { businessId: 'b1', agentKey: 'thread_title' })

    // ⚠️ ZERO. Not "fewer" — the whole point is that a provider known to be dead is not dialled.
    expect(anthropicCreate).toHaveBeenCalledTimes(0)
    // And the owner still gets their answer, from the same provider as before.
    expect(out.provider).toBe('gemini')
    expect(out.text).toBe('Gemini answered.')
    // The incident is stamped with who actually served, so the skip is visible in the incident log.
    expect(recordFallbackProvider).toHaveBeenCalledWith('inc-1', 'gemini')
  })

  it('⚠️ WITH THE CIRCUIT CLOSED IT STILL TRIES ANTHROPIC — anti-vacuity for the test above', async () => {
    // Without this, a router that never called Anthropic under any condition would pass the first test
    // and have broken the product.
    circuitOpen = { open: false }
    anthropicCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Claude answered.' }], usage: { input_tokens: 10, output_tokens: 5 } })

    const out = await ariaChatWithProvider('insight', 'q', 64, { businessId: 'b1', agentKey: 'thread_title' })

    expect(anthropicCreate.mock.calls.length).toBeGreaterThan(0)
    expect(out.text).toBe('Claude answered.')
    // A success CLOSES the incident, so a top-up heals on the next turn instead of waiting out the TTL.
    expect(recordSuccess).toHaveBeenCalled()
  })

  it('⚠️ A CREDIT-BALANCE 400 OPENS THE CIRCUIT ON THE FIRST OCCURRENCE — no three-strikes wait', async () => {
    circuitOpen = { open: false }
    anthropicCreate.mockRejectedValue(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API"}}'))

    const out = await ariaChatWithProvider('insight', 'q', 64, { businessId: 'b1', agentKey: 'thread_title' })

    // Hard fault → immediate, not after the 3rd failure in 5 minutes.
    expect(recordHardDown).toHaveBeenCalledTimes(1)
    expect(String(recordHardDown.mock.calls[0]![0])).toContain('credit balance')
    // ⚠️ AND NOT through the transient path, which would wait for two more doomed round-trips.
    expect(recordFailure).not.toHaveBeenCalled()
    // The owner is unaffected: Gemini answers, exactly as it does today.
    expect(out.provider).toBe('gemini')
  })

  it('⚠️ AN AUTH-RESOLUTION ERROR IS ALSO HARD — the second of the two faults', async () => {
    circuitOpen = { open: false }
    anthropicCreate.mockRejectedValue(new Error('Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.'))

    await ariaChatWithProvider('insight', 'q', 64, { businessId: 'b1', agentKey: 'thread_title' })

    expect(recordHardDown).toHaveBeenCalledTimes(1)
    expect(recordFailure).not.toHaveBeenCalled()
  })

  it('⚠️ A 429 STILL GOES THROUGH THE UNCHANGED THREE-STRIKES PATH — the brief requires this exactly', async () => {
    // "A 429 or a timeout is different — leave existing retry behaviour for those alone." A rate limit
    // clears by waiting; an empty balance does not. Collapsing the two would be the real regression.
    circuitOpen = { open: false }
    anthropicCreate.mockRejectedValue(new Error('429 rate_limit_error: Number of requests has exceeded your rate limit'))

    await ariaChatWithProvider('insight', 'q', 64, { businessId: 'b1', agentKey: 'thread_title' })

    expect(recordHardDown).not.toHaveBeenCalled()
    expect(recordFailure).toHaveBeenCalledTimes(1)
  })

  it('a timeout is transient too, and is not marked hard', async () => {
    circuitOpen = { open: false }
    anthropicCreate.mockRejectedValue(new Error('Request timed out after 30000ms'))
    await ariaChatWithProvider('insight', 'q', 64, { businessId: 'b1', agentKey: 'thread_title' })
    expect(recordHardDown).not.toHaveBeenCalled()
    expect(recordFailure).toHaveBeenCalledTimes(1)
  })

  it('⚠️ THE SAME PROVIDER ANSWERS, WITH AND WITHOUT THE BREAKER — the hard rule, as a test', async () => {
    /**
     * ⚠️ MY FIRST VERSION OF THIS TEST ASSERTED THE WRONG THING and the run corrected me. It claimed
     * OpenAI would not be called, on the assumption that the chain was claude → gemini. It is not:
     * `TASK_PROVIDERS.insight === 'openai'`, so the real sequence for a `thread_title` turn is
     * [openai, claude, gemini, haiku]. OpenAI legitimately precedes Claude.
     *
     * So the invariant is not "openai is skipped" — it is the one the sprint actually states: **whoever
     * answers an owner today answers them after this change.** This runs the identical scenario twice,
     * once the old way (circuit closed, Anthropic fails as it does in production) and once the new way
     * (circuit open), and asserts the SAME provider returns the SAME text — while the number of doomed
     * Anthropic calls drops from 2 to 0. That is the whole phase in one assertion.
     */
    const CREDIT = new Error('400 "Your credit balance is too low to access the Anthropic API"')

    // ── today: the circuit is closed, so both Anthropic models are dialled and both fail ──
    circuitOpen = { open: false }
    anthropicCreate.mockRejectedValue(CREDIT)
    openaiCreate.mockRejectedValue(new Error('openai unavailable in this fixture'))
    const before = await ariaChatWithProvider('insight', 'q', 64, {})
    const anthropicCallsBefore = anthropicCreate.mock.calls.length

    // ── after: the breaker knows, so neither is dialled ──
    anthropicCreate.mockClear()
    circuitOpen = { open: true, incidentId: 'inc-1', hard: true }
    const after = await ariaChatWithProvider('insight', 'q', 64, {})
    const anthropicCallsAfter = anthropicCreate.mock.calls.length

    // The owner-visible result is IDENTICAL.
    expect(after.provider).toBe(before.provider)
    expect(after.text).toBe(before.text)
    expect(after.provider).toBe('gemini')

    // And the waste is gone. ONE Anthropic call before, not two: the chain is
    // [openai, claude, gemini, haiku], so Gemini succeeds BEFORE Haiku is ever reached. (My first
    // version expected 2 and the run corrected it — the count is asserted exactly, because a vague
    // "fewer" is what let 346 doomed calls look acceptable.)
    expect(anthropicCallsBefore).toBe(1)
    expect(anthropicCallsAfter).toBe(0)
  })

  it('⚠️ WHEN GEMINI ALSO FAILS, BOTH SONNET AND HAIKU ARE SKIPPED — the ledger pair, removed', async () => {
    /**
     * This is the shape actually in the ledger: `thread_title` logging a Sonnet failure AND a Haiku
     * failure in the same second. For Haiku to be reached at all, Gemini must have failed first — the
     * chain is [openai, claude, gemini, haiku]. That happens in an environment where no provider key
     * resolves, and it is also how a turn reaches the every-provider-down reply.
     *
     * With the breaker closed: 2 doomed Anthropic calls. With it open: 0, and the outcome is unchanged
     * (still no answer — this phase does not and must not change that; see phase 2).
     */
    const AUTH = new Error('Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.')
    openaiCreate.mockRejectedValue(new Error('no openai key'))
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({}), text: async () => 'no gemini key' })
    anthropicCreate.mockRejectedValue(AUTH)

    circuitOpen = { open: false }
    const before = await ariaChatWithProvider('insight', 'q', 64, {})
    const callsBefore = anthropicCreate.mock.calls.length

    anthropicCreate.mockClear()
    circuitOpen = { open: true, incidentId: 'inc-1', hard: true }
    const after = await ariaChatWithProvider('insight', 'q', 64, {})

    expect(callsBefore).toBe(2)                       // Sonnet AND Haiku — the ledger pair
    expect(anthropicCreate.mock.calls.length).toBe(0) // both skipped
    // ⚠️ The OUTCOME is identical, including the bad one. Phase 1 removes doomed calls; it does not
    // change what the owner is told when everything is genuinely down.
    expect(after.provider).toBe(before.provider)
    expect(after.provider).toBe('none')
    expect(after.text).toBe(before.text)
  })
})
