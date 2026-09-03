import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAPABILITIES, missingArgs } from './capabilities'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const RUN = read('src/lib/aria/works/run.ts')
const ROUTE = read('src/app/api/aria/works/plan/[id]/run/route.ts')

/**
 * M11B PHASE 3 — EXECUTE, ONE STEP AT A TIME.
 *
 * ⚠️ THE ARGUMENT CHECK BELOW IS NOT DEFENSIVE POLITENESS. IT IS A MEASURED DEFECT.
 *
 * This phase's first live proof deliberately included an `adjust_stock` step with an EMPTY payload,
 * expecting it to refuse. **It did not.** With no product named, `executeAction` falls through to a
 * `.limit(10)` with no filter, takes the first ten products of the business, and returns
 * "Done — 10 changes". The executor's own mass-mutation backstop did not fire because ten is under
 * its threshold of twenty.
 *
 * On that run it happened to be nearly harmless — `quantity` was missing too, so the delta was zero
 * and no stock value moved (measured: 10 `pos_products.updated_at` bumped, 0 stock adjustments, 0
 * inventory rows changed). **A payload of `{adjust_type:'set', quantity:0}` with no product would
 * have set ten products' stock to zero.**
 */
describe('M11B phase 3 · a step that was not told what to act on must not run', () => {
  it('adjust_stock requires a product, a type and a quantity', () => {
    const cap = CAPABILITIES.adjust_stock
    expect(missingArgs(cap, {})).toEqual(['product_id or product_name', 'adjust_type', 'quantity'])
    expect(missingArgs(cap, { product_name: 'Oat milk', adjust_type: 'set', quantity: 24 })).toEqual([])
    // Either identifier will do — the executor accepts an id or an ilike on the name.
    expect(missingArgs(cap, { product_id: 'x', adjust_type: 'add', quantity: 1 })).toEqual([])
  })

  it('set_low_stock_threshold requires a scope and a threshold', () => {
    const cap = CAPABILITIES.set_low_stock_threshold
    // With neither category nor brand it targets EVERY active product up to 500.
    expect(missingArgs(cap, {})).toEqual(['category or brand', 'threshold'])
    expect(missingArgs(cap, { category: 'Coffee', threshold: 5 })).toEqual([])
  })

  it('present-but-empty is MISSING — null, "" and NaN tell an executor nothing', () => {
    const cap = CAPABILITIES.adjust_stock
    // `Number(null) || 0` would quietly become a zero nobody asked for.
    expect(missingArgs(cap, { product_name: 'x', adjust_type: 'set', quantity: null })).toContain('quantity')
    expect(missingArgs(cap, { product_name: '', adjust_type: 'set', quantity: 1 })).toContain('product_id or product_name')
    expect(missingArgs(cap, { product_name: 'x', adjust_type: 'set', quantity: Number.NaN })).toContain('quantity')
    // But a real zero quantity is NOT missing — "set the count to 0" is a legitimate instruction.
    expect(missingArgs(cap, { product_name: 'x', adjust_type: 'set', quantity: 0 })).toEqual([])
  })

  it('only the AUTO writes carry requirements — the rest never run here anyway', () => {
    for (const id of ['adjust_stock', 'set_low_stock_threshold'] as const) {
      expect(CAPABILITIES[id].requires, id).toBeDefined()
      expect(CAPABILITIES[id].gate).toBe('auto')
    }
    // Anti-vacuity: this is not passing because every capability has requirements.
    expect(CAPABILITIES.create_promotion.requires).toBeUndefined()
    expect(CAPABILITIES.read_revenue_day.requires).toBeUndefined()
  })

  it('the runner checks arguments BEFORE the executor is called', () => {
    const c = code(RUN)
    expect(c).toContain('const missing = missingArgs(cap,')
    expect(c.indexOf('missingArgs(cap,')).toBeLessThan(c.indexOf('executeAction('))
    expect(c).toContain('it was not told ')
    expect(c).toContain('Nothing was changed.')
  })

  it('MUTATION — removing the argument check lets an empty step reach the executor', () => {
    const mutated = RUN.replace('if (missing.length > 0) {', 'if (false) {')
    expect(mutated).not.toBe(RUN)
    expect(code(mutated)).not.toContain('if (missing.length > 0) {')
    // And the property that would be lost: an empty payload is missing three things.
    expect(missingArgs(CAPABILITIES.adjust_stock, {}).length).toBe(3)
  })
})

