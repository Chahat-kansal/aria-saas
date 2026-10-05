import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TurnAnchorSet } from '../pipeline/types'

/**
 * M18 · BRAIN-2 PHASE 4 — END TO END ON A LANE THAT HAD NONE.
 *
 * WALL 10 proves every `upsertConversation` call site passes the argument. `provenanceOf`'s own tests
 * prove an anchor set converts correctly. ⚠️ THIS CLOSES THE LINK BETWEEN THEM: that the thing a lane
 * actually hands the persistence layer is the anchor set STAGE 2 GAVE IT, not something it built or
 * dropped on the way.
 *
 * `general` is the lane worth proving it on. It is the M12 lane — 130 stored turns, **0.0% with
 * provenance** before this phase — and it is the one whose `ANCHOR_PLAN` entry is an empty set, so it
 * also exercises the honest-nothing path. Both directions, same lane.
 */

const callModel = vi.fn()
const upsertConversation = vi.fn(async (..._a: unknown[]) => 'conv-1')
const loadAnswerHistory = vi.fn(async (..._a: unknown[]) => [])

vi.mock('@/lib/ai/gateway', () => ({ callModel: (...a: unknown[]) => callModel(...a) as unknown }))
vi.mock('@/lib/aria-tools', () => ({ ARIA_POS_TOOLS: [], executePOSTool: async () => ({}) }))
vi.mock('@/lib/aria/prompt/assemble', () => ({
  assembleAriaPrompt: () => ({ systemPrompt: 'sp', grounded: false }),
  groundingNotice: () => '',
}))
vi.mock('../pipeline/turn-persistence', async orig => ({
  ...(await orig<typeof import('../pipeline/turn-persistence')>()),
  upsertConversation: (...a: unknown[]) => upsertConversation(...a) as unknown,
  loadAnswerHistory: (...a: unknown[]) => loadAnswerHistory(...a) as unknown,
}))
vi.mock('@/lib/aria/cost-guard', () => ({ trackSpend: async () => {}, checkSpendAllowed: async () => ({ allowed: true }) }))

const { generalStrategy } = await import('./general')

const SET = (figures: Array<{ value: number; label: string }>): TurnAnchorSet => ({
  figures,
  queries: figures.map(f => ({ name: 'q_' + f.value, ran: true, rows: 1, anchors: [f] })),
  emptyReason: figures.length ? null : 'the general lane runs before any business context exists',
})

const ARGS = (set: TurnAnchorSet) => ({
  input: {
    req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
    bid: 'ff5055a0-c351-4ada-817a-1804961035f3', userId: 'u1', supabase: {} as never,
    message: 'tidy up before the weekend', conversationId: null, attachments: [], clientMessages: [],
    noticeRef: null, branchIntent: { mode: 'append' as const },
  },
  understanding: {
    message: 'tidy up before the weekend',
    intent: { type: 'general', complexity: 'simple', confidence: 0.9 },
    ariaIntent: { intent_type: 'general' },
    outputFmt: {}, features: {}, firedFeatures: [], hasAttachments: false, hasImages: false, hasConversation: false,
  },
  grounding: { kind: 'none' as const, anchorSet: set },
  strategy: { name: 'general' as const, reason: 'classifyIntent=general', firedFeatures: [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

/** The 10th positional argument of `upsertConversation` — the provenance slot. */
function storedProvenance() {
  const call = upsertConversation.mock.calls[0]
  return call ? (call[9] as { anchors: number[]; anchorLabels: Record<string, string> } | undefined) : undefined
}

beforeEach(() => {
  upsertConversation.mockClear()
  callModel.mockReset().mockResolvedValue({ raw: 'Sounds like a plan.', cost_cents: 1, tool_calls: [] })
})

describe('M18 phase 4 · the general lane stores what stage 2 gave it', () => {
  it('⚠️ FORWARDS THE ANCHORS TO THE STORED TURN — the link M3 reported as "0 of 288"', async () => {
    await generalStrategy(ARGS(SET([
      { value: 822.4, label: 'Completed sales, today.' },
      { value: 240, label: 'Customers on record.' },
    ])))

    expect(upsertConversation).toHaveBeenCalledTimes(1)
    const p = storedProvenance()
    // ⚠️ THE VALUES, in the 10th slot. Before this phase this argument was simply not passed, so the
    // assistant message went into the JSONB with no `provenance` key and the renderer had nothing to
    // tier no matter how good it was.
    expect(p?.anchors).toEqual([822.4, 240])
    expect(p?.anchorLabels['822.4']).toBe('Completed sales, today.')
  })

  it('⚠️ PASSES NOTHING WHEN THERE IS NOTHING — not an empty object, and not a fabricated anchor', async () => {
    // The general lane's real `ANCHOR_PLAN` entry is an empty set, so this is its production shape.
    // `upsertConversation` then omits the key entirely, keeping "we never captured this" and "we
    // captured nothing" distinguishable in the JSONB — its own documented rule.
    await generalStrategy(ARGS(SET([])))

    expect(upsertConversation).toHaveBeenCalledTimes(1)
    expect(storedProvenance()).toBeUndefined()
  })

  it('⚠️ the provenance sits in the SLOT upsertConversation reads — not merely somewhere in the call', async () => {
    // Anti-vacuity for both tests above. `provenanceTail` exists because the argument is 10th, behind
    // `downloads`, `incomplete` and `branch`; one slot out and the anchors would be read as a branch
    // descriptor and silently discarded. This asserts the three slots before it are the empty ones.
    await generalStrategy(ARGS(SET([{ value: 5, label: 'Customers on record.' }])))
    const call = upsertConversation.mock.calls[0]!
    expect(call[5]).toBe('general')      // intentType
    expect(call[6]).toBeUndefined()      // downloads
    expect(call[7]).toBeUndefined()      // incomplete
    expect(call[8]).toBeUndefined()      // branch
    expect((call[9] as { anchors: number[] }).anchors).toEqual([5])
  })
})
