// COST-LEDGER-1 — shared compute core for the full COGS model. Extracted from
// scripts/ai-cost-model.ts (which was AI-only) so both the CLI script and the admin API's
// venues-slider widget use the exact same math instead of two independently-drifting copies.
//
// scripts/ai-cost-model.ts remains the CLI entry point (unchanged usage/output) and now just
// imports from here. src/app/api/admin/costs/route.ts imports the same functions for the live
// admin page, passing in a dynamically-computed fixedCostPerBusinessPerDayUsd (from the live
// cost_subscriptions table — that number can't live in the static JSON since it changes whenever
// a subscription is added/edited/deactivated).
// Static JSON import (not fs.readFileSync) — this module is imported both by the standalone CLI
// (scripts/ai-cost-model.ts, run via tsx) and by a Next.js API route (src/app/api/admin/costs).
// A dynamic __dirname-relative fs read is fragile inside a Next.js serverless bundle (the physical
// file layout at runtime doesn't match the source tree); tsconfig has resolveJsonModule:true, so a
// static import is inlined into the bundle at build time in both contexts and just works.
import costModelJson from '../../scripts/ai-cost-model.json'

export interface ModelPricing {
  input_per_m_usd: number
  output_per_m_usd: number
  source: string
}

export interface MeasuredJob {
  key: string
  label: string
  model: string
  trigger: string
  batchEligible: boolean
  wasteGateNoDeltaReductionFactor?: number
  alwaysApplyBatch?: boolean
  alwaysApplyDeltaGate?: boolean
  callsPerBusinessPerDay: number
  inputTokensPerCall: number
  outputTokensPerCall: number
  cacheWriteTokensPerCall: number
  cacheReadTokensPerCall: number
}

export interface EstimatedComponent {
  key: string
  label: string
  source: string
  includeInProjection: boolean
  shippedAsOfAiCost2?: boolean
  usdPerBusinessPerDayLow?: number
  usdPerBusinessPerDayMid?: number
  usdPerBusinessPerDayHigh?: number
  wasteGatedUsdPerBusinessPerDay?: number
  wasteGatedNote?: string
  usdTotalOverWindow?: number
  usdTotalOverWindowLow?: number
  usdTotalOverWindowHigh?: number
  basis: string
}

export interface NonAiCostInput {
  key: string
  label: string
  usdPerBusinessPerDay: number
  source: 'estimate' | 'measured'
  basis: string
}

export interface CostModelData {
  audit: { business: string; windowStart: string; windowEnd: string; windowDays: number; anthropicInvoiceUsd: number }
  pricing: Record<string, ModelPricing>
  cache: { writeMultiplier: number; readMultiplier: number }
  batchDiscountFactor: number
  measuredJobs: MeasuredJob[]
  estimatedComponents: EstimatedComponent[]
  nonAiCosts: NonAiCostInput[]
  planPricingUsdPerMonth: number
}

export function loadCostModelData(): CostModelData {
  return costModelJson as unknown as CostModelData
}

function callCostUsd(data: CostModelData, job: MeasuredJob, useBatch: boolean): number {
  const p = data.pricing[job.model]
  if (!p) throw new Error(`No pricing entry for model ${job.model} (job ${job.key})`)
  const discount = useBatch && job.batchEligible ? data.batchDiscountFactor : 1
  const baseInput = job.inputTokensPerCall / 1_000_000 * p.input_per_m_usd * discount
  const cacheWrite = job.cacheWriteTokensPerCall / 1_000_000 * p.input_per_m_usd * data.cache.writeMultiplier * discount
  const cacheRead = job.cacheReadTokensPerCall / 1_000_000 * p.input_per_m_usd * data.cache.readMultiplier * discount
  const output = job.outputTokensPerCall / 1_000_000 * p.output_per_m_usd * discount
  return baseInput + cacheWrite + cacheRead + output
}

