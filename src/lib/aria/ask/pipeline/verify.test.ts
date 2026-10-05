import { describe, it, expect } from 'vitest'
import { verifyAnswer } from './verify'
import { makeTurnResult, type TurnAnchorSet, type TurnGrounding, type LaneName } from './types'

/**
 * M18 · BRAIN-2 PHASE 2 — THE VERIFIER DOES THE WORK.
 *
 * ⚠️ NOT ONE OF THESE ASSERTS THAT `verified.ran` IS TRUE AND STOPS THERE. `ran: true` is the easiest
 * thing in the world to ship — M17's `ran: false` becomes it with a one-word edit, and the result
 * would be a verifier that runs on every turn and decides nothing. So every test below puts a real
 * answer and a real anchor set in and asserts on the VERDICT and the COUNTS.
 *
 * The two that matter most are the ones that distinguish this from a guard that just says no:
 *   · a failed anchor query must HEDGE, never refuse — otherwise the loader's outage is reported as
 *     the answer's dishonesty, and the figure it blames may be perfectly correct
 *   · the tolerance must be the COUNCIL'S tolerance, to the decimal, because two rails disagreeing
 *     about what "grounded" means is more expensive than either being slightly wrong
 */

const fig = (value: number, label: string) => ({ value, label })

const SET = (over: Partial<TurnAnchorSet> = {}): TurnAnchorSet => ({
  figures: [fig(822.4, 'Completed sales, today.'), fig(3310.75, 'Completed sales, this week to date.')],
  queries: [
    { name: 'revenue_today', ran: true, rows: 37, anchors: [fig(822.4, 'Completed sales, today.')] },
    { name: 'revenue_week_to_date', ran: true, rows: 141, anchors: [fig(3310.75, 'Completed sales, this week to date.')] },
  ],
  emptyReason: null,
  ...over,
})

const GROUNDING = (set: TurnAnchorSet): TurnGrounding => ({ kind: 'council', bizCtx: '', augCtx: '', anchors: [], provenance: null, anchorSet: set })

const answer = (text: string, lane: LaneName = 'council') => makeTurnResult(lane, { response: text })

