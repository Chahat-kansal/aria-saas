import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canRun, whyNotRunnable } from './approve'
import type { PlanRow } from './persist'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const APPROVE = read('src/lib/aria/works/approve.ts')
const ROUTE = read('src/app/api/aria/works/plan/[id]/approve/route.ts')
const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const CARD = read('src/components/ask-aria-ax/PlanCard.tsx')

const plan = (over: Partial<PlanRow>): Pick<PlanRow, 'status' | 'approved_at'> =>
  ({ status: 'proposed', approved_at: null, ...over } as Pick<PlanRow, 'status' | 'approved_at'>)

/**
 * M11B PHASE 2 — APPROVE.
 *
 * The approval is the only thing that turns a plan into work. `canRun` is the single predicate the
 * runner asks, and the sprint's named mutation for this phase — "let an unapproved plan run" — is
 * run against it below, because it is the function that would have to be broken for that to happen.
 */
describe('M11B phase 2 · canRun — the ONE predicate, and an unapproved plan is not runnable', () => {
  it('ONLY an approved plan with a recorded approval time may run', () => {
    expect(canRun(plan({ status: 'approved', approved_at: '2026-09-03T01:00:00Z' }))).toBe(true)
  })

  it('a proposed plan may NOT run — nobody said yes', () => {
    expect(canRun(plan({ status: 'proposed' }))).toBe(false)
    expect(whyNotRunnable(plan({ status: 'proposed' }))).toContain('has not been approved yet')
  })

  it('a running plan may not run AGAIN — re-entering is how a step runs twice', () => {
    expect(canRun(plan({ status: 'running', approved_at: '2026-09-03T01:00:00Z' }))).toBe(false)
    expect(whyNotRunnable(plan({ status: 'running', approved_at: 'x' }))).toContain('already running')
  })

  it('a finished or abandoned plan is over', () => {
    expect(canRun(plan({ status: 'reported', approved_at: 'x' }))).toBe(false)
    expect(canRun(plan({ status: 'abandoned' }))).toBe(false)
    expect(whyNotRunnable(plan({ status: 'reported', approved_at: 'x' }))).toContain('already finished')
    expect(whyNotRunnable(plan({ status: 'abandoned' }))).toContain('abandoned')
  })

  it('"approved" with no approved_at is NOT runnable — a state nothing can account for', () => {
    // A row written by hand, or a half-applied update. Executing real work off it would mean acting
    // on an approval nobody can point at.
    expect(canRun(plan({ status: 'approved', approved_at: null }))).toBe(false)
    expect(whyNotRunnable(plan({ status: 'approved', approved_at: null }))).toContain('no approval time')
  })

  it('whyNotRunnable is null exactly when canRun is true — the two cannot disagree', () => {
    const cases: Array<Pick<PlanRow, 'status' | 'approved_at'>> = [
      plan({ status: 'proposed' }),
      plan({ status: 'approved', approved_at: 'x' }),
      plan({ status: 'approved', approved_at: null }),
      plan({ status: 'running', approved_at: 'x' }),
      plan({ status: 'reported', approved_at: 'x' }),
      plan({ status: 'abandoned' }),
    ]
    for (const c of cases) expect(whyNotRunnable(c) === null, c.status).toBe(canRun(c))
    // Anti-vacuity: the set covers both answers.
    expect(cases.filter(canRun).length).toBe(1)
    expect(cases.filter(c => !canRun(c)).length).toBe(5)
  })

  it('MUTATION — letting an unapproved plan run makes this suite RED', () => {
    // The sprint's named mutation for phase 2, applied to the real predicate's logic.
    const permissive = (p: Pick<PlanRow, 'status' | 'approved_at'>) => p.status !== 'abandoned'
    const proposed = plan({ status: 'proposed' })
    expect(canRun(proposed)).toBe(false)
    expect(permissive(proposed)).toBe(true)        // ← what the mutation would allow
    expect(canRun(proposed)).not.toBe(permissive(proposed))
  })
})

