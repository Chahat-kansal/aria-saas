import { describe, it, expect } from 'vitest'
import { hasUnclosedFence, trailingIncompleteTableRows, stabiliseStreamingMarkdown } from './markdown-stream'

const TABLE = [
  'Here is the week.',
  '',
  '| Day | Takings |',
  '| --- | ------: |',
  '| Mon | $1,204  |',
  '| Sat | $3,980  |',
].join('\n')

describe('phase 8 · a stream that cuts mid-table', () => {
  it('withholds a pipe row that is not yet a table', () => {
    const midTable = 'Here is the week.\n\n| Day | Takings |'
    expect(trailingIncompleteTableRows(midTable)).toBe(1)
    expect(stabiliseStreamingMarkdown(midTable, true)).toBe('Here is the week.\n')
  })

  it('renders the table as soon as the delimiter row arrives', () => {
    const withDelim = 'Here is the week.\n\n| Day | Takings |\n| --- | ------: |'
    expect(trailingIncompleteTableRows(withDelim)).toBe(0)
    expect(stabiliseStreamingMarkdown(withDelim, true)).toBe(withDelim)
  })

  it('leaves a complete table completely alone', () => {
    expect(stabiliseStreamingMarkdown(TABLE, true)).toBe(TABLE)
    expect(stabiliseStreamingMarkdown(TABLE, false)).toBe(TABLE)
  })

  it('the FINAL text is never modified, whatever state it cut in', () => {
    const half = 'Here is the week.\n\n| Day | Takings |'
    expect(stabiliseStreamingMarkdown(half, false)).toBe(half)
  })
})

describe('phase 8 · a stream that cuts mid-code-fence', () => {
  it('detects an open fence', () => {
    expect(hasUnclosedFence('```sql\nselect 1')).toBe(true)
    expect(hasUnclosedFence('```sql\nselect 1\n```')).toBe(false)
    expect(hasUnclosedFence('no fences here')).toBe(false)
  })

  it('closes it while streaming so the fence cannot swallow the rest of the answer', () => {
    const out = stabiliseStreamingMarkdown('```sql\nselect 1', true)
    expect(hasUnclosedFence(out)).toBe(false)
    expect(out).toContain('select 1')
  })

  it('does not close it once the answer is complete', () => {
    expect(stabiliseStreamingMarkdown('```sql\nselect 1', false)).toBe('```sql\nselect 1')
  })

  it('handles a fence AND an incomplete table in the same chunk', () => {
    const messy = '```sql\nselect 1\n```\n\n| Day | Takings |'
    const out = stabiliseStreamingMarkdown(messy, true)
    expect(trailingIncompleteTableRows(out)).toBe(0)
    expect(hasUnclosedFence(out)).toBe(false)
  })

  it('the empty and single-token cases do not throw', () => {
    expect(stabiliseStreamingMarkdown('', true)).toBe('')
    expect(stabiliseStreamingMarkdown('|', true)).toBe('')
  })
})
