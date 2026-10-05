import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'
import { todayAEST } from '@/lib/date-au'
import type { TurnGrounding } from './types'

/**
 * M18 · BRAIN-2 PHASE 1 — THE GROUNDING STAGE HAS A BODY.
 *
 * ⚠️ NOT ONE ASSERTION HERE CHECKS THAT A FIELD EXISTS. M17 shipped a `ground()` that returned
 * `{ kind: 'council', bizCtx: '', augCtx: '', anchors: [], provenance: null }` and
 * `{ kind: 'full', ctx: undefined as never }` — every field present, every field empty, on every
 * turn. A presence test passed against that for seven weeks. So each test below drives a real turn
 * through `runTurn()`, catches the grounding THE SPINE HANDED THE LANE, and asserts on the figures
 * and the query names actually in it.
 *
 * The three that matter most are the ones that would have caught the shipped shape:
 *   · a general-lane turn must run NO anchor query at all — counted, not assumed
 *   · a failed query must be in the set as `ran: false` carrying the thrown message, not dropped
 *   · the stage must run ONCE per turn. `runTurn` called `ground()` a second time to build the turn
 *     record; with M17's empty body that was free, and with a body it doubles every query.
 */

const classifyIntent = vi.fn()
const classifyAriaIntent = vi.fn()
const getRevenueSnapshot = vi.fn()
const getRevenueForRange = vi.fn()

/** Every anchor query that reached the database double, in the order it got there. */
const dbCalls: string[] = []
let customerCount: number | null = 240
let consentCount: number | null = 61
let weeklyTarget: number | null = 4200
let countError: string | null = null

vi.mock('@/lib/aria/ask/intent', () => ({
  classifyIntent: (...a: unknown[]) => classifyIntent(...a) as unknown,
  detectOutputFormat: () => ({ wants_download: false, wants_chart: false, wants_table: false, wants_comparison: false }),
}))
vi.mock('@/lib/aria/ask/aria-intent', () => ({
  classifyAriaIntent: (...a: unknown[]) => classifyAriaIntent(...a) as unknown,
}))
vi.mock('@/lib/aria/log-ai-call', () => ({ logAICallSafe: async () => true }))
vi.mock('@/lib/aria/revenue-snapshot', () => ({
  getRevenueSnapshot: (...a: unknown[]) => getRevenueSnapshot(...a) as unknown,
  getRevenueForRange: (...a: unknown[]) => getRevenueForRange(...a) as unknown,
}))

/**
 * A `supabaseAdmin` double that records WHICH query reached it, keyed on the FILTER rather than on
 * call order — the consented count is the one carrying `marketing_consent`. Order-independent, so
 * the test cannot start passing or failing because `Promise.all` resolved differently.
 */
