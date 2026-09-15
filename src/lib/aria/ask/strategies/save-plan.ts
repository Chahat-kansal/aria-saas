/**
 * M17 · BRAIN-1 PHASE 3 — THE `save_plan` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:369–400`. The UI sentinel lane. No LLM call — the pending_action is already planned.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('save_plan', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { upsertConversation } from '../pipeline/turn-persistence'

export const savePlanStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId } = input
  // ── Save-plan fast-path ────────────────────────────────────────────────────
  // When the UI sends [ARIA_SAVE_PLAN], save the pending_action to aria_actions
  // with status='proposed' and return immediately — no LLM call needed.
  if (message === '[ARIA_SAVE_PLAN]' && conversationId) {
    const { data: convRow, error: convErr } = await supabaseAdmin
      .from('aria_conversations').select('pending_action')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()
    // WALL 6 — a lost read makes this look like "there was no plan to save" and the owner is
    // told "Plan saved: your plan" having saved nothing.
    if (convErr) console.error('[aria/ask] save-plan pending_action read failed:', convErr.message)
    if (convRow?.pending_action) {
      const plan = convRow.pending_action as import('@/lib/aria/ask/action-planner').PlannedAction
      const impactText = (Number((plan.estimated_impact ?? '').replace(/[^0-9.]/g, '').slice(0, 10) || '0') || 0).toFixed(2)
      const { error: planInsertErr } = await supabaseAdmin.from('aria_actions').insert({
        business_id: bid,
        category: 'sales',
        title: plan.title,
        recommendation: plan.description,
        expected_impact: impactText,
        confidence: plan.risk === 'low' ? 'high' : plan.risk === 'medium' ? 'medium' : 'low',
        status: 'proposed',
        source: 'ask_aria:plan',
        priority: plan.risk === 'high' ? 'high' : 'medium',
        triggered_by: 'ask_aria',
      })
      // WALL 6 — the whole point of this lane is that the plan reaches aria_actions. A rejected
      // INSERT here means the owner is told it was saved and the Actions dashboard stays empty.
      if (planInsertErr) console.error('[aria/ask] save-plan aria_actions INSERT failed:', planInsertErr.message)
      const { error: clearErr } = await supabaseAdmin.from('aria_conversations')
        .update({ pending_action: null, pending_action_expires_at: null })
        .eq('id', conversationId)
      // WALL 6 — a failed clear leaves the pending_action live, so the next "confirm" re-runs it.
      if (clearErr) console.error('[aria/ask] save-plan pending_action clear failed:', clearErr.message)
    }
    const planTitle = (convRow?.pending_action as import('@/lib/aria/ask/action-planner').PlannedAction | null)?.title ?? 'your plan'
    const planReply = `Plan saved: "${planTitle}". You'll find it in your Actions dashboard when you're ready to execute.`
    let planConvId = conversationId
    try { planConvId = await upsertConversation(bid, userId, conversationId, 'Save plan', planReply, 'plan_saved') } catch (_e) { /* non-fatal */ }
    return makeTurnResult('save_plan', { response: planReply, conversation_id: planConvId, intent: 'plan_saved', action: { type: 'plan_saved' }, cost_usd_cents: 0 })
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
