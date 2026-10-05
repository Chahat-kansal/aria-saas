/**
 * M18 · BRAIN-2 PHASE 2 — STAGE 5 RUNS THE VERIFIER THIS REPO ALREADY HAS.
 *
 * ⚠️ THE FIRST VERSION OF THIS FILE WAS A FIFTH IMPLEMENTATION, AND THE SWEEP CAUGHT IT. I wrote an
 * anchor-matching check here, then swept for siblings as RULE 16 #2 requires, and found the 2%
 * tolerance rule written out **six times** (`response-validator.ts` twice, `validate-summary.ts`,
 * `ground-guard.ts`, `manager/review.ts`, and a second `matchesAnyAnchor` in `aria/verifier.ts`)
 * across **three separate engines**:
 *
 * | engine | adoption | what it is |
 * |---|---|---|
 * | `ground-guard.ts` · `guardOutput()` | **~25 call sites** | the widely-adopted one; `strip`/`redact`/`flag` modes, logs to `aria_ai_calls` |
 * | `response-validator.ts` · `stripUngroundedNumbers()` | the council + the briefing cron | sentence-level, 2%, owner-citation bypass |
 * | `aria/verifier.ts` · `verifyResponse()` | **the eval harness, and nothing else** | MS15's purpose-built verifier |
 *
 * **The third one is this stage's job description, and it has never run in production.** Its own
 * header: *"PURE ON PURPOSE. Ground truth is passed in; nothing here queries, and nothing here calls
 * a model… IT SITS AFTER GENERATION… on failure it REFUSES or HEDGES."* It returns
 * `action: 'pass' | 'hedge' | 'refuse'` — which is, word for word, the three verdicts the sprint asked
 * for. It has 25+ assertions in `verifier.test.ts`. And the only thing that ever called it is
 * `evals/run.ts`. It is the seventh instance of this repo's #1 pattern: exists, well made, unreached.
 *
 * So this file does not check anything itself. **It gives that verifier the anchors stage 2 loaded and
 * puts it on every turn** — which is both the smallest possible diff and the largest capability gain
 * available here, because wiring it also makes these reachable from Ask Aria for the first time:
 *
 *   · **the ALLERGEN HARD RULE.** `CLAUDE.md` locks it: no model output may answer allergen or
 *     dietary-safety questions on any surface, gated or disclaimed or not. `verifyResponse` fires that
 *     on the QUESTION, and until now nothing on the ask path asked it.
 *   · the unknown-entity rule, the weak-cost-provenance rule, the house-rule-conflict rule.
 *
 * ⚠️ IT RECORDS, IT DOES NOT APPLY. `verifyResponse` returns a `safeResponse` that would replace the
 * owner's answer. **That is deliberately ignored here.** Swapping owner-facing prose is a behaviour
 * change on a customer-facing surface and needs a human present — so Phase 2 wires the DETECTION and
 * parks the substitution. The body the client receives is byte-identical either way.
 *
 * ⚠️ TWO TOLERANCES NOW DISAGREE, AND IT IS BETTER TO RECORD THAT THAN TO PICK ONE QUIETLY.
 * `verifyResponse` matches anchors within **0.5%**; the council's own synthesis guard uses **2%**. So a
 * figure the council shipped can be `refused` here. That is a real disagreement between two existing
 * rails, not a new rule invented in this file, and it only ever produces a recorded verdict — never an
 * edit. Unifying the six copies is rail-first work spanning `src/lib/manager/**` and `src/lib/aria/*`,
 * outside this sprint's file domain; it is raised in the run log as a request.
 *
 * ⚠️ ENTITIES ARE DELIBERATELY EMPTY. `verifyResponse`'s entity rule is guarded by `known.size > 0`, so
 * an empty list disables it rather than flagging every Title-Case phrase. Populating it needs product,
 * supplier and staff names in the anchor set — a Phase 1 widening, not a Phase 2 smuggle.
 */
import { verifyResponse } from '@/lib/aria/verifier'
import type { TurnGrounding, TurnResult, Verification } from './types'

/**
 * STAGE 5. Pure, synchronous, no database, no model.
 *
 * Returns `ran: true` on EVERY result, including the ones with nothing to check — because "ran and
 * found nothing to check" and "did not run" are different facts, and collapsing them is the exact
 * silence this sprint exists to remove. A gate's 429 gets `checkedFigures: 0` and a note saying why,
 * not `{ ran: false }`.
 */
