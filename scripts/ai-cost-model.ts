// Full-COGS cost model CLI (COST-LEDGER-1 — was AI-only under AI-COST-AUDIT-1/AI-COST-2, extended
// to the complete per-venue cost of goods: AI + SMS + email + Stripe fees + fixed costs allocated
// per active business).
//
// Standalone calculator, read-only: touches nothing at runtime. Reads its per-job cost table from
// ./ai-cost-model.json. The compute core lives in src/lib/cost-model.ts, shared with the live admin
// page's venues-slider widget (src/app/api/admin/costs/route.ts) so the CLI and the admin UI can
// never drift apart.
//
// Usage:
//   npx tsx scripts/ai-cost-model.ts
//   npx tsx scripts/ai-cost-model.ts --venues=50
//   npx tsx scripts/ai-cost-model.ts --venues=200 --plan=297
//   npx tsx scripts/ai-cost-model.ts --reconcile        (prints the window-only $20 AI reconciliation)
//
// Fixed-cost allocation (Vercel/Supabase/etc, ÷30 ÷active-business-count) requires the LIVE
// cost_subscriptions table and active-business count, which this offline CLI has no DB access to —
// it prints AI + SMS/email/fee only and states that fixed costs are omitted. The admin page
// (Admin → Cost Ledger) shows the true all-in total including live fixed-cost allocation.
//
// PROCESS RULE (see CLAUDE.md): any sprint adding or modifying an LLM call must add a job entry to
// ai-cost-model.json and quote the resulting $/business/day (this script's output) in its commit
// message. COST-LEDGER-1 extends this: a sprint adding a new SMS/email/fee cost path should add an
// entry to nonAiCosts in ai-cost-model.json too.

import { loadCostModelData, measuredAnthropicOnlyUsdPerDay, computeFullCogsPerBusinessPerDay } from '../src/lib/cost-model'

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (const arg of argv) {
    const m = arg.match(/^--([a-zA-Z_]+)=(.+)$/)
    if (m) out[m[1]] = m[2]
    if (arg === '--reconcile') out.reconcile = 'true'
  }
  return out
}

function printProjection(venues: number, plan: number) {
  const data = loadCostModelData()
  const asIs = computeFullCogsPerBusinessPerDay(data, 'as_is', 0)
  const wasteGated = computeFullCogsPerBusinessPerDay(data, 'waste_gated', 0)

  console.log(`\nCost model (COST-LEDGER-1 full COGS) — ${venues} venue(s), $${plan}/mo plan`)
  console.log('='.repeat(72))
  console.log(`AI:     as-is $${asIs.aiUsdPerBusinessPerDay.toFixed(4)}/biz/day, waste-gated $${wasteGated.aiUsdPerBusinessPerDay.toFixed(4)}/biz/day`)
  for (const c of asIs.nonAiBreakdown) {
    console.log(`${c.label.padEnd(30)} $${c.usdPerBusinessPerDay.toFixed(4)}/biz/day (${c.source})`)
  }
  console.log('Fixed costs (Vercel/Supabase/etc): OMITTED — requires live cost_subscriptions data, see Admin -> Cost Ledger for the true all-in total')
  console.log('-'.repeat(72))

  const rows = [
    { name: 'as-is (AI + SMS/email/fee, incl. AI-COST-2)', perDay: asIs.aiUsdPerBusinessPerDay + asIs.nonAiUsdPerBusinessPerDay },
    { name: 'waste-gated (remaining cron-tail batch, MODELED)', perDay: wasteGated.aiUsdPerBusinessPerDay + wasteGated.nonAiUsdPerBusinessPerDay },
  ]

  for (const r of rows) {
    const dayTotal = r.perDay * venues
    const monthTotal = dayTotal * 30
    const revenueTotal = plan * venues
    const pct = (monthTotal / revenueTotal) * 100
    console.log(`${r.name.padEnd(48)} $${dayTotal.toFixed(2)}/day  $${monthTotal.toFixed(2)}/mo  ${pct.toFixed(2)}% of plan revenue (excl. fixed costs)`)
  }
  console.log('='.repeat(72))
}

function printReconcile() {
  const data = loadCostModelData()
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

  if (args.reconcile) {
    printReconcile()
    return
  }

  const venues = args.venues ? Number(args.venues) : 1
  const data = loadCostModelData()
  const plan = args.plan ? Number(args.plan) : data.planPricingUsdPerMonth
  if (!Number.isFinite(venues) || venues <= 0) throw new Error('--venues must be a positive number')
  if (!Number.isFinite(plan) || plan <= 0) throw new Error('--plan must be a positive number')

  printProjection(venues, plan)
}

main()
