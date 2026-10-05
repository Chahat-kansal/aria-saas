import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18 · BRAIN-2 PHASE 3 — THE SEVENTH SILENT CATCH, NARROWED.
 *
 * The anchor region of `answer-council.ts` had ONE `catch` around ~245 lines: all eighteen
 * ground-truth queries, `anchorValues`, and `turnProvenance = buildProvenance(...)`. A Supabase
 * outage and a `.toFixed()` on an unexpected shape produced the identical log line and the identical
 * outcome — no anchors, `provenance: null`, every figure untierable. That is M3's 0-of-288 missing
 * tiers and S6's live finding of a real turn with no provenance, with a cause nothing recorded.
 *
 * ⚠️ THESE TESTS DRIVE THE REAL `councilStrategy`. Not the regex, not the import — the lane. Each one
 * breaks a DIFFERENT half of the region and asserts that the two are now told apart, because "it is
 * narrower" is not observable and "it says which half failed" is.
 */

const getBusinessContext = vi.fn()
const buildFactsPacket = vi.fn()
const runAriaCouncil = vi.fn()
const logAICallSafe = vi.fn(async (..._a: unknown[]) => true)
const upsertConversation = vi.fn(async (..._a: unknown[]) => 'conv-1')
const computeHealthSignals = vi.fn(async (..._a: unknown[]) => null)
const errors: string[] = []

/** When true, every ground-truth read rejects — the Supabase-outage half. */
let queriesThrow = false
/** When true, the reads succeed and return a shape the arithmetic cannot handle — the other half. */
let poisonShape = false

vi.mock('@/lib/aria/get-business-context', () => ({ getBusinessContext: (...a: unknown[]) => getBusinessContext(...a) as unknown }))
vi.mock('@/lib/aria/ask/facts-packet', () => ({ buildFactsPacket: (...a: unknown[]) => buildFactsPacket(...a) as unknown }))
vi.mock('@/lib/aria/answer-council', () => ({ runAriaCouncil: (...a: unknown[]) => runAriaCouncil(...a) as unknown }))
vi.mock('@/lib/aria/log-ai-call', () => ({ logAICallSafe: (...a: unknown[]) => logAICallSafe(...a) as unknown }))
vi.mock('../pipeline/turn-persistence', () => ({ upsertConversation: (...a: unknown[]) => upsertConversation(...a) as unknown }))
vi.mock('@/lib/aria/health-signals', () => ({ computeHealthSignals: (...a: unknown[]) => computeHealthSignals(...a) as unknown }))
vi.mock('@/lib/aria/goal-context', () => ({ computeGoalContext: async () => null }))
vi.mock('@/lib/aria/open-loops', () => ({ getOpenLoops: async () => [] }))
vi.mock('@/lib/aria/benchmark-context', () => ({ computeBenchmarkContext: async () => null }))
vi.mock('@/lib/aria/hypothesis-context', () => ({ computeHypothesisContext: async () => null }))
vi.mock('@/lib/aria/memory/extract', () => ({ extractAndStoreMemories: async () => {} }))
vi.mock('@/lib/aria/memory/summarize', () => ({ summariseConversation: async () => {} }))
vi.mock('@/lib/aria/response-validator', () => ({
  validateAndHeal: async (args: { text: string }) => ({ text: args.text, healed: false, healReason: null, blocks: null }),
}))

vi.mock('@/lib/supabase-admin', () => {
  const make = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'order', 'limit', 'ilike', 'neq', 'is', 'not']) self[m] = () => self
    const payload = () => {
      if (queriesThrow) throw new Error('ECONNRESET reading pos_sales')
      // ⚠️ THE POISON IS A VALUE, NOT A THROW. A malformed `created_at` sails through the query layer
      // and detonates in the 56-day bucketing loop (`new Date('nope').toISOString()` throws
      // RangeError) — precisely the class of fault the old single catch made indistinguishable from
      // a Supabase outage.
      if (poisonShape) return { data: [{ total_amount: 10, created_at: 'not-a-date', sale_id: 's1', total_spent: 5 }], count: 3, error: null }
      return { data: [{ total_amount: 10, created_at: new Date().toISOString(), sale_id: 's1', total_spent: 5 }], count: 3, error: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.then = (res: any, rej: any) => { try { return Promise.resolve(payload()).then(res, rej) } catch (e) { return Promise.reject(e).then(res, rej) } }
    self.maybeSingle = async () => payload()
    return self
  }
  return { supabaseAdmin: { from: () => make() } }
})

const { councilStrategy } = await import('./answer-council')

