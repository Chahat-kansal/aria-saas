import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContentFreeBlock, dropContentFreeBlocks } from './block-content'
import type { AskBlock } from './ask-types'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const B = (o: Record<string, unknown>) => o as unknown as AskBlock

/**
 * S7 PHASE 2 — ONE PREDICATE, TAUGHT EVERY HEADER+BODY SHAPE.
 *
 * S6 taught it three. The deployed build then showed a fourth: a `data_table` titled
 * "TOP CUSTOMERS — ALL LAPSED 60+ DAYS" with columns and no rows. The phase-1 inventory found 13
 * such types in total. Both renderers already call this predicate, so teaching it here fixes every
 * renderer and every consumer at once.
 */
describe('S7 phase 2 · the live screenshot case', () => {
  it('a data_table with a title and columns but NO ROWS renders nothing', () => {
    expect(isContentFreeBlock(B({
      type: 'data_table',
      title: 'TOP CUSTOMERS — ALL LAPSED 60+ DAYS',
      columns: [{ key: 'name', label: 'Customer' }, { key: 'days', label: 'Days' }],
      rows: [],
    }))).toBe(true)
  })

  it('COLUMNS ARE NOT CONTENT — that is the whole trap', () => {
    // Counting a non-empty `columns` as content would reproduce the exact reported defect while
    // looking like a fix: a table header with nothing under it.
    expect(isContentFreeBlock(B({ type: 'data_table', columns: [{ key: 'a' }], rows: [] }))).toBe(true)
    expect(isContentFreeBlock(B({ type: 'spreadsheet', headers: ['A', 'B'], rows: [] }))).toBe(true)
  })

  it('one real row is enough to render', () => {
    expect(isContentFreeBlock(B({
      type: 'data_table', title: 'Top customers',
      columns: [{ key: 'name' }], rows: [{ name: 'Ana', days: 61 }],
    }))).toBe(false)
  })
})

describe('S7 phase 2 · every header+body shape from the inventory', () => {
  const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['data_table',       { rows: [] },     { rows: [{ a: 1 }] }],
    ['spreadsheet',      { rows: [] },     { rows: [['a']] }],
    ['comparison_table', { rows: [] },     { rows: [{ a: 1 }] }],
    ['action_card',      { buttons: [] },  { buttons: [{ label: 'Do it' }] }],
    ['action_list',      { items: [] },    { items: [{ label: 'Do it' }] }],
    ['menu_list',        { items: [] },    { items: [{ name: 'Latte' }] }],
    ['metric_row',       { items: [] },    { items: [{ label: 'Sales', value: 12 }] }],
    ['task_plan',        { steps: [] },    { steps: [{ label: 'Step 1' }] }],
    ['infographic',      { sections: [] }, { sections: [{ heading: 'A' }] }],
    ['slides',           { slides: [] },   { slides: [{ heading: 'A' }] }],
    ['chart',            { values: [] },   { values: [1, 2, 3] }],
    ['bar',              { data: [] },     { data: [{ x: 1, y: 2 }] }],
    ['styled_chart',     { data: [] },     { data: [{ x: 1, y: 2 }] }],
    // S7 phase 3 — found by the rail, in the single-line half of ask-types.ts that every
    // line-anchored scan before it had skipped.
    ['bento_grid',       { items: [] },    { items: [{ label: 'Sales', value: 12 }] }],
    ['progress_bars',    { items: [] },    { items: [{ label: 'Stock', value: 40 }] }],
    ['activity_stream',  { items: [] },    { items: [{ text: 'Sale at 9:04' }] }],
    ['clay_chart',       { data: [] },     { data: [{ name: 'Mon', value: 4 }] }],
  ]

  for (const [type, empty, full] of cases) {
    it(type + ': empty body renders nothing; real body renders', () => {
      expect(isContentFreeBlock(B({ type, title: 'A header', ...empty })), type + ' empty').toBe(true)
      expect(isContentFreeBlock(B({ type, title: 'A header', ...full })), type + ' full').toBe(false)
    })
  }

  it('a missing body field is as empty as an empty one', () => {
    expect(isContentFreeBlock(B({ type: 'data_table', title: 'X' }))).toBe(true)
  })

  it('an array of blank entries is still empty', () => {
    expect(isContentFreeBlock(B({ type: 'menu_list', items: ['', '  ', null] }))).toBe(true)
    expect(isContentFreeBlock(B({ type: 'action_list', items: [{}, { label: '' }] }))).toBe(true)
  })

  it('a numeric entry counts as content — 0 is a real value', () => {
    // The provenance work has already established that 0 is a figure, not an absence.
    expect(isContentFreeBlock(B({ type: 'chart', values: [0, 0, 0] }))).toBe(false)
    expect(isContentFreeBlock(B({ type: 'metric_row', items: [{ label: '', value: 0 }] }))).toBe(false)
  })
})

