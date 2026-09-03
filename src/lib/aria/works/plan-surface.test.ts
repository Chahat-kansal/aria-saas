import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assemblePlan, markFor, type WorkPlan } from './plan'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const CARD = read('src/components/ask-aria-ax/PlanCard.tsx')
const PERSIST = read('src/lib/aria/works/persist.ts')
const ROUTE = read('src/app/api/aria/works/plan/route.ts')

const ok = (r: ReturnType<typeof assemblePlan>): WorkPlan => {
  if (!r.ok) throw new Error('expected a plan: ' + r.reason)
  return r
}

/**
 * M11B PHASE 1 — THE PLAN GETS A SURFACE, AND BECOMES ROWS.
 *
 * M11 built the planner and deliberately wired it to nothing. This phase gives the owner a way to
 * delegate and persists what comes back. Two properties carry the whole phase:
 *
 *   1. No step Aria may not carry out is ever rendered unmarked.
 *   2. No error is discarded — the failure that gave council-executor.ts zero audit inserts against
 *      819 rows is not reproduced in the module that writes plans.
 */
describe('M11B phase 1 · every unexecutable step carries a mark, on the surface too', () => {
  const plan = ok(assemblePlan('get ready for the long weekend', {
    title: 'Long weekend prep',
    steps: [
      { capability: 'adjust_stock', title: 'Correct the oat milk count', detail: '', payload: { product_name: 'Oat milk', adjust_type: 'set', quantity: 24 } },
      { capability: 'create_promotion', title: 'Set up a long-weekend offer', detail: '' },
      { capability: null, title: 'Call the baker', detail: '' },
    ],
  }))

  it('the card renders markFor — the SAME function the server renderer uses', () => {
    // Re-deriving the mark from needs_approval in JSX is how the screen and the report drift apart.
    expect(code(CARD)).toContain("import { markFor")
    expect(code(CARD)).toContain('{markFor(step)}')
    expect(code(CARD)).not.toMatch(/step\.needs_approval \?/)
  })

  it('there is no unmarked state for a step Aria may not run', () => {
    for (const s of plan.steps) {
      if (s.runnable_by_aria) continue
      expect(markFor(s), 'step ' + s.index).toMatch(/NEEDS (A PERSON|YOU|YOUR OK)/)
    }
    // Anti-vacuity: at least one step IS runnable, so this is not passing on a plan of refusals.
    expect(plan.steps.some(s => s.runnable_by_aria)).toBe(true)
  })

  it('the blocked reason is rendered BEFORE the title', () => {
    const c = code(CARD)
    expect(c.indexOf('blocked_reason')).toBeLessThan(c.indexOf('{result.title}'))
  })

  it('an unplannable request renders its reason, not an empty plan', () => {
    expect(code(CARD)).toContain("I can’t turn that into a plan")
    expect(code(CARD)).toContain('{result.reason}')
  })

  it('the card says nothing has run', () => {
    expect(code(CARD)).toContain('Nothing has run. This is the plan.')
  })

  it('MUTATION — rendering a step without its mark makes this suite RED', () => {
    const mutated = CARD.replace('{markFor(step)}', '{step.title}')
    expect(mutated).not.toBe(CARD)
    expect(code(mutated)).not.toContain('{markFor(step)}')
  })

  it('NO FAKE CONTROL — the approve button exists only where it actually does something', () => {
    // AMENDED BY M11B PHASE 2. This asserted `onApprove` was ABSENT from the surface, which was
    // true and right for phase 1: approving did not exist yet, and a button that looks live and
    // does nothing is the fake control this surface was cleaned of ten times over. Phase 2 ships
    // the approval, so the assertion is rewritten to the property it was always protecting rather
    // than deleted — the button must be WIRED, and must not render where it would no-op.
    const c = code(AX)
    const card = code(CARD)
    expect(c).toMatch(/onApprove=\{id => void approvePlan\(id, i\)\}/)
    expect(c).toContain('const approvePlan = useCallback')
    // Still gated three ways in the card: a real row, still 'proposed', and a handler was passed.
    expect(card).toContain('Boolean(planId)')
    expect(card).toContain("status === 'proposed'")
    expect(card).toContain('typeof onApprove === ')
    expect(card).toMatch(/\{canApprove && \(/)
  })
})

describe('M11B phase 1 · delegation is an EXPLICIT gesture', () => {
  const c = code(AX)

  it('ANTI-VACUITY — the surface was read', () => {
    expect(AX.length).toBeGreaterThan(25_000)
    expect(c).toContain('const delegate = useCallback')
  })

  it('a Delegate control calls it, and nothing infers a delegation from the message', () => {
    expect(c).toMatch(/onClick=\{\(\) => void delegate\(input\)\}/)
    // If the surface ever decided this by reading the text, every ordinary question would be at
    // risk of silently becoming a job. Asserted as an absence.
    expect(c).not.toMatch(/looksLikeDelegation|isDelegation|detectIntent\(/)
  })

  it('it posts the request, the business and the conversation — and nothing else', () => {
    expect(c).toContain("fetch('/api/aria/works/plan'")
    expect(c).toContain('request: msg')
    expect(c).toContain('business_id: ctx?.businessId')
    expect(c).toContain('conversation_id: conversationId')
  })

  it('a plan lives ON THE TURN, so it scrolls and restores with the conversation', () => {
    expect(c).toMatch(/plan\?: \{ planId: string \| null; result: PlanResult; status: string \| null \}/)
    expect(c).toContain('if (t.plan) {')
  })

  it('a route failure is stated, never smoothed into a plan that is not there', () => {
    expect(c).toMatch(/if \(!res\.ok \|\| !j\.plan\)/)
    expect(c).toContain('Nothing was attempted')
  })

  it('the status shown comes from the STORED row, not from an assumption', () => {
    expect(c).toContain('j.stored?.plan?.status')
  })
})

describe('M11B phase 1 · NO ERROR IS DISCARDED', () => {
  it('every insert and update in persist.ts reads its error', () => {
    const c = code(PERSIST)
    // The shape that gave council-executor.ts 0 of 819: an insert whose error is never destructured.
    const inserts = c.match(/\.(insert|update)\(/g) ?? []
    expect(inserts.length).toBeGreaterThanOrEqual(2)
    for (const m of ['planErr', 'abandonErr']) expect(c, 'missing ' + m).toContain(m)
    expect(c).toContain("console.error('[works/persist] plan insert failed:'")

    // THE SWALLOW SHAPE, asserted as an absence rather than by a clever regex: a write whose result
    // is never assigned to anything. `await supabase.from(...).insert(...)` as a bare statement is
    // exactly what council-executor.ts does, and it is why 819 rows have zero audit inserts.
    // (My first version of this assertion used a negative lookahead that could match anywhere and
    // failed on correct code — a measurement error in my own diagnostic, failure pattern #5.)
    const bareWrites = c.split('\n').filter(l => /^\s*(await\s+)?supabaseAdmin$/.test(l.trim()) || /^\s*await supabaseAdmin\b/.test(l))
    expect(bareWrites, 'unassigned write(s): ' + bareWrites.join(' | ')).toEqual([])

    // And every write's result IS destructured with an error.
    const destructured = c.match(/const \{[^}]*error[^}]*\} = await supabaseAdmin/g) ?? []
    expect(destructured.length).toBeGreaterThanOrEqual(2)
  })

  it('reads THROW rather than returning empty — an unreadable plan is not a plan with no steps', () => {
    const c = code(PERSIST)
    expect(c).toContain('plan_unreadable')
    expect(c).toContain('plan_steps_unreadable')
    expect(c).not.toMatch(/catch\s*\{\s*return \[\]/)
  })

  it('a PARTIAL write is a failure, and the plan is marked abandoned', () => {
    const c = code(PERSIST)
    expect(c).toMatch(/if \(failed\.length > 0\)/)
    expect(c).toContain("status: 'abandoned'")
    expect(c).toMatch(/return \{ ok: false, reason \}/)
  })

  it('the route never returns a plan_id for a plan that failed to save', () => {
    const c = code(ROUTE)
    expect(c).toMatch(/if \(saved && !saved\.ok\)/)
    expect(c).toMatch(/status: 500/)
  })

  it('recordEvent — the spine’s ONE writer — now reads its error too', () => {
    // It did not: `await supabase.insert()` resolves with { error } rather than throwing, so a CHECK
    // violation landed in a variable nobody looked at. Still non-fatal; only now it is visible.
    const c = code(read('src/lib/moat/recordEvent.ts'))
    expect(c).toMatch(/const \{ error \} = await supabaseAdmin/)
    expect(c).toContain("console.error('[recordEvent] REJECTED'")
    // RULE 0 — the original thrown-failure arm is kept, not replaced.
    expect(c).toContain("console.error('[recordEvent] failed'")
  })
})

describe('M11B phase 1 · the plan uses what already exists', () => {
  const c = code(PERSIST)

  it('steps are written through createDecision, not a second insert site', () => {
    expect(c).toContain("from '@/lib/decisions/createDecision'")
    expect(c).toContain('await createDecision({')
    expect(c).not.toMatch(/\.from\('aria_autopilot_actions'\)[\s\S]{0,80}\.insert\(/)
  })

  it('ONE event per plan, not one per step', () => {
    expect(c).toContain('emit: false')
    expect(c).toContain('notify: false')
    expect((c.match(/recordEvent\(/g) ?? []).length).toBe(1)
    expect(c).toContain("event_type: 'job_created'")
    expect(c).toContain("entity_type: 'job'")
  })

  it('no CHECK is extended — job_created/job/aria are already allowed values', () => {
    // business_events_entity_type_check: decision | job.
    // business_events_event_type_check: proposed | approved | declined | expired | job_created |
    //   job_completed | job_failed. The spine had a job lifecycle waiting for a user.
    expect(c).not.toMatch(/event_type: 'plan_/)
    expect(c).not.toMatch(/entity_type: 'plan'/)
  })

  it('step_index is 1-based and set with plan_id, never alone', () => {
    expect(c).toContain('step_index: step.index')
    expect(c).toContain('plan_id: planId')
    // assemblePlan numbers from 1; the DB CHECK requires the pair.
    const p = ok(assemblePlan('x', { steps: [{ capability: 'adjust_stock', title: 'a' }, { capability: 'adjust_stock', title: 'b' }] }))
    expect(p.steps.map(s => s.index)).toEqual([1, 2])
  })

  it('named columns only — never select(*) on a table beside staff PII-adjacent reads', () => {
    expect(c).not.toMatch(/\.select\('\*'\)/)
    expect(c).toContain('PLAN_COLUMNS')
    expect(c).toContain('STEP_COLUMNS')
  })

  it('a business_id filter is in every read, because supabaseAdmin bypasses RLS', () => {
    expect((c.match(/\.eq\('business_id', businessId\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('M11B phase 1 · a plan step carries the arguments it needs', () => {
  it('the payload survives assembly and is a plain object', () => {
    const p = ok(assemblePlan('fix the count', {
      steps: [{ capability: 'adjust_stock', title: 'Set oat milk to 24', payload: { product_name: 'Oat milk', adjust_type: 'set', quantity: 24 } }],
    }))
    expect(p.steps[0].payload).toEqual({ product_name: 'Oat milk', adjust_type: 'set', quantity: 24 })
  })

  it('a non-object payload is discarded, not coerced', () => {
    for (const bad of ['nope', 42, ['a'], null, undefined]) {
      const p = ok(assemblePlan('x', { steps: [{ capability: 'adjust_stock', title: 't', payload: bad }] }))
      expect(p.steps[0].payload).toEqual({})
    }
  })

  it('the payload NEVER influences the gate', () => {
    const p = ok(assemblePlan('x', {
      steps: [{ capability: 'create_promotion', title: 't', payload: { gate: 'auto', runnable_by_aria: true } }],
    }))
    expect(p.steps[0].gate).toBe('propose_only')
    expect(p.steps[0].runnable_by_aria).toBe(false)
  })
})
