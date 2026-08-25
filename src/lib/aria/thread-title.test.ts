import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildTitlePrompt, sanitiseTitle, fallbackTitle, shouldGenerateTitle, MAX_TITLE } from './thread-title'

const root = join(__dirname, '..', '..', '..')
const ROUTE = readFileSync(join(root, 'src/app/api/aria/ask/route.ts'), 'utf8')

describe('phase 6 · one call per thread, ever', () => {
  it('generates only when the conversation is being created', () => {
    expect(shouldGenerateTitle({ isNewConversation: true, question: 'how did last week go?' })).toBe(true)
    expect(shouldGenerateTitle({ isNewConversation: false, question: 'how did last week go?' })).toBe(false)
  })

  it('does not generate for an empty question', () => {
    expect(shouldGenerateTitle({ isNewConversation: true, question: '   ' })).toBe(false)
  })

  it('THE ROUTE NEVER UPDATES A TITLE — which is what makes a rename permanent', () => {
    // Both sprint rules fall out of this one property, so it is asserted directly rather than
    // trusting a flag that can be forgotten. Comments stripped so the explanation cannot satisfy it.
    const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const updates = [...code.matchAll(/\.update\(\{[\s\S]{0,400}?\}\)/g)].map(m => m[0])
    expect(updates.length).toBeGreaterThan(0)                 // there ARE updates, so this is meaningful
    for (const u of updates) {
      expect(u, 'a title UPDATE would overwrite an owner rename').not.toMatch(/\btitle\s*:/)
    }
  })

  it('the title is set on the INSERT path only', () => {
    expect(ROUTE).toMatch(/shouldGenerateTitle\(\{ isNewConversation: true/)
    expect(ROUTE).toMatch(/agentKey: 'thread_title'/)
  })

  it('MUTATION PROBE — a title UPDATE is detectable', () => {
    const mutated = ROUTE.replace('last_intent: intentType,', "last_intent: intentType, title: 'retitled',")
    expect(mutated).not.toBe(ROUTE)
    const code = mutated.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const updates = [...code.matchAll(/\.update\(\{[\s\S]{0,400}?\}\)/g)].map(m => m[0])
    expect(updates.some(u => /\btitle\s*:/.test(u))).toBe(true)
  })
})

describe('phase 6 · the title itself', () => {
  it('asks for a subject, not a sentence, and includes the answer for context', () => {
    const p = buildTitlePrompt('and oat milk?', 'You run dry Thursday afternoon.')
    expect(p).toMatch(/2 to 6 words/)
    expect(p).toContain('and oat milk?')
    expect(p).toContain('You run dry Thursday afternoon.')
  })

  it('strips the wrappers models actually produce', () => {
    expect(sanitiseTitle('"Last week\'s takings"', 'q')).toBe("Last week's takings")
    expect(sanitiseTitle('Title: Oat milk supply', 'q')).toBe('Oat milk supply')
    expect(sanitiseTitle('Oat milk supply.', 'q')).toBe('Oat milk supply')
    expect(sanitiseTitle('Oat milk supply\nand more prose', 'q')).toBe('Oat milk supply')
    expect(sanitiseTitle('  Oat   milk   supply  ', 'q')).toBe('Oat milk supply')
  })

  it('clamps to a length a thread row can show, on a word boundary', () => {
    const long = 'A very long title about last week takings and oat milk and suppliers and rosters'
    const t = sanitiseTitle(long, 'q')
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE)
    expect(t).not.toMatch(/\s$/)
    expect(long).toContain(t)              // it is a prefix, not a mangling
  })

  it('never returns empty — an empty title is worse than a crude one', () => {
    expect(sanitiseTitle('', 'how did last week go?')).toBe('how did last week go?')
    expect(sanitiseTitle('   ', 'how did last week go?')).toBe('how did last week go?')
    expect(sanitiseTitle(null, '')).toBe('New conversation')
  })

  it('the fallback is the question, truncated honestly with an ellipsis', () => {
    expect(fallbackTitle('short one')).toBe('short one')
    const long = fallbackTitle('x'.repeat(200))
    expect(long.length).toBeLessThanOrEqual(MAX_TITLE + 1)
    expect(long.endsWith('…')).toBe(true)
  })

  it('generation failure falls back rather than blocking the answer', () => {
    // The route races the title call against a 6s timeout and catches everything.
    expect(ROUTE).toMatch(/title timeout/)
    expect(ROUTE).toMatch(/\[thread-title\] falling back to the question/)
  })
})
