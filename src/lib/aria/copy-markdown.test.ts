import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toClipboardMarkdown, hasMarkdownStructure } from './copy-markdown'

const root = join(__dirname, '..', '..', '..')
const SURFACE = readFileSync(join(root, 'src/components/ask-aria-ax/AskAriaTransition.tsx'), 'utf8')

/** A realistic Aria answer: prose, a real table of numbers, a fence, emphasis and a list. */
const ANSWER = [
  '## Last week',
  '',
  'Steady week — **$14,208** across 612 sales, up 6%.',
  '',
  '| Day | Sales | Takings |',
  '| --- | ----: | ------: |',
  '| Mon | 71    | $1,204  |',
  '| Sat | 168   | $3,980  |',
  '',
  '- Oat milk runs out Thursday',
  '- Two suppliers unpaid',
  '',
  '```sql',
  'select sum(total_amount) from pos_sales where status = %s;',
  '```',
  '',
  '[DELIVERABLE:weekly_summary]',
].join('\n')

describe('phase 4 · copy is raw markdown, not rendered text', () => {
  it('round-trips as valid markdown — every structure survives', () => {
    const copied = toClipboardMarkdown(ANSWER)
    const s = hasMarkdownStructure(copied)
    expect(s.table).toBe(true)
    expect(s.fence).toBe(true)
    expect(s.heading).toBe(true)
    expect(s.emphasis).toBe(true)
    expect(s.list).toBe(true)
  })

  it('keeps the table pipes and the alignment row intact', () => {
    const copied = toClipboardMarkdown(ANSWER)
    expect(copied).toContain('| Day | Sales | Takings |')
    expect(copied).toContain('| --- | ----: | ------: |')
    expect(copied).toContain('| Sat | 168   | $3,980  |')
  })

  it('strips UI-only sentinels, which are not part of the answer', () => {
    const copied = toClipboardMarkdown(ANSWER)
    expect(copied).not.toContain('[DELIVERABLE:')
    expect(copied).not.toContain('json_blocks')
  })

  it('MUTATION PROBE — copying innerText loses every structure', () => {
    // What `element.innerText` gives you: the text with markup flattened away. This is the failure
    // the phase exists to prevent, and the assertions above are what catch it.
    const flattened = ANSWER
      .replace(/```[a-z]*\n?/g, '')
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\|/g, ' ')
    const s = hasMarkdownStructure(flattened)
    expect(s.table).toBe(false)
    expect(s.fence).toBe(false)
    expect(s.heading).toBe(false)
    expect(s.emphasis).toBe(false)
    expect(s.list).toBe(false)
  })

  it('handles an empty or missing answer without throwing', () => {
    expect(toClipboardMarkdown('')).toBe('')
    expect(toClipboardMarkdown(null)).toBe('')
    expect(toClipboardMarkdown(undefined)).toBe('')
  })

  it('does not collapse a fenced block that contains blank lines', () => {
    const src = '```\na\n\n\nb\n```'
    expect(toClipboardMarkdown(src)).toContain('```')
  })
})

describe('the surface copies the source, never the DOM', () => {
  it('writes the model text through toClipboardMarkdown', () => {
    expect(SURFACE).toMatch(/writeText\(toClipboardMarkdown\(body\)\)/)
    expect(SURFACE).toMatch(/copyAnswer\(i, t\.text\)/)
  })

  it('never reads innerText or textContent to build a copy', () => {
    const code = SURFACE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\.innerText/)
    expect(code).not.toMatch(/\.textContent/)
  })

  it('MUTATION PROBE — switching the copy to innerText is detectable', () => {
    const mutated = SURFACE.replace('writeText(toClipboardMarkdown(body))', 'writeText(ref.current.innerText)')
    expect(mutated).not.toBe(SURFACE)
    expect(mutated).toMatch(/\.innerText/)
    expect(mutated).not.toMatch(/writeText\(toClipboardMarkdown\(body\)\)/)
  })
})
