import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildProvenance, segmentFigures } from './figure-provenance'

const root = join(__dirname, '..', '..', '..')
const ROUTE = readFileSync(join(root, 'src/app/api/aria/ask/route.ts'), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S6 PHASE 2 — a live turn stored 33 anchors against 4 labels: 29 numbers underlined, clickable,
 * and silent. The anchors it stored included -800, -600, -100, 100 and nine zeros.
 */
describe('S6 phase 2 · every stored anchor can state its meaning', () => {
  it('THE INVARIANT: anchors and labels are always the same length', () => {
    const p = buildProvenance([
      { value: 36.5, label: 'Completed sales, this week to date.' },
      { value: 51, label: 'Customers on record.' },
    ])
    expect(p.anchors).toHaveLength(2)
    expect(Object.keys(p.anchorLabels)).toHaveLength(2)
    expect(p.anchors.every(a => p.anchorLabels[String(a)])).toBe(true)
  })

  it('an unlabelled value is not stored at all', () => {
    const p = buildProvenance([
      { value: 36.5, label: 'Completed sales, this week to date.' },
      { value: -800, label: '' },
      { value: 100, label: '   ' },
    ])
    expect(p.anchors).toEqual([36.5])
  })

  it('THE JUNK IS GONE: chart axes and constants never had labels, so they never enter', () => {
    // -800, -600, -100 and 100 came from healthAnchors/goalAnchors/benchmarkAnchors/
    // hypothesisAnchors — bare number[] spreads with no per-value provenance.
    const p = buildProvenance([{ value: 36.5, label: 'Completed sales, this week to date.' }])
    for (const junk of [-800, -600, -100, 100]) expect(p.anchors).not.toContain(junk)
  })

  it('AMBIGUOUS VALUES ARE DROPPED, not coin-flipped', () => {
    // On a quiet day revenue-today, the weekly target and a promo count are all 0. Keyed by value,
    // they collapse to one label and the last write wins — the owner clicks 0 and reads whichever
    // landed last. That is a guess presented as a fact.
    const p = buildProvenance([
      { value: 0, label: 'Completed sales, today.' },
      { value: 0, label: 'Your weekly revenue target.' },
      { value: 51, label: 'Customers on record.' },
    ])
    expect(p.anchors).toEqual([51])
    expect(p.anchorLabels['0']).toBeUndefined()
  })

  it('the SAME label repeated for the same value is not ambiguous', () => {
    const p = buildProvenance([
      { value: 0, label: 'Completed sales, today.' },
      { value: 0, label: 'Completed sales, today.' },
    ])
    expect(p.anchors).toEqual([0])
    expect(p.anchorLabels['0']).toBe('Completed sales, today.')
  })

  it('ZERO IS A LEGITIMATE ANCHOR when it means one thing', () => {
    // "Takings today $0.00" is a real, useful figure to click. The rule drops ambiguity, not zero.
    const p = buildProvenance([{ value: 0, label: 'Completed sales, today.' }])
    expect(p.anchors).toEqual([0])
  })

  it('non-finite values never enter', () => {
    const p = buildProvenance([
      { value: NaN, label: 'x' }, { value: Infinity, label: 'y' },
      { value: null, label: 'z' }, { value: undefined, label: 'w' },
      { value: 7, label: 'Real.' },
    ])
    expect(p.anchors).toEqual([7])
  })

  it('END TO END — every stored anchor resolves in the renderer', () => {
    const p = buildProvenance([
      { value: 36.5, label: 'Completed sales, this week to date.' },
      { value: 0, label: 'Completed sales, today.' },
      { value: 0, label: 'Your weekly revenue target.' },   // ambiguous -> dropped
    ])
    const segs = segmentFigures('You made $36.50 this week.', p)
    const fig = segs.find(s => s.kind === 'figure')!
    expect(fig.tier).toBe('verified')
    expect(fig.source).toContain('Completed sales, this week to date.')
    // and the ambiguous one cannot be clicked into a wrong answer
    expect(p.anchorLabels['0']).toBeUndefined()
  })
})

describe('S6 phase 2 · stopped where they enter, not at the renderer', () => {
  it('the route builds provenance from labelled pairs', () => {
    expect(code(ROUTE)).toMatch(/turnProvenance = buildProvenance\(\[/)
  })

  it('the four bare spreads are NOT offered as sources', () => {
    const c = code(ROUTE)
    const call = c.slice(c.indexOf('turnProvenance = buildProvenance(['), c.indexOf('turnProvenance = buildProvenance([') + 1600)
    for (const spread of ['healthAnchors', 'goalAnchors', 'benchmarkAnchors', 'hypothesisAnchors']) {
      expect(call, spread + ' must not be a stored source').not.toContain(spread)
    }
  })

  it('but they STILL reach the verifier — grounding is not weakened', () => {
    // Check 6 validates against as wide a corpus as possible; narrowing it would trade one bug
    // for a worse one.
    const c = code(ROUTE)
    expect(c).toMatch(/\.\.\.topCustLTVs, \.\.\.healthAnchors, \.\.\.goalAnchors, \.\.\.benchmarkAnchors, \.\.\.hypothesisAnchors,/)
    expect(c).toMatch(/_anchor_values: anchorValues,/)
  })

  it('MUTATION PROBE — storing an unlabelled anchor is detectable', () => {
    const mutated = ROUTE.replace('turnProvenance = buildProvenance([', 'turnProvenance = { anchors: anchorValues, anchorLabels: {} }; const _unused = ([')
    expect(mutated).not.toBe(ROUTE)
    expect(code(mutated)).not.toMatch(/turnProvenance = buildProvenance\(\[/)
  })
})
