/**
 * M17 · BRAIN-1 PHASE 3 — THE `multi_domain` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:930–958`. Falls back to the single-call path on any error.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('multi_domain', X)`
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
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'
import { upsertConversation } from '../pipeline/turn-persistence'

export const multiDomainStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId } = input
  const { features } = understanding
  if (features.isMultiDomain) {
    try {
      const { data: bizInfo, error: bizErr } = await supabaseAdmin.from('businesses').select('industry, subscription_tier').eq('id', bid).maybeSingle()
      // WALL 6 — a lost read silently downgrades the run to 'retail' + 'starter', which changes
      // which agents run and how many. Non-fatal, no longer silent.
      if (bizErr) console.error('[aria/ask] multi-domain business lookup failed:', bizErr.message)
      const tasks = buildBriefingTasks(bid, (bizInfo as { industry?: string } | null)?.industry ?? 'retail')
      const parallelResult = await runParallelAriaAgents(bid, tasks, (bizInfo as { subscription_tier?: string } | null)?.subscription_tier ?? 'starter')
      const responseText = 'Here\'s your full business overview:\n\n' + parallelResult.merged
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'multi_domain')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (multi_domain):', (e as Error).message)
      }
      return makeTurnResult('multi_domain', {
        response: responseText,
        conversation_id: savedConvId ?? conversationId,
        intent: 'multi_domain',
        action: null,
        cost_usd_cents: parallelResult.total_cost_cents,
        downloads: null,
        tool_calls: [],
        used_council: false,
        ai_mode: 'parallel',
        model_used: 'parallel',
      })
    } catch (err) {
      console.error('[aria/ask] multi-domain parallel failed, falling back:', (err as Error).message)
      // Non-fatal — fall through to single-call path
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
