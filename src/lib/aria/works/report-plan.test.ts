import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPlanReport, stepState, planReportAnchors, type ReportableStep } from './report'
import { segmentFigures, buildProvenance } from '@/lib/aria/figure-provenance'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FINISH = read('src/lib/aria/works/finish.ts')

const step = (o: Partial<ReportableStep> & { step_index: number }): ReportableStep => ({
  title: 'step ' + o.step_index, status: 'pending', requires_stepup: false,
  outcome_note: null, outcome_data: null, resolved_at: null, ...o,
})

/**
 * M11B PHASE 4 — THE REPORT.
 *
 * ⚠️ THE FIXTURES BELOW ARE THE REAL RUN. This is the plan M11B phase 3 actually executed against
 * production (`c1a424d1`), with its four steps in the states they really ended in — a read that
 * ran, a money step left waiting, a step that failed for want of arguments, and a step nothing
 * could do. The report they produce is pasted in RUN-M11B.md, read back off `aria_plans.report`.
 */
const REAL_RUN: ReportableStep[] = [
  step({ step_index: 1, title: "M11B-RUN2 Read yesterday's takings", status: 'executed', resolved_at: '2026-09-03T15:12:00Z',
    outcome_note: 'Read takings for 2026-09-02: A$0.00 across 0 sales.',
    outcome_data: { source: 'pos_sales', date: '2026-09-02', revenue: 0, transaction_count: 0 } }),
  step({ step_index: 2, title: 'M11B-RUN2 Discount the pastries', requires_stepup: true }),
  step({ step_index: 3, title: 'M11B-RUN2 Fix a count with no product named', resolved_at: '2026-09-03T15:12:01Z',
    outcome_note: 'Could not run this step — it was not told product_id or product_name, adjust_type, quantity. Nothing was changed.',
    outcome_data: { missing: ['product_id or product_name', 'adjust_type', 'quantity'] } }),
  step({ step_index: 4, title: 'M11B-RUN2 Ring the baker' }),
]

describe('M11B phase 4 · the state of a step is read from the row alone', () => {
  it('the four states, from the real run', () => {
    expect(REAL_RUN.map(stepState)).toEqual(['done', 'waiting_for_you', 'failed', 'not_run'])
  })

  it('A FAILED STEP IS NOT "WAITING" — attempted-and-broken is decided first', () => {
    // A failed step keeps status 'pending' (the CHECK has no 'failed' — see run.ts). If "still
    // pending" were read before "was attempted", a step that BROKE would be reported as merely
    // awaiting the owner, which is the quietest possible way to lose a failure.
    const broke = step({ step_index: 9, status: 'pending', requires_stepup: true, resolved_at: 'x', outcome_note: 'it broke' })
    expect(stepState(broke)).toBe('failed')
  })

  it('a resolved step with no note is not silently a failure', () => {
    expect(stepState(step({ step_index: 1, resolved_at: 'x', outcome_note: null }))).toBe('not_run')
  })
})

describe('M11B phase 4 · failures are the FIRST line, and reported is not succeeded', () => {
  const out = renderPlanReport('tidy up before the weekend', REAL_RUN)

  it('the very first line is the failure count', () => {
    expect(out.split('\n')[0]).toBe('⚠️ 1 of 4 steps did not go through.')
  })

  it('the failing step is printed before the successful one', () => {
    expect(out.indexOf('DID NOT GO THROUGH')).toBeLessThan(out.indexOf('DONE'))
  })

  it('the owner’s own words are quoted back, so the report can be judged against the ask', () => {
    expect(out).toContain('You asked: tidy up before the weekend')
  })

  it('every state is named, and the closing line NEVER just says done', () => {
    expect(out).toContain('1 done · 1 did not go through · 1 waiting for you · 1 not attempted')
    // "we did not try this", "this broke" and "this needs you" are three different sentences.
    expect(out).toContain('WAITING FOR YOU')
    expect(out).toContain('NOT RUN')
  })

  it('a plan where EVERYTHING failed still reports, and says so', () => {
    const allBad = [1, 2].map(i => step({ step_index: i, resolved_at: 'x', outcome_note: 'it broke' }))
    const r = renderPlanReport('do the thing', allBad)
    expect(r.split('\n')[0]).toBe('⚠️ 2 of 2 steps did not go through.')
    expect(r).toContain('0 done')
    expect(r).not.toMatch(/succeed|success/i)
  })

  it('a plan with NO steps says nothing was done — never "complete"', () => {
    // The council's bug: 91 of 92 sessions marked complete having produced nothing.
    const r = renderPlanReport('do the thing', [])
    expect(r).toContain('no steps, so nothing was done')
    expect(r).not.toContain('done ·')
  })

  it('a clean run has no warning line at all — the flag means something', () => {
    const good = [step({ step_index: 1, status: 'executed', outcome_note: 'Done — 1 change.' })]
    const r = renderPlanReport('x', good)
    expect(r).not.toContain('did not go through')
    expect(r.split('\n')[0]).toContain('You asked:')
  })

  it('MUTATION — dropping the failed step from the report makes this suite RED', () => {
    // The sprint's named mutation for this phase.
    const honest = renderPlanReport('tidy up', REAL_RUN)
    const mutated = renderPlanReport('tidy up', REAL_RUN.filter(s => stepState(s) !== 'failed'))
    expect(honest).toContain('did not go through')
    expect(mutated).not.toContain('did not go through')    // ← what the drop costs
    expect(mutated).not.toContain('DID NOT GO THROUGH')
    expect(honest).not.toBe(mutated)
  })
})

