import { supabaseAdmin } from '@/lib/supabase-admin'
import { persistMemories } from '../memory/extract'

/**
 * Called when an owner approves an aria_action.
 * Snapshots the current baseline metric and creates an outcome tracking row.
 */
export async function onActionApproved(actionId: string, businessId: string): Promise<void> {
  const { data: action } = await supabaseAdmin
    .from('aria_actions')
    .select('id,title,category,recommendation,expected_impact,confidence,source')
    .eq('id', actionId)
    .maybeSingle()
  if (!action) return

  const a = action as Record<string, unknown>
  const baseline = await snapshotBaseline(businessId, (a.category as string | null) ?? 'cashflow')

  await supabaseAdmin.from('aria_outcomes').insert({
    business_id: businessId,
    action_id: actionId,
    recommendation_type: (a.source as string | null) ?? 'aria_action',
    recommendation_detail: `${a.title as string}: ${(a.recommendation as string | null) ?? ''}`.slice(0, 1000),
    recommended_at: new Date().toISOString(),
    acted_on: true,
    acted_on_at: new Date().toISOString(),
    category: a.category as string | null,
    baseline_metric_cents: baseline,
  })

  const memContent = `Owner accepted Aria recommendation: "${(a.title as string).slice(0, 150)}". Category: ${a.category as string | null}. Expected: ${(a.expected_impact as string | null) ?? 'unspecified'}.`
  await persistMemories(
    businessId,
    [{ kind: 'decision', content: memContent, topic: (a.category as string | null), importance: 7, confidence: 0.9 }],
    null,
  )

  console.log('[outcome-learning] action approved, baseline snapshotted for', actionId, 'baseline_cents', baseline)
}

/**
 * Called by the outcome-check cron.
 * Computes 7d/30d verdicts, adjusts advice weights, writes memories.
 */
export async function runOutcomeChecks(businessId: string): Promise<{ checked: number; memories_written: number }> {
  const now = new Date()
  const day7  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data: outcomes } = await supabaseAdmin
    .from('aria_outcomes')
    .select('id,business_id,action_id,category,recommendation_detail,baseline_metric_cents,outcome_7d_cents,outcome_30d_cents,acted_on_at,outcome_verdict')
    .eq('business_id', businessId)
    .eq('acted_on', true)
    .is('outcome_verdict', null)
    .not('acted_on_at', 'is', null)

  if (!outcomes || outcomes.length === 0) return { checked: 0, memories_written: 0 }

  let checked = 0, memoriesWritten = 0

  for (const outcome of outcomes) {
    const o = outcome as Record<string, unknown>
    if (!o.acted_on_at) continue

    const actedAt       = new Date(o.acted_on_at as string)
    const category      = (o.category as string | null) ?? 'cashflow'
    const baselineCents = o.baseline_metric_cents as number | null
    const needs7d  = !o.outcome_7d_cents  && actedAt < day7
    const needs30d = !o.outcome_30d_cents && actedAt < day30

    if (!needs7d && !needs30d) continue

    const current = await snapshotBaseline(businessId, category)
    const update: Record<string, unknown> = {}

    if (needs7d) update.outcome_7d_cents = current

    if (needs30d) {
      update.outcome_30d_cents = current
      if (baselineCents !== null && current !== null) {
        const delta     = current - baselineCents
        const threshold = Math.abs(baselineCents) * 0.05
        let verdict: string
        if      (delta > threshold)            verdict = 'worked'
        else if (delta < -threshold)           verdict = 'backfired'
        else if (Math.abs(delta) <= threshold * 0.5) verdict = 'neutral'
        else                                   verdict = 'partial'

        update.outcome_verdict     = verdict
        update.outcome_checked_at  = now.toISOString()

        await adjustAdviceWeight(businessId, category, verdict)

        const sign       = delta >= 0 ? '+' : '-'
        const deltaLabel = `${sign}$${(Math.abs(delta) / 100).toFixed(0)}`
        const detail     = ((o.recommendation_detail as string) ?? '').slice(0, 120)
        const memContent = `Tried: "${detail}". Result after 30 days: ${verdict} (${deltaLabel} in ${category} metric vs baseline).`
        const mem = await persistMemories(
          businessId,
          [{
            kind: 'tried',
            content: memContent,
            topic: category,
            importance: verdict === 'worked' ? 8 : verdict === 'backfired' ? 7 : 5,
            confidence: 0.85,
          }],
          null,
        )
        memoriesWritten += mem.inserted
      }
    }

    if (Object.keys(update).length > 0) {
      await supabaseAdmin.from('aria_outcomes').update(update).eq('id', o.id as string)
      checked++
    }
  }

  return { checked, memories_written: memoriesWritten }
}

async function snapshotBaseline(businessId: string, category: string): Promise<number | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  try {
    if (['cashflow', 'pricing', 'inventory', 'marketing', 'hours'].includes(category)) {
      const { data } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', businessId)
        .neq('status', 'voided')
        .gte('created_at', since)
      return (data ?? []).reduce((s, r) => s + Math.round(Number((r as Record<string,unknown>).total_amount || 0) * 100), 0)
    }
    if (category === 'customers') {
      const { count } = await supabaseAdmin
        .from('pos_customers')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .in('segment', ['champions', 'loyal', 'regular'])
      return (count ?? 0) * 100
    }
    if (category === 'staff') {
      const { count } = await supabaseAdmin
        .from('pos_users')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_active', true)
      return count ?? 0
    }
    return null
  } catch {
    return null
  }
}

async function adjustAdviceWeight(businessId: string, category: string, verdict: string): Promise<void> {
  const delta   = verdict === 'worked' ? 0.1 : verdict === 'backfired' ? -0.15 : 0.0
  const posInc  = verdict === 'worked'                              ? 1 : 0
  const negInc  = verdict === 'backfired'                           ? 1 : 0
  const neutInc = verdict === 'neutral' || verdict === 'partial'    ? 1 : 0

  try {
    const { data: existing } = await supabaseAdmin
      .from('aria_advice_weights')
      .select('id,weight,positive_outcomes,negative_outcomes,neutral_outcomes')
      .eq('business_id', businessId)
      .eq('category', category)
      .maybeSingle()

    if (existing) {
      const e = existing as Record<string, unknown>
      const newWeight = Math.max(0.3, Math.min(2.0, Number(e.weight) + delta))
      await supabaseAdmin
        .from('aria_advice_weights')
        .update({
          weight: Number(newWeight.toFixed(3)),
          positive_outcomes: (Number(e.positive_outcomes) || 0) + posInc,
          negative_outcomes: (Number(e.negative_outcomes) || 0) + negInc,
          neutral_outcomes:  (Number(e.neutral_outcomes)  || 0) + neutInc,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', e.id as string)
    } else {
      await supabaseAdmin
        .from('aria_advice_weights')
        .insert({
          business_id: businessId,
          category,
          weight: Number(Math.max(0.3, Math.min(2.0, 1.0 + delta)).toFixed(3)),
          positive_outcomes: posInc,
          negative_outcomes: negInc,
          neutral_outcomes:  neutInc,
        })
    }
  } catch (e) {
    console.error('[outcome-learning] adjustAdviceWeight failed:', (e as Error).message)
  }
}
