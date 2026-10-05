import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findUnprovenancedCalls, PROVENANCE_EXEMPT } from './provenance-rule'
import { provenanceOf, provenanceTail } from './turn-persistence'
import type { TurnAnchorSet, TurnGrounding } from './types'

/**
 * M18 · BRAIN-2 PHASE 4 — EVERY LANE STORES ITS ANCHORS.
 *
 * Measured before this phase: 1 of 22 `upsertConversation` call sites passed provenance, and the live
 * database read 17.8% on `question` and **0.0% on every other intent**. M3 called it "0 of 288
 * conversations carried a tier" and it was read for months as a renderer fault. It was twenty-one
 * lanes not passing an argument.
 */

const STRATEGIES = join(process.cwd(), 'src', 'lib', 'aria', 'ask', 'strategies')

function strategySources(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of readdirSync(STRATEGIES)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f === 'index.ts') continue
    out[f] = readFileSync(join(STRATEGIES, f), 'utf8')
  }
  return out
}

const SET = (figures: Array<{ value: number; label: string }>, over: Partial<TurnAnchorSet> = {}): TurnAnchorSet => ({
  figures,
  queries: figures.map(f => ({ name: 'q_' + f.value, ran: true, rows: 1, anchors: [f] })),
  emptyReason: figures.length ? null : 'nothing to ground on this lane',
  ...over,
})

const GROUNDING = (set: TurnAnchorSet): TurnGrounding => ({ kind: 'none', anchorSet: set })

describe('M18 phase 4 · WALL 10 — no lane stores a turn without its anchors', () => {
  it('⚠️ THE RULE CAN REPORT A VIOLATION — proven on a fixture, before it is trusted on the tree', () => {
    // Anti-vacuity, and it is the whole reason this is a function rather than a script. A rule that
    // only ever returns [] is indistinguishable from a rule that never looks.
    const probe = {
      'fake-lane.ts': [
        "export const fakeStrategy = async ({ input, grounding }) => {",
        "  // upsertConversation is mentioned in this comment and must NOT be counted",
        "  const a = await upsertConversation(bid, userId, convId, message, text, 'fake')",
        "  const b = await upsertConversation(bid, userId, convId, message, text, 'fake', ...provenanceTail(grounding))",
        "}",
      ].join('\n'),
    }

    const found = findUnprovenancedCalls(probe)

    expect(found).toHaveLength(1)
    expect(found[0]!.line).toBe(3)            // the real violation
    expect(found[0]!.file).toBe('fake-lane.ts')
    expect(found[0]!.text).toContain("'fake'")
    // The decoy on line 2 is a comment. A rule that counted it would fire on the doc-blocks in every
    // one of these files, and would then be loosened until it stopped firing at all.
    expect(found.map(f => f.line)).not.toContain(2)
  })

  it('⚠️ reads a MULTI-LINE call as one call — main.ts\'s stopped turn spans five lines', () => {
    const probe = {
      'multi.ts': [
        "const x = await upsertConversation(",
        "  bid, userId, conversationId, message,",
        "  partial || '(stopped)',",
        "  'stopped', undefined, true,",
        ")",
      ].join('\n'),
    }
    // Judged on the WHOLE argument list. Reading only the first line would mark every multi-line call
    // a violation, and reading only the last would miss them.
    expect(findUnprovenancedCalls(probe)).toHaveLength(1)

    const fixed = { 'multi.ts': probe['multi.ts'].replace("'stopped', undefined, true,", "'stopped', undefined, true, undefined, provenanceOf(grounding),") }
    expect(findUnprovenancedCalls(fixed)).toHaveLength(0)
  })

  it('⚠️ EVERY REAL LANE PASSES PROVENANCE — the live tree, not a fixture', () => {
    const found = findUnprovenancedCalls(strategySources())
    expect(
      found,
      'these lanes store an assistant message with no anchors:\n'
      + found.map(f => '  ' + f.file + ':' + f.line + ' — ' + f.text.split('\n')[0]).join('\n'),
    ).toEqual([])
  })

  it('the one exemption is named and reasoned, not a bare skip', () => {
    // An exemption list without reasons becomes "everything is allowed" one entry at a time.
    expect(Object.keys(PROVENANCE_EXEMPT)).toEqual(['save-plan.ts'])
    expect(PROVENANCE_EXEMPT['save-plan.ts']).toMatch(/never receives a grounding/)
    // And the exemption is only sound while that lane really does run as a pre-classifier gate.
    const src = strategySources()
    expect(src['save-plan.ts']).toContain('savePlanGate')
  })
})

describe('M18 phase 4 · what gets stored', () => {
  it('⚠️ TURNS THE ANCHOR SET INTO PROVENANCE, with the labels the owner reads', () => {
    const p = provenanceOf(GROUNDING(SET([
      { value: 822.4, label: 'Completed sales, today.' },
      { value: 240, label: 'Customers on record.' },
    ])))

    expect(p?.anchors).toEqual([822.4, 240])
    expect(p?.anchorLabels['822.4']).toBe('Completed sales, today.')
    expect(p?.anchorLabels['240']).toBe('Customers on record.')
  })

  it('⚠️ AN EMPTY ANCHOR SET STORES NOTHING — the field is ABSENT, never an empty object', () => {
    // `upsertConversation`'s own contract, and it is deliberate: "the field is absent, not an empty
    // object, so 'we never captured this' and 'we captured nothing' stay distinguishable in the
    // JSONB." The sprint brief asked for an "honest empty"; the code had already decided against it
    // with a stated reason, so the code wins and this asserts the code's rule.
    expect(provenanceOf(GROUNDING(SET([])))).toBeUndefined()
  })

  it('⚠️ DROPS AN AMBIGUOUS VALUE RATHER THAN MISLABELLING IT — buildProvenance\'s rule, inherited', () => {
    // Two different labels for the same number: the renderer cannot say which it is, so tiering it
    // would attach a confident wrong caption to a real figure. `buildProvenance` drops it, and
    // `provenanceOf` must not paper over that by returning an empty-but-present object.
    const p = provenanceOf(GROUNDING(SET([
      { value: 100, label: 'Completed sales, today.' },
      { value: 100, label: 'Customers on record.' },
    ])))
    expect(p).toBeUndefined()
  })

  it('⚠️ keeps an unambiguous value when an ambiguous one is dropped alongside it', () => {
    // Anti-vacuity for the test above: if `provenanceOf` returned undefined whenever ANY value was
    // ambiguous, it would silently un-anchor whole answers.
    const p = provenanceOf(GROUNDING(SET([
      { value: 100, label: 'Completed sales, today.' },
      { value: 100, label: 'Customers on record.' },
      { value: 822.4, label: 'Completed sales, this week to date.' },
    ])))
    expect(p?.anchors).toEqual([822.4])
  })

  it('the positional tail puts provenance in the 10th slot, so 21 call sites cannot get it wrong', () => {
    const tail = provenanceTail(GROUNDING(SET([{ value: 5, label: 'Customers on record.' }])))
    // downloads, incomplete, branch, provenance — in that order. A hand-written `undefined, undefined,
    // undefined, p` at twenty-one sites is exactly how an argument ends up one slot out.
    expect(tail).toHaveLength(4)
    expect(tail[0]).toBeUndefined()
    expect(tail[1]).toBeUndefined()
    expect(tail[2]).toBeUndefined()
    expect(tail[3]?.anchors).toEqual([5])
  })
})
