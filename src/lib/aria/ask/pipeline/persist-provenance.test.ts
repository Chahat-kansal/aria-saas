import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18 · BRAIN-2 PHASE 4 — THE LAST LINK: THE ROW THAT ACTUALLY GETS WRITTEN.
 *
 * ⚠️ THIS LINK WAS PINNED BY A REGEX, NOT BY A TEST. `provenance-chain.test.ts:42` asserts that
 * `turn-persistence.ts` contains the literal text
 *
 *     ...(provenance && provenance.anchors.length > 0 ? { provenance } : {})
 *
 * which proves the line is present and nothing about what it does. The sprint's own standing rule is
 * that a rail test exercises the function and never just its source. So these call
 * `upsertConversation` for real, against a database double, and read the `messages` array it writes.
 *
 * The chain is now behavioural end to end:
 *   stage 2 loads the anchor set → `provenanceOf` converts it → the lane passes it (WALL 10) →
 *   **this** test shows it reaching the JSONB the renderer reads back.
 */

type Row = Record<string, unknown>
const inserted: Row[] = []
const updated: Row[] = []

vi.mock('@/lib/supabase-admin', () => {
  const builder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = {}
    for (const m of ['eq', 'gte', 'lte', 'order', 'limit', 'is', 'not', 'in', 'ilike']) self[m] = () => self
    self.select = () => self
    self.maybeSingle = async () => ({ data: null, error: null })
    self.single = async () => ({ data: { id: 'new-conv' }, error: null })
    self.insert = (row: Row) => {
      if (table === 'aria_conversations') inserted.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'new-conv' }, error: null }) }) }
    }
    self.update = (row: Row) => {
      if (table === 'aria_conversations') updated.push(row)
      return self
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej)
    return self
  }
  return { supabaseAdmin: { from: (t: string) => builder(t) } }
})
vi.mock('@/lib/ai-router', () => ({ ariaChatWithProvider: async () => ({ text: 'A title' }) }))
vi.mock('@/lib/aria/thread-title', () => ({
  buildTitlePrompt: () => 'p', sanitiseTitle: (s: string) => s, fallbackTitle: () => 'Untitled',
  shouldGenerateTitle: () => false,
}))

const { upsertConversation } = await import('./turn-persistence')

/** The assistant message of the row that was written. */
function assistantMessage(): Record<string, unknown> | undefined {
  const row = inserted[0] ?? updated[0]
  const msgs = (row?.messages ?? []) as Array<Record<string, unknown>>
  return [...msgs].reverse().find(m => m.role === 'assistant')
}

beforeEach(() => {
  inserted.length = 0
  updated.length = 0
})

describe('M18 phase 4 · upsertConversation writes the anchors into the row', () => {
  it('⚠️ THE STORED ASSISTANT MESSAGE CARRIES THE PROVENANCE — the JSONB assertion 3 reads', async () => {
    await upsertConversation(
      'b1', 'u1', null, 'how are we doing?', 'You took $822.40 today.', 'question',
      undefined, undefined, undefined,
      { anchors: [822.4, 240], anchorLabels: { '822.4': 'Completed sales, today.', '240': 'Customers on record.' } },
    )

    const assistant = assistantMessage()
    expect(assistant, 'no assistant message was written at all').toBeTruthy()
    const prov = assistant!.provenance as { anchors: number[]; anchorLabels: Record<string, string> } | undefined
    // ⚠️ The values, in the row. `check:live` assertion 3 reads exactly this path:
    // aria_conversations.messages → last assistant → .provenance → .anchors.length > 0
    expect(prov?.anchors).toEqual([822.4, 240])
    expect(prov?.anchorLabels['822.4']).toBe('Completed sales, today.')
  })

  it('⚠️ OMITS THE KEY ENTIRELY when there are no anchors — absent, not an empty object', async () => {
    await upsertConversation(
      'b1', 'u1', null, 'tidy up before the weekend', 'Sounds like a plan.', 'general',
      undefined, undefined, undefined, { anchors: [] },
    )

    const assistant = assistantMessage()
    expect(assistant).toBeTruthy()
    // `turn-persistence.ts`'s own documented rule: "the field is absent, not an empty object, so 'we
    // never captured this' and 'we captured nothing' stay distinguishable in the JSONB." An empty
    // object here would make every un-anchored turn look like a captured-but-empty one, and the 9.44%
    // baseline would become unmeasurable.
    expect(Object.prototype.hasOwnProperty.call(assistant!, 'provenance')).toBe(false)
  })

  it('omits the key when no provenance is passed at all — the pre-M18 shape, still legal', async () => {
    // Anti-vacuity for both above: if the key were always present, or always absent, neither assertion
    // would carry information. This is also what 21 lanes did before this phase, and what the
    // `save-plan` exemption still does.
    await upsertConversation('b1', 'u1', null, 'q', 'a', 'general')
    expect(Object.prototype.hasOwnProperty.call(assistantMessage()!, 'provenance')).toBe(false)
  })

  it('⚠️ a row is written on the INSERT path, so the assertions above are reading a real write', async () => {
    // If the double silently swallowed the insert, every assertion here would be inspecting
    // `undefined` and passing by accident.
    await upsertConversation('b1', 'u1', null, 'q', 'a', 'question', undefined, undefined, undefined, { anchors: [1] })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]!.business_id).toBe('b1')
    expect(Array.isArray(inserted[0]!.messages)).toBe(true)
    expect((inserted[0]!.messages as unknown[])).toHaveLength(2) // the user turn and the assistant turn
  })
})
