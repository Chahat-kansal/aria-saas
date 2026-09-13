import { describe, it, expect } from 'vitest'
import {
  LANE_NAMES,
  makeTurnResult,
  withVerification,
  type LaneName,
  type TurnResult,
} from './types'

/**
 * M17 PHASE 1 — EVERY EXISTING RESPONSE SHAPE MAPS ONTO `TurnResult` LOSSLESSLY.
 *
 * ⚠️ EVERY ASSERTION CALLS `makeTurnResult`. None of them greps a source file or asserts that an
 * import exists — M13's own rail test asserted the import and not the function, and that is exactly
 * the shape of failure this repo keeps producing.
 *
 * The fixtures below are the **real bodies of all 28 exits** in src/app/api/aria/ask/route.ts, with
 * their **real key order**, extracted from the file rather than written from the sprint document.
 * Key order is load-bearing: `JSON.stringify` preserves insertion order, phase 3 must prove the
 * rendered body is identical byte-for-byte, and the 28 exits do NOT agree on an order — exit 1106
 * leads with `response, blocks, conversation_id` and exit 1475 leads with
 * `blocks, followups, used_council, advisors_lost, provenance`.
 */

/** One fixture per exit: the line it lives on, its lane, its status, its body in its own key order. */
const EXITS: Array<{ line: number; lane: LaneName; status: number; body: Record<string, unknown> }> = [
  { line: 317, lane: 'rate_limited_user', status: 429, body: { error: 'Rate limit exceeded. Try again later.' } },
  { line: 366, lane: 'bad_request', status: 400, body: { error: 'message or file required' } },
  { line: 399, lane: 'save_plan', status: 200, body: { response: 'Plan saved: "x".', conversation_id: 'c1', intent: 'plan_saved', action: { type: 'plan_saved' }, cost_usd_cents: 0 } },
  { line: 406, lane: 'cost_guard_blocked', status: 200, body: { response: '⚠️ over budget', blocked_by_cost_guard: true, current_spend: 120, daily_limit: 100 } },
  { line: 424, lane: 'rate_limited_minute', status: 429, body: { error: 'rate_limited', message: 'Aria can answer up to 20 questions per minute.', retry_after: 60 } },
  { line: 434, lane: 'cost_ceiling', status: 402, body: { error: 'budget_exceeded', message: 'Aria has used $5.00', spent: 5, ceiling: 5 } },
  { line: 468, lane: 'pending_action', status: 200, body: { response: 'Your action plan has expired', conversation_id: 'c1', intent: 'action_expired', action: null, cost_usd_cents: 0 } },
  { line: 505, lane: 'pending_action', status: 200, body: { response: '⚠️ This affects 40 items.', conversation_id: 'c1', intent: 'action_request', action: { action: 'mass_confirm', affected: 40 }, cost_usd_cents: 0 } },
  { line: 517, lane: 'pending_action', status: 200, body: { response: 'Action failed: nope', conversation_id: 'c1', intent: 'action_executed', action: { type: 'execution_result', ok: false }, cost_usd_cents: 0 } },
  { line: 599, lane: 'pending_action', status: 200, body: { response: 'Done — 3 items updated.', conversation_id: 'c1', intent: 'action_executed', action: { type: 'execution_result', ok: true }, blocks: [{ type: 'lead', content: 'Done' }], followups: [], used_council: true, cost_usd_cents: 0 } },
  { line: 633, lane: 'agent_composer', status: 200, body: { response: "Couldn't stage the agent", conversation_id: 'c1', intent: 'action_request', action: null, cost_usd_cents: 0 } },
  { line: 636, lane: 'agent_composer', status: 200, body: { response: "Here's the agent", conversation_id: 'c1', intent: 'action_request', action: { action: 'fork', planned: {}, propose_only: false }, cost_usd_cents: 0 } },
  { line: 705, lane: 'action_planner', status: 200, body: { response: "Couldn't stage the action", conversation_id: 'c1', intent: 'action_request', action: null, cost_usd_cents: 0 } },
  { line: 714, lane: 'action_planner', status: 200, body: { response: 'I can do X', conversation_id: 'c1', intent: 'action_request', action: { action: 'fork', planned: {}, propose_only: true }, cost_usd_cents: 0 } },
  { line: 730, lane: 'action_planner', status: 200, body: { response: 'I need details', conversation_id: 'c1', intent: 'action_request', action: null, cost_usd_cents: 0 } },
  { line: 760, lane: 'inventory_agent', status: 200, body: { response: 'PO ready', conversation_id: 'c1', intent: 'action_request', action: { action: 'fork', planned: {}, propose_only: false }, cost_usd_cents: 0 } },
  { line: 773, lane: 'inventory_agent', status: 200, body: { response: '4 items low', conversation_id: 'c1', intent: 'inventory', action: null, cost_usd_cents: 2, downloads: null, tool_calls: [], used_council: false, ai_mode: 'haiku', model_used: 'haiku' } },
  { line: 804, lane: 'nav_fastpath', status: 200, body: { response: 'Find it at /pos', conversation_id: 'c1', intent: 'navigation', action: null, cost_usd_cents: 0, used_council: false } },
  { line: 910, lane: 'general', status: 200, body: { response: 'Sure.', conversation_id: 'c1', intent: 'general', action: null, cost_usd_cents: 3, downloads: null, tool_calls: [{ name: 'web_search', ms: 900 }], blocks: undefined, used_council: false, ai_mode: 'haiku', model_used: 'haiku' } },
  { line: 942, lane: 'multi_domain', status: 200, body: { response: "Here's your full business overview", conversation_id: 'c1', intent: 'multi_domain', action: null, cost_usd_cents: 11, downloads: null, tool_calls: [], used_council: false, ai_mode: 'parallel', model_used: 'parallel' } },
  { line: 985, lane: 'deliverable', status: 200, body: { response: "Here's your chart:\n\n[DELIVERABLE:x]", conversation_id: 'c1', intent: 'deliverable', action: null, cost_usd_cents: 1, downloads: null, tool_calls: [], used_council: false, deliverable: { id: 'x', kind: 'chart', title: 'T', html: '<i/>' }, blocks: [{ type: 'lead', content: 'x' }], healed: undefined, heal_reason: undefined, served_by: 'deliverable' } },
  { line: 1042, lane: 'background_task', status: 200, body: { response: 'Working on it in the background', conversation_id: 'c1', intent: 'background_task', blocks: [{ type: 'task_plan', title: 'Working', steps: [] }], followups: [], used_council: false, cost_usd_cents: 0, downloads: null, action: null, tool_calls: [] } },
  { line: 1106, lane: 'council', status: 200, body: { response: "I don't have enough data yet", blocks: [{ type: 'lead', content: 'x' }], conversation_id: 'c1', intent: 'question', action: null, cost_usd_cents: 0, downloads: null, tool_calls: [], used_council: false } },
  { line: 1475, lane: 'council', status: 200, body: { blocks: [{ type: 'lead', content: 'x' }], followups: ['a'], used_council: true, advisors_lost: ['pricing'], provenance: { anchors: [22.5], anchorLabels: { '22.5': 'Completed sales, this week to date.' } }, response: 'Your week is…', conversation_id: 'c1', intent: 'question', action: null, cost_usd_cents: 0, downloads: null, tool_calls: [], served_by: 'council_fresh' } },
  { line: 2390, lane: 'image', status: 200, body: { response: "Here's your poster!", conversation_id: 'c1', intent: 'generate_image', downloads: [{ filename: 'poster.png', download_url: 'u', rows: 0, format: 'png' }] } },
  { line: 2470, lane: 'stopped', status: 200, body: { response: 'partial…', conversation_id: 'c1', intent: 'stopped', stopped: true, incomplete: true, blocks: null, followups: [] } },
  { line: 2536, lane: 'total_outage', status: 200, body: { response: "Aria's thinking cap is off", conversation_id: 'c1', intent: 'ai_outage', degraded_provider: true, total_outage: true, cached: true, note: 'Cached answer' } },
  { line: 2746, lane: 'main', status: 200, body: { response: 'You made $22.50.', conversation_id: 'c1', intent: 'question', action: null, cost_usd_cents: 7, downloads: null, tool_calls: [{ name: 'query_sales', ms: 120 }], blocks: undefined, used_council: false, ai_mode: 'haiku', model_used: 'haiku', sonnet_used_cents: 0, sonnet_budget_cents: 3000, sonnet_percent_used: 0, healed: undefined, heal_reason: undefined, served_by: 'main_brain', degraded_provider: undefined, degraded_via: undefined, note: undefined } },
]

