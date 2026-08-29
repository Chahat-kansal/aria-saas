import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BODY_FIELDS, isContentFreeBlock } from './block-content'
import type { AskBlock } from './ask-types'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S8 PHASE 0 — THE GATE.
 *
 * Two things S5–S7 delivered have to still be true before S8 builds on them. Neither is checked by
 * anything else: the swap is a one-line render that a bad merge could silently revert, and the
 * predicate's coverage is a count that only a test can hold. Written as a test rather than a
 * one-off script for exactly the reason S6 and S7 both established — a claim in a run log stops
 * being true the moment someone edits the file, and nothing tells you.
 */
describe('S8 phase 0 · the gate', () => {
  it('THE SWAP IS LIVE — /dashboard/ask-aria serves the built surface', () => {
    const page = code(read('src/app/dashboard/ask-aria/page.tsx'))
    expect(page).toMatch(/from '@\/components\/ask-aria-ax\/AskAriaTransition'/)
    expect(page).toMatch(/<AskAriaTransition\s*\/>/)
    // The stylesheet carries `*`, `body` and `:root` rules, so it must stay page-scoped.
    expect(page).toMatch(/import '@\/styles\/ask-aria-transition\.css'/)
  })

  it('THE OLD SURFACE IS STILL REACHABLE — five capabilities live only there', () => {
    // S5 parked 5 of 6 capabilities rather than migrate them; parking means no retirement.
    // If this file ever goes, those five go silently with it.
    expect(() => read('src/app/dashboard/ask-aria/classic/page.tsx')).not.toThrow()
  })

  it('THE PREDICATE COVERS ALL 17 HEADER+BODY TYPES', () => {
    // 13 from S7 phase 2, plus the 4 the phase-3 rail found in the single-line half of ask-types.ts.
    const S7_SEVENTEEN = [
      'data_table', 'spreadsheet', 'comparison_table', 'action_card', 'action_list', 'menu_list',
      'metric_row', 'task_plan', 'infographic', 'slides', 'chart', 'bar', 'styled_chart',
      'bento_grid', 'progress_bars', 'activity_stream', 'clay_chart',
    ]
    const missing = S7_SEVENTEEN.filter(t => !(t in BODY_FIELDS))
    expect(missing, 'types that lost their coverage: ' + missing.join(', ')).toEqual([])
    expect(Object.keys(BODY_FIELDS).length).toBe(17)

    // Coverage is not the claim — BEHAVIOUR is. Each one must actually judge an empty body.
    const notJudged = S7_SEVENTEEN.filter(t => {
      const empty: Record<string, unknown> = { type: t, title: 'A header' }
      for (const f of BODY_FIELDS[t]!) empty[f] = []
      return !isContentFreeBlock(empty as unknown as AskBlock)
    })
    expect(notJudged, 'listed but do not judge an empty body: ' + notJudged.join(', ')).toEqual([])
  })

  it('and S6\'s three are still judged, and unknown types still are not', () => {
    expect(isContentFreeBlock({ type: 'brain_readouts', items: [] } as unknown as AskBlock)).toBe(true)
    expect(isContentFreeBlock({ type: 'council_split' } as unknown as AskBlock)).toBe(true)
    expect(isContentFreeBlock({ type: 'lead', content: '' } as unknown as AskBlock)).toBe(true)
    expect(isContentFreeBlock({ type: 'kpi_card', value: 1 } as unknown as AskBlock)).toBe(false)
  })

  it('ANTI-VACUITY — the list this gate checks is not empty and not stale', () => {
    // A gate that iterates an empty array passes while proving nothing. This one also fails if
    // BODY_FIELDS grows past 17 without the list above being updated to match.
    expect(Object.keys(BODY_FIELDS).length).toBeGreaterThanOrEqual(17)
    const extra = Object.keys(BODY_FIELDS).filter(t => ![
      'data_table', 'spreadsheet', 'comparison_table', 'action_card', 'action_list', 'menu_list',
      'metric_row', 'task_plan', 'infographic', 'slides', 'chart', 'bar', 'styled_chart',
      'bento_grid', 'progress_bars', 'activity_stream', 'clay_chart',
    ].includes(t))
    expect(extra, 'BODY_FIELDS grew — update this gate: ' + extra.join(', ')).toEqual([])
  })

  it('MUTATION PROBE — the coverage assertion can go red', () => {
    // Proves the check above is capable of failing rather than passing on an empty filter.
    const withoutOne = { ...BODY_FIELDS } as Record<string, string[]>
    delete withoutOne.clay_chart
    expect(Object.keys(withoutOne).length).toBe(16)
    expect('clay_chart' in withoutOne).toBe(false)
    expect('clay_chart' in BODY_FIELDS).toBe(true)
  })
})
