/**
 * M17 · BRAIN-1 PHASE 3 — THE `general` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:818–923`. THE M12 LANE. It runs BEFORE any business context exists, which is why its grounding kind is `none` and why `grounded: false` is passed to assembleAriaPrompt — that pairing is what turns "tidy up before the weekend" into a question rather than an answer about bed-making.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('general', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { callModel } from '@/lib/ai/gateway'
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools'
import { assembleAriaPrompt } from '@/lib/aria/prompt/assemble'
import { loadAnswerHistory, upsertConversation } from '../pipeline/turn-persistence'

export const generalStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId, clientMessages } = input
  const { intent, ariaIntent, features } = understanding
  const { trackSpend } = await import('@/lib/aria/cost-guard')
  // thread exists, fall through to the business tool-loop, which rehydrates this conversation's history (so the
  // referent resolves) and has the data tools. THIS is the real cause of "what does she buy" losing the referent.

  // GENERAL fast-path — non-business question: skip all business context, answer directly as a capable assistant
  if (!features.isCoreferentialFollowup && (intent.type === 'general' || ariaIntent.intent_type === 'general' || ariaIntent.intent_type === 'smalltalk')) {
    // Defensive: even a genuine general follow-up gets this conversation's recent turns so references resolve.
    const generalPrior = await loadAnswerHistory(bid, conversationId, clientMessages)
    /**
     * M12 PHASE 3 — THIS LANE NO LONGER WRITES ITS OWN PROMPT.
     *
     * It used to carry 639 characters of general-assistant instructions with the business
     * explicitly excluded ("Do NOT force a business angle or mention the owner's business") and
     * nothing else — no constitution, no grounding, no data tools. On 4 September a classifier read
     * "Tidy up before the weekend" as housekeeping, this lane took the turn, and Aria told a café
     * owner to make his bed.
     *
     * THE BESPOKE PROMPT IS DELETED. The lane is not: deleting it would send every genuinely
     * general question through the 18,171-character grounded prompt, roughly ten times the tokens,
     * to fix a fault that was in the prompt rather than in the lane. What is deleted is the thing
     * that was actually wrong.
     *
     * It now assembles through the ONE rail, so it carries the constitution — including ABSTAIN
     * OVER GUESS — and, because this lane attaches no business data at all, `grounded: false`. That
     * pairing is what turns the failing turn into "I can't see your business right now — do you
     * mean the till, the stock, or the roster?"
     *
     * The general-question instruction is not lost: the constitution already contains its own
     * GENERAL QUESTION RULE ("If a question is NOT about the business, answer it directly and
     * competently as a helpful general assistant — do NOT force a business angle"). The lane was
     * duplicating that one line and discarding everything around it.
     */
    // M12 PHASE 5 — SAY WHICH LANE TOOK THE TURN, AND WHY.
    //
    // The main lane logs `[ask-aria] route {...}` at :2283 — but it returns at :866, so a turn that
    // took this fast-path left NO record of the decision at all. Reconstructing why the founder's
    // turn went to haiku meant re-running both classifiers by hand. It now says so, including which
    // classifier triggered it, because the condition is an OR and the two disagree in practice:
    // on the failing message classifyIntent said 'smalltalk' while classifyAriaIntent said
    // 'general', and only the second one is in this condition.
    console.log('[ask-aria] route', {
      bid,
      lane: 'general-fast-path',
      model: 'haiku',
      grounded: false,
      intent: intent.type,
      aria_intent: ariaIntent.intent_type,
      triggered_by: intent.type === 'general' ? 'classifyIntent'
        : ariaIntent.intent_type === 'general' ? 'classifyAriaIntent:general'
        : 'classifyAriaIntent:smalltalk',
      routing_reason: ariaIntent.routing_reason,
    })

    const generalSystemPrompt = assembleAriaPrompt({
      variant: 'lean',
      // NOT the business name: this lane runs BEFORE the business context is built (`ctx` does not
      // exist yet at this point in the route), which is precisely why it had no grounding to lose.
      // Passing a name we have not loaded would be inventing one — IRON RULE 2.
      businessName: null,
      grounded: false,
    })

    const generalTools = ARIA_POS_TOOLS.filter((t: { name: string }) => ['web_search', 'fetch_url'].includes((t as { name: string }).name))
    // M13 PHASE 5 — through the gateway. Same model, same prompt, same tools: callModel passes
    // the model through unchanged and delegates to the same provider entry point this called
    // directly a moment ago. What changes is that businessId is now REQUIRED at the boundary,
    // so this call cannot become one of the unlogged ones.
    const generalResult = await callModel({
      model: 'haiku',
      systemPrompt: generalSystemPrompt,
      userPrompt: message,
      priorMessages: generalPrior,
      tools: generalTools,
      executeTool: (name, input) => executePOSTool(name, input, bid),
      maxTokens: 2000,
      maxIterations: 3,
      timeoutMs: 30_000,
      businessId: bid,
      agentKey: 'ask_aria',
      role: 'chat',
      requestSummary: message.slice(0, 100),
    })

    let generalConvId = conversationId
    try {
      generalConvId = await upsertConversation(bid, userId, conversationId, message, generalResult.raw, 'general')
    } catch (e) {
      console.error('[aria/ask] upsertConversation failed (general):', (e as Error).message)
    }
    trackSpend(bid, generalResult.cost_cents, 'chat').catch(() => {})

    return makeTurnResult('general', {
      response: generalResult.raw,
      conversation_id: generalConvId ?? conversationId,
      intent: 'general',
      action: null,
      cost_usd_cents: generalResult.cost_cents,
      downloads: null,
      tool_calls: generalResult.tool_calls.map((t: { name: string; ms: number }) => ({ name: t.name, ms: t.ms })),
      blocks: undefined,
      used_council: false,
      ai_mode: 'haiku',
      model_used: 'haiku',
    })
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
