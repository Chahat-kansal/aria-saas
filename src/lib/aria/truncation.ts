/**
 * S8 PHASE 1 — A MODEL CALL THAT HITS ITS CEILING MUST SAY SO.
 *
 * ── WHAT WAS MEASURED ───────────────────────────────────────────────────────────────────────────
 * One council turn, 30 Aug 2026 01:53 Melbourne: four advisor calls, each producing **exactly
 * 1,200 output tokens**, two of them marked failed. Exactly-the-ceiling four times over is not a
 * coincidence, it is `max_tokens: 1200` (council.ts) being smaller than the JSON the advisors are
 * asked to write. S4 found the same class at `maxTokens: 300` in suggestions.
 *
 * ── THE PART THAT IS NOT OBVIOUS, AND IT CHANGES THE FIX ────────────────────────────────────────
 * Hitting the ceiling does NOT always destroy the structure. `safeParseJSON` slices from the first
 * `{` to the LAST `}`, so an advisor that finished its JSON object and then rambled until the cap
 * still parses perfectly. That is the likeliest reason two of those four survived and two did not.
 *
 * So "stop_reason === 'max_tokens'" must NOT be treated as an automatic failure — doing that would
 * throw away two advisors that were working, which is a downgrade. What matters is the pair:
 *
 *   hit the ceiling AND the structure did not parse  -> TRUNCATED MID-STRUCTURE. A real failure,
 *                                                       and now one with a named cause instead of
 *                                                       an anonymous "unparseable".
 *   hit the ceiling AND the structure parsed anyway  -> AT THE CEILING. Not a failure. But the
 *                                                       budget is provably too tight and the next
 *                                                       call may not land as luckily, so it is
 *                                                       recorded rather than shrugged off.
 *   did not hit the ceiling AND did not parse        -> UNPARSEABLE for some other reason. Do not
 *                                                       blame the budget for it.
 *
 * ── WHY THIS IS ONE MODULE AND NOT AN `if` AT EACH CALL SITE ────────────────────────────────────
 * `stop_reason` is read in exactly two places in this entire codebase today
 * (providers/anthropic.ts:362, intelligence/agent.ts:73) and **neither one checks for
 * 'max_tokens'**. Every model call in the product is currently unable to notice its own truncation.
 * Six call sites deciding separately what "truncated" means is this repo's most-repeated failure
 * (N copies drift), so it is decided once, here.
 *
 * This module reads a response. It never widens a parser, and nothing here accepts broken output —
 * the decision table forbids that, and S4 already established that the fix is the budget.
 */

/** The shape we need off an Anthropic response, without depending on the SDK's types. */
interface ModelResponseLike {
  stop_reason?: string | null
  usage?: { output_tokens?: number; input_tokens?: number } | null
}

export type ModelOutcome =
  /** Structure parsed and the call ended on its own terms. */
  | 'ok'
  /** Structure parsed, but the call was cut at its ceiling. The budget is too tight. */
  | 'ok_at_ceiling'
  /** Cut at the ceiling and the structure did not survive it. This is the reported bug. */
  | 'truncated_mid_structure'
  /** Did not parse, and the ceiling is not to blame. */
  | 'unparseable'

export interface TruncationCheck {
  /** True when the model stopped because it ran out of budget, not because it was finished. */
  hitCeiling: boolean
  /** Verbatim, for the log — 'end_turn' | 'max_tokens' | 'tool_use' | … | null. */
  stopReason: string | null
  outputTokens: number | null
}

/** Reads a model response's own account of why it stopped. No inference from content length. */
export function inspectTruncation(res: unknown): TruncationCheck {
  const r = (res ?? {}) as ModelResponseLike
  const stopReason = typeof r.stop_reason === 'string' ? r.stop_reason : null
  const out = r.usage?.output_tokens
  return {
    hitCeiling: stopReason === 'max_tokens',
    stopReason,
    outputTokens: typeof out === 'number' ? out : null,
  }
}

/**
 * The same question, asked of Gemini.
 *
 * S8 PHASE 5 (open-bugs #4) — the Gemini context brain sets `maxOutputTokens: 1500`, parses the
 * reply as JSON, and never read why the model stopped. Same class as the Anthropic advisors, in
 * the one provider phase 1 could not reach: there is no `stop_reason` here, the field is
 * `candidates[0].finishReason` and the value is 'MAX_TOKENS'.
 *
 * It lives in THIS file rather than in context-brain.ts on purpose. A second definition of
 * "truncated" is how N-copies drift starts, and that file already carries a second private
 * `safeParseJSON` — one duplicate in a file is enough.
 */
export function inspectGeminiTruncation(data: unknown): TruncationCheck {
  const d = (data ?? {}) as { candidates?: Array<{ finishReason?: unknown }>; usageMetadata?: { candidatesTokenCount?: unknown } }
  const reason = d.candidates?.[0]?.finishReason
  const stopReason = typeof reason === 'string' ? reason : null
  const out = d.usageMetadata?.candidatesTokenCount
  return {
    hitCeiling: stopReason === 'MAX_TOKENS',
    stopReason,
    outputTokens: typeof out === 'number' ? out : null,
  }
}

/**
 * The pair that matters: did it run out of room, and did the structure survive.
 *
 * `parsed` is whether the caller's OWN parser succeeded — this module never parses anything itself,
 * so it cannot disagree with the call site about what counts as valid.
 */
export function classifyOutcome(check: TruncationCheck, parsed: boolean): ModelOutcome {
  if (check.hitCeiling) return parsed ? 'ok_at_ceiling' : 'truncated_mid_structure'
  return parsed ? 'ok' : 'unparseable'
}

/** True for the outcomes that mean the token budget is the problem, whether or not it failed yet. */
export function isBudgetProblem(outcome: ModelOutcome): boolean {
  return outcome === 'ok_at_ceiling' || outcome === 'truncated_mid_structure'
}

/**
 * A short, greppable signal for `aria_ai_calls.learning_signal`, so this is queryable in the
 * database rather than needing Vercel log access — the same reason council's own log-failure
 * fallback writes its rejection reason into a row.
 */
export function truncationSignal(label: string, check: TruncationCheck, outcome: ModelOutcome): string {
  return ('token_ceiling:' + label + ':' + outcome + ':out=' + (check.outputTokens ?? '?')).slice(0, 120)
}

/**
 * One plain sentence for a human — an owner-facing surface or a report. Never a number the owner
 * cannot act on, and never a claim that the answer is wrong: a lost advisor makes an answer
 * narrower, not false.
 */
export function truncationNote(label: string, outcome: ModelOutcome): string | null {
  if (outcome === 'truncated_mid_structure') return label + ' ran out of room before it finished.'
  return null
}
