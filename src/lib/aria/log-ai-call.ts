import { supabaseAdmin } from '@/lib/supabase-admin'

// LOGGING-AUDIT-3 Part 4 — single safe entry point for aria_ai_calls inserts.
//
// THE BUG THIS PREVENTS: aria_ai_calls.role and .provider have CHECK constraints. supabaseAdmin
// (service role) bypasses RLS, so a CHECK violation is the only thing that rejects an insert — and
// Supabase .insert() returns { error } WITHOUT throwing, so an unchecked `await ...insert()` swallows
// the rejection silently. Whole agent_keys (heal, sql_guard, summarizer_guard, council_*) wrote ZERO
// rows for weeks because their role/provider was off-list.
//
// These literal unions mirror the pg_constraint CHECK lists (verified 2026-06-14). Passing an
// off-list value is now a COMPILE error, not a silent runtime drop.

export type AiCallRole =
  | 'generator' | 'judge' | 'search' | 'data' | 'forecast' | 'chat' | 'classify' | 'analysis'
  | 'embed' | 'narrative' | 'reorder' | 'rostering' | 'competitor' | 'social' | 'briefing'
  | 'generate_image' | 'image' | 'document' | 'pricing' | 'product' | 'customer' | 'inventory'
  | 'schedule' | 'compliance' | 'other'

export type AiCallProvider =
  | 'anthropic' | 'openai' | 'google' | 'xai' | 'perplexity' | 'tavily' | 'exa' | 'openrouter'
  | 'go-upc' | 'upcitemdb' | 'open-meteo' | 'geoapify' | 'moonshot' | 'zai' | 'other'

export interface AiCallRow {
  business_id: string | null
  agent_key: string
  role: AiCallRole
  provider: AiCallProvider
  model_id?: string | null
  input_tokens?: number
  output_tokens?: number
  latency_ms?: number
  /**
   * ⚠️ M18B PHASE 4 — OMIT THIS AND THE ROW SAYS **NULL (unknown)**, NOT 0 (free).
   *
   * `aria_ai_calls.cost_usd_cents` has `DEFAULT 0`, so every caller that left it out was recording a
   * claim that the call cost nothing. Measured before this change: **929 calls since 21 September
   * summed to 0** — 885 rows literally `0`, 44 `NULL`. That is why Aria could not tell you what it
   * spends.
   *
   * `undefined` here is now written as an explicit `null`, so "we did not measure it" and "it was
   * free" stop being the same row. Pass a number only when you actually computed one —
   * `computeCostCentsOrNull()` is the canonical way, and it already returns null for an unknown model.
   */
  cost_usd_cents?: number | null
  /**
   * ⚠️ M18B PHASE 4 — DERIVED FROM `provider` WHEN OMITTED, NEVER LEFT TO THE COLUMN DEFAULT.
   *
   * `aria_ai_calls.model_provider` has `DEFAULT 'anthropic'::text`. Almost nothing set it, so the
   * column read the literal string `anthropic` on **every row** — including 547 `gemini-2.5-flash`
   * calls and every `gpt-4o-mini` call. A column that says the same thing about every row is not a
   * record of anything.
   *
   * `provider` beside it IS accurate (it is CHECK-constrained and set per call from the client that
   * was used: google 547, anthropic 388, openai 27). So this defaults to it rather than to a literal,
   * which fixes every row this writer makes without a schema change. Pass it explicitly only when the
   * model family genuinely differs from the client — e.g. a gateway fronting another vendor.
   */
  model_provider?: string | null
  success?: boolean
  error_message?: string | null
  request_summary?: string | null
  response_summary?: string | null
  learning_signal?: string | null
}

/**
 * Insert one aria_ai_calls row, CHECKING the returned error (Supabase resolves with { error }
 * rather than throwing). Returns true on success, false on rejection/throw — callers may fall back.
 * Standardised log line `[aria_ai_calls insert failed]` so it can be grepped in Vercel logs.
 */
export async function logAICallSafe(row: AiCallRow): Promise<boolean> {
  try {
    /**
     * ⚠️ M18B PHASE 4 — THE TWO COLUMNS WHOSE DEFAULTS WERE LYING.
     *
     * Both are set EXPLICITLY here, because an omitted column takes the database default and both
     * defaults assert something false: `model_provider DEFAULT 'anthropic'` and
     * `cost_usd_cents DEFAULT 0`. Measured before this: 1 distinct `model_provider` across 929 calls,
     * and a cost sum of 0.
     *
     * An explicit value overrides a default, so this needs no DDL — but **the defaults still stand for
     * every insert that does not come through here**, including the 175 allow-listed bypassers. Dropping
     * them is founder console item 5, and until then this writer is the only place the ledger is honest.
     */
    const toInsert = {
      ...row,
      // Derived from the client that was used, never a literal.
      model_provider: row.model_provider ?? row.provider,
      // Unknown is NULL. 0 is a claim that the call was free.
      cost_usd_cents: row.cost_usd_cents ?? null,
    }
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert(toInsert)
    if (error) {
      console.error('[aria_ai_calls insert failed]', { agentKey: row.agent_key, role: row.role, provider: row.provider, reason: error.message })
      return false
    }
    return true
  } catch (e) {
    console.error('[aria_ai_calls insert failed]', { agentKey: row.agent_key, role: row.role, provider: row.provider, reason: (e as Error).message })
    return false
  }
}
