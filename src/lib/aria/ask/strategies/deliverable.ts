/**
 * M17 · BRAIN-1 PHASE 3 — THE `deliverable` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:962–1004`. The sprint calls this the "artifact" lane. Falls back to a normal text response on a generation error — RULE 0, never break the conversation.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('deliverable', X)`
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
import { classifyDeliverableKind, generateDeliverable } from '@/lib/aria/deliverables'
import { validateAndHeal } from '@/lib/aria/response-validator'
import { upsertConversation } from '../pipeline/turn-persistence'

export const deliverableStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId } = input
  const { ariaIntent, features } = understanding
  const deliverableKind = classifyDeliverableKind(message)
  if (deliverableKind && !features.isMultiDomain && ariaIntent.intent_type === 'artifact_request' && !features.isSpreadsheetRequest) {
    try {
      const { data: bizInfoD, error: bizErr } = await supabaseAdmin.from('businesses').select('industry').eq('id', bid).maybeSingle()
      // WALL 6 — losing this silently makes every deliverable default to 'retail' styling.
      if (bizErr) console.error('[aria/ask] deliverable industry lookup failed:', bizErr.message)
      const result = await generateDeliverable(bid, conversationId ?? null, message, deliverableKind, (bizInfoD as { industry?: string } | null)?.industry ?? 'retail')
      const responseText = 'Here\'s your ' + result.title + ':\n\n[DELIVERABLE:' + result.outputId + ']'
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'deliverable')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (deliverable):', (e as Error).message)
      }
      // HEAL-1: validate deliverable output — catches spreadsheet-class mismatches not caught by SPREADSHEET_RE gate
      // GROUND-1: toolsUsed=1 — generateDeliverable fetches live DB data, so it counts as a grounded path
      const delivValidated = await validateAndHeal({
        userMessage: message,
        blocks: [],
        rawResponse: result.html ?? '',
        pipelinePath: 'deliverable',
        businessId: bid,
        toolsUsed: 1,
      })
      return makeTurnResult('deliverable', {
        response: responseText,
        conversation_id: savedConvId ?? conversationId,
        intent: 'deliverable',
        action: null,
        cost_usd_cents: 1,
        downloads: null,
        tool_calls: [],
        used_council: false,
        deliverable: { id: result.outputId, kind: result.kind, title: result.title, html: result.html },
        blocks: delivValidated.blocks.length > 0 ? delivValidated.blocks : undefined,
        healed: delivValidated.healed || undefined,
        heal_reason: delivValidated.healReason,
        served_by: 'deliverable', // LOGGING-FIX-1 Part 3: serving-path observability (debug-only)
      })
    } catch (err) {
      console.error('[aria/ask] deliverable generation failed, falling back to text:', (err as Error).message)
      // RULE 0: fall through to normal text response — never break the conversation
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
