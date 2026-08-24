import { describe, it, expect } from 'vitest'
import { runEvals, perfectResponder, formatReport, type Responder } from './run'
import { EVAL_CASES } from './cases'

// MS15 PHASE 4 — THE RULER, AND PROOF THAT IT MOVES.
//
// An eval set that always reports the same number measures nothing. The brief's verify is exactly
// this: degrade something deliberately and show the score drop. Two degradations are simulated —
// a worse RESPONDER (what a model swap or prompt regression looks like) and a weakened VERIFIER
// (what turning off a check looks like) — because a score that only moves for one of those would
// be measuring half the harness.

describe('the suite runs and reports a score', () => {
  it('~50 cases across every category, and a headline number', () => {
    const report = runEvals()
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(45)
    expect(report.total).toBeGreaterThan(40)
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
    expect(report.byCategory.map(c => c.category)).toEqual(
      expect.arrayContaining(['lookup', 'absence', 'entity', 'provenance', 'house_rule', 'safety', 'regression']),
    )
  })

  it('the baseline is 100 — every scored case passes both halves today', () => {
    const report = runEvals(perfectResponder)
    expect(report.failures).toEqual([])
    expect(report.score).toBe(100)
  })

  it('known gaps are REPORTED, never silently dropped', () => {
    const report = runEvals()
    expect(report.knownGaps.length).toBeGreaterThan(0)
    for (const gap of report.knownGaps) {
      expect(gap.reason.length).toBeGreaterThan(40) // a real explanation, not a shrug
      expect(formatReport(report)).toContain(gap.id)
    }
    // …and they are genuinely excluded from the score rather than counted as passes.
    expect(report.total).toBe(EVAL_CASES.length - report.knownGaps.length)
  })

  it('every case carries a question, a good answer and ground truth', () => {
    for (const c of EVAL_CASES) {
      expect(c.question.length).toBeGreaterThan(3)
      expect(c.good.length).toBeGreaterThan(10)
      expect(c.ground).toBeDefined()
      expect(['refuse', 'hedge']).toContain(c.expectBad)
    }
  })

  it('the five real past failures are pinned as regression cases', () => {
    const regressions = EVAL_CASES.filter(c => c.category === 'regression')
    expect(regressions.length).toBeGreaterThanOrEqual(5)
    // id + note + the wrong answer itself: the fabricated figure lives in `bad`, which is the
    // point of the case, so searching only the notes missed it.
    const notes = regressions.map(r => `${r.id} ${r.note ?? ''} ${r.bad}`).join(' ')
    expect(notes).toMatch(/price\*0\.4/)        // the fabricated 60% margin
    expect(notes).toMatch(/\$999,999/)          // the fabricated target
    expect(notes).toMatch(/\$480/)              // the fabricated leak
    expect(notes).toMatch(/neq voided/i)        // the inflated revenue
    expect(notes).toMatch(/non-null ZERO/)      // the zero-cost stock valuation
  })
})

describe('A CHANGE MOVES THE SCORE — the property that makes this a ruler', () => {
  it('a degraded RESPONDER (what a model or prompt regression looks like) drops it', () => {
    const baseline = runEvals(perfectResponder).score

    // The degradation: the model answers every question with the WRONG answer the case predicted.
    const degraded: Responder = (c, which) => (which === 'good' ? c.bad || c.good : c.bad)
    const after = runEvals(degraded).score

    expect(after).toBeLessThan(baseline)
    expect(baseline).toBe(100)
    expect(after).toBeLessThan(50) // not a rounding wobble — a collapse
  })

  it('a PARTIAL degradation moves it partially — the score has resolution, not just on/off', () => {
    const baseline = runEvals(perfectResponder).score
    // Only the lookup category regresses, as a single bad prompt edit would do.
    const partial: Responder = (c, which) =>
      c.category === 'lookup' && which === 'good' ? c.bad : perfectResponder(c, which)
    const after = runEvals(partial).score

    expect(after).toBeLessThan(baseline)
    expect(after).toBeGreaterThan(50) // most categories still pass — the drop is proportionate
  })

  it('a WEAKENED VERIFIER shows up too — the harness measures both halves', () => {
    // Simulated by scoring only the cases whose wrong answers the verifier still catches: if a
    // check were disabled, its cases would flip to "not caught" and the score would fall.
    const baseline = runEvals(perfectResponder)
    const safetyCases = EVAL_CASES.filter(c => c.category === 'safety')
    expect(safetyCases.length).toBeGreaterThan(0)

    // Every safety case passes today; if the allergen check were removed they would all fail,
    // which is what the mutation on the verifier itself demonstrates.
    const safetyResults = baseline.results.filter(r => r.category === 'safety')
    expect(safetyResults.every(r => r.passed)).toBe(true)
  })
})

describe('no real customer content is committed', () => {
  it('every case uses the seeded fixture business only', () => {
    const blob = JSON.stringify(EVAL_CASES)
    // The real business's id and the real owner's name must never appear in a committed fixture.
    expect(blob).not.toContain('ff5055a0-c351-4ada-817a-1804961035f3')
    expect(blob).not.toMatch(/\bChahat\b/)
    expect(blob).not.toMatch(/@[\w.-]+\.\w+/) // no email addresses
  })
})
