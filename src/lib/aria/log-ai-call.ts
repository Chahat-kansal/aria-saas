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
  cost_usd_cents?: number
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
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert(row)
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
