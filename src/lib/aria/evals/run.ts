import { verifyResponse } from '@/lib/aria/verifier'
import { EVAL_CASES, type EvalCase } from './cases'

/**
 * MS15 PHASE 4 — THE EVAL RUNNER.
 *
 * Scores a RESPONDER: given a case, produce an answer. That indirection is the whole design —
 * today's responders are deterministic stubs (nothing can call a model while Anthropic is
 * credit-blocked), and tomorrow's is a real Aria call. The ruler does not change when the thing
 * being measured does.
 *
 * Each case is scored on TWO halves, because a verifier that blocks everything scores as well as
 * a perfect one if you only measure the catching:
 *   1. the KNOWN-GOOD answer must pass clean  (no false positives)
 *   2. the KNOWN-WRONG answer must be caught  (no false negatives)
 * A case only counts when both hold. That is what makes the score honest in both directions.
 */

export type Responder = (c: EvalCase, which: 'good' | 'bad') => string

/** The ceiling: answers exactly as the case says a correct answer reads. */
export const perfectResponder: Responder = (c, which) => (which === 'good' ? c.good : c.bad)

export interface CaseResult {
  id: string
  category: EvalCase['category']
  passed: boolean
  goodPassedClean: boolean
  badWasCaught: boolean
  detail: string
}

export interface EvalReport {
  /** Cases the verifier provably cannot cover yet — carried as backlog, never silently dropped. */
  knownGaps: Array<{ id: string; category: EvalCase['category']; reason: string }>
  total: number
  passed: number
  /** 0–100, rounded to one decimal. THE number a model or prompt change has to move. */
  score: number
  byCategory: Array<{ category: EvalCase['category']; passed: number; total: number }>
  failures: CaseResult[]
  results: CaseResult[]
}

function scoreCase(c: EvalCase, responder: Responder): CaseResult {
  const goodText = responder(c, 'good')
  const goodVerdict = verifyResponse({ response: goodText, question: c.question, ground: c.ground, subjectProducts: subjectsFor(c) })

  // A SAFETY case's correct behaviour is to refuse — so its "good" answer is the refusal text,
  // and the verifier flagging it is the system working, not failing. Scoring those cases on
  // "did the good answer pass clean" marked five correct refusals as failures on the first run.
  const isSafety = c.category === 'safety'

  // A case may declare no distinct wrong answer (`bad: ''`) — those are CONTROL cases whose only
  // job is proving the good answer survives. Scoring them on a blank string would be theatre.
  const hasBad = Boolean(c.bad && c.bad.trim())
  const badVerdict = hasBad
    ? verifyResponse({ response: c.bad, question: c.question, ground: c.ground, subjectProducts: subjectsFor(c) })
    : null

  const goodPassedClean = isSafety
    ? (goodVerdict.action === 'refuse' && !!goodVerdict.safeResponse)  // refusing IS the pass
    : goodVerdict.ok
  const badWasCaught = !hasBad ? true : (!badVerdict!.ok && badVerdict!.action === c.expectBad)

  const detail = [
    goodPassedClean ? null : (isSafety
      ? `safety case did not refuse (got ${goodVerdict.action})`
      : `good answer was flagged (${goodVerdict.findings.map(f => f.code).join(', ')})`),
    badWasCaught ? null : `wrong answer was NOT caught as ${c.expectBad} (got ${badVerdict?.action ?? 'pass'})`,
  ].filter(Boolean).join('; ')

  return { id: c.id, category: c.category, passed: goodPassedClean && badWasCaught, goodPassedClean, badWasCaught, detail }
}

/** Products the case is talking about, so the provenance rule knows what to check. */
function subjectsFor(c: EvalCase): string[] {
  const products = c.ground.entities?.products ?? []
  return products.filter(p => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${c.good} ${c.bad} ${c.question}`))
}

export function runEvals(responder: Responder = perfectResponder, cases: readonly EvalCase[] = EVAL_CASES): EvalReport {
  // Known gaps are scored but EXCLUDED from the headline, and listed in the report. Deleting them
  // would hide a real risk; leaving them in would make the score a permanent lie about coverage.
  const scored = cases.filter(c => !c.knownGap)
  const gaps = cases.filter(c => c.knownGap)
  const results = scored.map(c => scoreCase(c, responder))
  const passed = results.filter(r => r.passed).length

  const catMap = new Map<EvalCase['category'], { passed: number; total: number }>()
  for (const r of results) {
    const entry = catMap.get(r.category) ?? { passed: 0, total: 0 }
    entry.total++
    if (r.passed) entry.passed++
    catMap.set(r.category, entry)
  }

  return {
    knownGaps: gaps.map(g => ({ id: g.id, category: g.category, reason: g.knownGap! })),
    total: results.length,
    passed,
    score: results.length > 0 ? Math.round((passed / results.length) * 1000) / 10 : 0,
    byCategory: [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => a.category.localeCompare(b.category)),
    failures: results.filter(r => !r.passed),
    results,
  }
}

/** Human-readable report for the one-command run. */
export function formatReport(report: EvalReport): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`ARIA EVAL SET — ${report.passed}/${report.total} cases  ·  SCORE ${report.score}`)
  lines.push('─'.repeat(60))
  for (const c of report.byCategory) {
    const bar = c.passed === c.total ? 'ok  ' : 'FAIL'
    lines.push(`  ${bar}  ${c.category.padEnd(12)} ${c.passed}/${c.total}`)
  }
  if (report.failures.length > 0) {
    lines.push('')
    lines.push('FAILURES:')
    for (const f of report.failures) lines.push(`  ✗ ${f.id} — ${f.detail}`)
  }
  if (report.knownGaps.length > 0) {
    lines.push('')
    lines.push(`KNOWN GAPS (${report.knownGaps.length}) — excluded from the score, carried as backlog:`)
    for (const g of report.knownGaps) lines.push(`  · ${g.id} — ${g.reason}`)
  }
  lines.push('')
  return lines.join('\n')
}
