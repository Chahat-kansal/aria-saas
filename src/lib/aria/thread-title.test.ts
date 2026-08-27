import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildTitlePrompt, sanitiseTitle, fallbackTitle, shouldGenerateTitle, MAX_TITLE, extractTitleFromJson, subjectOf, looksLikeLeakedJson } from './thread-title'

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


/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * S3 PHASE 2 — the two live failures.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

describe('S3 phase 2a · a raw model response never reaches the title column', () => {
  // These are the EXACT shapes found in production, plus the two the old cleaner mangled worse.
  it('pretty-printed JSON yields the title, not a brace', () => {
    // The shipped code returned "{" here — the first line of the object.
    const out = sanitiseTitle('{\n  "title": "Revenue Shortfall Analysis",\n  "reason": "x"\n}', 'q')
    expect(out).toBe('Revenue Shortfall Analysis')
  })

  it('compact JSON yields the title, not the whole blob', () => {
    expect(sanitiseTitle('{"title":"POS Payment Sync","why":"y"}', 'q')).toBe('POS Payment Sync')
  })

  it('fenced JSON yields the title, not the fence language', () => {
    // The shipped code returned "json".
    expect(sanitiseTitle('```json\n{"title":"Stock levels"}\n```', 'q')).toBe('Stock levels')
  })

  it('a TRUNCATED object still yields its title — the common real failure', () => {
    // The model hit its token cap mid-object. This is how both live rows were produced.
    expect(sanitiseTitle('{ "title": "Revenue Shortfall Analysis",', 'q')).toBe('Revenue Shortfall Analysis')
  })

  it('accepts name/label/subject as well as title', () => {
    expect(sanitiseTitle('{"name":"Oat milk supply"}', 'q')).toBe('Oat milk supply')
  })

  it('FAILS CLOSED to the question when the object has no usable title', () => {
    expect(sanitiseTitle('{"reason":"no title here"}', 'how did last week go?')).toBe('how did last week go?')
  })

  it('FAILS CLOSED rather than storing anything with a brace in it', () => {
    expect(sanitiseTitle('{ garbage', 'how did last week go?')).toBe('how did last week go?')
    expect(looksLikeLeakedJson('{ "title"')).toBe(true)
    expect(looksLikeLeakedJson('Last week takings')).toBe(false)
  })

  it('a plain string title is completely unaffected', () => {
    expect(sanitiseTitle('Last week takings', 'q')).toBe('Last week takings')
    expect(extractTitleFromJson('Last week takings')).toBeNull()
  })

  it('MUTATION PROBE — removing the parse step reinstates the bug', () => {
    // Emulates deleting the extractTitleFromJson call: fall straight through to line-splitting.
    const withoutParse = (raw: string) => raw.split('\n')[0]!.trim()
    expect(withoutParse('{\n  "title": "Revenue Shortfall Analysis",\n}')).toBe('{')
    expect(sanitiseTitle('{\n  "title": "Revenue Shortfall Analysis",\n}', 'q')).not.toBe('{')
  })
})

describe('S3 phase 2b · a title distinguishes one thread from another', () => {
  it('strips the stock opener so the SUBJECT leads', () => {
    expect(subjectOf('Tell me about "Revenue below weekly target"')).toBe('Revenue below weekly target')
    expect(subjectOf('Can you tell me more about oat milk')).toBe('oat milk')
    expect(subjectOf('What about Tuesday')).toBe('Tuesday')
  })

  it('THE LIVE CASE: three identical-looking titles become the same distinct subject', () => {
    // Before: all three truncated to `Tell me about "Briefing pipeline stalled - only` and were
    // indistinguishable from each other AND from the revenue thread beside them.
    const q = 'Tell me about "Briefing pipeline stalled — only 0 rows written in last 24h"'
    const t = fallbackTitle(q)
    expect(t.startsWith('Tell me about')).toBe(false)
    expect(t.startsWith('Briefing pipeline stalled')).toBe(true)
  })

  it('TEN launcher questions produce TEN distinguishable titles', () => {
    const subjects = [
      'Revenue below weekly target', 'Briefing pipeline stalled', '53 Aria recommendations pending review',
      'Stock running low on oat milk', 'Customer churn risk rising', 'Payment sync failing overnight',
      'Weekend staffing below cover', 'Supplier price increase detected', 'Loyalty redemptions falling',
      'Waste above the usual range',
    ]
    const titles = subjects.map(sub => fallbackTitle('Tell me about "' + sub + '"'))
    expect(new Set(titles).size).toBe(10)
    expect(titles.every(t => !t.startsWith('Tell me about'))).toBe(true)
  })

  it('a question that is ONLY the opener is left alone rather than emptied', () => {
    expect(fallbackTitle('Tell me about')).toBe('Tell me about')
  })

  it('never returns an empty title', () => {
    expect(fallbackTitle('')).toBe('New conversation')
    expect(fallbackTitle('   ')).toBe('New conversation')
  })

  it('an internal quote is preserved — only WRAPPING quotes are dropped', () => {
    expect(subjectOf('the "oat milk" order')).toBe('the "oat milk" order')
  })

  it('still respects the length ceiling', () => {
    const t = fallbackTitle('Tell me about "' + 'x'.repeat(200) + '"')
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE + 1) // +1 for the ellipsis
  })
})