const ARGS = () => ({
  input: {
    req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
    bid: 'ff5055a0-c351-4ada-817a-1804961035f3', userId: 'u1', supabase: {} as never,
    message: 'how are we doing this week?', conversationId: null, attachments: [], clientMessages: [],
    noticeRef: null, branchIntent: { mode: 'append' as const },
  },
  understanding: {
    message: 'how are we doing this week?',
    intent: { type: 'question', complexity: 'complex', confidence: 0.9 },
    ariaIntent: { intent_type: 'analytical' },
    outputFmt: {}, features: {}, firedFeatures: [], hasAttachments: false, hasImages: false, hasConversation: false,
  },
  grounding: { kind: 'council' as const, bizCtx: '', augCtx: '', anchors: [], provenance: null, anchorSet: { figures: [], queries: [], emptyReason: 'n/a' } },
  strategy: { name: 'council' as const, reason: 'isStrategicQuestion', firedFeatures: [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

beforeEach(() => {
  errors.length = 0
  queriesThrow = false
  poisonShape = false
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
  // ⚠️ MUST EXCEED 50 CHARACTERS. `answer-council.ts:88` treats a shorter context as "not enough data
  // for a strategic read" and returns from an EARLIER exit that never reaches the anchor region at
  // all. My first version was 44 characters, and all four assertions below failed against the wrong
  // return — a reminder that a lane test has to clear the lane's own guards to be testing the lane.
  getBusinessContext.mockReset().mockResolvedValue(JSON.stringify({
    business_name: 'Sip Cafe', revenue_today: 22.5, revenue_week: 310.5, customers: 240, outlets: 1,
  }))
  buildFactsPacket.mockReset().mockResolvedValue({ facts: [] })
  logAICallSafe.mockClear()
  runAriaCouncil.mockReset().mockResolvedValue({
    final_briefing: 'You are tracking steadily this week.',
    ask_followups: [], advisors_lost: [], ask_blocks: null, served_from_cache: false,
  })
})

/** Every `council_anchors` row the lane wrote — the countable half of the report. */
function anchorAudits() {
  return logAICallSafe.mock.calls
    .map(c => c[0] as Record<string, unknown>)
    .filter(r => r?.agent_key === 'council_anchors')
}

describe('M18 phase 3 · the anchor region reports WHICH half failed', () => {
  it('⚠️ A HEALTHY TURN DEGRADES NOTHING — anti-vacuity for every assertion below', () => {
    // If `anchors_degraded` were always populated, or the audit always written, the two tests after
    // this one would prove nothing at all.
    return councilStrategy(ARGS()).then(result => {
      expect(result).not.toBeNull()
      expect(result!.body.anchors_degraded).toEqual([])
      expect(anchorAudits()).toHaveLength(0)
      // The field is PRESENT and empty, never omitted — the `advisors_lost` contract.
      expect(Object.prototype.hasOwnProperty.call(result!.body, 'anchors_degraded')).toBe(true)
    })
  })

  it('⚠️ A FAILED QUERY is named `ground_truth_queries`, carries the thrown error, and is COUNTABLE', async () => {
    queriesThrow = true

    const result = await councilStrategy(ARGS())

    // Non-fatal, exactly as before: the council still answers.
    expect(result).not.toBeNull()
    expect(result!.body.response).toContain('tracking steadily')
    expect(result!.body.anchors_degraded).toEqual(['ground_truth_queries'])
    // `provenance: null` is the consequence the owner feels — no figure in this answer can be tiered.
    expect(result!.body.provenance).toBeNull()

    // The thrown error travels, rather than "something went wrong".
    expect(errors.join(' ')).toContain('ECONNRESET')
    expect(errors.join(' ')).toContain('QUERIES failed')

    // ⚠️ COUNTABLE, not just logged. A console line is a line nobody greps; this row makes "how often
    // do the council's anchors fail" a query. role/provider are CHECK-legal or the insert is a silent
    // rejection — the exact failure mode that had whole agent_keys writing zero rows for weeks.
    const audits = anchorAudits()
    expect(audits).toHaveLength(1)
    expect(audits[0]!.success).toBe(false)
    expect(audits[0]!.role).toBe('analysis')
    expect(audits[0]!.provider).toBe('other')
    expect(String(audits[0]!.error_message)).toContain('ECONNRESET')
    expect(String(audits[0]!.response_summary)).toContain('ground_truth_queries')
  })

  it('⚠️ REPORTED ONCE, NOT TWICE — narrowing must not turn one outage into two faults', async () => {
    queriesThrow = true
    await councilStrategy(ARGS())

    // The sentinel exists for this. Before it, the inner `.catch()` logged and then the throw it
    // raised to skip the arithmetic was caught by the outer handler, which logged again — and two
    // lines for one outage reads, to whoever greps next, as two separate problems.
    expect(anchorAudits()).toHaveLength(1)
    expect(errors.filter(e => e.includes('council ground-truth QUERIES failed'))).toHaveLength(1)
    expect(errors.filter(e => e.includes('DERIVATION failed'))).toHaveLength(0)
  })

  it('⚠️ A FAILED DERIVATION is named `anchor_derivation` — a DIFFERENT fault from an outage', async () => {
    // The reads return cleanly and the arithmetic over them throws. Under the old single catch this
    // was word-for-word indistinguishable from the test above.
    // `computeHealthSignals` cannot be used for this: it sits INSIDE the `Promise.all` behind its own
    // `.catch(() => null)`, so a throw there never reaches the derivation. The poison has to be a
    // value the queries return successfully.
    poisonShape = true

    const result = await councilStrategy(ARGS())

    expect(result).not.toBeNull()
    expect(result!.body.anchors_degraded).toEqual(['anchor_derivation'])
    expect(result!.body.anchors_degraded).not.toEqual(['ground_truth_queries'])
    const audits = anchorAudits()
    expect(audits).toHaveLength(1)
    expect(String(audits[0]!.response_summary)).toContain('anchor_derivation')
    // The message says the queries were FINE, which is the whole point of splitting them.
    expect(errors.join(' ')).toContain('the queries returned fine')
  })
})
