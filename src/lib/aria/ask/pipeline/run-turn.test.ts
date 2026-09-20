import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'

/**
 * M17 PHASE 2 — THE SPINE, DRIVEN BY RUNNING IT.
 *
 * ⚠️ Every assertion CALLS a stage function or `runTurn` itself. Nothing here asserts that a module
 * imports another module.
 *
 * The two classifiers are mocked because they are network calls; ⚠️ THEY ARE STILL BOTH CALLED, and
 * one test asserts exactly that — the pair being unreconciled is the fault M19 fixes, and a spine
 * that quietly dropped one would have changed behaviour while claiming not to.
 */

const classifyIntent = vi.fn()
const classifyAriaIntent = vi.fn()
const detectOutputFormat = vi.fn((..._a: unknown[]) =>
  ({ wants_download: false, wants_chart: false, wants_table: false, wants_comparison: false }))

vi.mock('@/lib/aria/ask/intent', () => ({
  classifyIntent: (...a: unknown[]) => classifyIntent(...a) as unknown,
  detectOutputFormat: (...a: unknown[]) => detectOutputFormat(...a) as unknown,
}))
vi.mock('@/lib/aria/ask/aria-intent', () => ({
  classifyAriaIntent: (...a: unknown[]) => classifyAriaIntent(...a) as unknown,
}))

const { understand, decide, ground, act, verify, runTurn, assertRegistryComplete } = await import('./run-turn')
const { LANE_NAMES, makeTurnResult } = await import('./types')
type LaneName = (typeof LANE_NAMES)[number]

const INTENT = (over: Partial<ClassifiedIntent> = {}) =>
  ({ type: 'question', complexity: 'simple', confidence: 0.9, ...over }) as ClassifiedIntent