vi.mock('@/lib/supabase-admin', () => {
  const make = (table: string) => {
    const eqs: string[] = []
    let head = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = {}
    for (const m of ['gte', 'lte', 'lt', 'order', 'limit', 'ilike', 'neq']) self[m] = () => self
    self.eq = (col: string) => { eqs.push(col); return self }
    self.select = (_cols: string, opts?: { count?: string; head?: boolean }) => { head = !!opts?.head; return self }
    self.maybeSingle = async () => {
      dbCalls.push(table + ':maybeSingle')
      if (countError) return { data: null, error: { message: countError } }
      return { data: { weekly_revenue_target: weeklyTarget }, error: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.then = (res: any, rej: any) => {
      const consent = eqs.includes('marketing_consent')
      dbCalls.push(table + (head ? (consent ? ':count:consented' : ':count:all') : ':select'))
      const payload = countError
        ? { count: null, error: { message: countError } }
        : { count: consent ? consentCount : customerCount, error: null }
      return Promise.resolve(payload).then(res, rej)
    }
    return self
  }
  return { supabaseAdmin: { from: (t: string) => make(t) } }
})

const { runTurn } = await import('./run-turn')
const { makeTurnResult } = await import('./types')

const INTENT = (over: Partial<ClassifiedIntent> = {}) =>
  ({ type: 'question', complexity: 'simple', confidence: 0.9, ...over }) as ClassifiedIntent
const ARIA = (over: Partial<AriaIntent> = {}) =>
  ({ intent_type: 'analytical', comparison_period: null, routing_reason: 'r', ...over }) as AriaIntent
const PARSED = (over: Record<string, unknown> = {}) => ({
  message: 'hello', conversationId: null, attachments: [], clientMessages: [],
  noticeRef: null, branchIntent: { mode: 'append' as const }, ...over,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENV = () => ({
  req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
  bid: 'ff5055a0-c351-4ada-817a-1804961035f3', userId: 'u1', supabase: {} as never,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

/** Runs a turn whose lanes record the grounding they were handed, and returns that grounding. */
async function groundingHandedTo(lane: string, message: string): Promise<TurnGrounding> {
  let seen: TurnGrounding | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const capture = (name: string) => async (a: any) => {
    seen = a.grounding as TurnGrounding
    return makeTurnResult(name as 'main', { response: 'x' })
  }
  await runTurn(ENV(), {
    // `main` is always offered last, so registering it keeps an unexpected route a visible wrong
    // grounding rather than a thrown "no strategy registered for lane".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry: { main: capture('main'), [lane]: capture(lane) } as any,
    parse: async () => PARSED({ message }),
    /**
     * ⚠️ `onRecord` IS NOT OPTIONAL HERE, AND LEAVING IT OUT COST A MUTATION CHECK.
     *
     * `runTurn` builds the turn record as `opts.onRecord?.(recordOf(…, grounding, …))`. An optional
     * CALL short-circuits its own arguments, so with no `onRecord` the whole `recordOf(…)` expression
     * is never evaluated. The first version of this helper omitted it — and the mutation that put the
     * second `await ground(…)` back inside that argument stayed GREEN, because the test was not
     * reproducing the wiring the route actually uses (`onRecord: recordTurn`, route.ts).
     *
     * A test that omits what production always passes cannot see a regression in it.
     */
    onRecord: () => {},
  })
  if (!seen) throw new Error('no lane ran — the registry never received a grounding')
  return seen
}

beforeEach(() => {
  dbCalls.length = 0
  customerCount = 240; consentCount = 61; weeklyTarget = 4200; countError = null
  classifyIntent.mockReset().mockResolvedValue(INTENT())
  classifyAriaIntent.mockReset().mockResolvedValue(ARIA())
  getRevenueSnapshot.mockReset().mockResolvedValue({ revenue: 822.4, transaction_count: 37 })
  // Keyed on the END of the window, not on call order: week-to-date ends today, last week does not.
  getRevenueForRange.mockReset().mockImplementation(async (_bid: string, _start: string, end: string) =>
    end === todayAEST()
      ? { revenue: 3310.75, transaction_count: 141 }
      : { revenue: 2904.1, transaction_count: 128 })
})

describe('M18 phase 1 · stage 2 loads an anchor set', () => {
  it('⚠️ A QUESTION LANE IS HANDED FIGURES AND THE NAMES OF THE QUERIES THAT PRODUCED THEM', async () => {
    const g = await groundingHandedTo('council', 'how are we doing this week?')

    // The figures are the values the canonical revenue helpers actually returned — not a shape.
    const byLabel = new Map(g.anchorSet.figures.map(f => [f.label, f.value]))
    expect(byLabel.get('Completed sales, today.')).toBe(822.4)
    expect(byLabel.get('Completed sales, this week to date.')).toBe(3310.75)
    expect(byLabel.get('Completed sales, last week.')).toBe(2904.1)
    expect(byLabel.get('Customers on record.')).toBe(240)
    expect(byLabel.get('Customers who have consented to marketing.')).toBe(61)
    expect(byLabel.get('Your weekly revenue target.')).toBe(4200)

    // "at least one query named" — and in fact every one of the six, with what it returned.
    const names = g.anchorSet.queries.map(q => q.name)
    expect(names).toContain('revenue_today')
    expect(names).toContain('customers_on_record')
    expect(g.anchorSet.queries).toHaveLength(6)
    expect(g.anchorSet.queries.find(q => q.name === 'revenue_today')).toMatchObject({ ran: true, rows: 37 })
    // Non-empty means non-empty: an `emptyReason` here would say the set is empty and explained.
    expect(g.anchorSet.emptyReason).toBeNull()
  })

  it('⚠️ THE GENERAL LANE GETS AN EMPTY-BUT-PRESENT SET, AND RUNS NOT ONE QUERY', async () => {
    classifyIntent.mockResolvedValue(INTENT({ type: 'general' }))
    classifyAriaIntent.mockResolvedValue(ARIA({ intent_type: 'general' }))

    const g = await groundingHandedTo('general', 'tidy up before the weekend')

    expect(g.anchorSet.figures).toEqual([])
    expect(g.anchorSet.queries).toEqual([])
    // "Nothing to ground" is a RESULT. The reason names why THIS lane has nothing, in the code's own
    // terms, so the next person does not read the empty set as a bug.
    expect(g.anchorSet.emptyReason).toMatch(/before any business context exists/)

    // ⚠️ COUNTED, NOT ASSUMED. An empty set produced by running six queries and throwing the answers
    // away would pass every assertion above.
    expect(getRevenueSnapshot).not.toHaveBeenCalled()
    expect(getRevenueForRange).not.toHaveBeenCalled()
    expect(dbCalls).toEqual([])
  })

  it('⚠️ A FAILED QUERY IS IN THE SET AS ran:false WITH THE THROWN MESSAGE — NOT DROPPED', async () => {
    getRevenueSnapshot.mockRejectedValue(new Error('getRevenueSnapshot(bid, 2026-10-05): JWT expired'))

    const g = await groundingHandedTo('council', 'how are we doing this week?')
    const failed = g.anchorSet.queries.find(q => q.name === 'revenue_today')

    expect(failed).toMatchObject({ ran: false, rows: null })
    expect(failed?.note).toContain('JWT expired')
    expect(failed?.anchors).toEqual([])
    // The other five still ran. A set that collapses on one failure silently un-anchors the whole
    // answer, which is how the verifier one stage later starts refusing honest figures.
    expect(g.anchorSet.queries.filter(q => q.ran)).toHaveLength(5)
    expect(g.anchorSet.figures.some(f => f.label === 'Completed sales, today.')).toBe(false)
    expect(g.anchorSet.emptyReason).toBeNull()
  })

  it('⚠️ AN UNSET WEEKLY TARGET IS ABSENT, NEVER ZERO — GROUNDING-TEETH', async () => {
    weeklyTarget = null

    const g = await groundingHandedTo('council', 'how are we doing this week?')
    const target = g.anchorSet.queries.find(q => q.name === 'weekly_revenue_target')

    expect(target).toMatchObject({ ran: true })
    expect(target?.anchors).toEqual([])
    expect(target?.note).toMatch(/no weekly revenue target/)
    // A 0 anchor here is what lets "you are at 0% of target" past the verifier as grounded.
    expect(g.anchorSet.figures.some(f => f.label === 'Your weekly revenue target.')).toBe(false)
    expect(g.anchorSet.figures.some(f => f.value === 0)).toBe(false)
  })

  it('⚠️ THE STAGE RUNS ONCE PER TURN — the turn record must not re-ground and double every query', async () => {
    await groundingHandedTo('council', 'how are we doing this week?')
    expect(getRevenueSnapshot).toHaveBeenCalledTimes(1)
    expect(getRevenueForRange).toHaveBeenCalledTimes(2)
    expect(dbCalls.filter(c => c === 'pos_customers:count:all')).toHaveLength(1)
    expect(dbCalls.filter(c => c === 'pos_customers:count:consented')).toHaveLength(1)
    expect(dbCalls.filter(c => c === 'businesses:maybeSingle')).toHaveLength(1)
  })

  it('an admission gate leaves with an empty-but-present set too — no stage is skipped', async () => {
    let kind: string | null = null
    await runTurn(ENV(), {
      registry: {},
      beforeParse: async () => makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429),
      parse: async () => PARSED(),
      onRecord: r => { kind = r.groundingKind },
    })
    expect(kind).toBe('none')
    // A gate must never pay for an anchor query — it answered before the classifiers ran.
    expect(getRevenueSnapshot).not.toHaveBeenCalled()
    expect(dbCalls).toEqual([])
  })
})

describe('emptyAnchorSet refuses to be silent', () => {
  it('throws rather than return an unexplained empty set', async () => {
    const { emptyAnchorSet } = await import('./anchors')
    expect(() => emptyAnchorSet('  ')).toThrow(/needs a reason/)
    expect(emptyAnchorSet('no figures on a navigation answer')).toEqual({
      figures: [], queries: [], emptyReason: 'no figures on a navigation answer',
    })
  })
})
