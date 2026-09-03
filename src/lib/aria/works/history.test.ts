import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rehydratePlan, markFor, type StoredPlanRow, type StoredStepRow } from './plan-shape'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const CARD = read('src/components/ask-aria-ax/PlanCard.tsx')
const ROUTE = read('src/app/api/aria/works/plans/route.ts')

/**
 * M11B PHASE 5 — HISTORY.
 *
 * ⚠️ THE ROWS BELOW ARE THE REAL FINISHED JOB — plan `c1a424d1`, the one phase 3 ran and phase 4
 * reported against production, in the exact states it ended in. Rehydrating them is what "a past
 * job reopens complete" means, and asserting it against the real record rather than an invented
 * one is the difference between testing the function and testing my idea of it.
 */
const PLAN: StoredPlanRow = {
  id: 'c1a424d1-114a-405a-b1ab-013f84118c16',
  request: 'M11B-RUN2-4d81 tidy up before the weekend',
  title: 'M11B-RUN2-4d81 Weekend tidy',
  status: 'reported',
  unplannable_reason: null,
  report: '⚠️ 1 of 4 steps did not go through.\n\nYou asked: M11B-RUN2-4d81 tidy up before the weekend\n\n…',
  created_at: '2026-09-03T15:10:00Z',
}

const STEPS: StoredStepRow[] = [
  { step_index: 1, title: "Read yesterday's takings", description: 'Reads pos_sales.', status: 'executed',
    action_type: 'read_revenue_day', action_data: { capability: 'read_revenue_day', gate: 'auto', date: '2026-09-02' },
    requires_stepup: false, outcome_note: 'Read takings for 2026-09-02: A$0.00 across 0 sales.', resolved_at: '2026-09-03T15:12:00Z' },
  { step_index: 2, title: 'Discount the pastries', description: '10% off.', status: 'pending',
    action_type: 'create_promotion', action_data: { capability: 'create_promotion', gate: 'propose_only' },
    requires_stepup: true, outcome_note: null, resolved_at: null },
  { step_index: 3, title: 'Fix a count with no product named', description: 'Deliberately missing its arguments.', status: 'pending',
    action_type: 'adjust_stock', action_data: { capability: 'adjust_stock', gate: 'auto' },
    requires_stepup: false, outcome_note: 'Could not run this step — it was not told product_id or product_name, adjust_type, quantity. Nothing was changed.', resolved_at: '2026-09-03T15:12:01Z' },
  { step_index: 4, title: 'Ring the baker', description: 'Nothing can do this.', status: 'pending',
    action_type: 'phone_the_baker', action_data: { capability: null },
    requires_stepup: false, outcome_note: null, resolved_at: null },
]

