/**
 * M17 · BRAIN-1 PHASE 3 — THE `inventory_agent` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:740–790`. INV-AGENT-1. Falls through to the main tool loop on a thrown error, and DECLINES when handleInventoryQuestion() reports handled:false.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('inventory_agent', X)`
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
import { classifyInventoryIntent, handleInventoryQuestion } from '@/lib/inventory/owner-agent'
import { upsertConversation } from '../pipeline/turn-persistence'

export const inventoryAgentStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, supabase, message, conversationId } = input
  // the full 19-query context build + 30-tool loop. Answers from real DB data; routes
  // PO approvals through the existing pending_action gate. SURFACE + ROUTE ONLY.
  const invIntent = classifyInventoryIntent(message)
  if (invIntent !== 'none') {
    try {
      const invResult = await handleInventoryQuestion(supabaseAdmin, bid, message, invIntent)
      if (invResult.handled) {
        if (invResult.approve_action) {
          // Pending-action gate — stores the approve_po_draft action for one-tap confirmation.
          const planned = invResult.approve_action
          let forkConvId = conversationId
          try {
            forkConvId = await upsertConversation(bid, userId, conversationId, message, invResult.text, 'action_request')
          } catch (e) { console.error('[aria/ask] inv_agent upsert failed:', (e as Error).message) }
          if (forkConvId) {
            const { error: invStageErr } = await supabase.from('aria_conversations').update({
              pending_action: planned,
              pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            }).eq('id', forkConvId).eq('business_id', bid)
            // WALL 6 — if this write is rejected the owner is shown a PO approval card whose
            // pending_action was never stored: tapping confirm then does nothing at all.
            if (invStageErr) console.error('[aria/ask] inv_agent pending_action stage failed:', invStageErr.message)
          }
          return makeTurnResult('inventory_agent', {
            response: invResult.text,
            conversation_id: forkConvId ?? conversationId,
            intent: 'action_request',
            action: { action: 'fork', planned, propose_only: false },
            cost_usd_cents: 0,
          })
        }
        // Informational inventory answer — return directly.
        let invConvId = conversationId
        try {
          invConvId = await upsertConversation(bid, userId, conversationId, message, invResult.text, 'inventory')
        } catch (e) { console.error('[aria/ask] inv_agent upsert failed:', (e as Error).message) }
        return makeTurnResult('inventory_agent', {
          response: invResult.text,
          conversation_id: invConvId ?? conversationId,
          intent: 'inventory',
          action: null,
          cost_usd_cents: invResult.cost_cents,
          downloads: null,
          tool_calls: [],
          used_council: false,
          ai_mode: 'haiku',
          model_used: 'haiku',
        })
      }
    } catch (e) {
      console.error('[aria/ask] inv_agent failed, falling through:', (e as Error).message)
      // RULE 0: non-fatal — fall through to main tool loop
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