describe('M18 phase 2 · verifyAnswer', () => {
  it('⚠️ PASSES an answer whose every figure matches an anchor — and says how many it checked', () => {
    const v = verifyAnswer(answer('You took $822.40 today, and $3,310.75 so far this week.'), GROUNDING(SET()))

    expect(v.ran).toBe(true)
    expect(v.ran === true && v.verdict).toBe('ok')
    // Counts, not a boolean: a verifier that checked zero figures and said "ok" is useless.
    expect(v.ran === true && v.checkedFigures).toBe(2)
    expect(v.ran === true && v.unsourcedFigures).toBe(0)
    expect(v.ran === true && v.note).toContain('ground-truth anchors')
  })

  it('⚠️ REFUSES a figure that matches no anchor, and names it', () => {
    const v = verifyAnswer(answer('Tuesdays are costing you about $480 a week in lost trade.'), GROUNDING(SET()))

    expect(v.ran === true && v.verdict).toBe('refused')
    expect(v.ran === true && v.unsourcedFigures).toBeGreaterThan(0)
    // Naming the figure is the difference between a verdict and a shrug.
    expect(v.ran === true && v.note).toContain('$480')
    expect(v.ran === true && v.note).toContain('unverified_number')
  })

  it('⚠️ HEDGES RATHER THAN REFUSES WHEN AN ANCHOR QUERY FAILED — the loader\'s outage is not the answer\'s fault', () => {
    // revenue_today threw, so $822.40 is NOT in the anchor set. The answer is CORRECT and the
    // verifier must not call it invented. Without phase 1's per-query `ran` flag this is impossible
    // to tell apart from a fabrication, and the verifier would confidently blame the wrong party.
    const broken = SET({
      figures: [fig(3310.75, 'Completed sales, this week to date.')],
      queries: [
        { name: 'revenue_today', ran: false, rows: null, anchors: [], note: 'JWT expired' },
        { name: 'revenue_week_to_date', ran: true, rows: 141, anchors: [fig(3310.75, 'Completed sales, this week to date.')] },
      ],
    })

    const v = verifyAnswer(answer('You took $822.40 today.'), GROUNDING(broken))

    expect(v.ran === true && v.verdict).toBe('hedged')
    expect(v.ran === true && v.verdict).not.toBe('refused')
    expect(v.ran === true && v.note).toContain('revenue_today')
    expect(v.ran === true && v.note).toMatch(/anchor may simply be missing/)
  })

  it('⚠️ HEDGES when there were no anchors at all, and repeats the anchor set\'s own reason', () => {
    const empty = SET({ figures: [], queries: [], emptyReason: 'the general lane runs before any business context exists' })

    const v = verifyAnswer(answer('Revenue is up about 12% on last week.'), GROUNDING(empty))

    expect(v.ran === true && v.verdict).toBe('hedged')
    expect(v.ran === true && v.unsourcedFigures).toBeGreaterThan(0)
    // ⚠️ The reason travels. A bare "hedged" would send the next person hunting for why.
    expect(v.ran === true && v.note).toContain('before any business context exists')
    expect(v.ran === true && v.note).toMatch(/unverifiable rather than wrong/)
  })

  it('⚠️ RAN:TRUE WITH ZERO CHECKED on a gate — "nothing to check" is a result, not an absence', () => {
    const gate = makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429)
    const v = verifyAnswer(gate, { kind: 'none', anchorSet: SET({ figures: [], queries: [], emptyReason: 'a gate' }) })

    // ⚠️ THE WHOLE POINT OF THE PHASE: this is the turn M17 stamped `{ran:false}` on, and it is also
    // the turn where `ran:false` was least defensible — the check is trivially satisfiable.
    expect(v.ran).toBe(true)
    expect(v.ran === true && v.verdict).toBe('ok')
    expect(v.ran === true && v.checkedFigures).toBe(0)
    expect(v.ran === true && v.note).toContain('rate_limited_user')
  })

  it('an answer that asserts no figure at all passes, and says that is why', () => {
    const v = verifyAnswer(answer('Your quietest stretch is mid-afternoon; try moving one staff shift later.'), GROUNDING(SET()))
    expect(v.ran === true && v.verdict).toBe('ok')
    expect(v.ran === true && v.checkedFigures).toBe(0)
    expect(v.ran === true && v.unsourcedFigures).toBe(0)
  })

  describe('⚠️ it delegates to aria/verifier.ts, and the delegation is observable', () => {
    /**
     * ⚠️ REWRITTEN. These two tests originally asserted the COUNCIL'S rule — a 2% tolerance and
     * `response-validator.ts`'s owner-citation bypass — because the first version of `verify.ts` was a
     * fifth hand-written anchor checker. The sibling sweep found three existing engines and six copies
     * of the tolerance, so that file was replaced by a thin delegation to `aria/verifier.ts`, the
     * purpose-built verifier that had never run outside the eval harness.
     *
     * They are rewritten to assert what the REAL engine does, because that is now the behaviour. The
     * two differences are kept as explicit assertions rather than smoothed over: a difference nobody
     * wrote down is how six copies of one rule happened.
     */
    it('matches anchors within 0.5%, STRICTER than the 2% the council uses — recorded, not reconciled', () => {
      // 822.40 ± 0.5% = 818.3 .. 826.5
      const inside = verifyAnswer(answer('Takings today were $826.00.'), GROUNDING(SET()))
      const outside = verifyAnswer(answer('Takings today were $834.70.'), GROUNDING(SET()))

      expect(inside.ran === true && inside.verdict).toBe('ok')
      // $834.70 is +1.5% — inside the council's 2% guard, outside this verifier's 0.5%. So a figure
      // the council SHIPPED can be recorded as refused here. That is a real disagreement between two
      // existing rails, and unifying the six tolerance copies spans files outside this sprint's
      // domain. It is harmless today only because this stage records and never edits.
      expect(outside.ran === true && outside.verdict).toBe('refused')
    })

    it('has NO owner-citation bypass, unlike the guard the council uses — stricter here too', () => {
      // `response-validator.ts` never strips a sentence citing the owner, because the owner telling
      // Aria a figure IS grounding. `aria/verifier.ts` has no such rule, so this is `refused`.
      // Asserted rather than wished away: if a later phase APPLIES the verdict, this is the case that
      // would wrongly withhold an answer, and it should be found by a red test rather than an owner.
      const v = verifyAnswer(answer('You mentioned a $5,000 target, so that is what I have used.'), GROUNDING(SET()))
      expect(v.ran === true && v.verdict).toBe('refused')
    })

    it('⚠️ REFUSES AN ALLERGEN QUESTION — the locked rule, reachable from the ask path for the first time', () => {
      // CLAUDE.md: no model output may answer allergen or dietary-safety questions on any surface,
      // gated or disclaimed or not. `verifyResponse` fires on the QUESTION, and nothing on the ask
      // path had ever asked it. Wiring stage 5 is what makes this reachable.
      const v = verifyAnswer(
        answer('The banana bread should be fine for most people.'),
        GROUNDING(SET()),
        'is the banana bread gluten free?',
      )
      expect(v.ran === true && v.verdict).toBe('refused')
      expect(v.ran === true && v.note).toContain('ALLERGEN')
      expect(v.ran === true && v.note).toContain('locked rule')
    })

    it('an allergen refusal is NOT softened by a failed anchor query — the locked rule is absolute', () => {
      // Anti-vacuity for the hedge branches: they must not be able to rescue this one. A hedge here
      // would read as "we could not check whether it is safe", which is the opposite of the rule.
      const broken = SET({ queries: [{ name: 'revenue_today', ran: false, rows: null, anchors: [], note: 'JWT expired' }], figures: [] })
      const v = verifyAnswer(answer('It contains no nuts.'), GROUNDING(broken), 'is the banana bread gluten free?')
      expect(v.ran === true && v.verdict).toBe('refused')
      expect(v.ran === true && v.verdict).not.toBe('hedged')
    })

    /**
     * ⚠️ A GAP IN A LOCKED RULE'S GUARD, FOUND BY THIS TEST AND DELIBERATELY NOT FIXED HERE.
     *
     * `CLAUDE.md`'s ALLERGEN HARD RULE is absolute. `verifier.ts`'s `ALLERGEN_RE` implements it, and it
     * requires a QUALIFYING PHRASE around the allergen noun — `nut-free`, `peanut`, `contains nuts`,
     * `gluten-free`. A bare noun does not match:
     *
     *     "any nuts in the banana bread?"   → NOT caught
     *     "is the banana bread nut-free?"   → caught
     *
     * Those are the same question from an owner's point of view, and the first is closer to the
     * phrasing a worried customer actually uses at the counter.
     *
     * NOT FIXED IN M18: `src/lib/aria/verifier.ts` is outside this sprint's file domain, and widening a
     * safety regex is exactly the change that needs a human to weigh the false-positive cost. It is
     * raised in the run log as a founder request. This test asserts the CURRENT behaviour so the gap
     * lives in the suite rather than only in a document — it will go red the moment the regex is
     * widened, which is the correct signal to delete it.
     */
    it('KNOWN GAP (not fixed here): a bare allergen noun is NOT caught — see the comment above', () => {
      const v = verifyAnswer(answer('It contains no nuts.'), GROUNDING(SET()), 'any nuts in the banana bread?')
      expect(v.ran === true && v.verdict).not.toBe('refused')
      // And the qualified phrasing IS caught — which is what makes this a gap rather than an absence.
      const q = verifyAnswer(answer('It contains no nuts.'), GROUNDING(SET()), 'is the banana bread nut-free?')
      expect(q.ran === true && q.verdict).toBe('refused')
    })
  })

  it('does NOT rewrite the answer — the verdict is recorded, the prose is untouched', () => {
    const original = 'Tuesdays are costing you about $480 a week in lost trade.'
    const result = answer(original)
    const v = verifyAnswer(result, GROUNDING(SET()))

    expect(v.ran === true && v.verdict).toBe('refused')
    // ⚠️ `stripUngroundedNumbers` returns a `healedText` that would have deleted that sentence.
    // Rewriting owner-facing prose is a behaviour change on a customer-facing surface and needs a
    // human present. The body the client receives is byte-identical.
    expect(result.body.response).toBe(original)
    expect(result.text).toBe(original)
  })
})
