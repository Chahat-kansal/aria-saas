import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = 'src/app/api/cron/aria-health-monitor/route.ts'

/** The `case 'x':` labels inside one named function in the route. */
function casesOf(src: string, fnName: string): string[] {
  const at = src.indexOf('function ' + fnName + '(')
  if (at < 0) return []
  // Each builder ends at the next top-level `function ` declaration.
  const next = src.indexOf('\nfunction ', at + 1)
  const body = src.slice(at, next < 0 ? src.length : next)
  // `[a-z0-9_]+`, not `[a-z_]+`: `briefing_table_writes_24h` has DIGITS in it, and the first
  // version of this scan silently found 4 checks instead of 5. The anti-vacuity floor below is
  // the only reason that surfaced rather than passing as a clean sweep of a short list.
  return [...body.matchAll(/case '([a-z0-9_]+)':/g)].map(m => m[1]!).sort()
}

/**
 * S9 PHASE 5 (#8) — `aria_actions.reason` was UNPOPULATED, NOT DEAD.
 *
 * Measured before changing anything: 193 of 442 rows carry a reason, and the split is by writer —
 * signal_engine 112/112, aria_intelligence:alert 9/11, aria_router:ops_narrative 70/213, and
 * cron:aria-health-monitor 0 of 78 with 27 of those still pending. Those 27 are exactly the notices
 * the Ask Aria surface renders, and since S8 phase 3 they are carried into the council when an owner
 * clicks one. So an empty `reason` is a hole in what Aria knows about her own alert.
 *
 * No DDL: `upsertAriaAction` already accepted and wrote the column on both its insert and update
 * paths. The only thing missing was the caller passing it.
 */
describe('S9 phase 5 · the health monitor supplies a reason', () => {
  const src = read(ROUTE)

  it('the writer passes reason, and the helper has always been able to store it', () => {
    expect(src).toMatch(/const reason = buildRedReason\(check\)/)
    // passed into the upsert alongside title/recommendation
    const at = src.indexOf('await upsertAriaAction({')
    expect(at, 'the upsert call moved').toBeGreaterThan(-1)
    expect(src.slice(at, at + 400)).toMatch(/^\s*reason,$/m)
    // the plumbing was never the problem
    const helper = read('src/lib/aria/upsert-aria-action.ts')
    expect(helper).toMatch(/reason\?: string \| null/)
    expect((helper.match(/reason: row\.reason/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('THE RAIL — every check with a title has a reason, so a new one cannot ship without one', () => {
    const titles = casesOf(src, 'buildRedTitle')
    const reasons = casesOf(src, 'buildRedReason')
    // ANTI-VACUITY: if the scan finds no cases at all it has broken, and an empty-vs-empty
    // comparison would pass while proving nothing.
    expect(titles.length, 'the case scan found no checks — the scan is broken, not the code')
      .toBeGreaterThanOrEqual(5)
    const missing = titles.filter(t => !reasons.includes(t))
    expect(missing, 'checks that raise a notice with no reason: ' + missing.join(', ')).toEqual([])
  })

  it('the reason states MEASURED values only — never an estimate', () => {
    const at = src.indexOf('function buildRedReason(')
    const body = src.slice(at, src.indexOf('\nfunction ', at + 1))
    // It quotes the check's own value and threshold, both of which the monitor computed.
    expect(body).toContain('String(check.value)')
    expect(body).toContain('check.threshold')
    // GROUNDING-TEETH: no invented currency or percentage literals in the narrative.
    expect(body).not.toMatch(/\$\d/)
    expect(body).not.toMatch(/\b\d+%/)
  })

  it('an unknown check gets the measured sentence and NO invented narrative', () => {
    const at = src.indexOf('function buildRedReason(')
    const body = src.slice(at, src.indexOf('\nfunction ', at + 1))
    const def = body.slice(body.indexOf('default:'))
    expect(def).toContain('return measured')
    // The default must not fabricate a cause for a check this function has not been taught.
    expect(def.replace(/\/\/.*$/gm, '')).not.toMatch(/probably|likely|may have|suggests/i)
  })

  it('reason and recommendation stay DIFFERENT things — evidence vs action', () => {
    // The convention read off the 112 signal_engine rows that already populate it.
    const at = src.indexOf('function buildRedReason(')
    const reasonBody = src.slice(at, src.indexOf('\nfunction ', at + 1))
    const rAt = src.indexOf('function buildRedRecommendation(')
    const recBody = src.slice(rAt, src.indexOf('\nfunction ', rAt + 1))
    expect(reasonBody).toContain('measured')
    // A recommendation tells you what to do; a reason does not.
    expect(recBody).toMatch(/Check|Run|Review/)
    expect(reasonBody).not.toMatch(/^\s*return 'Check the/m)
  })

  it('MUTATION PROBE — dropping a check from buildRedReason goes red', () => {
    const titles = casesOf(src, 'buildRedTitle')
    const reasons = casesOf(src, 'buildRedReason')
    expect(titles.length).toBeGreaterThan(0)
    const mutated = reasons.filter(r => r !== titles[0])
    expect(mutated).not.toEqual(reasons)                       // the mutation really removes one
    expect(titles.filter(t => !mutated.includes(t))).not.toEqual([])   // ...and the rail sees it
  })
})
