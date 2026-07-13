// AI-COST-AUDIT-1 reusable cost model.
//
// Standalone calculator, read-only: touches nothing at runtime, has no imports from src/.
// Reads its per-job cost table from ./ai-cost-model.json (traces to AI-COST-AUDIT-REPORT.md
// at the repo root). Every dollar figure in that report is reproducible by running this file.
//
// Usage:
//   npx tsx scripts/ai-cost-model.ts
//   npx tsx scripts/ai-cost-model.ts --venues=50
//   npx tsx scripts/ai-cost-model.ts --venues=200 --plan=297
//   npx tsx scripts/ai-cost-model.ts --reconcile        (prints the window-only $20 reconciliation)
//
// PROCESS RULE (see CLAUDE.md): any sprint adding or modifying an LLM call must add a job
// entry to ai-cost-model.json and quote the resulting $/business/day (this script's output)
// in its commit message.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface ModelPricing {
  input_per_m_usd: number
  output_per_m_usd: number
  source: string
}

interface MeasuredJob {
  key: string
  label: string
  model: string
  trigger: string
  batchEligible: boolean
  wasteGateNoDeltaReductionFactor?: number
  /** AI-COST-2 shipped this job's batch conversion for real — apply in every "current" scenario, not just waste_gated. */
  alwaysApplyBatch?: boolean
  /** AI-COST-2 shipped this job's delta-gate for real — apply in every "current" scenario, not just waste_gated. */
  alwaysApplyDeltaGate?: boolean
  callsPerBusinessPerDay: number
  inputTokensPerCall: number
  outputTokensPerCall: number
  cacheWriteTokensPerCall: number
  cacheReadTokensPerCall: number
}

