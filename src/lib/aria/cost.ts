export interface ModelCost {
  input_per_m_usd: number
  output_per_m_usd: number
  search_per_1k_usd?: number
}

export const PRICING: Record<string, ModelCost> = {
  'claude-haiku-4-5-20251001':  { input_per_m_usd: 0.25,  output_per_m_usd: 1.25 },
  'claude-sonnet-4-5-20250929': { input_per_m_usd: 3.00,  output_per_m_usd: 15.00 },
  'claude-opus-4-5-20251101':   { input_per_m_usd: 5.00,  output_per_m_usd: 25.00 },
  'gpt-5.4':                    { input_per_m_usd: 2.50,  output_per_m_usd: 15.00 },
  'text-embedding-3-small':     { input_per_m_usd: 0.02,  output_per_m_usd: 0 },
  'sonar':                      { input_per_m_usd: 1.00,  output_per_m_usd: 1.00, search_per_1k_usd: 5.00 },
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
