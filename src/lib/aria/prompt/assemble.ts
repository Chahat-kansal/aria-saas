import { ARIA_CONSTITUTION } from './constitution'

/**
 * M12 PHASE 3 — THE ONE ASSEMBLY POINT.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────────────────────────
 * Seven lanes can answer in Ask Aria. Before this, four carried a different partial version of the
 * constitution, one carried none, and the one complete copy was a template literal typed inside a
 * route where nothing could import it. The owner met the lane with none, and Aria told him to make
 * his bed.
 *
 * Every Ask Aria system prompt is built here. `ARIA_CONSTITUTION` is not a parameter and there is no
 * flag to leave it out — a caller physically cannot assemble a prompt without it. This is the shape
 * `withBusinessContext` proved: a rail reached 78.5% adoption where importable helpers stalled at
 * 9–15%, because the helper is optional and the rail is not.
 *
 * ── VARIANTS CHANGE WHAT IS ADDED, NEVER WHAT IS GUARANTEED ────────────────────────────────────
 * A variant may add a tool catalogue, business context or a house-rules block. None of them can
 * subtract the constitution. `full` is asserted to reproduce the route's existing 18,171-character
 * prompt byte-for-byte, so this commit moves the text and changes no behaviour.
 */

export type AriaPromptVariant =
  /** The grounded tool-loop lane: constitution + the full tool catalogue and rules. */
  | 'full'
  /** A direct data lookup: constitution + "you must call a tool" instructions, no catalogue. */
  | 'lookup'
  /**
   * A question that looks like it has nothing to do with the business.
   *
   * It still gets the constitution. That is the whole point of this variant existing rather than
   * the lane keeping its own prompt: a misclassification now costs the owner some context, not
   * Aria's identity. `ABSTAIN OVER GUESS` is in force, so with nothing attached the honest answer
   * is "I can't see your business right now" — not five paragraphs about the bathroom.
   */
  | 'lean'

export interface AssembleParams {
  variant: AriaPromptVariant
  /**
   * Everything the lane wants to add AFTER the constitution — its tool catalogue, its business
   * context block, its house rules. Joined in order with a blank line between.
   */
  sections?: Array<string | null | undefined>
  /** The business's name, when known. Never invented — omitted entirely when null. */
  businessName?: string | null
  /**
   * FALSE when the turn has no business data attached. Adds the cannot-see block (phase 4).
   * Defaults to true so an existing caller that does not pass it is unchanged.
   */
  grounded?: boolean
}

/**
 * THE BLOCK THAT MAKES THE FOOTER TRUE.
 *
 * The surface promises "Connected records only — she won't invent missing data" under every answer.
 * When nothing is attached, this is what keeps that true: the answer itself changes, rather than a
 * disclaimer being bolted onto a fluent one.
 *
 * Deliberately specific about what to say instead — "ask which part of the business they mean" —
 * because "say you don't know" alone produces a refusal that helps nobody. For the turn that
 * started this sprint the right reply names the till, the stock and the roster.
 */
export const CANNOT_SEE_BLOCK = `⛔ NO BUSINESS DATA IS ATTACHED TO THIS TURN — ABSOLUTE:

You have been given NO live business records for this request: no takings, no stock, no roster, no
customers, no bookings. You therefore CANNOT answer any question about how this business is doing,
what it sold, who its customers are, or what it should do next.

1. SAY SO FIRST. Open by stating plainly that you cannot see the business's records right now.
2. NEVER answer as though you could see them, and never substitute general advice for the answer —
   generic tips presented in place of an answer are worse than saying nothing, because the owner
   cannot tell them apart from a grounded one.
3. If the request is ambiguous — it could be about the business or about something else — ASK WHICH.
   Name the concrete parts of THIS business it might mean (the till, the stock, the roster, the
   bookings, the suppliers). Do not guess, and do not answer the non-business reading as if it were
   obviously the intended one.
4. If it is genuinely nothing to do with the business, you may answer it directly and briefly — but
   still say that you answered it as a general question, not from their records.`

const LOOKUP_BLOCK = `THIS IS A DIRECT DATA LOOKUP. Call the relevant data tool, read its result, then answer with the
name or number asked for plus at most one short sentence of context. Lead with the answer.`

/**
 * Build an Ask Aria system prompt.
 *
 * The constitution is first and is never optional. Sections follow in the order given.
 */
export function assembleAriaPrompt(params: AssembleParams): string {
  const { variant, sections = [], businessName = null, grounded = true } = params

  const parts: string[] = [ARIA_CONSTITUTION]

  if (variant === 'lookup') parts.push(LOOKUP_BLOCK)

  // Named only when known. An invented or defaulted business name is exactly what IRON RULE 2
  // forbids the model from doing, and the assembler must not do it on the model's behalf.
  if (businessName) parts.push(`THE BUSINESS: ${businessName}.`)

  // Phase 4. Placed AFTER the constitution and BEFORE the lane's own sections, so a lane cannot
  // bury it under its instructions.
  if (!grounded) parts.push(CANNOT_SEE_BLOCK)

  for (const s of sections) {
    if (typeof s === 'string' && s.trim()) parts.push(s)
  }

  return parts.join('\n\n')
}

/**
 * The `full` variant is a pure prefix operation: the route's existing prompt, unchanged.
 *
 * Exported so `assemble.test.ts` can assert byte-identity against the route rather than trusting
 * that the extraction was faithful. If someone edits the constitution or the route's remainder,
 * that test is what notices.
 */
export function assembleFullPrompt(rest: string): string {
  return ARIA_CONSTITUTION + rest
}

export { ARIA_CONSTITUTION }

/**
 * The minimum a turn must know about the business to be answering FROM it.
 *
 * Structural, not a full `AskAriaContext`, so this stays pure and testable and does not drag the
 * context builder into every caller.
 */
export interface GroundingSignals {
  business_name?: string | null
  revenue_today_cents?: number | null
  staff_count?: number | null
  pending_aria_actions?: number | null
}

/**
 * M12 PHASE 4 — CAN ARIA SEE THIS BUSINESS AT ALL?
 *
 * ⚠️ ZERO IS NOT ABSENT, AND THIS IS THE WHOLE DISTINCTION.
 *
 * Sip has taken A$0.00 today. That is a FACT, it came from `pos_sales`, and the honest answer to
 * "how are we doing" is "you've taken nothing yet today" — not "I can't see your business". A
 * predicate that treated zero revenue as no-data would make Aria refuse to answer on every quiet
 * morning, which is worse than the bug this sprint is fixing and would look identical to it.
 *
 * So the test is whether the context was actually LOADED, and the marker for that is the business's
 * own identity: if we do not even know its name, nothing else in the object can be trusted to mean
 * what it says. `revenue_today_cents: 0` on a named business is grounded. The same field on a
 * context with no name is an empty shell.
 */
export function isGrounded(ctx: GroundingSignals | null | undefined): boolean {
  if (!ctx) return false
  return typeof ctx.business_name === 'string' && ctx.business_name.trim().length > 0
}

/**
 * The block to splice into a lane's own prompt when it cannot see, or '' when it can.
 *
 * Returned with its trailing separator so a caller can interpolate it directly into a template
 * literal without deciding about whitespace — the decision that gets fumbled when a block is
 * "optional".
 */
export function groundingNotice(ctx: GroundingSignals | null | undefined): string {
  return isGrounded(ctx) ? '' : CANNOT_SEE_BLOCK + '\n\n'
}
