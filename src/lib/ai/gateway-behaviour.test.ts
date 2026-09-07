import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M13C PHASE 4 — THE WALL, TESTED BY CALLING IT.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────────
 * M13 shipped `gateway.test.ts` with this assertion:
 *
 *     expect(GATEWAY_CODE).toContain("from '@/lib/aria/truncation'")
 *
 * It passed. It kept passing for weeks. And the function it named was **structurally blind** — the
 * gateway handed `inspectTruncation` an object carrying neither `stop_reason` nor `usage`, so it
 * returned `{hitCeiling:false}` on every model call in the product and `ok_at_ceiling` /
 * `truncated_mid_structure` were unreachable. A presence test passes on dead code. It cannot fail
 * for the reason you care about, because it never asks the question you care about.
 *
 * ── WHAT THIS FILE DOES INSTEAD ────────────────────────────────────────────────────────────────
 * It stands a controlled provider behind the gateway and **calls `callModel`**, then asserts on what
 * comes back. Every one of these tests would have gone red on the M13 gateway on the day it shipped.
 *
 * The provider is mocked rather than hit: the wall's contract is what it does with a provider
 * response, and that contract must be testable without a network, an API key or a bill.
 */

const callAnthropic = vi.fn()
const callAnthropicWithTools = vi.fn()

vi.mock('@/lib/aria/providers/anthropic', () => ({
  callAnthropic: (...a: unknown[]) => callAnthropic(...a),
  callAnthropicWithTools: (...a: unknown[]) => callAnthropicWithTools(...a),
}))

const { callModel } = await import('./gateway')

/** What the provider returns TODAY — with the two fields M13C phase 3 of M13B made it return. */
const providerReply = (o: Partial<{
  raw: string; data: unknown; stop_reason: string | null
  input_tokens: number; output_tokens: number; success: boolean
}> = {}) => ({
  data: o.data ?? null,
  raw: o.raw ?? 'hello',
  cost_cents: 3,
  latency_ms: 120,
  success: o.success ?? true,
  provider: 'anthropic' as const,
  stop_reason: o.stop_reason === undefined ? 'end_turn' : o.stop_reason,
  input_tokens: o.input_tokens ?? 900,
  output_tokens: o.output_tokens ?? 400,
})

/** What the provider returned BEFORE M13B — the shape that made the rail blind. */
const legacyProviderReply = (o: { raw?: string; data?: unknown } = {}) => ({
  data: o.data ?? null, raw: o.raw ?? 'hello', cost_cents: 3, latency_ms: 120,
  success: true, provider: 'anthropic' as const,
})

const req = {
  businessId: 'ff5055a0-c351-4ada-817a-1804961035f3',
  agentKey: 'ask_aria' as never,
  role: 'chat' as never,
  model: 'haiku' as const,
  systemPrompt: 'you are a test',
  userPrompt: 'hello',
}

beforeEach(() => { callAnthropic.mockReset(); callAnthropicWithTools.mockReset() })

describe('M13C phase 4 · truncation, asserted on the RETURN VALUE', () => {
  it('a clipped call that still parsed is ok_at_ceiling — the outcome M13 could never produce', async () => {
    callAnthropic.mockResolvedValue(providerReply({ stop_reason: 'max_tokens', data: { a: 1 }, output_tokens: 4000 }))
    const res = await callModel(req, { a: 0 })
    expect(res.outcome).toBe('ok_at_ceiling')
    expect(res.truncation).toEqual({ hitCeiling: true, stopReason: 'max_tokens', outputTokens: 4000 })
  })

  it('a clipped call whose structure did NOT survive is truncated_mid_structure', async () => {
    callAnthropic.mockResolvedValue(providerReply({ stop_reason: 'max_tokens', data: null, raw: '{"a":' }))
    const res = await callModel(req, { a: 0 })
    expect(res.outcome).toBe('truncated_mid_structure')
    // outputTokens asserted too, not just hitCeiling. After M13B the provider returns stop_reason at
    // the TOP LEVEL, which is where inspectTruncation happens to read it — so the blind
    // `inspectTruncation(res)` still gets the ceiling right and only loses the token count. The
    // reshaping the gateway does is load-bearing for `usage`, and this is the assertion that says so.
    expect(res.truncation).toEqual({ hitCeiling: true, stopReason: 'max_tokens', outputTokens: 400 })
  })

  it('a call that finished on its own terms is plain ok', async () => {
    callAnthropic.mockResolvedValue(providerReply({ stop_reason: 'end_turn', data: { a: 1 } }))
    const res = await callModel(req, { a: 0 })
    expect(res.outcome).toBe('ok')
    expect(res.truncation.hitCeiling).toBe(false)
    expect(res.truncation.stopReason).toBe('end_turn')
  })

  it('⚠️ THE PROBE — hand the gateway the OLD provider shape and the ceiling becomes invisible', async () => {
    // This is the anti-vacuity requirement, and it is the M13 bug reproduced end to end. The provider
    // returns a response with no stop_reason and no usage — exactly what callAnthropic returned
    // before M13B — and the gateway can no longer tell a clipped answer from a finished one.
    callAnthropic.mockResolvedValue(legacyProviderReply({ raw: '{"a":1}', data: { a: 1 } }))
    const blind = await callModel(req, { a: 0 })
    expect(blind.truncation).toEqual({ hitCeiling: false, stopReason: null, outputTokens: null })
    expect(blind.outcome).toBe('ok')

    // And the same logical call, with the fields present, reports the ceiling. The pair is the
    // point: these assertions are sensitive to the provider's fields, which is precisely what the
    // presence test they replace could not be.
    callAnthropic.mockResolvedValue(providerReply({ stop_reason: 'max_tokens', data: { a: 1 } }))
    const seeing = await callModel(req, { a: 0 })
    expect(seeing.outcome).not.toBe(blind.outcome)
  })

  it('token counts reach the caller instead of being dropped at the boundary', async () => {
    callAnthropic.mockResolvedValue(providerReply({ input_tokens: 1234, output_tokens: 56 }))
    const res = await callModel(req)
    expect(res.input_tokens).toBe(1234)
    expect(res.output_tokens).toBe(56)
  })
})