describe('S7 phase 2 · S6 behaviour is preserved exactly', () => {
  it('the three S6 shapes still judge the same way', () => {
    expect(isContentFreeBlock(B({ type: 'brain_readouts', items: [] }))).toBe(true)
    expect(isContentFreeBlock(B({ type: 'brain_readouts', items: [{ role: 'growth', text: 'Real.' }] }))).toBe(false)
    expect(isContentFreeBlock(B({ type: 'council_split', question: '', growth: '', risk: '', strategy: '' }))).toBe(true)
    expect(isContentFreeBlock(B({ type: 'council_split', question: 'Raise the price?' }))).toBe(false)
    expect(isContentFreeBlock(B({ type: 'lead', content: '  ' }))).toBe(true)
    expect(isContentFreeBlock(B({ type: 'lead', content: 'Steady week.' }))).toBe(false)
  })

  it('AN UNKNOWN TYPE IS STILL NEVER DROPPED — S6 chose this deliberately', () => {
    // The decision table says so explicitly: losing a real answer beats an empty panel.
    expect(isContentFreeBlock(B({ type: 'kpi_card', value: 12 }))).toBe(false)
    expect(isContentFreeBlock(B({ type: 'some_future_block' }))).toBe(false)
    expect(isContentFreeBlock(B({ type: 'html', html: '<p>x</p>' }))).toBe(false)
  })

  it('null and non-objects stay content-free rather than crashing a render', () => {
    expect(isContentFreeBlock(null)).toBe(true)
    expect(isContentFreeBlock(undefined)).toBe(true)
  })

  it('dropContentFreeBlocks removes the empty table and keeps the rest, in order', () => {
    const kept = dropContentFreeBlocks([
      B({ type: 'data_table', title: 'TOP CUSTOMERS', columns: [{ key: 'a' }], rows: [] }),
      B({ type: 'lead', content: 'Steady week.' }),
      B({ type: 'kpi_card', value: 3 }),
    ])
    expect(kept.map(k => (k as unknown as Record<string, unknown>).type)).toEqual(['lead', 'kpi_card'])
  })
})

describe('S7 phase 2 · one predicate, every call site', () => {
  it('both renderers and the route use it — there is no second definition', () => {
    for (const f of [
      'src/components/dashboard/BlockRenderer.tsx',
      'src/components/aria/BlockRenderer.tsx',
      'src/app/api/aria/ask/route.ts',
    ]) {
      expect(code(read(f)), f).toMatch(/from '@\/lib\/aria\/block-content'/)
    }
  })

  it('MUTATION PROBE — treating columns as content reinstates the screenshot bug', () => {
    const SRC = read('src/lib/aria/block-content.ts')
    const mutated = SRC.replace("data_table:       ['rows'],", "data_table:       ['rows', 'columns'],")
    expect(mutated).not.toBe(SRC)
    expect(code(mutated)).toMatch(/data_table:\s+\['rows', 'columns'\]/)
  })
})