const ARIA = (over: Partial<AriaIntent> = {}) =>
  ({ intent_type: 'analytical', comparison_period: null, routing_reason: 'r', ...over }) as AriaIntent

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INPUT = (over: Record<string, any> = {}) => ({
  req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
  bid: 'b1',
  userId: 'u1',
  supabase: {} as never,
  message: 'hello',
  conversationId: null,
  attachments: [],
  clientMessages: [],
  noticeRef: null,
  branchIntent: { mode: 'append' as const },
  ...over,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

async function understandingFor(message: string, intent = INTENT(), aria = ARIA(), over = {}) {
  classifyIntent.mockResolvedValue(intent)
  classifyAriaIntent.mockResolvedValue(aria)
  return understand(INPUT({ message, ...over }))
}

beforeEach(() => {
  classifyIntent.mockReset()
  classifyAriaIntent.mockReset()
})

describe('M17 phase 2 · stage 1 — understand', () => {
  it('⚠️ RUNS BOTH CLASSIFIERS, unreconciled, exactly as _POST does today', async () => {
    const u = await understandingFor('why are margins down')
    expect(classifyIntent).toHaveBeenCalledTimes(1)
    expect(classifyAriaIntent).toHaveBeenCalledTimes(1)
    // Both outputs survive side by side. M19 is the sprint that replaces the pair.
    expect(u.intent.type).toBe('question')
    expect(u.ariaIntent.intent_type).toBe('analytical')
  })

  it('passes businessId to BOTH classifiers so neither call goes unlogged (M12 phase 5)', async () => {
    await understandingFor('hello')
    expect(classifyIntent).toHaveBeenCalledWith('hello', undefined, 'b1')
    expect(classifyAriaIntent).toHaveBeenCalledWith('hello', 'b1')
  })

  it('computes the features and lists the ones that fired', async () => {
    const u = await understandingFor('why are my margins down')
    expect(u.features.isStrategicQuestion).toBe(true)
    expect(u.firedFeatures).toContain('isStrategicQuestion')
  })
})

describe('M17 phase 2 · stage 3 — decide reproduces the waterfall', () => {
  it('⚠️ ALWAYS ends with main — the only lane that never declines', async () => {
    for (const msg of ['hello', 'why are margins down', 'create a 10% off promo', 'who is my best customer']) {
      const u = await understandingFor(msg)
      const c = decide(u, INPUT({ message: msg }))
      expect(c[c.length - 1]!.name, msg).toBe('main')
    }
  })

  /**
   * ⚠️ REWRITTEN IN M17B PHASE 2, NOT DELETED. It used to assert that `decide()` short-circuits to a
   * single `save_plan` candidate. It no longer offers `save_plan` AT ALL, and that is the fix:
   * route.ts:372 runs the sentinel BEFORE the spend gates (403) and BEFORE the classifiers (447).
   * Offering it from `decide()` means `understand()` has already run — so a UI sentinel that makes
   * no model call would have paid for two classifier calls, and could have been refused by a budget
   * it never spends. It runs as `RunTurnOptions.savePlanGate` instead; see the runTurn block below.
   */
  it('⚠️ save_plan is NOT a candidate — it is a gate that runs before the classifiers', async () => {
    const u = await understandingFor('[ARIA_SAVE_PLAN]')
    const c = decide(u, INPUT({ message: '[ARIA_SAVE_PLAN]', conversationId: 'c1' }))
    expect(c.map(x => x.name)).not.toContain('save_plan')
    // The feature still fires; nothing at this point reads it.
    expect(u.features.isSavePlan).toBe(true)
  })

  it('a strategic question offers the council BEFORE main, and says why', async () => {
    const u = await understandingFor('how can I improve margins?')
    const c = decide(u, INPUT({ message: 'how can I improve margins?' }))
    const names = c.map(x => x.name)
    expect(names).toContain('council')
    expect(names.indexOf('council')).toBeLessThan(names.indexOf('main'))
    expect(c.find(x => x.name === 'council')!.reason).toBe('isStrategicQuestion')
  })

  it('⚠️ the brevity and data-lookup gates keep a short factual question OUT of the council', async () => {
    for (const msg of ["what's my revenue today", 'who is my best customer']) {
      const u = await understandingFor(msg)
      expect(decide(u, INPUT({ message: msg })).map(x => x.name), msg).not.toContain('council')
    }
  })

  it('the general lane fires when EITHER classifier says so — the OR that M19 removes', async () => {
    const viaIntent = await understandingFor('hi', INTENT({ type: 'general' }), ARIA({ intent_type: 'analytical' }))
    expect(decide(viaIntent, INPUT()).find(x => x.name === 'general')!.reason).toBe('classifyIntent=general')

    const viaAria = await understandingFor('hi', INTENT({ type: 'question' }), ARIA({ intent_type: 'smalltalk' }))
    expect(decide(viaAria, INPUT()).find(x => x.name === 'general')!.reason).toBe('classifyAriaIntent=smalltalk')
  })

  it('a coreferential follow-up is kept OFF the general lane (the "what does she buy" bug)', async () => {
    const msg = 'what does she buy'
    const u = await understandingFor(msg, INTENT({ type: 'general' }), ARIA({ intent_type: 'general' }), { conversationId: 'c1' })
    const c = decide(u, INPUT({ message: msg, conversationId: 'c1' }))
    expect(c.map(x => x.name)).not.toContain('general')
  })

  it('the nav fast-path stays OFF unless NAV_FASTPATH=1 — env-gated, as in production', async () => {
    const msg = 'where is the roster'
    const u = await understandingFor(msg)
    const before = process.env.NAV_FASTPATH
    try {
      delete process.env.NAV_FASTPATH
      expect(decide(u, INPUT({ message: msg })).map(x => x.name)).not.toContain('nav_fastpath')
      process.env.NAV_FASTPATH = '1'
      expect(decide(u, INPUT({ message: msg })).map(x => x.name)).toContain('nav_fastpath')
    } finally {
      if (before === undefined) delete process.env.NAV_FASTPATH
      else process.env.NAV_FASTPATH = before
    }
  })

  it('every candidate names a REAL lane', async () => {
    const u = await understandingFor('why are margins down')
    for (const c of decide(u, INPUT())) {
      expect(LANE_NAMES as readonly string[]).toContain(c.name)
      expect(c.reason.length).toBeGreaterThan(0)
    }
  })

  it('⚠️ image / stopped / total_outage are NEVER candidates — they are sub-exits of main', async () => {
    // The image fast-path is route.ts:2362, AFTER buildAskAriaContext() at 1517 (19 DB queries),
    // and never reads ctx. Offering it ahead of main would render a byte-identical body while
    // skipping those queries — phase 6 would report "no diff" and it would still be a change.
    const msg = 'make me a poster for the weekend'
    const u = await understandingFor(msg)
    expect(u.features.isImageRequest).toBe(true)          // the feature still fires…
    const names = decide(u, INPUT({ message: msg })).map(x => x.name)
    expect(names).not.toContain('image')                  // …but it does not become a lane here
    expect(names).not.toContain('stopped')
    expect(names).not.toContain('total_outage')
    expect(names[names.length - 1]).toBe('main')
  })

  it('the admission lanes are never candidates either — they are stage 0', async () => {
    const u = await understandingFor('hello')
    const names = decide(u, INPUT()).map(x => x.name)
    for (const admissionLane of ['rate_limited_user', 'rate_limited_minute', 'cost_guard_blocked', 'cost_ceiling', 'bad_request'] as const) {
      expect(names, admissionLane).not.toContain(admissionLane)
    }
  })
})

describe('M17 phase 2 · stage 2 — ground', () => {
  it('reports the kind each lane actually loads today — including none', async () => {
    const u = await understandingFor('hello')
    const g = (name: LaneName) => ground(INPUT(), u, { name, reason: 'r', firedFeatures: [] })
    expect(g('council').kind).toBe('council')
    expect(g('main').kind).toBe('full')
    // ⚠️ Not an aspiration: the general lane and the fast paths load NOTHING today.
    expect(g('general').kind).toBe('none')
    expect(g('save_plan').kind).toBe('none')
    expect(g('action_planner').kind).toBe('none')
  })
})

describe('M17 phase 2 · stage 4 — act walks the waterfall', () => {
  const ok = (lane: LaneName) => async () => makeTurnResult(lane, { response: lane })
  const declines = async () => null

  it('takes the FIRST candidate that produces a result', async () => {
    const u = await understandingFor('hello')
    const out = await act(
      [{ name: 'council', reason: 'r', firedFeatures: [] }, { name: 'main', reason: 'r', firedFeatures: [] }],
      { council: ok('council'), main: ok('main') }, INPUT(), u,
    )
    expect(out.chosen.name).toBe('council')
    expect(out.result.text).toBe('council')
    expect(out.declined).toEqual([])
  })

  it('⚠️ A LANE THAT DECLINES FALLS THROUGH — the try/catch shape _POST uses seven times', async () => {
    const u = await understandingFor('hello')
    const out = await act(
      [
        { name: 'pending_action', reason: 'r', firedFeatures: [] },
        { name: 'inventory_agent', reason: 'r', firedFeatures: [] },
        { name: 'main', reason: 'r', firedFeatures: [] },
      ],
      { pending_action: declines, inventory_agent: declines, main: ok('main') }, INPUT(), u,
    )
    expect(out.chosen.name).toBe('main')
    expect(out.result.text).toBe('main')
    // The waterfall, recorded as a value instead of implied by where a `return` sits.
    expect(out.declined).toEqual(['pending_action', 'inventory_agent'])
  })

  it('throws LOUDLY for an unregistered lane rather than answering with nothing', async () => {
    const u = await understandingFor('hello')
    await expect(act([{ name: 'council', reason: 'r', firedFeatures: [] }], {}, INPUT(), u))
      .rejects.toThrow(/no strategy registered for lane "council"/)
  })

  it('throws LOUDLY if every lane declines — a blank answer is never acceptable', async () => {
    const u = await understandingFor('hello')
    await expect(act([{ name: 'main', reason: 'r', firedFeatures: [] }], { main: declines }, INPUT(), u))
      .rejects.toThrow(/every lane declined/)
  })

  it('assertRegistryComplete names the missing lanes — all 20 when empty', async () => {
    expect(assertRegistryComplete({}, LANE_NAMES)).toHaveLength(20)
    expect(assertRegistryComplete({ main: ok('main') }, LANE_NAMES)).not.toContain('main')
    const full = Object.fromEntries(LANE_NAMES.map(l => [l, ok(l)]))
    expect(assertRegistryComplete(full, LANE_NAMES)).toEqual([])
  })
})

describe('M17 phase 2 · stage 5 — verify', () => {
  it('⚠️ IS A PASS-THROUGH IN M17, AND SAYS SO IN THE VALUE', () => {
    const r = makeTurnResult('main', { response: 'x' })
    const v = verify(r)
    expect(v.result).toBe(r)
    expect(v.verified.ran).toBe(false)
    // A not-run verdict with no reason would be the same silence in a new place.
    expect(v.verified.ran === false && v.verified.reason).toMatch(/M18/)
  })
})

/**
 * ⚠️ REWRITTEN IN M17B PHASE 2, NOT DELETED.
 *
 * `runTurn` took `(input, { registry, admit })`. It now takes `(envelope, { registry, beforeParse,
 * parse, afterParse, savePlanGate, spendGates, registry })`, because wiring the real route showed
 * that a single `admit()` before `understand()` would have silently changed two behaviours:
 *
 *   · the per-user rate limit runs BEFORE the body is read (route.ts:316 vs the parse at 330), so a
 *     flood costs one Redis read rather than a multipart parse of up to five attachments;
 *   · `save_plan` runs BEFORE the spend gates and BEFORE the classifiers (route.ts:372 vs 403/447),
 *     so an owner over the daily AI budget can still save a plan — it makes no model call — and a
 *     UI sentinel never pays for two classifier calls.
 *
 * NEITHER WOULD HAVE APPEARED IN A REPLAY THAT ONLY COMPARES RENDERED JSON. The assertions below
 * are what hold them.
 */
const PARSED = (over: Record<string, unknown> = {}) => ({
  message: 'hello', conversationId: null, attachments: [], clientMessages: [],
  noticeRef: null, branchIntent: { mode: 'append' as const }, ...over,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ENV = (over: Record<string, any> = {}) => ({
  req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
  bid: 'b1', userId: 'u1', supabase: {} as never, ...over,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

describe('M17B phase 2 · runTurn — the whole order, in one place', () => {
  it('renders the lane body VERBATIM and with its status', async () => {
    classifyIntent.mockResolvedValue(INTENT())
    classifyAriaIntent.mockResolvedValue(ARIA())
    const body = { blocks: [], followups: [], used_council: true, response: 'answer', conversation_id: 'c1' }
    const res = await runTurn(ENV(), {
      registry: { council: async () => makeTurnResult('council', body) },
      parse: async () => PARSED({ message: 'why are margins down' }),
    })
    expect(res.status).toBe(200)
    expect(JSON.stringify(await res.json())).toBe(JSON.stringify(body))
  })

  it('⚠️ THE PER-USER LIMIT RUNS BEFORE THE BODY IS EVEN PARSED', async () => {
    // The reason beforeParse exists at all: a flood must cost one Redis read, not a multipart parse.
    const parse = vi.fn(async () => PARSED())
    const res = await runTurn(ENV(), {
      registry: {},
      beforeParse: async () => makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429),
      parse,
    })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Try again later.' })
    expect(parse, 'the body must not be read for a rate-limited request').not.toHaveBeenCalled()
    expect(classifyIntent).not.toHaveBeenCalled()
    expect(classifyAriaIntent).not.toHaveBeenCalled()
  })

  it('⚠️ SAVE-PLAN RUNS BEFORE THE SPEND GATES — an owner over budget can still save a plan', async () => {
    const spendGates = vi.fn(async () => makeTurnResult('cost_ceiling', { error: 'budget_exceeded' }, 402))
    const res = await runTurn(ENV(), {
      registry: {},
      parse: async () => PARSED({ message: '[ARIA_SAVE_PLAN]', conversationId: 'c1' }),
      savePlanGate: async () => makeTurnResult('save_plan', { response: 'Plan saved: "x".', intent: 'plan_saved' }),
      spendGates,
    })
    expect(res.status).toBe(200)
    expect((await res.json()).intent).toBe('plan_saved')
    // If the spend gates ran first this would be a 402 and the free action would be refused.
    expect(spendGates, 'the spend gates must not run before the save-plan sentinel').not.toHaveBeenCalled()
  })

  it('⚠️ SAVE-PLAN NEVER PAYS FOR THE TWO CLASSIFIER CALLS', async () => {
    await runTurn(ENV(), {
      registry: {},
      parse: async () => PARSED({ message: '[ARIA_SAVE_PLAN]', conversationId: 'c1' }),
      savePlanGate: async () => makeTurnResult('save_plan', { response: 'Plan saved.', intent: 'plan_saved' }),
    })
    expect(classifyIntent).not.toHaveBeenCalled()
    expect(classifyAriaIntent).not.toHaveBeenCalled()
  })

  it('the gates run in route.ts order, and the first one to answer wins', async () => {
    const order: string[] = []
    classifyIntent.mockResolvedValue(INTENT())
    classifyAriaIntent.mockResolvedValue(ARIA())
    await runTurn(ENV(), {
      registry: {
        // 'hello' with ariaIntent=analytical offers council before main; register both so the
        // assertion is about ORDER, not about a missing lane.
        council: async () => { order.push('council'); return null },
        main: async () => { order.push('main'); return makeTurnResult('main', { response: 'x' }) },
      },
      beforeParse: async () => { order.push('beforeParse'); return null },
      parse: async () => { order.push('parse'); return PARSED() },
      afterParse: () => { order.push('afterParse'); return null },
      savePlanGate: async () => { order.push('savePlanGate'); return null },
      spendGates: async () => { order.push('spendGates'); return null },
    })
    expect(order).toEqual(['beforeParse', 'parse', 'afterParse', 'savePlanGate', 'spendGates', 'council', 'main'])
  })

  it('a bad request is refused after the parse and before anything is spent', async () => {
    const spendGates = vi.fn(async () => null)
    const res = await runTurn(ENV(), {
      registry: {},
      parse: async () => PARSED({ message: '' }),
      afterParse: () => makeTurnResult('bad_request', { error: 'message or file required' }, 400),
      spendGates,
    })
    expect(res.status).toBe(400)
    expect(spendGates).not.toHaveBeenCalled()
    expect(classifyIntent).not.toHaveBeenCalled()
  })

  it('emits a turn record naming the lane, the reason, the features and the grounding kind', async () => {
    classifyIntent.mockResolvedValue(INTENT())
    classifyAriaIntent.mockResolvedValue(ARIA())
    const records: unknown[] = []
    await runTurn(ENV(), {
      registry: { council: async () => makeTurnResult('council', { response: 'x' }) },
      parse: async () => PARSED({ message: 'how can I improve margins?' }),
      onRecord: r => records.push(r),
    })
    expect(records).toHaveLength(1)
    const rec = records[0] as Record<string, unknown>
    expect(rec.lane).toBe('council')
    expect(rec.reason).toBe('isStrategicQuestion')
    expect(rec.groundingKind).toBe('council')
    expect(rec.firedFeatures).toContain('isStrategicQuestion')
    expect(rec.verified).toEqual({ ran: false, reason: expect.stringContaining('M18') })
    expect(typeof rec.totalMs).toBe('number')
  })

  it('a gate record names WHICH gate answered, and says it beat the classifiers', async () => {
    const records: unknown[] = []
    await runTurn(ENV(), {
      registry: {},
      spendGates: async () => makeTurnResult('cost_ceiling', { error: 'budget_exceeded' }, 402),
      parse: async () => PARSED(),
      onRecord: r => records.push(r),
    })
    const rec = records[0] as Record<string, unknown>
    expect(rec.lane).toBe('cost_ceiling')
    expect(rec.status).toBe(402)
    expect(rec.intentType).toBe('n/a')
    expect(rec.reason).toMatch(/admission \(spend\)/)
    expect(rec.reason).toMatch(/before the classifiers ran/)
  })
})