describe('M11B phase 4 · figures carry their tier, from what the step recorded', () => {
  it('a figure a read step recorded is anchored to what it read', () => {
    const anchors = planReportAnchors(REAL_RUN)
    expect(anchors).toContainEqual({ value: 0, label: 'pos_sales' })
    const p = buildProvenance(anchors)
    const segs = segmentFigures('Read takings for 2026-09-02: A$0.00 across 0 sales.', p)
    expect(segs.some(s => s.kind === 'figure' && s.tier === 'verified')).toBe(true)
  })

  it('a figure with NO recorded source stays plain — never quietly verified', () => {
    const noSource = [step({ step_index: 1, status: 'executed', outcome_note: 'We took A$980.00.', outcome_data: { revenue: 980 } })]
    expect(planReportAnchors(noSource)).toEqual([])
    const segs = segmentFigures('We took A$980.00.', buildProvenance(planReportAnchors(noSource)))
    expect(segs.some(s => s.kind === 'figure' && s.tier === 'verified')).toBe(false)
  })

  it('no second notion of verified was invented for plans', () => {
    const src = read('src/lib/aria/works/report.ts')
    expect(src).not.toMatch(/tier\s*[:=]\s*'verified'/)
  })
})

describe('M11B phase 4 · closing the plan', () => {
  const c = code(FINISH)

  it('ANTI-VACUITY — the module was read', () => {
    expect(FINISH.length).toBeGreaterThan(2000)
    expect(c).toContain('export async function finishPlan')
  })

  it('the report is GENERATED FROM THE ROWS, not from anything the runner remembered', () => {
    // The guard against the council's bug: a plan that did nothing produces a report that says so.
    expect(c).toContain('const loaded = await loadPlan(')
    expect(c).toContain('renderPlanReport(loaded.plan.request, steps)')
    expect(c.indexOf('loadPlan(')).toBeLessThan(c.indexOf('renderPlanReport('))
  })

  it('the close is atomic on status=running — two callers cannot both report', () => {
    expect(c).toMatch(/\.eq\('status', 'running'\)/)
    expect(c).toContain("status: 'reported'")
    expect(c).toContain('completed_at')
    expect(c).toContain('was not running, so there was nothing to report')
  })

  it('the spine gets the TRUTH — job_failed when a step failed', () => {
    expect(c).toMatch(/event_type: hadFailures \? 'job_failed' : 'job_completed'/)
    expect(c).toContain("entity_type: 'job'")
  })

  it('there is no success path and no failure path — one path, which writes what happened', () => {
    expect(c).not.toMatch(/if \(hadFailures\) return/)
    expect(c).toContain('had_failures: hadFailures')
  })

  it('the error is read', () => {
    expect(c).toMatch(/const \{ data, error \} = await supabaseAdmin/)
    expect(c).toContain("console.error('[works/finish] update failed:'")
  })

  it('the run route reports BOTH facts when the report cannot be written', () => {
    const route = code(read('src/app/api/aria/works/plan/[id]/run/route.ts'))
    expect(route).toContain('report_error')
    expect(route).toContain('ran: true')
  })
})