// applyShippedFixes=true: honor alwaysApplyBatch/alwaysApplyDeltaGate/shippedAsOfAiCost2 (current,
// real architecture). false: ignore those flags — used by the historical reconciliation, which
// must reflect the pre-AI-COST-2 state of the audited window regardless of what's shipped since.
export function jobUsdPerDay(data: CostModelData, job: MeasuredJob, scenario: 'as_is' | 'waste_gated', applyShippedFixes: boolean): number {
  const useBatch = scenario === 'waste_gated' || (applyShippedFixes && !!job.alwaysApplyBatch)
  const perCall = callCostUsd(data, job, useBatch)
  let calls = job.callsPerBusinessPerDay
  const applyDeltaGate = scenario === 'waste_gated' || (applyShippedFixes && !!job.alwaysApplyDeltaGate)
  if (applyDeltaGate && job.wasteGateNoDeltaReductionFactor) {
    calls = calls * (1 - job.wasteGateNoDeltaReductionFactor)
  }
  return perCall * calls
}

export function computeAiScenarioTotal(data: CostModelData, scenario: 'as_is' | 'waste_gated'): { total: number; anthropicOnly: number; rows: Array<{ label: string; usdPerDay: number; provider: string }> } {
  const rows = data.measuredJobs.map(job => {
    const usdPerDay = jobUsdPerDay(data, job, scenario, true)
    const provider = job.model.startsWith('claude') ? 'anthropic' : job.model.startsWith('gemini') ? 'google' : job.model.startsWith('gpt') ? 'openai' : 'other'
    return { label: job.label, usdPerDay, provider }
  })

  for (const comp of data.estimatedComponents) {
    if (!comp.includeInProjection) continue
    const usdPerDay = (scenario === 'waste_gated' || comp.shippedAsOfAiCost2) && comp.wasteGatedUsdPerBusinessPerDay !== undefined
      ? comp.wasteGatedUsdPerBusinessPerDay
      : (comp.usdPerBusinessPerDayMid ?? 0)
    rows.push({ label: comp.label, usdPerDay, provider: 'anthropic' })
  }

  const total = rows.reduce((s, r) => s + r.usdPerDay, 0)
  const anthropicOnly = rows.filter(r => r.provider === 'anthropic').reduce((s, r) => s + r.usdPerDay, 0)
  return { total, anthropicOnly, rows }
}

export function measuredAnthropicOnlyUsdPerDay(data: CostModelData): number {
  // Deliberately excludes estimatedComponents (e.g. model_router_business_brain) -- those are NOT
  // in aria_ai_calls at all, so they must not be folded into the "measured" reconciliation line.
  // applyShippedFixes=false: reconciles the historical AUDITED window, predating AI-COST-2's fixes.
  return data.measuredJobs
    .filter(job => job.model.startsWith('claude'))
    .reduce((sum, job) => sum + jobUsdPerDay(data, job, 'as_is', false), 0)
}

export interface FullCogsResult {
  aiUsdPerBusinessPerDay: number
  nonAiUsdPerBusinessPerDay: number
  nonAiBreakdown: Array<{ key: string; label: string; usdPerBusinessPerDay: number; source: string }>
  fixedUsdPerBusinessPerDay: number
  totalUsdPerBusinessPerDay: number
}

// COST-LEDGER-1 — full COGS = AI (job-based model) + SMS/email/fee (flat per-business-day
// estimates from the JSON) + fixed costs allocated per active business (computed live by the
// caller from cost_subscriptions and passed in — this number is NOT static, so it can't live in
// the JSON file; see src/app/api/admin/costs/route.ts).
export function computeFullCogsPerBusinessPerDay(
  data: CostModelData,
  scenario: 'as_is' | 'waste_gated',
  fixedCostPerBusinessPerDayUsd: number,
): FullCogsResult {
  const ai = computeAiScenarioTotal(data, scenario)
  const nonAiBreakdown = data.nonAiCosts.map(c => ({ key: c.key, label: c.label, usdPerBusinessPerDay: c.usdPerBusinessPerDay, source: c.source }))
  const nonAiTotal = nonAiBreakdown.reduce((s, c) => s + c.usdPerBusinessPerDay, 0)
  return {
    aiUsdPerBusinessPerDay: ai.total,
    nonAiUsdPerBusinessPerDay: nonAiTotal,
    nonAiBreakdown,
    fixedUsdPerBusinessPerDay: fixedCostPerBusinessPerDayUsd,
    totalUsdPerBusinessPerDay: ai.total + nonAiTotal + fixedCostPerBusinessPerDayUsd,
  }
}
