import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildBusinessContext } from './context'
import { runAgent } from './agents'
import { judge } from './judge'
import { tryConsume } from './rate-limit'
import type { AgentKey, AriaInvokeResult } from './types'

function agentToCategory(key: AgentKey): string {
  const map: Record<AgentKey, string> = {
    promo: 'promotions', pricing: 'pricing', inventory: 'inventory',
    compliance: 'compliance', product_lookup: 'inventory', hardware: 'sales',
    ops_narrative: 'sales', generic: 'sales',
    intent_classifier: 'sales', ask_aria: 'sales', ask_suggestions: 'sales',
    ask_files: 'sales', ask_troubleshoot: 'sales',
    rostering: 'staff', hypothesis_engine: 'sales',
    signal_engine_synth: 'sales', memory_extractor: 'sales',
    customer_insight: 'customers', document_vision: 'inventory',
    marketing_ai_generate: 'promotions', review_reputation: 'sales',
  }
  return map[key] ?? 'sales'
}

export async function routeAndJudge(
  agentKey: AgentKey,
  businessId: string,
  opts: {
    productId?: string
    taskHint?: string
    includeWeather?: boolean
  } = {},
): Promise<AriaInvokeResult> {
  const t0 = Date.now()

  // Rate limit
  const rl = tryConsume(businessId, 1)
  if (!rl.allowed) {
    return { recommendation: null, reason: 'Rate limit exceeded. Try again in a minute.' }
  }

  const supabase = createServerSupabaseClient()
  const context = await buildBusinessContext(supabase, businessId, {
    productId: opts.productId,
    includeWeather: opts.includeWeather,
  })

  if (!context) {
    return { recommendation: null, reason: 'Business context not found.' }
  }

  // Run specialist agent
  const agentResult = await runAgent(agentKey, context, opts.taskHint)
  let totalCost = agentResult.cost_cents

  const rec = agentResult.recommendation
  if (rec.type === 'none') {
    return { recommendation: null, reason: rec.rationale ?? 'No suggestion applicable.', total_cost_cents: totalCost }
  }

  // 3-pass judge
  const validation = await judge(rec, context)
  totalCost += validation.cost_cents ?? 0

  const finalRec = validation.ok
    ? (validation.rewritten ?? rec)
    : (validation.severity === 'soft' && validation.rewritten ? validation.rewritten : null)

  // Persist to aria_actions — expected_impact is TEXT
  try {
    await supabase.from('aria_actions').insert({
      business_id: businessId,
      title: rec.title,
      category: agentToCategory(agentKey),
      priority: (validation.primary_judge_score ?? 0) >= 80 ? 'high' : 'medium',
      recommendation: rec.description,
      reason: validation.ok ? null : (validation.rejected_reason ?? null),
      expected_impact: (Number(rec.estimated_impact_dollars) || 0).toFixed(2),
      confidence: rec.confidence,
      status: validation.ok ? 'pending' : 'auto_rejected',
      source: `aria_router:${agentKey}`,
      payload: {
        recommendation: rec,
        validation: {
          ok: validation.ok,
          primary_score: validation.primary_judge_score,
          secondary_score: validation.secondary_judge_score,
          judges_disagreed: validation.judges_disagreed,
          notes: validation.judge_notes,
          severity: validation.severity,
        },
        cost_usd_cents: totalCost,
        latency_ms: Date.now() - t0,
      },
    })
  } catch { /* aria_actions insert failure non-fatal */ }

  return {
    recommendation: finalRec,
    reason: validation.ok ? null : (validation.rejected_reason ?? 'Rejected by judge'),
    validation,
    total_cost_cents: totalCost,
    latency_ms: Date.now() - t0,
  }
}
