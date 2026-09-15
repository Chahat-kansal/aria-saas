/**
 * M17 · BRAIN-1 PHASE 3 — THE `agent_composer` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:613–643`. MS13 phase 4. Deterministic, no LLM, staged through the same pending_action machinery as every other action: nothing persists until the owner confirms.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('agent_composer', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { upsertConversation } from '../pipeline/turn-persistence'

export const agentComposerStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, supabase, message, conversationId } = input
  const { features } = understanding
  // MS13 PHASE 4 — THE AGENT COMPOSER LANE. Describe → spec card (with the ALWAYS-TRUE box) →
  // revise by re-describing → approve → aria_skills row (kind='agent'). Deterministic (no LLM),
  // staged through the SAME pending_action machinery as every other action: NOTHING persists
  // until the owner confirms, and reject/expiry clears the card without a write.
  if (features.isAgentCompose) {
    const { planCreateAgent } = await import('@/lib/aria/agents/composer')
    const planned = planCreateAgent(message)
    const cardText = 'Here\u2019s the agent I\u2019ll create:\n\n' + planned.preview.join('\n')
    let agentConvId = conversationId
    try {
      agentConvId = await upsertConversation(bid, userId, conversationId, message, cardText, 'action_request')
    } catch (e) { console.error('[aria/ask] composer upsert failed:', (e as Error).message) }
    if (agentConvId) {
      const { error: stageErr } = await supabase.from('aria_conversations').update({
        pending_action: planned,
        pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }).eq('id', agentConvId).eq('business_id', bid)
      if (stageErr) {
        console.error('[aria/ask] composer stage failed:', stageErr.message)
        return makeTurnResult('agent_composer', { response: "Couldn't stage the agent \u2014 please try again.", conversation_id: agentConvId, intent: 'action_request', action: null, cost_usd_cents: 0 })
      }
    }
    return makeTurnResult('agent_composer', {
      response: cardText,
      conversation_id: agentConvId ?? conversationId,
      intent: 'action_request',
      action: { action: 'fork', planned, propose_only: false },
      cost_usd_cents: 0,
    })
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
