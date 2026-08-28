import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { segmentFigures } from './figure-provenance'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/aria/ask/route.ts')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const PANEL = read('src/components/ask-aria-ax/rooms/ThreadsPanel.tsx')
const STREAM = read('src/components/ask-aria-ax/useAriaStream.ts')

/** Strip comments — this whole sprint is about prose that describes work nobody wired. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S3 PHASE 1 — THE CHAIN, LINK BY LINK.
 *
 * The renderer and the verifier both worked before this sprint. 0 of 288 conversations carried a
 * provenance field because the chain BETWEEN them was never connected. Each `it` below pins one
 * link, so a future change that quietly removes one fails here rather than in a screenshot.
 */
describe('S3 phase 1 · the four links that were broken', () => {
  it('LINK 1 — the route carries anchors out of the nested scope that computes them', () => {
    const c = code(ROUTE)
    // S6 PHASE 2 — REWRITTEN. The carrier is unchanged; what fills it changed. It used to take
    // anchorValues wholesale (33 values, 4 labels). It now takes labelled pairs through
    // buildProvenance(), so anchors and labels are the same length by construction.
    expect(c).toMatch(/let turnProvenance: \{ anchors: number\[\]; anchorLabels: Record<string, string> \} \| null = null/)
    expect(c).toMatch(/turnProvenance = buildProvenance\(\[/)
  })

  it('LINK 2 — it is persisted WITH the message, not just returned', () => {
    const c = code(ROUTE)
    expect(c).toMatch(/provenance\?: \{ anchors: number\[\]; anchorLabels\?: Record<string, string> \}/)
    expect(c).toMatch(/\.\.\.\(provenance && provenance\.anchors\.length > 0 \? \{ provenance \} : \{\}\)/)
    // and the council path actually passes it
    expect(c).toMatch(/upsertConversation\([^\n]*turnProvenance \?\? undefined\)/)
  })

  it('LINK 3 — it reaches the client in the response', () => {
    expect(code(ROUTE)).toMatch(/provenance: turnProvenance,/)
    expect(code(STREAM)).toMatch(/provenance\?: \{ anchors: number\[\]; anchorLabels\?: Record<string, string> \} \| null/)
  })

  it('LINK 4 — the surface hands it to the renderer', () => {
    // This was the single most consequential missing line: AnswerMarkdown accepted a `provenance`
    // prop from the day it was written and was never given one.
    expect(code(SURFACE)).toMatch(/provenance=\{t\.provenance\}/)
    expect(code(SURFACE)).toMatch(/provenance: \(result\?\.provenance as ProvenanceInput \| null \| undefined\) \?\? undefined/)
  })

  it('SURVIVES RELOAD — the restore path keeps it', () => {
    expect(code(SURFACE)).toMatch(/provenance: m\.provenance,/)
    expect(code(PANEL)).toMatch(/provenance\?: \{ anchors: number\[\]; anchorLabels\?: Record<string, string> \}/)
  })

  it('MUTATION PROBE — stripping the tier at the assembly step is detectable', () => {
    // The sprint's named mutation: break the assembly and the assertion must go red.
    // S6 PHASE 2 — REWRITTEN to the new assembly step. Same guarantee: break it, this goes red.
    const mutated = ROUTE.replace('turnProvenance = buildProvenance([', 'const _dropped = ([')
    expect(mutated).not.toBe(ROUTE)
    expect(code(mutated)).not.toMatch(/turnProvenance = buildProvenance\(\[/)
  })

  it('MUTATION PROBE — dropping the prop at the renderer is detectable', () => {
    const mutated = SURFACE.replace(/\r?\n\s*provenance=\{t\.provenance\}/, '')
    expect(mutated).not.toBe(SURFACE)
    expect(code(mutated)).not.toMatch(/provenance=\{t\.provenance\}/)
  })
})

describe('S3 phase 1 · the tier is never generous', () => {
  it('a turn with NO anchors renders every figure plain — the honest default', () => {
    // Sip takes $0 today and most costs are fabricated. A truthful answer here is mostly plain,
    // and that is the correct outcome, not a failure of this sprint.
    const segs = segmentFigures('Revenue was $1,240.00 and margin 61%.', {})
    const figures = segs.filter(s => s.kind === 'figure')
    expect(figures).toHaveLength(2)
    expect(figures.every(f => f.tier === 'plain')).toBe(true)
    expect(figures.every(f => f.source === undefined)).toBe(true)
  })

  it('a figure matching NO anchor stays plain even when other anchors exist', () => {
    // The failure this forbids: "it looks like a number, and we have some anchors, so tier it."
    const segs = segmentFigures('Revenue was $9,999.00.', { anchors: [1240] })
    const fig = segs.find(s => s.kind === 'figure')!
    expect(fig.tier).toBe('plain')
  })

  it('only a figure that matches real computed ground truth is verified', () => {
    const segs = segmentFigures('Revenue was $1,240.00.', {
      anchors: [1240], anchorLabels: { '1240': 'Completed sales, today.' },
    })
    const fig = segs.find(s => s.kind === 'figure')!
    expect(fig.tier).toBe('verified')
    expect(fig.source).toContain('Completed sales, today.')
  })

  it('an unlabelled anchor gets a generic TRUE source, never an invented one', () => {
    // The spread anchor sets arrive as bare numbers. They are still real values computed this
    // turn — so they may be tiered — but nothing is claimed about WHICH query produced them.
    const segs = segmentFigures('Revenue was $1,240.00.', { anchors: [1240] })
    const fig = segs.find(s => s.kind === 'figure')!
    expect(fig.tier).toBe('verified')
    expect(fig.source).toBeTruthy()
    expect(fig.source).not.toContain('undefined')
  })

  it('weak cost tiers downgrade verified to estimated rather than hiding the doubt', () => {
    const segs = segmentFigures('Margin is 61%.', { anchors: [61], weakCostTiers: true })
    const fig = segs.find(s => s.kind === 'figure')!
    expect(fig.tier).toBe('estimated')
    expect(fig.source).toMatch(/estimate/i)
  })
})

describe('S3 phase 1 · the labels describe queries that actually ran', () => {
  it('every label is attached to a named query result, not to a spread set', () => {
    // S6 PHASE 2 — REWRITTEN. labelAnchor() keyed a shared map by String(value), which is how
    // two metrics with the same number collapsed to one label. Labels are now (value, label)
    // PAIRS, so the same guarantee is expressed against the pair list.
    const c = code(ROUTE)
    for (const [sym, text] of [
      ['revToday', 'Completed sales, today.'],
      ['revWeekCal', 'Completed sales, this week to date.'],
      ['revLastWeekCal', 'Completed sales, last week.'],
      ['revSwlm', 'Completed sales, the same week last month.'],
      ['targetWeekly', 'Your weekly revenue target.'],
    ] as const) {
      expect(c.replace(/\s+/g, ' '), sym + ' must be labelled')
        .toContain(`{ value: ${sym}, label: '${text}' }`)
    }
  })

  it('labelAnchor refuses a non-finite value rather than keying on NaN', () => {
    // S6 PHASE 2 — REWRITTEN. The guard moved into buildProvenance(), where it is covered by a
    // real unit test ("non-finite values never enter") rather than a regex over the route.
    expect(code(read('src/lib/aria/figure-provenance.ts')))
      .toMatch(/if \(typeof value !== 'number' \|\| !isFinite\(value\)\) continue/)
  })
})