interface EstimatedComponent {
  key: string
  label: string
  source: string
  includeInProjection: boolean
  /** AI-COST-2 shipped the optimization this component's wasteGated value models — use it in every "current" scenario. */
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

interface CostModelData {
  audit: { business: string; windowStart: string; windowEnd: string; windowDays: number; anthropicInvoiceUsd: number }
  pricing: Record<string, ModelPricing>
  cache: { writeMultiplier: number; readMultiplier: number }
  batchDiscountFactor: number
  measuredJobs: MeasuredJob[]
  estimatedComponents: EstimatedComponent[]
  planPricingUsdPerMonth: number
}

function loadData(): CostModelData {
  const raw = readFileSync(join(__dirname, 'ai-cost-model.json'), 'utf8')
  return JSON.parse(raw) as CostModelData
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (const arg of argv) {
    const m = arg.match(/^--([a-zA-Z_]+)=(.+)$/)
    if (m) out[m[1]] = m[2]
    if (arg === '--reconcile') out.reconcile = 'true'
  }
  return out
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

// applyShippedFixes=true means: honor alwaysApplyBatch/alwaysApplyDeltaGate/shippedAsOfAiCost2 —
// i.e. this is a "current, real architecture" computation (projections). false means: ignore
// those flags entirely — used by the historical reconciliation, which must reflect the pre-fix
// state of the audited window regardless of what's shipped since.
function jobUsdPerDay(data: CostModelData, job: MeasuredJob, scenario: 'as_is' | 'waste_gated', applyShippedFixes: boolean): number {
  const useBatch = scenario === 'waste_gated' || (applyShippedFixes && !!job.alwaysApplyBatch)
  const perCall = callCostUsd(data, job, useBatch)
  let calls = job.callsPerBusinessPerDay
  const applyDeltaGate = scenario === 'waste_gated' || (applyShippedFixes && !!job.alwaysApplyDeltaGate)
  if (applyDeltaGate && job.wasteGateNoDeltaReductionFactor) {
    calls = calls * (1 - job.wasteGateNoDeltaReductionFactor)
  }
  return perCall * calls
}

function computeScenarioTotal(data: CostModelData, scenario: 'as_is' | 'waste_gated'): { total: number; anthropicOnly: number; rows: Array<{ label: string; usdPerDay: number; provider: string }> } {
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

function printProjection(data: CostModelData, venues: number, plan: number) {
  const asIs = computeScenarioTotal(data, 'as_is')
  const wasteGated = computeScenarioTotal(data, 'waste_gated')

  console.log(`\nAI-COST-AUDIT-1 model — ${venues} venue(s), $${plan}/mo plan`)
  console.log('='.repeat(72))
  console.log(`Base rate (1 business): as-is $${asIs.total.toFixed(4)}/day, waste-gated $${wasteGated.total.toFixed(4)}/day`)
  console.log('-'.repeat(72))

  const rows = [
    { name: 'as-is (current architecture, incl. AI-COST-2)', perDay: asIs.total },
    { name: 'waste-gated (remaining cron-tail batch, MODELED)', perDay: wasteGated.total },
  ]

  for (const r of rows) {
    const dayTotal = r.perDay * venues
    const monthTotal = dayTotal * 30
    const revenueTotal = plan * venues
    const pct = (monthTotal / revenueTotal) * 100
    console.log(`${r.name.padEnd(42)} $${dayTotal.toFixed(2)}/day  $${monthTotal.toFixed(2)}/mo  ${pct.toFixed(2)}% of plan revenue`)
  }
  console.log('='.repeat(72))
}

function measuredAnthropicOnlyUsdPerDay(data: CostModelData): number {
  // Deliberately excludes estimatedComponents (e.g. model_router_business_brain) --
  // those are NOT in aria_ai_calls at all, so they must not be folded into the
  // "measured" line here; printReconcile lists them as separate additive rows.
  // applyShippedFixes=false: this reconciles the historical AUDITED window, which predates
  // AI-COST-2's batch/delta-gate/cache fixes -- it must reflect the pre-fix state.
  return data.measuredJobs
    .filter(job => job.model.startsWith('claude'))
    .reduce((sum, job) => sum + jobUsdPerDay(data, job, 'as_is', false), 0)
}

function printReconcile(data: CostModelData) {
  const measuredWindowTotal = measuredAnthropicOnlyUsdPerDay(data) * data.audit.windowDays

  console.log(`\nAI-COST-AUDIT-1 reconciliation — ${data.audit.business}, ${data.audit.windowStart} to ${data.audit.windowEnd} (${data.audit.windowDays} days)`)
  console.log('='.repeat(72))
  console.log(`Measured (recomputed from aria_ai_calls, Anthropic only): $${measuredWindowTotal.toFixed(2)}`)

  let low = measuredWindowTotal
  let high = measuredWindowTotal
  for (const comp of data.estimatedComponents) {
    if (comp.usdPerBusinessPerDayLow !== undefined && comp.usdPerBusinessPerDayHigh !== undefined) {
      const compLow = comp.usdPerBusinessPerDayLow * data.audit.windowDays
      const compHigh = comp.usdPerBusinessPerDayHigh * data.audit.windowDays
      console.log(`+ ${comp.label}: $${compLow.toFixed(2)} - $${compHigh.toFixed(2)}`)
      low += compLow
      high += compHigh
    } else if (comp.usdTotalOverWindowLow !== undefined && comp.usdTotalOverWindowHigh !== undefined) {
      console.log(`+ ${comp.label}: $${comp.usdTotalOverWindowLow.toFixed(2)} - $${comp.usdTotalOverWindowHigh.toFixed(2)}`)
      low += comp.usdTotalOverWindowLow
      high += comp.usdTotalOverWindowHigh
    } else if (comp.usdTotalOverWindow !== undefined) {
      console.log(`+ ${comp.label}: $${comp.usdTotalOverWindow.toFixed(2)}`)
      low += comp.usdTotalOverWindow
      high += comp.usdTotalOverWindow
    }
  }

  console.log('-'.repeat(72))
  console.log(`Bottom-up total range: $${low.toFixed(2)} - $${high.toFixed(2)}`)
  console.log(`Anthropic invoice (reported): $${data.audit.anthropicInvoiceUsd.toFixed(2)}`)
  const gapLow = data.audit.anthropicInvoiceUsd - high
  const gapHigh = data.audit.anthropicInvoiceUsd - low
  console.log(`Unexplained gap: $${Math.max(0, gapLow).toFixed(2)} - $${Math.max(0, gapHigh).toFixed(2)}`)
  console.log('='.repeat(72))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const data = loadData()

  if (args.reconcile) {
    printReconcile(data)
    return
  }

  const venues = args.venues ? Number(args.venues) : 1
  const plan = args.plan ? Number(args.plan) : data.planPricingUsdPerMonth
  if (!Number.isFinite(venues) || venues <= 0) throw new Error('--venues must be a positive number')
  if (!Number.isFinite(plan) || plan <= 0) throw new Error('--plan must be a positive number')

  printProjection(data, venues, plan)
}

main()