describe('M11B phase 2 · the claim is atomic, and approval is PER PLAN', () => {
  const c = code(APPROVE)

  it('ANTI-VACUITY — the module was read', () => {
    expect(APPROVE.length).toBeGreaterThan(2000)
    expect(c).toContain('export async function approvePlan')
  })

  it('the status re-check rides the UPDATE — never select-then-update', () => {
    const at = c.indexOf('.update({')
    expect(at).toBeGreaterThan(-1)
    const stmt = c.slice(at, c.indexOf('.maybeSingle()', at))
    expect(stmt).toContain("status: 'approved'")
    expect(stmt).toContain('approved_at')
    expect(stmt).toContain('approved_by: userId')
    expect(stmt).toMatch(/\.eq\('status', 'proposed'\)/)
    expect(stmt).toMatch(/\.eq\('business_id', businessId\)/)
    // Two statements would leave a window in which two tabs both see 'proposed'.
    expect((c.match(/\.update\(\{/g) ?? []).length).toBe(1)
  })

  it('a second approval gets no row and is told which case it is', () => {
    expect(c).toContain("reason: existing ? 'not_proposed' : 'not_found'")
  })

  it('NOTHING here touches a step — a plan-level yes never clears a step-level gate', () => {
    // The worst bug this sprint could ship: approving the plan silently approving its money step.
    expect(c).not.toContain('aria_autopilot_actions')
    expect(c).not.toContain('requires_stepup')
    expect(c).not.toContain('step_index')
  })

  it('it does not execute anything', () => {
    expect(c).not.toMatch(/executeAction|runPlan|execute\(/)
  })

  it('every error is read', () => {
    expect(c).toMatch(/const \{ data, error \} = await supabaseAdmin/)
    expect(c).toContain("console.error('[works/approve] update failed:'")
    expect(c).toContain("console.error('[works/approve] existence check failed:'")
  })

  it('the spine event uses values the CHECK already allows', () => {
    expect(c).toContain("entity_type: 'job'")
    expect(c).toContain("event_type: 'approved'")
    expect(c).toContain("actor: 'owner'")
  })
})

describe('M11B phase 2 · the route', () => {
  const c = code(ROUTE)

  it('verifies the caller owns the business before writing anything', () => {
    expect(c).toMatch(/\.from\('businesses'\)[\s\S]{0,120}\.eq\('user_id', user\.id\)/)
    expect(c.indexOf("from('businesses')")).toBeLessThan(c.indexOf('approvePlan('))
  })

  it('a non-UUID id is a 404 and never reaches the database', () => {
    expect(c).toContain('toNullableUuid(id)')
    expect(c.indexOf('toNullableUuid')).toBeLessThan(c.indexOf('approvePlan('))
  })

  it('ALREADY APPROVED is a 200 with the plan state, not an error the owner must interpret', () => {
    expect(c).toContain('already: true')
    expect(c).toContain('nothing changed')
    expect(c).not.toMatch(/status: 409/)
  })

  it('it says out loud that approving did not execute', () => {
    expect(c).toContain('executed: false')
  })
})

describe('M11B phase 2 · the surface', () => {
  const c = code(AX)

  it('the approve button is now live, and only for a plan with a row', () => {
    expect(c).toMatch(/onApprove=\{id => void approvePlan\(id, i\)\}/)
    expect(code(CARD)).toContain("status === 'proposed'")
    expect(code(CARD)).toContain('Boolean(planId)')
  })

  it('the card state is refreshed from the SERVER, never from an assumption', () => {
    expect(c).toContain('j.stored?.plan?.status ?? null')
    expect(c).not.toMatch(/status: 'approved'/)
  })

  it('busy is per plan id, so two plans on screen do not both look busy', () => {
    expect(c).toMatch(/const \[approvingId, setApprovingId\] = useState<string \| null>\(null\)/)
    expect(c).toMatch(/approving=\{approvingId !== null && approvingId === t\.plan\.planId\}/)
  })

  it('a re-approve is reported plainly rather than as a failure', () => {
    expect(c).toMatch(/if \(j\.already && j\.note\)/)
  })
})
