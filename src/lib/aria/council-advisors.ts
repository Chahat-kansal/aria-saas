import type { ModelOutcome } from './truncation'

/**
 * S8 PHASE 2 — AN ADVISOR THAT WAS LOST MUST READ AS LOST, NOT AS "FOUND NOTHING".
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
 * The synthesis input rendered all four advisors unconditionally. A failed one arrived as:
 *
 *     RISK BRAIN (confidence: low):
 *     Observations:
 *     Recommendations:
 *
 * Two blank fields under a confident heading. That does not say "the risk advisor was lost" — it
 * says "the risk advisor looked and found nothing", and the model has no way to tell which. It is
 * the empty-chrome class S6 and S7 fixed in the two renderers, one layer up: a header promising
 * content that was never there. The difference is that here the reader is a language model, so the
 * consequence is not an ugly panel — it is an answer that quietly speaks for a dimension nobody
 * examined.
 *
 * On the reported turn TWO of four arrived like this and synthesis answered an 11,485-token prompt
 * with 556 tokens of "Where did you see this message?".
 *
 * ── WHY THIS IS A MODULE ────────────────────────────────────────────────────────────────────────
 * It began as a closure inside runCouncil, where nothing could test it. A guard whose behaviour
 * can only be asserted by grepping the file it lives in is the kind of guard this codebase has
 * repeatedly found to be decorative. These are pure functions and the tests exercise them.
 */

export interface AdvisorLike {
  role: string
  observations: string[]
  recommendations: string[]
  confidence: string
  succeeded: boolean
  outcome?: ModelOutcome
}

/** Why an advisor is not here, in words a synthesis prompt can act on. */
const ABSENCE: Record<string, string> = {
  truncated_mid_structure: 'ran out of room before it finished writing',
  unparseable: 'did not return a usable answer',
  ok_at_ceiling: 'finished at the edge of its budget',
  unknown: 'did not report back',
}

/**
 * One advisor's section of the synthesis input.
 *
 * A lost advisor NEVER renders `Observations:` with nothing after it. It renders an absence, and
 * names the reason, so the next person reading a prompt dump does not have to guess which of four
 * things happened.
 */
export function renderAdvisorSection(label: string, b: AdvisorLike, extra?: string): string {
  if (!b.succeeded) {
    return label + ' BRAIN: NOT AVAILABLE for this question — it '
      + (ABSENCE[b.outcome ?? 'unknown'] ?? ABSENCE.unknown) + '.\n'
  }
  return label + ' BRAIN (confidence: ' + b.confidence + '):\n'
    + 'Observations: ' + b.observations.join(' | ') + '\n'
    + 'Recommendations: ' + b.recommendations.join(' | ') + '\n'
    + (extra ? extra + '\n' : '')
}

/** The advisors that did not report back, by role and reason. Empty array = a complete council. */
export function lostAdvisors(brains: AdvisorLike[]): Array<{ role: string; reason: ModelOutcome | 'unknown' }> {
  return brains.filter(b => !b.succeeded).map(b => ({ role: b.role, reason: b.outcome ?? 'unknown' as const }))
}

/**
 * The instruction that goes with a short council.
 *
 * RULE 19 — extract the missing fact, do not forbid the symptom. The model was not misbehaving
 * when it treated a blank RISK section as "no risk"; it was reading the only thing it was given.
 * So it is given the fact instead: a missing advisor examined nothing, and its silence is not a
 * finding. Empty string when the council is complete — never a rule about a problem that is not
 * happening, which would just be noise in every prompt.
 */
export function lostAdvisorRule(lost: Array<{ role: string }>): string {
  if (lost.length === 0) return ''
  return '\nADVISORS MISSING FROM THIS COUNCIL: ' + lost.map(a => a.role).join(', ')
    + '. A brain marked NOT AVAILABLE did not examine anything — its silence is NOT a finding of'
    + ' "no risk" or "nothing notable". Do not fill the gap, and do not claim the council'
    + ' considered a dimension it could not reach. Answer from the advisors you actually have.\n'
}

/**
 * What the owner is told. One plain sentence, or nothing.
 *
 * No percentage and no quality score: the owner cannot act on either, and GROUNDING-TEETH forbids
 * a number that was not measured. It says what happened and stops. It also never says the answer
 * is WRONG — a council of two is narrower, not false, and overstating that would be its own lie.
 */
export function advisorShortfallNote(lostCount: number): string | null {
  if (lostCount <= 0) return null
  const who = lostCount === 1 ? 'One of Aria’s four advisors' : lostCount + ' of Aria’s four advisors'
  return who + ' didn’t report back on this one, so this answer is narrower than usual.'
}
