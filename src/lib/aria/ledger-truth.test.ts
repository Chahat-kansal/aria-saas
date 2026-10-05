import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18B · PHASE 4 — THE LEDGER TELLS THE TRUTH.
 *
 * ⚠️ BOTH FAULTS WERE **DDL DEFAULTS**, NOT CODE, which is why neither showed up in any code review:
 *
 *     model_provider   DEFAULT 'anthropic'::text
 *     cost_usd_cents   DEFAULT 0
 *
 * Measured before this phase, over the 929 calls since 21 September:
 *   · `model_provider` had **1 distinct value** — the literal `anthropic` — across 547
 *     `gemini-2.5-flash` calls, 27 `gpt-4o-mini` calls and everything else.
 *   · `sum(cost_usd_cents)` was **0**. 885 rows literally `0`, 44 `NULL`.
 *
 * An explicit value overrides a default, so this needed no schema change. What it did need was for the
 * canonical writer to stop omitting the columns.
 */

const inserted: Array<Record<string, unknown>> = []
let insertError: string | null = null

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row)
        return { error: insertError ? { message: insertError } : null }
      },
    }),
  },
}))

const { logAICallSafe } = await import('./log-ai-call')

beforeEach(() => {
  inserted.length = 0
  insertError = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('M18B phase 4 · model_provider records who actually served the call', () => {
  it('⚠️ A GEMINI CALL IS RECORDED AS google, NOT anthropic', async () => {
    await logAICallSafe({
      business_id: 'b1', agent_key: 'ask_aria', role: 'chat', provider: 'google',
      model_id: 'gemini-2.5-flash', success: true,
    })
    // This is the row that was wrong 547 times.
    expect(inserted[0]!.model_provider).toBe('google')
    expect(inserted[0]!.model_provider).not.toBe('anthropic')
  })

  it('⚠️ AN OPENAI CALL IS RECORDED AS openai', async () => {
    await logAICallSafe({
      business_id: 'b1', agent_key: 'ask_aria', role: 'chat', provider: 'openai',
      model_id: 'gpt-4o-mini', success: true,
    })
    expect(inserted[0]!.model_provider).toBe('openai')
  })

  it('an anthropic call is still recorded as anthropic — anti-vacuity', async () => {
    // If `model_provider` were simply never 'anthropic' now, the assertions above would pass for the
    // wrong reason and the column would be wrong in a new direction.
    await logAICallSafe({
      business_id: 'b1', agent_key: 'ask_aria', role: 'chat', provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20251001', success: true,
    })
    expect(inserted[0]!.model_provider).toBe('anthropic')
  })

  it('⚠️ IT IS NEVER LEFT TO THE COLUMN DEFAULT — the key is always present in the insert', async () => {
    // The whole fault was an OMITTED column taking `DEFAULT 'anthropic'`. Asserting the value is not
    // enough: the key has to be in the payload, or the database decides and we are back where we started.
    await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'google' })
    expect(Object.prototype.hasOwnProperty.call(inserted[0]!, 'model_provider')).toBe(true)
  })

  it('an explicit model_provider wins over the derivation — a gateway fronting another vendor', async () => {
    await logAICallSafe({
      business_id: 'b1', agent_key: 'x', role: 'other', provider: 'openrouter',
      model_provider: 'anthropic', model_id: 'anthropic/claude-haiku',
    })
    expect(inserted[0]!.provider).toBe('openrouter')
    expect(inserted[0]!.model_provider).toBe('anthropic')
  })
})

describe('M18B phase 4 · an unmeasured cost is NULL, not 0', () => {
  it('⚠️ OMITTING THE COST WRITES NULL — 0 is a claim that the call was free', async () => {
    await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'google' })
    expect(inserted[0]!.cost_usd_cents).toBeNull()
    // And the key is present, so the `DEFAULT 0` cannot fill it in.
    expect(Object.prototype.hasOwnProperty.call(inserted[0]!, 'cost_usd_cents')).toBe(true)
  })

  it('⚠️ A REAL ZERO IS STILL RECORDED AS 0 — a cached answer genuinely cost nothing', async () => {
    // Anti-vacuity, and it matters: `council_cache` hits are free, and turning every 0 into NULL would
    // lose that. "Measured as free" and "never measured" are different facts, which is the whole point.
    await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'other', cost_usd_cents: 0 })
    expect(inserted[0]!.cost_usd_cents).toBe(0)
    expect(inserted[0]!.cost_usd_cents).not.toBeNull()
  })

  it('a measured cost is passed through unchanged', async () => {
    await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'anthropic', cost_usd_cents: 7 })
    expect(inserted[0]!.cost_usd_cents).toBe(7)
  })

  it('an explicit null stays null', async () => {
    await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'google', cost_usd_cents: null })
    expect(inserted[0]!.cost_usd_cents).toBeNull()
  })
})

describe('M18B phase 4 · nothing else about the writer changed', () => {
  it('still reads the returned error and reports it — W6 is not weakened', async () => {
    insertError = 'new row violates check constraint "aria_ai_calls_role_check"'
    const spy = vi.spyOn(console, 'error')
    const ok = await logAICallSafe({ business_id: 'b1', agent_key: 'x', role: 'other', provider: 'google' })
    expect(ok).toBe(false)
    expect(spy.mock.calls.flat().map(String).join(' ')).toContain('aria_ai_calls insert failed')
  })

  it('passes every other field through untouched', async () => {
    await logAICallSafe({
      business_id: 'b1', agent_key: 'ask_aria_router', role: 'other', provider: 'other',
      model_id: 'm', input_tokens: 10, output_tokens: 5, latency_ms: 42, success: false,
      error_message: 'e', request_summary: 'rq', response_summary: 'rs', learning_signal: 'ls',
    })
    const row = inserted[0]!
    expect(row.agent_key).toBe('ask_aria_router')
    expect(row.input_tokens).toBe(10)
    expect(row.latency_ms).toBe(42)
    expect(row.success).toBe(false)
    expect(row.learning_signal).toBe('ls')
  })
})