describe('M17 phase 1 · the 28 exits map onto TurnResult losslessly', () => {
  it('there are exactly 28 exits, and the fixture set is all of them', () => {
    // Anti-vacuity: if someone trims the fixtures to make a later assertion pass, this fails first.
    expect(EXITS.length).toBe(28)
    expect(new Set(EXITS.map(e => e.line)).size).toBe(28)
  })

  it('covers all 20 lanes — no lane is left untested', () => {
    const covered = new Set(EXITS.map(e => e.lane))
    expect(LANE_NAMES.length).toBe(20)
    for (const lane of LANE_NAMES) expect(covered.has(lane), 'lane not covered by a fixture: ' + lane).toBe(true)
  })

  it('⚠️ THE BODY SURVIVES BYTE-FOR-BYTE — key order included', () => {
    // The whole reason `body` is carried verbatim instead of being re-composed from typed fields.
    for (const e of EXITS) {
      const before = JSON.stringify(e.body)
      const after = JSON.stringify(makeTurnResult(e.lane, e.body, e.status).body)
      expect(after, 'exit ' + e.line + ' body changed').toBe(before)
    }
  })

  it('⚠️ the key ORDER genuinely differs between exits — so the byte test above is not trivial', () => {
    // If every exit happened to agree on an order, the assertion above would prove nothing.
    const order1106 = Object.keys(EXITS.find(e => e.line === 1106)!.body)
    const order1475 = Object.keys(EXITS.find(e => e.line === 1475)!.body)
    expect(order1106[0]).toBe('response')
    expect(order1475[0]).toBe('blocks')
    expect(order1106).not.toEqual(order1475)
  })

  it('preserves the status code, including the four non-200s', () => {
    const byLine = new Map(EXITS.map(e => [e.line, makeTurnResult(e.lane, e.body, e.status)]))
    expect(byLine.get(317)!.status).toBe(429)
    expect(byLine.get(366)!.status).toBe(400)
    expect(byLine.get(424)!.status).toBe(429)
    expect(byLine.get(434)!.status).toBe(402)
    expect(byLine.get(2746)!.status).toBe(200)
  })

  it('projects the fields the spine reads — from the body, never from a caller claim', () => {
    const council = makeTurnResult('council', EXITS.find(e => e.line === 1475)!.body)
    expect(council.text).toBe('Your week is…')
    expect(council.usedCouncil).toBe(true)
    expect(council.provenance?.anchors).toEqual([22.5])
    expect(council.servedBy).toBe('council_fresh')
    expect(council.blocks).toHaveLength(1)
    expect(council.followups).toEqual(['a'])

    const main = makeTurnResult('main', EXITS.find(e => e.line === 2746)!.body)
    expect(main.model).toBe('haiku')
    expect(main.costCents).toBe(7)
    expect(main.toolCalls).toEqual([{ name: 'query_sales', ms: 120 }])
    expect(main.provenance).toBeNull()

    const stopped = makeTurnResult('stopped', EXITS.find(e => e.line === 2470)!.body)
    expect(stopped.stopped).toBe(true)
    expect(stopped.incomplete).toBe(true)

    const rl = makeTurnResult('rate_limited_user', EXITS.find(e => e.line === 317)!.body, 429)
    expect(rl.error).toBe('Rate limit exceeded. Try again later.')
    expect(rl.text).toBeNull()
  })

  it('⚠️ a projection cannot be faked — it is read out of the body, not accepted from the lane', () => {
    // A lane claiming used_council in a typed field while sending false to the client is exactly
    // the "exists, looks correct, does nothing" shape. There is no way to express it.
    const r = makeTurnResult('general', { response: 'hi', used_council: false })
    expect(r.usedCouncil).toBe(false)
    expect((r as unknown as Record<string, unknown>).usedCouncil).not.toBe(true)
  })

  it('falls back from model_used to ai_mode, and reports null when a lane sets neither', () => {
    expect(makeTurnResult('main', { ai_mode: 'sonnet' }).model).toBe('sonnet')
    expect(makeTurnResult('main', { model_used: 'opus', ai_mode: 'sonnet' }).model).toBe('opus')
    expect(makeTurnResult('image', EXITS.find(e => e.line === 2390)!.body).model).toBeNull()
  })

  it('reports an absent field as null/empty rather than inventing one', () => {
    // GROUNDING-TEETH in type form: unknown renders unknown, never a substitute.
    const bare = makeTurnResult('image', { response: 'x' })
    expect(bare.conversationId).toBeNull()
    expect(bare.costCents).toBeNull()
    expect(bare.downloads).toBeNull()
    expect(bare.toolCalls).toEqual([])
    expect(bare.usedCouncil).toBe(false)
    expect(bare.provenance).toBeNull()
  })

  it('rejects a malformed provenance rather than passing it through as one', () => {
    expect(makeTurnResult('council', { provenance: { anchors: 'nope' } }).provenance).toBeNull()
    expect(makeTurnResult('council', { provenance: null }).provenance).toBeNull()
    expect(makeTurnResult('council', { provenance: { anchors: [1], anchorLabels: {} } }).provenance)
      .toEqual({ anchors: [1], anchorLabels: {} })
  })

  it('⚠️ every one of the 36 distinct response keys in the route survives the round trip', () => {
    // Measured from route.ts, not written from the sprint document. If a key stops surviving,
    // something is silently dropping part of an answer.
    const KEYS = [
      'response', 'conversation_id', 'intent', 'action', 'cost_usd_cents', 'used_council', 'blocks',
      'downloads', 'tool_calls', 'ai_mode', 'error', 'followups', 'model_used', 'served_by',
      'degraded_provider', 'heal_reason', 'healed', 'message', 'note', 'advisors_lost',
      'blocked_by_cost_guard', 'cached', 'ceiling', 'current_spend', 'daily_limit', 'degraded_via',
      'deliverable', 'incomplete', 'provenance', 'retry_after', 'sonnet_budget_cents',
      'sonnet_percent_used', 'sonnet_used_cents', 'spent', 'stopped', 'total_outage',
    ]
    expect(KEYS.length).toBe(36)
    const seen = new Set<string>()
    for (const e of EXITS) {
      const out = makeTurnResult(e.lane, e.body, e.status).body
      for (const k of Object.keys(e.body)) {
        expect(Object.prototype.hasOwnProperty.call(out, k), 'key dropped: ' + k).toBe(true)
        seen.add(k)
      }
    }
    for (const k of KEYS) expect(seen.has(k), 'no fixture exercises key: ' + k).toBe(true)
  })

  it('withVerification carries a MANDATORY verified field — M17 ships it not-run, with a reason', () => {
    const r: TurnResult = makeTurnResult('main', { response: 'x' })
    const v = withVerification(r, { ran: false, reason: 'M18' })
    expect(v.result).toBe(r)
    expect(v.verified.ran).toBe(false)
    // A not-run verdict that says nothing is the same silence in a new place. The type forbids it.
    expect(v.verified.ran === false && v.verified.reason).toBe('M18')
  })
})