describe('M11B phase 5 · a past job reopens complete', () => {
  const r = rehydratePlan(PLAN, STEPS)

  it('the request, the title, the status and the report all come back', () => {
    expect(r.planId).toBe(PLAN.id)
    expect(r.result.ok).toBe(true)
    if (r.result.ok) {
      expect(r.result.request).toBe(PLAN.request)
      expect(r.result.title).toBe(PLAN.title)
      expect(r.result.steps.map(s => s.index)).toEqual([1, 2, 3, 4])
    }
    expect(r.status).toBe('reported')
    expect(r.report).toContain('1 of 4 steps did not go through')
  })

  it('the step outcomes come back — done, waiting and failed', () => {
    expect(r.outcomes).toEqual([
      { step_index: 1, title: "Read yesterday's takings", result: 'ran', note: 'Read takings for 2026-09-02: A$0.00 across 0 sales.' },
      { step_index: 2, title: 'Discount the pastries', result: 'skipped', note: 'Waiting for you.' },
      { step_index: 3, title: 'Fix a count with no product named', result: 'failed', note: 'Could not run this step — it was not told product_id or product_name, adjust_type, quantity. Nothing was changed.' },
    ])
    // Step 4 was never attempted, so it has no outcome — an absence, not a fabricated one.
    expect(r.outcomes.some(o => o.step_index === 4)).toBe(false)
  })

  it('steps come back IN ORDER even if the rows arrive shuffled', () => {
    const shuffled = [STEPS[2], STEPS[0], STEPS[3], STEPS[1]]
    const out = rehydratePlan(PLAN, shuffled)
    if (!out.result.ok) throw new Error('expected a plan')
    expect(out.result.steps.map(s => s.index)).toEqual([1, 2, 3, 4])
    expect(out.result.steps[0].title).toBe("Read yesterday's takings")
  })

  it('THE GATE IS RE-DERIVED FROM THE REGISTRY, never read from the stored payload', () => {
    // A row whose action_data.gate was somehow wrong must not render a money step as safe a month
    // later. Proven by lying in the stored payload and checking the registry still wins.
    const lying = STEPS.map(s => s.step_index === 2 ? { ...s, action_data: { capability: 'create_promotion', gate: 'auto' } } : s)
    const out = rehydratePlan(PLAN, lying)
    if (!out.result.ok) throw new Error('expected a plan')
    const money = out.result.steps[1]
    expect(money.gate).toBe('propose_only')
    expect(money.runnable_by_aria).toBe(false)
    expect(markFor(money)).toContain('NEEDS YOU')
  })

  it('the registry bookkeeping is stripped, and the real arguments survive', () => {
    const out = rehydratePlan(PLAN, STEPS)
    if (!out.result.ok) throw new Error('expected a plan')
    expect(out.result.steps[0].payload).toEqual({ date: '2026-09-02' })
    expect(out.result.steps[0].payload.capability).toBeUndefined()
    expect(out.result.steps[0].payload.gate).toBeUndefined()
  })

  it('a step with no capability still needs a person, a month later', () => {
    const out = rehydratePlan(PLAN, STEPS)
    if (!out.result.ok) throw new Error('expected a plan')
    expect(out.result.steps[3].needs_person).toBe(true)
    expect(markFor(out.result.steps[3])).toContain('NEEDS A PERSON')
  })

  it('an unplannable plan reopens as the REFUSAL it was', () => {
    const out = rehydratePlan(
      { ...PLAN, status: 'abandoned', unplannable_reason: 'That is not something a POS can do.', report: null },
      [],
    )
    expect(out.result.ok).toBe(false)
    if (!out.result.ok) expect(out.result.reason).toBe('That is not something a POS can do.')
  })

  it('it is PURE — no fetch, no model, no store', () => {
    const src = code(read('src/lib/aria/works/plan-shape.ts'))
    expect(src).not.toMatch(/fetch\(|supabaseAdmin|runAriaModel/)
  })
})

describe('M11B phase 5 · no parallel store, and one renderer for a plan', () => {
  const c = code(AX)

  it('history reuses the ?c= thread mechanism and the conversation link', () => {
    expect(c).toContain('void loadPlansFor(restored.id)')
    expect(c).toContain('conversation_id=')
    expect(c).toContain("fetch('/api/aria/works/plans?business_id=")
  })

  it('clicking a thread brings its jobs back too, not just a reload', () => {
    expect(c).toMatch(/onOpenThread=\{\(id, messages\) => \{ openThread\(id, messages\); void loadPlansFor\(id\) \}\}/)
  })

  it('a revived job renders through the SAME PlanCard — not a history-only view', () => {
    expect(c).toContain('rehydratePlan(r.plan, r.steps)')
    expect((c.match(/<PlanCard/g) ?? []).length).toBe(1)
  })

  it('jobs are appended oldest first, so they read in the order they happened', () => {
    expect(c).toContain('[...rows].reverse()')
  })

  it('a conversation whose jobs will not load still shows its messages', () => {
    // Checked against the RAW source, not the comment-stripped copy: this is one of the deliberate
    // swallows S9 phase 6 left in place, and the rule for those is that the reason is written
    // beside them. My first version of this assertion searched the stripped text for the comment it
    // had just removed — an assertion that could only ever fail.
    const raw = AX.slice(AX.indexOf('const loadPlansFor'), AX.indexOf('const restoredRef'))
    expect(raw).toContain('try {')
    expect(raw).toContain('} catch {')
    expect(raw).toContain('History is additive')
    // And it must not fall back to an empty plan list that would render as "no jobs".
    expect(raw).not.toMatch(/catch\s*\{\s*setTurns/)
  })
})

describe('M11B phase 5 · COST IS UNKNOWN, and that is the answer', () => {
  it('the route returns null, never 0 and never an estimate', () => {
    const c = code(ROUTE)
    expect(c).toContain('cost_usd_cents: null')
    expect(c).not.toMatch(/cost_usd_cents: 0/)
    expect(c).toContain('nothing links a model call to a plan')
  })

  it('the card renders the word, and only once something has run', () => {
    const c = code(CARD)
    expect(c).toContain('cost')
    expect(c).toContain('unknown')
    // Before a plan runs there is nothing to have cost anything, so the line is not shown.
    expect(c).toMatch(/status && status !== 'proposed'/)
  })

  it('nothing anywhere attributes cost by a time window', () => {
    const c = code(ROUTE) + code(read('src/lib/aria/works/persist.ts')) + code(read('src/lib/aria/works/finish.ts'))
    expect(c).not.toMatch(/aria_ai_calls/)
    expect(c).not.toMatch(/cost_usd_cents\s*[><]/)
  })
})