export function verifyAnswer(result: TurnResult, grounding: TurnGrounding, question = ''): Verification {
  const text = (result.text ?? '').trim()
  const anchorSet = grounding.anchorSet
  const anchors = anchorSet.figures.map(f => f.value)
  const failedQueries = anchorSet.queries.filter(q => !q.ran).map(q => q.name)

  // An admission gate, a 429, an action-only body. No owner-facing prose to check — a result, not a
  // gap. The allergen rule is still worth running: it fires on the QUESTION, not the answer, and a
  // refusal must not depend on the turn having produced prose.
  const verdictOf = verifyResponse({
    response: text,
    question,
    ground: { anchors, entities: {} },
  })

  const figures = verdictOf.findings.filter(f => f.code === 'unverified_number')
  const evidence = verdictOf.findings.slice(0, 4).map(f => f.evidence).filter(Boolean).join(', ')

  if (verdictOf.action === 'pass') {
    return {
      ran: true,
      checkedFigures: countFigures(text),
      unsourcedFigures: 0,
      verdict: 'ok',
      note: !text
        ? 'no owner-facing prose in this response (lane ' + result.lane + ') — nothing to check'
        : 'every figure traced to one of ' + anchors.length + ' ground-truth anchors from '
          + anchorSet.queries.filter(q => q.ran).length + ' queries',
    }
  }

  // An allergen question is refused outright and no anchor can rescue it — the locked rule is
  // absolute, so it is checked before anything else can soften the verdict.
  if (verdictOf.findings.some(f => f.code === 'allergen_refusal')) {
    return {
      ran: true,
      checkedFigures: countFigures(text),
      unsourcedFigures: figures.length,
      verdict: 'refused',
      note: 'ALLERGEN/DIETARY SAFETY — generated text must never answer this (locked rule). '
        + 'Asked: ' + evidence.slice(0, 120),
    }
  }

  // ⚠️ A FAILED ANCHOR QUERY MUST NOT BECOME A FALSE ACCUSATION. If `revenue_today` threw, today's
  // revenue is not in the anchor set — so a perfectly correct "$822.40" looks unverified. Hedge,
  // never refuse. This is what Phase 1's per-query `ran` flag is for; without it this stage would
  // confidently blame the answer for the loader's outage.
  if (figures.length > 0 && failedQueries.length > 0) {
    return {
      ran: true,
      checkedFigures: countFigures(text),
      unsourcedFigures: figures.length,
      verdict: 'hedged',
      note: 'cannot verify ' + evidence + ' — these anchor queries failed, so the matching anchor '
        + 'may simply be missing: ' + failedQueries.join(', '),
    }
  }

  // Nothing to check against at all. The figures may be right; we cannot say so. The anchor set
  // carries its own reason, so the note says WHY there was nothing rather than only that there was.
  if (figures.length > 0 && anchors.length === 0) {
    return {
      ran: true,
      checkedFigures: countFigures(text),
      unsourcedFigures: figures.length,
      verdict: 'hedged',
      note: 'no anchors to check against, so ' + evidence + ' is unverifiable rather than wrong — '
        + (anchorSet.emptyReason ?? 'the anchor set was empty and gave no reason'),
    }
  }

  return {
    ran: true,
    checkedFigures: countFigures(text),
    unsourcedFigures: figures.length,
    verdict: verdictOf.action === 'refuse' ? 'refused' : 'hedged',
    note: verdictOf.findings.map(f => f.code).join(',') + ' — ' + evidence.slice(0, 220),
  }
}

/**
 * How many figures the verifier had to judge. Counted with ITS regexes, not a third set, so
 * `checkedFigures` and `unsourcedFigures` are measured on the same ruler.
 */
function countFigures(text: string): number {
  if (!text) return 0
  // Mirrors verifier.ts's NUMBER_RE / COUNT_RE. Kept local and private rather than exported from
  // there, because widening that module's surface is outside this sprint's file domain.
  const money = text.match(/(?:A?\$\s?-?[\d,]+(?:\.\d+)?)|(?:-?[\d,]+(?:\.\d+)?\s?%)/g) ?? []
  const counts = text.match(/\b\d[\d,]*(?:\.\d+)?[\s-]?(?:\w{1,8}\s){0,2}(?:units?|members?|reviews?|customers?|sales|orders?|staff|hours?|stars?|transactions?|covers?|visits?)\b/gi) ?? []
  return money.length + counts.length
}
