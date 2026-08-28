import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContentFreeBlock, dropContentFreeBlocks } from './block-content'
import type { AskBlock } from './ask-types'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const DASH = read('src/components/dashboard/BlockRenderer.tsx')
const ARIA = read('src/components/aria/BlockRenderer.tsx')
const ROUTE = read('src/app/api/aria/ask/route.ts')

const readouts = (items: unknown[]) => ({ type: 'brain_readouts', items } as unknown as AskBlock)

/**
 * S6 PHASE 1 — the council renders COUNCIL READ + GROWTH/RISK/STRATEGY/CONTEXT over nothing.
 *
 * The council IS meant to return sections — council.ts:457-461 asks the model for brain_readouts
 * and council_split by name, and route.ts passes ask_blocks straight through. So this is not a
 * scaffold being retired; it is a promise nobody checked before printing.
 */
describe('S6 phase 1 · a heading with nothing under it is a fake control', () => {
  it('THE LIVE CASE: an empty brain_readouts is content-free', () => {
    // The stored message for 7372a1a6 is one plain content string — the model returned prose, and
    // the panel printed its header and four role labels over nothing.
    expect(isContentFreeBlock(readouts([]))).toBe(true)
  })

  it('items that exist but say nothing are still nothing', () => {
    expect(isContentFreeBlock(readouts([{ role: 'growth', icon: '📈', text: '' }]))).toBe(true)
    expect(isContentFreeBlock(readouts([{ role: 'growth', icon: '📈', text: '   ' }]))).toBe(true)
    expect(isContentFreeBlock(readouts([{ role: 'growth', icon: '📈' }]))).toBe(true)
  })

  it('ONE speaking item is enough — a real section is never dropped', () => {
    expect(isContentFreeBlock(readouts([
      { role: 'growth', icon: '📈', text: 'Acai Bowl is 31% of revenue.' },
      { role: 'risk', icon: '⚠', text: '' },
    ]))).toBe(false)
  })

  it('a council_split with no text is content-free; with any, it is not', () => {
    const split = (o: Record<string, unknown>) => ({ type: 'council_split', ...o } as unknown as AskBlock)
    expect(isContentFreeBlock(split({ question: '', growth: '', risk: '', strategy: '' }))).toBe(true)
    expect(isContentFreeBlock(split({ question: 'Raise the price?', growth: '', risk: '', strategy: '' }))).toBe(false)
  })

  it('an empty lead is content-free', () => {
    expect(isContentFreeBlock({ type: 'lead', content: '  ' } as unknown as AskBlock)).toBe(true)
    expect(isContentFreeBlock({ type: 'lead', content: 'Steady week.' } as unknown as AskBlock)).toBe(false)
  })

  it('AN UNKNOWN BLOCK TYPE IS NEVER DROPPED — losing a real answer is worse than an empty panel', () => {
    expect(isContentFreeBlock({ type: 'kpi_card', value: 12 } as unknown as AskBlock)).toBe(false)
    expect(isContentFreeBlock({ type: 'some_future_block' } as unknown as AskBlock)).toBe(false)
  })

  it('null and non-objects are content-free rather than crashing a render', () => {
    expect(isContentFreeBlock(null)).toBe(true)
    expect(isContentFreeBlock(undefined)).toBe(true)
  })

  it('dropContentFreeBlocks keeps order and keeps the real ones', () => {
    const kept = dropContentFreeBlocks([
      readouts([]),
      { type: 'lead', content: 'Steady week.' } as unknown as AskBlock,
      readouts([{ role: 'risk', icon: '⚠', text: 'Stock is thin.' }]),
    ])
    expect(kept).toHaveLength(2)
    expect((kept[0] as unknown as Record<string, unknown>).type).toBe('lead')
    expect((kept[1] as unknown as Record<string, unknown>).type).toBe('brain_readouts')
  })

  it('dropping everything leaves an empty array, not a crash', () => {
    expect(dropContentFreeBlocks([readouts([])])).toEqual([])
    expect(dropContentFreeBlocks(null)).toEqual([])
  })
})

describe('S6 phase 1 · stopped at the source AND at both renderers', () => {
  it('the route drops content-free blocks before they reach a client', () => {
    expect(code(ROUTE)).toMatch(/dropContentFreeBlocks\(councilBlocks as AskBlockType\[\] \| null\)/)
  })

  it('it falls back to the prose lead rather than sending nothing', () => {
    expect(code(ROUTE)).toMatch(/kept\.length > 0 \? kept : \[\{ type: 'lead', content: councilText \}\]/)
  })

  it('BOTH renderers refuse to draw one that arrives anyway', () => {
    // From an older deploy, a replayed conversation, or a path nobody has thought about yet.
    for (const [name, src] of [['dashboard', DASH], ['aria', ARIA]] as const) {
      expect(code(src), name + ' renderer has no guard').toMatch(/if \(isContentFreeBlock\(block\)\) return null/)
    }
  })

  it('there is ONE definition of empty, not three', () => {
    for (const src of [DASH, ARIA, ROUTE]) {
      expect(code(src)).toMatch(/from '@\/lib\/aria\/block-content'/)
    }
  })

  it('MUTATION PROBE — rendering a heading with no content is detectable', () => {
    for (const [name, src] of [['dashboard', DASH], ['aria', ARIA]] as const) {
      const mutated = src.replace('if (isContentFreeBlock(block)) return null', '')
      expect(mutated, name).not.toBe(src)
      expect(code(mutated)).not.toMatch(/if \(isContentFreeBlock\(block\)\) return null/)
    }
  })
})
