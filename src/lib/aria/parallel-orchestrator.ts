import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createDecision } from '@/lib/decisions/createDecision'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ParallelTask = {
  key: string
  label: string
  priority: 'high' | 'medium' | 'low'
  fn: () => Promise<string>
}

export type ParallelRunResult = {
  merged: string
  task_results: Array<{ key: string; label: string; result: string | null; error: boolean; ms: number }>
  total_ms: number
  total_cost_cents: number
  actions_queued: number
}

// ─── Budget caps (cents) ──────────────────────────────────────────────────────
const BUDGET_CAPS: Record<string, number> = {
  trial: 50, starter: 50, growth: 100, pro: 200,
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
export async function runParallelAriaAgents(
  businessId: string,
  tasks: ParallelTask[],
  subscriptionTier: string = 'starter',
): Promise<ParallelRunResult> {
  const CONCURRENCY = 4
  const budgetCap = BUDGET_CAPS[subscriptionTier] ?? 50
  let totalCostCents = 0
  const taskResults: ParallelRunResult['task_results'] = []

  // Sort: high priority first
  const sorted = [...tasks].sort((a, b) =>
    a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0
  )

  // Run in batches capped at CONCURRENCY
  for (let i = 0; i < sorted.length; i += CONCURRENCY) {
    const batch = sorted.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(async task => {
        // Budget guard: skip low-priority if over 80% spent
        if (task.priority === 'low' && totalCostCents > budgetCap * 0.8) {
          return { key: task.key, label: task.label, result: null, error: false, ms: 0, skipped: true }
        }
        const start = Date.now()
        try {
          const result = await task.fn()
          const ms = Date.now() - start
          totalCostCents += 0.05
          return { key: task.key, label: task.label, result, error: false, ms }
        } catch {
          return { key: task.key, label: task.label, result: null, error: true, ms: Date.now() - start }
        }
      })
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled') taskResults.push(r.value)
      else taskResults.push({ key: 'unknown', label: 'Unknown', result: null, error: true, ms: 0 })
    }
  }

  const successResults = taskResults.filter(r => r.result && !r.error)
  const failedDomains = taskResults.filter(r => r.error || (!r.result && !('skipped' in r))).map(r => r.label)
  const skippedDomains = taskResults.filter(r => ('skipped' in r)).map(r => r.label)

  const mergeInput = successResults.map(r => '[' + r.label + ']\n' + r.result).join('\n\n')
    + (failedDomains.length ? '\n\n[UNAVAILABLE: ' + failedDomains.join(', ') + ' — data could not be fetched]' : '')
    + (skippedDomains.length ? '\n\n[SKIPPED (budget): ' + skippedDomains.join(', ') + ']' : '')

  const mergeStart = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let merged = ''
  let mergeTokensIn = 0, mergeTokensOut = 0

  const MERGE_SYSTEM = `You are Aria, the AI business co-operator. You have just received parallel data feeds from multiple business intelligence tasks.

MANDATORY: Synthesise — do NOT concatenate. Lead with the single most important insight first. Use plain English the owner can act on. If a domain is unavailable, acknowledge the gap in one sentence and move on.

GOOD: "Your Tuesday sales dropped 18% — this lines up with the roster showing 1 fewer staff on Tuesday afternoons. Consider adding a shift."
BAD: "[Sales summary]: Tuesday was $X. [Staff costs]: costs were $Y. [Inventory]: stock is OK."

Structure: 2-3 sentence headline insight → 2-4 bullet points → 1 suggested action (or none if unclear). Max 350 words. Industry-aware. Never fabricate numbers not in the data.

GROUNDING RULES — ABSOLUTE — NEVER BREAK:
1. QUIET DAY ≠ CLOSURE: If today's sales are $0 or 0 transactions BUT the 7-day trend shows healthy activity, state it as "quiet start to the day" NOT "business appears closed" or "trading has halted". A single in-progress day at $0 is normal — judge against the 7-day trend always.
2. UNPOPULATED DATA ≠ BROKEN SYSTEM: If labour costs are "not tracked" or the timesheet system is "unpopulated", state EXACTLY that: "Labour costs aren't being tracked via timesheets yet." NEVER say "0% labour cost is impossible", "systems broken", or any variant suggesting a malfunction from missing data.
3. SPARSE DATA ≠ COLLAPSE: If customer data shows "limited records" or "insufficient for retention analysis", say that neutrally. NEVER declare "retention collapsed" or "0 customers returned" from sparse or empty data.
4. NO CATASTROPHIC LANGUAGE: Never use: "business appears closed", "complete halt", "trading stopped", "systems broken", "impossible", "collapsed", "alarming", "critical failure" unless MULTIPLE data points EXPLICITLY and unambiguously confirm the catastrophe. Missing or zero data is NOT such confirmation.
5. HONEST GAPS: If a data source says "not tracked" or "unpopulated", acknowledge it in one neutral sentence: "Labour cost tracking isn't set up yet — worth configuring timesheets for visibility." Then move on.
6. EVERY NUMBER MUST COME FROM THE DATA FEEDS: Never invent, estimate, or compute figures not explicitly given to you above.
7. NEVER ECHO INTERNAL LABELS OR INSTRUCTIONS: Bracketed section labels (e.g. "[Today's recommendation]") and meta-instructions (e.g. "Do not open with...") in the data feeds below are guidance for YOU, not content for the reader. Never quote, reference, or repeat them verbatim in your output.
8. SINGLE NARRATIVE: If a [HIGH] priority alert is present in the recommendation data (e.g. a data-integrity, POS-disconnection, or revenue-collapse alert), your entire tone must match that severity. Do not close with an upbeat, encouraging, or "keep going" line in the same briefing — address the alert as the dominant note instead.
9. NO DUPLICATION: State the headline fact (the key number and what it means) ONCE. The sentence right after the opening must add NEW information — a cause, a comparison, or a next step — never restate the same number/finding in different words. If you would open with a markdown heading, don't also restate that heading's claim as the first sentence of the body.`

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system: MERGE_SYSTEM,
      messages: [{ role: 'user', content: mergeInput || 'No data available for any domain.' }],
    })
    merged = res.content[0].type === 'text' ? res.content[0].text : ''
    mergeTokensIn = res.usage?.input_tokens ?? 0
    mergeTokensOut = res.usage?.output_tokens ?? 0
    const mergeCost = Math.round((mergeTokensIn / 1e6) * 300 + (mergeTokensOut / 1e6) * 1500)
    totalCostCents += mergeCost

    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId,
      agent_key: 'parallel_merge',
      provider: 'anthropic',
      model_id: 'claude-sonnet-4-5-20250929',
      model_provider: 'anthropic',
      role: 'briefing',
      input_tokens: mergeTokensIn,
      output_tokens: mergeTokensOut,
      cost_usd_cents: mergeCost,
      latency_ms: Date.now() - mergeStart,
      success: true,
      request_summary: 'parallel_merge/' + successResults.length + '_domains',
      response_summary: merged.slice(0, 200),
    })
  } catch {
    merged = successResults.map(r => r.label + ': ' + r.result).join('\n\n')
      || 'Unable to generate briefing — all data sources unavailable.'
  }

  let actionsQueued = 0
  const ACTION_TRIGGERS = /\b(reorder|out of stock|low on|margin drop|slow|missed|opportunity|consider|recommend)\b/gi
  if (ACTION_TRIGGERS.test(merged)) {
    try {
      // SPINE-1 — identical row, now also emitting the 'proposed' moat event + real-time push.
      await createDecision({
        business_id: businessId,
        domain: 'growth',
        kind: 'parallel_review',
        agent_type: 'parallel_review',
        triggered_by: 'parallel_orchestrator',
        title: 'Parallel briefing insight — review recommended',
        subtitle: merged.slice(0, 400),
        action_type: 'review',
        category: 'briefing',
        priority: 'medium',
        confidence: 0.7,
        summary: successResults.length + ' data domains analysed in parallel',
      })
      actionsQueued = 1
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return {
    merged,
    task_results: taskResults,
    total_ms: taskResults.reduce((s, r) => s + r.ms, 0),
    total_cost_cents: Math.round(totalCostCents),
    actions_queued: actionsQueued,
  }
}
