export interface ModelCost {
  input_per_m_usd: number
  output_per_m_usd: number
  search_per_1k_usd?: number
}

// Prices verified live from vendor docs 2026-05-18
// Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
// OpenAI:    https://openai.com/api/pricing/
// Perplexity: https://docs.perplexity.ai/docs/getting-started/pricing
export const PRICING: Record<string, ModelCost> = {
  // Anthropic — 4.5 / 4.6 / 4.7 generation share the same rates within tier
  'claude-haiku-4-5-20251001':  { input_per_m_usd: 1.00,  output_per_m_usd: 5.00 },
  'claude-sonnet-4-5-20250929': { input_per_m_usd: 3.00,  output_per_m_usd: 15.00 },
  'claude-opus-4-5-20251101':   { input_per_m_usd: 5.00,  output_per_m_usd: 25.00 },

  // OpenAI — workhorse + embeddings only (we don't use flagship GPT-5.5)
  'gpt-5.4':                    { input_per_m_usd: 2.50,  output_per_m_usd: 15.00 },
  'gpt-5.4-mini':               { input_per_m_usd: 0.75,  output_per_m_usd: 4.50 },
  'text-embedding-3-small':     { input_per_m_usd: 0.02,  output_per_m_usd: 0 },

  // Perplexity Sonar — request fee tracked separately via search_per_1k_usd
  // (low context $5/1K; we use low context by default)
  'sonar':                      { input_per_m_usd: 1.00,  output_per_m_usd: 1.00, search_per_1k_usd: 5.00 },
  'sonar-pro':                  { input_per_m_usd: 3.00,  output_per_m_usd: 15.00, search_per_1k_usd: 6.00 },
}

// Anthropic prompt cache pricing: cached write = 1.25x base, cached read = 0.10x base
export function computeCostCentsWithCache(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedReadTokens = 0,
  cachedWriteTokens = 0,
  searches = 0,
): number {
  const p = PRICING[modelId]
  if (!p) return 0
  const baseInputCost  = (Number(inputTokens)       || 0) / 1_000_000 * p.input_per_m_usd
  const cacheWriteCost = (Number(cachedWriteTokens)  || 0) / 1_000_000 * p.input_per_m_usd * 1.25
  const cacheReadCost  = (Number(cachedReadTokens)   || 0) / 1_000_000 * p.input_per_m_usd * 0.10
  const outputCost     = (Number(outputTokens)       || 0) / 1_000_000 * p.output_per_m_usd
  const searchCost     = p.search_per_1k_usd ? (Number(searches) || 0) / 1000 * p.search_per_1k_usd : 0
  return Math.round((baseInputCost + cacheWriteCost + cacheReadCost + outputCost + searchCost) * 100)
}

export function computeCostCents(modelId: string, inputTokens: number, outputTokens: number): number {
  return computeCostCentsWithCache(modelId, inputTokens, outputTokens)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MS15 PHASE 1 — AN UNPRICED CALL IS UNKNOWN, NOT FREE.
//
// 1,459 of the last 30 days' calls carried tokens and a recorded cost of ZERO. Measured against
// the live ledger, that is TWO different faults wearing one symptom:
//
//   (a) MISSING RATE — `gpt-4o-mini` and `openai/gpt-4o-mini` (93 calls) are not in PRICING, and
//       computeCostCentsWithCache returns 0 for any model it does not know. A call whose price we
//       cannot compute was being recorded as free. THIS FILE FIXES THAT: use
//       computeCostCentsOrNull and the ledger records null — unknown, not zero.
//
//   (b) SUB-CENT ROUNDING — the remaining 1,366 (gemini-2.5-flash ×1,308, haiku ×35, sonnet ×3)
//       ARE priced correctly; they are simply smaller than the storage granularity. A gemini call
//       averages 514 in / 27 out ≈ 0.006 cents, and Math.round() of that is 0. Measured true cost
//       of all 1,308 gemini calls: ~8.1 cents. So the ledger's understatement today is CENTS, not
//       dollars — but it is structural, and it scales with volume.
//       FIXING (b) NEEDS A COLUMN and is therefore PARKED, named here:
//         aria_ai_calls.cost_usd_cents is `integer`. Representing sub-cent costs needs either
//         numeric(12,6) on that column or a new cost_usd_micros integer column. DDL is not mine.
//       Until then a sub-cent call still records 0 — which is approximately true and, unlike (a),
//       not a claim that the call was free of charge.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Models seen in PRODUCTION with no rate in PRICING. Each needs a founder-verified rate. */
export const UNPRICED_MODELS_SEEN: readonly string[] = [
  'gpt-4o-mini',          // 90 calls / 128,815 tokens in the last 30 days
  'openai/gpt-4o-mini',   // 3 calls / 37,948 tokens (OpenRouter slug)
]

/** True when this codebase can actually price the model. */
export function isPricedModel(modelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICING, modelId)
}

/**
 * Cost in whole cents, or NULL when the model has no rate in PRICING.
 *
 * Every LOGGER should use this rather than computeCostCentsWithCache, so an unknown model lands
 * in the ledger as `null` (unknown) instead of `0` (free). computeCostCentsWithCache keeps its
 * 0-for-unknown behaviour for the arithmetic call sites that sum costs — changing those to handle
 * null is a separate migration, and a null in a sum is a worse failure than a zero.
 */
export function computeCostCentsOrNull(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedReadTokens = 0,
  cachedWriteTokens = 0,
  searches = 0,
): number | null {
  if (!isPricedModel(modelId)) return null
  return computeCostCentsWithCache(modelId, inputTokens, outputTokens, cachedReadTokens, cachedWriteTokens, searches)
}

// AI-COST-2 — the Anthropic Batches API discount (AI-COST-AUDIT-1 §1 flagged this as ASSUMED:
// "no batch-rate constant exists anywhere in the codebase"). 50% off both input and output,
// applied uniformly — Anthropic's published Batches API rate as of this sprint. Used by
// daily-briefing-submit and hypothesis-engine-batch-submit; scripts/ai-cost-model.json's
// batchDiscountFactor mirrors this exact value so the cost model and the real pricing fn agree.
export const BATCH_DISCOUNT_FACTOR = 0.5

export function computeBatchCostCents(modelId: string, inputTokens: number, outputTokens: number): number {
  return Math.round(computeCostCentsWithCache(modelId, inputTokens, outputTokens) * BATCH_DISCOUNT_FACTOR)
}