describe('M11B phase 3 · a plan is not a transaction, and it cannot run twice', () => {
  const c = code(RUN)

  it('ANTI-VACUITY — the runner was read', () => {
    expect(RUN.length).toBeGreaterThan(6000)
    expect(c).toContain('export async function runPlan')
  })

  it('the run is claimed atomically on status=approved — no preceding SELECT', () => {
    expect(c).toMatch(/\.update\(\{ status: 'running' \}\)/)
    expect(c).toMatch(/\.eq\('status', 'approved'\)/)
    expect(c).toMatch(/if \(!claimed\) return \{ ok: false, reason: 'This plan is already running\.' \}/)
    expect((c.match(/\.update\(\{ status: 'running' \}\)/g) ?? []).length).toBe(1)
  })

  it('it asks canRun first — the one predicate, not a second copy of the rule', () => {
    expect(c).toContain("from './approve'")
    expect(c).toContain('if (!canRun(loaded.plan))')
    expect(c).not.toMatch(/status === 'approved'/)
  })

  it('there is no rollback of the whole run — earlier steps stay done', () => {
    // Unwinding a completed step because a later one failed would be a second unrequested action.
    expect(c).not.toMatch(/rollbackAction|revertPlan|undoAll/)
    expect(c).toMatch(/for \(const step of loaded\.steps\)/)
  })

  it('money, sending and authorisation steps are SKIPPED, not executed', () => {
    expect(c).toMatch(/if \(cap\.gate !== 'auto'\) \{/)
    expect(c).toContain('Left for you — ')
    expect(c).toContain('Nothing was done to it.')
    // The skip happens before any execution branch.
    expect(c.indexOf("cap.gate !== 'auto'")).toBeLessThan(c.indexOf('executeAction('))
  })

  it('a step with no capability at all needs a person', () => {
    expect(c).toMatch(/if \(!cap\) \{/)
    expect(c).toContain('Aria has no way to do this one')
  })

  it('a FAILED step keeps status pending — no invented status value', () => {
    // aria_autopilot_actions_status_check has no 'failed'. Writing one would be TS-DEFECT-1 again:
    // three writers already use a status the CHECK rejects and fail silently. 'executed' would
    // claim it ran; 'rejected'/'dismissed' would say the OWNER decided against it.
    expect(c).toMatch(/if \(result === 'ran'\) patch\.status = 'executed'/)
    expect(c).not.toMatch(/status: 'failed'/)
    expect(c).not.toMatch(/status: 'rejected'/)
    expect(c).not.toMatch(/status: 'dismissed'/)
    // The failure is recorded where the report reads it.
    expect(c).toContain('outcome_note: note')
    expect(c).toContain('outcome_data: data')
  })

  it('every write reads its error', () => {
    expect(c).toMatch(/const \{ data: claimed, error: claimErr \}/)
    expect(c).toContain("console.error('[works/run] claim failed:'")
    expect(c).toMatch(/const \{ error \} = await supabaseAdmin/)
    expect(c).toContain("console.error('[works/run] could not record step outcome:'")
  })

  it('it never marks the plan reported — that is phase 4, from the recorded rows', () => {
    expect(c).not.toMatch(/'reported'/)
    expect(c).not.toContain('completed_at')
  })

  it('a read step records WHAT it read, and never the detector’s dollar estimates', () => {
    expect(c).toContain("source: 'pos_sales'")
    expect(c).toContain("source: 'loss-detector'")
    // estimated_monthly_loss_aud is the detector's own estimate; unlabelled in a report it would
    // read as measured. Titles only.
    expect(c).not.toContain('estimated_monthly_loss_aud')
  })
})

describe('M11B phase 3 · the route', () => {
  const c = code(ROUTE)

  it('verifies ownership before running anything', () => {
    expect(c.indexOf("from('businesses')")).toBeLessThan(c.indexOf('runPlan('))
    expect(c).toMatch(/\.eq\('user_id', user\.id\)/)
  })

  it('"already running" and "not approved" are 200s with the true sentence, not errors', () => {
    expect(c).toMatch(/ran: false, note: result\.reason/)
    expect(c).not.toMatch(/status: 409/)
  })

  it('the summary is COUNTED FROM THE OUTCOMES, never tracked alongside them', () => {
    // A count kept separately is a count that can disagree with the record it summarises.
    expect(c).toMatch(/result\.outcomes\.filter\(o => o\.result === 'ran'\)\.length/)
    expect(c).toMatch(/result\.outcomes\.filter\(o => o\.result === 'failed'\)\.length/)
    expect(c).toMatch(/result\.outcomes\.filter\(o => o\.result === 'skipped'\)\.length/)
  })
})
