import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { truncateAtWord, fallbackTitle, closeDanglingQuote } from './thread-title'

const root = join(__dirname, '..', '..', '..')
const CTX = readFileSync(join(root, 'src/lib/aria/ax-context.ts'), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S6 PHASE 3 — a suggestion chip rendered cut off mid-sentence.
 *
 * Cause: ax-context.ts:105 did `(a.recommendation ?? '').slice(0, 140)` — a raw cut, no word
 * boundary, no ellipsis. The owner cannot tell whether Aria stopped talking or the text stopped
 * fitting. S3 fixed exactly this class for thread titles; this is the SAME helper, not a second one.
 */
describe('S6 phase 3 · a truncation is visible and lands on a word', () => {
  const long = 'Revenue is below your weekly target and the gap is widening, so consider a midweek promotion'

  it('cuts on a word boundary, never mid-word', () => {
    const out = truncateAtWord(long, 40)
    expect(out.endsWith('…')).toBe(true)
    const body = out.replace(/…$/, '')
    expect(long.startsWith(body)).toBe(true)
    // the character after the cut in the original must be whitespace — i.e. we cut at a boundary
    expect(long[body.length] === undefined || /\s/.test(long[body.length]!)).toBe(true)
  })

  it('MARKS the cut, so a truncation is never mistaken for the end of a sentence', () => {
    expect(truncateAtWord(long, 40)).toMatch(/…$/)
  })

  it('leaves text that fits completely alone — no stray ellipsis', () => {
    expect(truncateAtWord('Nothing has gone through the till today.', 140))
      .toBe('Nothing has gone through the till today.')
  })

  it('never leaves a quote hanging open', () => {
    const out = truncateAtWord('the "oat milk order from Kirkwood that keeps arriving late', 22)
    expect((out.match(/"/g) ?? []).length % 2).toBe(0)
  })

  it('a single word longer than the budget still returns something', () => {
    // No boundary to cut on — a hard cut beats returning an empty chip.
    const out = truncateAtWord('Supercalifragilisticexpialidocious', 10)
    expect(out.length).toBeGreaterThan(1)
    expect(out.endsWith('…')).toBe(true)
  })

  it('collapses whitespace so a wrapped source string does not render ragged', () => {
    expect(truncateAtWord('  too    many\n\nspaces  ', 140)).toBe('too many spaces')
  })

  it('empty input gives empty output, not "undefined"', () => {
    expect(truncateAtWord(null, 40)).toBe('')
    expect(truncateAtWord(undefined, 40)).toBe('')
    expect(truncateAtWord('   ', 40)).toBe('')
  })
})

describe('S6 phase 3 · ONE truncation rule, shared', () => {
  it('the notice subtitle uses it — the raw slice is gone', () => {
    const c = code(CTX)
    expect(c).toMatch(/subtitle: truncateAtWord\(a\.recommendation, 140\)/)
    expect(c).not.toMatch(/\.slice\(0, 140\)/)
  })

  it('thread titles use the same helper — S3 fixed the class, this reuses it', () => {
    // Same rule, so the two surfaces cannot disagree about what a truncation looks like.
    expect(fallbackTitle('Tell me about "' + 'x'.repeat(200) + '"')).toMatch(/…$/)
    expect(closeDanglingQuote('a "quoted')).not.toMatch(/"$/)
  })

  it('MUTATION PROBE — restoring the raw slice is detectable', () => {
    const mutated = CTX.replace('truncateAtWord(a.recommendation, 140)', "(a.recommendation ?? '').slice(0, 140)")
    expect(mutated).not.toBe(CTX)
    expect(code(mutated)).toMatch(/\.slice\(0, 140\)/)
  })
})
