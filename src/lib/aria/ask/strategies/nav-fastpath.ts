/**
 * M17 · BRAIN-1 PHASE 3 — THE `nav_fastpath` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:792–813`. ENV-GATED OFF in production. Kept exactly as it is — RULE 0 — because a disabled lane is still a lane, and deleting it would be a downgrade.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('nav_fastpath', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { findProductByQuery } from '@/lib/aria/product-map'
import { upsertConversation } from '../pipeline/turn-persistence'

export const navFastpathStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId } = input
  const { features } = understanding
  // NAV fast-path — "where is X / how do I open X / where can I find X"
  // DISABLED by default: product-map is still in the system prompt so LLM answers
  // navigation questions correctly. The zero-LLM shortcut risks hijacking analytical
  // questions (e.g. "where does my best customer live" → wrong nav card).
  // Re-enable by setting NAV_FASTPATH=1 in env after adversarial testing passes.
  if (process.env.NAV_FASTPATH === '1' && features.isNavQuestion) {
    const match = findProductByQuery(message)
    if (match) {
      const navReply = `You can find **${match.feature}** at \`${match.route}\` in the sidebar.\n\n${match.blurb}.`
      let navConvId = conversationId
      try { navConvId = await upsertConversation(bid, userId, conversationId, message, navReply, 'navigation') } catch (_e) { /* non-fatal */ }
      return makeTurnResult('nav_fastpath', {
        response: navReply,
        conversation_id: navConvId ?? conversationId,
        intent: 'navigation',
        action: null,
        cost_usd_cents: 0,
        used_council: false,
      })
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
