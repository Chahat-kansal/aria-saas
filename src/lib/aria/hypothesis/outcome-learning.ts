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

  // Create corresponding aria_autopilot_actions row so the Autopilot dashboard
  // reflects approved recommendations with their outcome tracking status
  const confStr = (a.confidence as string | null) ?? ''
  const confNum = confStr === 'high' ? 0.9 : confStr === 'medium' ? 0.7 : confStr === 'low' ? 0.5 : null
  await supabaseAdmin.from('aria_autopilot_actions').insert({
    business_id: businessId,
    action_id: actionId,
    action_type: 'aria_recommendation_approved',
    title: (a.title as string).slice(0, 200),
    description: (a.recommendation as string | null)?.slice(0, 500) ?? null,
    status: 'approved',
    outcome: 'pending',
    priority: (a.priority as string | null) ?? null,
    category: a.category as string | null,
    reasoning: (a.reason as string | null)?.slice(0, 500) ?? null,
    confidence: confNum,
    estimated_impact: (a.expected_impact as string | null) ?? null,
    approved_at: new Date().toISOString(),
    triggered_by: 'aria_actions:' + actionId,
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
 * I4-VERIFY — Called when an aria_action reaches its TERMINAL state 'executed'.
 * Lifecycle is pending→approved→executed; many actions skip the 'approved' PATCH branch entirely
 * (auto-execute paths set status='executed' directly), so onActionApproved never fired and NO linked
 * outcome was ever created — the dead-end that left aria_outcomes with 0 action_id rows and the cron
 * with nothing to verdict. This creates the linked outcome (action_id + baseline_metric_cents) at
 * 'executed'. IDEMPOTENT: if an acted-on outcome already exists for this action (e.g. created at
 * 'approved'), it does nothing — so it never duplicates onActionApproved's row.
 */
export async function onActionExecuted(actionId: string, businessId: string): Promise<void> {
  // Idempotency guard — already tracked by an acted-on outcome? (approved path, or a prior execute)
  const { data: existing } = await supabaseAdmin
    .from('aria_outcomes')
    .select('id')
    .eq('business_id', businessId)
    .eq('action_id', actionId)
    .eq('acted_on', true)
    .limit(1)
    .maybeSingle()
  if (existing) return

  const { data: action } = await supabaseAdmin
    .from('aria_actions')
    .select('id,title,category,recommendation,source')
    .eq('id', actionId)
    .maybeSingle()
  if (!action) return

  const a = action as Record<string, unknown>
  const baseline = await snapshotBaseline(businessId, (a.category as string | null) ?? 'cashflow')
  const nowIso = new Date().toISOString()

  const { error } = await supabaseAdmin.from('aria_outcomes').insert({
    business_id: businessId,
    action_id: actionId,
    recommendation_type: (a.source as string | null) ?? 'aria_action',
    recommendation_detail: `${a.title as string}: ${(a.recommendation as string | null) ?? ''}`.slice(0, 1000),
    recommended_at: nowIso,
    acted_on: true,
    acted_on_at: nowIso,
    category: a.category as string | null,
    baseline_metric_cents: baseline,
  })
  if (error) { console.error('[outcome-learning] onActionExecuted insert failed:', error.message); return }
  console.log('[outcome-learning] action executed, linked outcome created for', actionId, 'baseline_cents', baseline)
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
    // customers / staff use a head-count metric; EVERY other category (cashflow, pricing, inventory,
    // marketing, hours, sales, revenue, promotions, …) uses 7-day revenue in cents. I4-VERIFY: the
    // revenue branch is now the DEFAULT — previously unlisted categories (e.g. 'sales', the real
    // category on Sip's actions) returned null, leaving the outcome with no baseline so the cron could
    // never verdict it. Revenue is the universal baseline; this only turns nulls into real numbers.
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
    // INTEL-OUTCOME-2 Part 3 — same recurring bug class fixed repeatedly across
    // INTEL-COMPUTE-2/3/4/CONTRACT-1: neq('status','voided') admits draft (unsent/in-progress) and
    // refunded rows into the revenue baseline/verdict this function computes. Every verdict
    // runOutcomeChecks has ever written (so far, exactly one) was measured against this contaminated
    // figure. Fixed to the canonical status='completed' filter — the same real-money boundary as
    // getRevenueSnapshot() and every other revenue site in this codebase.
    const { data } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', since)
    return (data ?? []).reduce((s, r) => s + Math.round(Number((r as Record<string,unknown>).total_amount || 0) * 100), 0)
  } catch {
    return null
  }
}

// ── LRN-1: Autopilot outcome tracking ────────────────────────────────────────

/**
 * Phase 1: Backfill aria_autopilot_actions rows for any aria_actions that were approved
 * but never got an outcome tracking row (e.g. approved before LRN-1 was deployed).
 * Phase 2: Resolve 'pending' outcomes that are 7+ days old.
 */
export async function runAutopilotOutcomeChecks(businessId: string): Promise<{ backfilled: number; resolved: number }> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  let backfilled = 0, resolved = 0

  // ── Phase 1: backfill approved aria_actions with no outcome row ──────────
  const { data: approvedActions } = await supabaseAdmin
    .from('aria_actions')
    .select('id, title, category, priority, recommendation, reason, expected_impact, confidence, created_at')
    .eq('business_id', businessId)
    .eq('status', 'approved')

  for (const aa of (approvedActions ?? []) as Record<string, unknown>[]) {
    const actionId = aa.id as string
    // Check if tracking row already exists (by action_id OR legacy triggered_by)
    const { count } = await supabaseAdmin
      .from('aria_autopilot_actions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .or(`action_id.eq.${actionId},triggered_by.eq.aria_actions:${actionId}`)
    if ((count ?? 0) > 0) continue

    const confStr = (aa.confidence as string | null) ?? ''
    const confNum = confStr === 'high' ? 0.9 : confStr === 'medium' ? 0.7 : confStr === 'low' ? 0.5 : null
    await supabaseAdmin.from('aria_autopilot_actions').insert({
      business_id: businessId,
      action_id: actionId,
      action_type: 'aria_recommendation_approved',
      title: (aa.title as string).slice(0, 200),
      description: (aa.recommendation as string | null)?.slice(0, 500) ?? null,
      status: 'approved',
      outcome: 'pending',
      category: aa.category as string | null,
      priority: aa.priority as string | null,
      confidence: confNum,
      estimated_impact: (aa.expected_impact as string | null) ?? null,
      approved_at: now.toISOString(),
      triggered_by: 'aria_actions:' + actionId,
    })
    backfilled++
  }

  // ── Phase 2: resolve pending outcomes that are 7+ days old ──────────────
  const { data: pendingRows } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select('id, category, action_id, created_at')
    .eq('business_id', businessId)
    .eq('outcome', 'pending')
    .lt('created_at', sevenDaysAgo)

  for (const row of (pendingRows ?? []) as Record<string, unknown>[]) {
    const rowId     = row.id as string
    const category  = (row.category as string | null) ?? 'cashflow'
    const createdAt = new Date(row.created_at as string)

    const beforeStart = new Date(createdAt.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const beforeEnd   = createdAt.toISOString()
    const afterStart  = createdAt.toISOString()
    const afterEnd    = new Date(createdAt.getTime() +  7 * 24 * 60 * 60 * 1000).toISOString()

    let verdict: 'positive' | 'negative' | 'unknown' = 'unknown'

    try {
      if (['cashflow', 'revenue', 'pricing', 'marketing', 'hours', 'promotions'].includes(category)) {
        const [{ data: beforeSales }, { data: afterSales }] = await Promise.all([
          supabaseAdmin.from('pos_sales').select('total_amount')
            .eq('business_id', businessId).neq('status', 'voided')
            .gte('created_at', beforeStart).lt('created_at', beforeEnd),
          supabaseAdmin.from('pos_sales').select('total_amount')
            .eq('business_id', businessId).neq('status', 'voided')
            .gte('created_at', afterStart).lte('created_at', afterEnd),
        ])
        const beforeRev = (beforeSales ?? []).reduce((s, r) => s + Number((r as Record<string,unknown>).total_amount || 0), 0)
        const afterRev  = (afterSales  ?? []).reduce((s, r) => s + Number((r as Record<string,unknown>).total_amount || 0), 0)
        if (beforeRev > 0) {
          const delta = (afterRev - beforeRev) / beforeRev
          verdict = delta > 0.05 ? 'positive' : delta < -0.05 ? 'negative' : 'unknown'
        }
      } else if (['stock', 'inventory'].includes(category)) {
        // Cleared = no critical low-stock items
        const { count: lowStockCount } = await supabaseAdmin
          .from('pos_products')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_active', true)
          .lte('stock_quantity', 2)
        verdict = (lowStockCount ?? 0) === 0 ? 'positive' : 'unknown'
      }
    } catch { verdict = 'unknown' }

    await supabaseAdmin.from('aria_autopilot_actions')
      .update({ outcome: verdict })
      .eq('id', rowId)

    // Update linked aria_actions to 'completed'
    if (row.action_id) {
      await supabaseAdmin.from('aria_actions')
        .update({ status: 'completed', updated_at: now.toISOString() })
        .eq('id', row.action_id as string)
        .eq('business_id', businessId)
    }

    // Write learning_signal to most recent aria_ai_calls for this business's council agents
    const agentKey = category === 'cashflow' || category === 'revenue' || category === 'pricing' ? 'council_growth'
      : category === 'stock' || category === 'inventory' ? 'council_risk'
      : 'council_strategy'
    const { data: latestCall } = await supabaseAdmin
      .from('aria_ai_calls')
      .select('id')
      .eq('business_id', businessId)
      .eq('agent_key', agentKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestCall) {
      await supabaseAdmin.from('aria_ai_calls')
        .update({ learning_signal: verdict })
        .eq('id', (latestCall as { id: string }).id)
    }

    resolved++
  }

  return { backfilled, resolved }
}

/**
 * I4 OUTCOME-LOOP-1 PART 5 — Hypothesis outcome closure.
 * Accepted hypotheses link to an aria_action (action_id) whose aria_outcomes row carries the
 * verdict computed by runOutcomeChecks. This propagates that resolved verdict back onto the
 * hypothesis row (outcome_verdict / outcome_*_cents / outcome_checked_at), finally closing the
 * hypothesis learning loop. Single source of truth — it does NOT recompute; it reads the outcome
 * the cron already resolved, so a hypothesis is only closed once its outcome has a verdict.
 */
export async function runHypothesisOutcomeClosure(businessId: string): Promise<{ closed: number }> {
  const { data: hyps } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('id, action_id')
    .eq('business_id', businessId)
    .eq('status', 'accepted')
    .not('action_id', 'is', null)
    .is('outcome_checked_at', null)

  if (!hyps || hyps.length === 0) return { closed: 0 }

  let closed = 0
  for (const hyp of hyps as Array<{ id: string; action_id: string | null }>) {
    if (!hyp.action_id) continue
    // The linked outcome row already carries the computed verdict (runOutcomeChecks). If it has
    // no verdict yet, the outcome isn't resolved — leave the hypothesis open for a later run.
    const { data: outcome } = await supabaseAdmin
      .from('aria_outcomes')
      .select('outcome_verdict, outcome_7d_cents, outcome_30d_cents')
      .eq('action_id', hyp.action_id)
      .eq('business_id', businessId)
      .not('outcome_verdict', 'is', null)
      .order('outcome_checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!outcome) continue

    const o = outcome as Record<string, unknown>
    await supabaseAdmin.from('aria_hypotheses').update({
      outcome_verdict:   o.outcome_verdict as string,
      outcome_7d_cents:  (o.outcome_7d_cents  as number | null) ?? null,
      outcome_30d_cents: (o.outcome_30d_cents as number | null) ?? null,
      outcome_checked_at: new Date().toISOString(),
    }).eq('id', hyp.id)
    closed++
  }

  return { closed }
}

export async function adjustAdviceWeight(businessId: string, category: string, verdict: string): Promise<void> {
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