describe('M13C phase 4 · prose and JSON are judged by different questions', () => {
  it('a prose reply of "OK" is ok, not unparseable — the defect a live run caught', async () => {
    callAnthropic.mockResolvedValue(providerReply({ raw: 'OK', data: null }))
    const res = await callModel(req)                     // no fallback: prose was asked for
    expect(res.outcome).toBe('ok')
  })

  it('the same empty reply IS unparseable when JSON was asked for', async () => {
    callAnthropic.mockResolvedValue(providerReply({ raw: '', data: null }))
    expect((await callModel(req, { a: 0 })).outcome).toBe('unparseable')
    expect((await callModel(req)).outcome).toBe('unparseable')   // prose: no text at all is also a failure
  })
})

describe('M13C phase 4 · what the gateway forwards, observed at the provider', () => {
  it('requestSummary and timeoutMs actually arrive — both were silently dropped before M13B', async () => {
    callAnthropic.mockResolvedValue(providerReply())
    await callModel({ ...req, requestSummary: 'who is my best customer', timeoutMs: 18000 })
    const got = callAnthropic.mock.calls[0][0] as Record<string, unknown>
    expect(got.requestSummary).toBe('who is my best customer')
    expect(got.timeoutMs).toBe(18000)
  })

  it('the model is passed through UNCHANGED — the wall never re-routes', async () => {
    callAnthropic.mockResolvedValue(providerReply())
    await callModel({ ...req, model: 'opus' })
    expect((callAnthropic.mock.calls[0][0] as { model: string }).model).toBe('opus')
  })

  it('temperature reaches the provider when set, and is absent when not', async () => {
    callAnthropic.mockResolvedValue(providerReply())
    await callModel({ ...req, temperature: 0.25 })
    expect((callAnthropic.mock.calls[0][0] as { temperature?: number }).temperature).toBe(0.25)

    callAnthropic.mockClear()
    await callModel(req)
    expect((callAnthropic.mock.calls[0][0] as { temperature?: number }).temperature).toBeUndefined()
  })

  it('businessId is REQUIRED, and the provider is never reached without one', async () => {
    await expect(callModel({ ...req, businessId: '' })).rejects.toThrow(/businessId is required/)
    // The precondition is what makes the ledger row a guarantee: no call, so no unattributed spend.
    expect(callAnthropic).not.toHaveBeenCalled()
  })

  it('tools select the tool path, and no tools select the plain one', async () => {
    callAnthropicWithTools.mockResolvedValue({
      raw: 'done', cost_cents: 1, latency_ms: 5, success: true, tool_calls: [], iterations: 2, thinking_tokens: 7,
    })
    const withTools = await callModel({ ...req, tools: [{ name: 't' }], executeTool: async () => ({}) })
    expect(callAnthropicWithTools).toHaveBeenCalledTimes(1)
    expect(callAnthropic).not.toHaveBeenCalled()
    expect(withTools.iterations).toBe(2)
    expect(withTools.thinking_tokens).toBe(7)

    callAnthropic.mockResolvedValue(providerReply())
    await callModel(req)
    expect(callAnthropic).toHaveBeenCalledTimes(1)
  })

  it('a failed provider call surfaces as ok:false with a reason, not as a silent empty answer', async () => {
    callAnthropic.mockResolvedValue({ ...providerReply({ raw: '' }), success: false, provider: 'none' as const })
    const res = await callModel(req, { a: 0 })
    expect(res.ok).toBe(false)
    expect(res.success).toBe(false)
    expect(res.error_message).toBe('provider call failed')
  })
})
