import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'

/**
 * M17B PHASE 3 — THE TURN RECORD, DRIVEN BY RUNNING A TURN.
 *
 * ⚠️ These assertions do not construct a `TurnRecord` and inspect it. They run `runTurn()` with a
 * registry whose lanes DECLINE, and read the record the spine emits — because the thing worth
 * holding is that the record reflects what actually happened, not that a shape can be built.
 *
 * The question this exists to answer has never been answerable before: **why did this message go to
 * that lane, and what else was offered first?**
 */

const classifyIntent = vi.fn()
const classifyAriaIntent = vi.fn()
const logAICallSafe = vi.fn(async (..._a: unknown[]) => true)

vi.mock('@/lib/aria/ask/intent', () => ({
  classifyIntent: (...a: unknown[]) => classifyIntent(...a) as unknown,
  detectOutputFormat: () => ({ wants_download: false, wants_chart: false, wants_table: false, wants_comparison: false }),
}))
vi.mock('@/lib/aria/ask/aria-intent', () => ({
  classifyAriaIntent: (...a: unknown[]) => classifyAriaIntent(...a) as unknown,
}))
vi.mock('@/lib/aria/log-ai-call', () => ({
  logAICallSafe: (...a: unknown[]) => logAICallSafe(...a) as unknown,
}))

const { runTurn } = await import('./run-turn')
const { makeTurnResult } = await import('./types')
const { recordTurn, turnRecordRow } = await import('./turn-record')
import type { TurnRecord } from './types'

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

beforeEach(() => {
  classifyIntent.mockReset().mockResolvedValue(INTENT())
  classifyAriaIntent.mockReset().mockResolvedValue(ARIA())
  logAICallSafe.mockClear()
})

describe('M17B phase 3 · the turn record', () => {
  it('⚠️ NAMES THE STRATEGY AND THE CANDIDATES THAT DECLINED — the question nobody could answer', async () => {
    const records: TurnRecord[] = []
    await runTurn(ENV(), {
      registry: {
        // A strategic question offers the council first; make it decline, as it does in production
        // when the council fails or returns no briefing.
        council: async () => null,
        main: async () => makeTurnResult('main', { response: 'answered by the main loop' }),
      },
      parse: async () => PARSED({ message: 'how can I improve margins?' }),
      onRecord: r => records.push(r),
    })

    expect(records).toHaveLength(1)
    const rec = records[0]!
    expect(rec.lane).toBe('main')
    // ⚠️ THE POINT: the council was offered, and declined, and the record says so.
    expect(rec.declined).toEqual(['council'])
    expect(rec.reason).toBe('no earlier lane claimed the turn')
    expect(rec.firedFeatures).toContain('isStrategicQuestion')
    expect(rec.businessId).toBe('ff5055a0-c351-4ada-817a-1804961035f3')
  })

  it('records an EMPTY declined list when the first candidate answers — not a missing one', async () => {
    // Anti-vacuity for the assertion above: if `declined` were always populated, or always absent,
    // it would carry no information.
    const records: TurnRecord[] = []
    await runTurn(ENV(), {
      registry: { council: async () => makeTurnResult('council', { response: 'x' }) },
      parse: async () => PARSED({ message: 'how can I improve margins?' }),
      onRecord: r => records.push(r),
    })
    expect(records[0]!.declined).toEqual([])
    expect(records[0]!.lane).toBe('council')
    expect(records[0]!.reason).toBe('isStrategicQuestion')
  })

  it('records the grounding kind, the verification verdict and per-stage timings', async () => {
    const records: TurnRecord[] = []
    await runTurn(ENV(), {
      registry: { council: async () => makeTurnResult('council', { response: 'x' }) },
      parse: async () => PARSED({ message: 'how can I improve margins?' }),
      onRecord: r => records.push(r),
    })
    const rec = records[0]!
    expect(rec.groundingKind).toBe('council')
    expect(rec.verified).toEqual({ ran: false, reason: expect.stringContaining('M18') })
    expect(Object.keys(rec.stageMs)).toEqual(expect.arrayContaining(['parse', 'understand', 'decide', 'act', 'verify']))
    expect(typeof rec.totalMs).toBe('number')
  })

  it('a gate decision is recorded too, and says it beat the classifiers', async () => {
    const records: TurnRecord[] = []
    await runTurn(ENV(), {
      registry: {},
      beforeParse: async () => makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429),
      parse: async () => PARSED(),
      onRecord: r => records.push(r),
    })
    const rec = records[0]!
    expect(rec.lane).toBe('rate_limited_user')
    expect(rec.status).toBe(429)
    expect(rec.intentType).toBe('n/a')
    expect(rec.reason).toMatch(/before the classifiers ran/)
    expect(rec.declined).toEqual([])
  })

  describe('the row it writes to aria_ai_calls', () => {
    const REC: TurnRecord = {
      businessId: 'b1', lane: 'main', reason: 'no earlier lane claimed the turn',
      declined: ['council', 'inventory_agent'], firedFeatures: ['isStrategicQuestion', 'isDataLookup'],
      intentType: 'question', ariaIntentType: 'analytical', complexity: 'simple',
      groundingKind: 'full', verified: { ran: false, reason: 'M18' }, status: 200,
      stageMs: { parse: 1, understand: 40, act: 900 }, totalMs: 950,
    }

    it('uses the canonical writer and only CHECK-legal role/provider values', () => {
      recordTurn(REC)
      expect(logAICallSafe).toHaveBeenCalledTimes(1)
      const row = logAICallSafe.mock.calls[0]![0] as unknown as Record<string, unknown>
      // aria_ai_calls.role and .provider carry CHECK constraints; an off-list value is a SILENT
      // rejected insert, which is how whole agent_keys wrote zero rows for weeks.
      expect(row.role).toBe('other')
      expect(row.provider).toBe('other')
      expect(row.agent_key).toBe('ask_aria_router')
      expect(row.business_id).toBe('b1')
      expect(row.latency_ms).toBe(950)
    })

    it('⚠️ the stored decision names the lane AND the declined candidates', () => {
      const row = turnRecordRow(REC)
      const decision = JSON.parse(row.response_summary) as Record<string, unknown>
      expect(decision.lane).toBe('main')
      expect(decision.declined).toEqual(['council', 'inventory_agent'])
      expect(decision.grounding).toBe('full')
      expect(decision.verified).toBe('not_run')
      expect(row.request_summary).toContain('main')
      expect(row.learning_signal).toBe('isStrategicQuestion,isDataLookup')
    })

    it('stays inside the summary columns it is written to', () => {
      const long: TurnRecord = {
        ...REC,
        declined: Array.from({ length: 40 }, (_, i) => 'council' as const),
        firedFeatures: Array.from({ length: 40 }, () => 'isStrategicQuestion' as const),
      }
      const row = turnRecordRow(long)
      expect(row.response_summary.length).toBeLessThanOrEqual(500)
      expect(row.request_summary.length).toBeLessThanOrEqual(200)
      expect(row.learning_signal.length).toBeLessThanOrEqual(100)
    })

    it('reports "none" rather than an empty string when nothing fired', () => {
      // An empty learning_signal reads as "not recorded"; "none" reads as "recorded, and it was none".
      expect(turnRecordRow({ ...REC, firedFeatures: [] }).learning_signal).toBe('none')
    })
  })
})
