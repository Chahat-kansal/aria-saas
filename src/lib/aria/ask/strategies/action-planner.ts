/**
 * M17 · BRAIN-1 PHASE 3 — THE `action_planner` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:676–737`. THREE exits: stage-error, the fork card, and the clarify fallback when planAction() returns null. That last one exists so a failed plan does not fall into the main model and loop forever asking clarifying questions.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('action_planner', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { planAction } from '@/lib/aria/ask/action-planner'
import { buildPlanContext, upsertConversation } from '../pipeline/turn-persistence'

export const actionPlannerStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, supabase, message, conversationId, clientMessages } = input
  const { features } = understanding
  // route.ts:655-656 — declared just above the lane and used only inside it, so it moves with it.
  // Actions that are too risky to execute immediately — propose-only (save plan, don't execute)
  const PROPOSE_ONLY_TYPES = new Set(['bulk_price_update', 'create_roster'])
  // Action-intent takes precedence over the data-lookup / coref / general lanes below. A strong create command
  // routes to the planner even if the classifier mislabels it analytical; the looser request keeps the guards.
  if (features.planTrigger) {
    const planCtx = await buildPlanContext(bid, conversationId, clientMessages)
    const planned = await planAction(message, bid, planCtx)
    if (planned) {
      const propose_only = PROPOSE_ONLY_TYPES.has(planned.type)
      const previewText = propose_only
        ? `I've drafted a plan: ${planned.title}. This type of change needs your review before execution — I'll save it to your Actions dashboard.`
        : `I can ${planned.title.toLowerCase()}. Choose how to proceed:`

      // BUG 2 FIX: create/update the conversation FIRST so we always have an ID,
      // then attach pending_action to it — even for brand-new conversations (conversationId=null).
      let forkConvId = conversationId
      try {
        forkConvId = await upsertConversation(bid, userId, conversationId, message, previewText, 'action_request')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (action_request):', (e as Error).message, 'conv_id:', conversationId)
      }
      if (forkConvId) {
        const { error: pendingWriteErr } = await supabase.from('aria_conversations').update({
          pending_action: planned,
          pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }).eq('id', forkConvId).eq('business_id', bid)

        if (pendingWriteErr) {
          console.error('[aria/ask] pending_action write failed:', pendingWriteErr.message, 'conv_id:', forkConvId)
          const stageErrText = "Couldn't stage the action — please try again."
          return makeTurnResult('action_planner', {
            response: stageErrText,
            conversation_id: forkConvId,
            intent: 'action_request',
            action: null,
            cost_usd_cents: 0,
          })
        }
      }
      return makeTurnResult('action_planner', {
        response: previewText,
        conversation_id: forkConvId ?? conversationId,
        intent: 'action_request',
        action: { action: 'fork', planned, propose_only },
        cost_usd_cents: 0,
      })
    }
    // BUG 1 FALLBACK: planAction returned null (API failure or truly unresolvable request).
    // Return a direct, non-looping prompt instead of falling through to the main LLM
    // which would loop endlessly asking clarifying questions per rule 5.
    const clarifyReply = `I can help create that — I just need a couple of quick details: what type of promotion (e.g. 10% off, $5 off, buy-one-get-one) and when should it start?`
    let clarifyConvId = conversationId
    try {
      clarifyConvId = await upsertConversation(bid, userId, conversationId, message, clarifyReply, 'action_request')
    } catch (_e) { /* non-fatal */ }
    return makeTurnResult('action_planner', {
      response: clarifyReply,
      conversation_id: clarifyConvId ?? conversationId,
      intent: 'action_request',
      action: null,
      cost_usd_cents: 0,
    })
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
