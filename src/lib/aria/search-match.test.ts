import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bestMatchingMessage, searchTerms, snippetAround } from './search-match'
import type { ThreadMessage } from './conversation-branch'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const SEARCH_ROUTE = read('src/app/api/aria/ask/search/route.ts')
const THREAD_ROUTE = read('src/app/api/aria/ask/thread/route.ts')
const ASK_ROUTE = read('src/app/api/aria/ask/route.ts')

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const thread = (): ThreadMessage[] => [
  { role: 'user', content: 'how did last week go?' },
  { role: 'assistant', content: 'Steady week — $14,208 across 612 sales.' },
  { role: 'user', content: 'and the oat milk order from Kirkwood?' },
  { role: 'assistant', content: 'Nine left, 4.2 a day, so you run dry Thursday.' },
]

describe('S2B phase 4 · a search result opens at the right message', () => {
  it('points at the message that actually matched', () => {
    const hit = bestMatchingMessage(thread(), 'Kirkwood')
    expect(hit.index).toBe(2)
    expect(hit.role).toBe('user')
    expect(hit.snippet).toContain('Kirkwood')
  })

  it('prefers the message containing the MOST distinct terms', () => {
    const hit = bestMatchingMessage(thread(), 'oat milk Kirkwood')
    expect(hit.index).toBe(2)
  })

  it('returns -1 when the thread matched on its TITLE, not a message', () => {
    // A legitimate outcome, not a failure: search_tsv covers title + messages, so a thread can
    // match with no message containing the term. The UI opens it at the top rather than pretending.
    const hit = bestMatchingMessage(thread(), 'zzzznotpresent')
    expect(hit.index).toBe(-1)
    expect(hit.snippet).toBe('')
  })

  it('ignores superseded branches, because it is given the live path only', () => {
    // renderPath() runs in the route before this is called, so a regenerated answer cannot be
    // returned as a search hit the owner can no longer see.
    const live = thread().filter((_, i) => i !== 3)
    expect(bestMatchingMessage(live, 'Thursday').index).toBe(-1)
  })

  it('handles what people actually type', () => {
    expect(searchTerms('"oat milk" OR kirkwood')).toEqual(['oat', 'milk', 'kirkwood'])
    expect(searchTerms('-refunds')).toEqual(['refunds'])
    expect(searchTerms('a')).toEqual([])
    expect(searchTerms('')).toEqual([])
  })

  it('keeps figures searchable as written', () => {
    expect(searchTerms('$14,208 and 4.2')).toContain('4.2')
  })

  it('a snippet is readable and never cuts mid-word', () => {
    const long = 'word '.repeat(80) + 'KIRKWOOD ' + 'word '.repeat(80)
    const s = snippetAround(long, long.indexOf('KIRKWOOD'))
    expect(s).toContain('KIRKWOOD')
    expect(s.startsWith('…')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    expect(s.length).toBeLessThan(long.length)
  })

  it('a short message is returned whole, with no ellipses', () => {
    expect(snippetAround('Nine left, 4.2 a day.', 0)).toBe('Nine left, 4.2 a day.')
  })
})

describe('S2B phase 4 · the search query is scoped, and excludes tombstones', () => {
  it('filters by business_id ON THE QUERY, not via RLS', () => {
    // PROVEN ON LIVE DATA: searching "revenue" scoped returns 95; unscoped returns 165 — 70 threads
    // belonging to another business. This filter is the only thing preventing that.
    expect(code(SEARCH_ROUTE)).toMatch(/\.eq\('business_id', bid\)/)
  })

  it('never returns a soft-deleted thread', () => {
    expect(code(SEARCH_ROUTE)).toMatch(/\.is\('deleted_at', null\)/)
  })

  it('uses websearch_to_tsquery over the GIN-indexed column', () => {
    expect(code(SEARCH_ROUTE)).toMatch(/\.textSearch\('search_tsv', q, \{ type: 'websearch', config: 'english' \}\)/)
  })

  it('builds NO embedding or vector pipeline', () => {
    // Explicitly forbidden by the sprint, and right at 288 threads.
    expect(code(SEARCH_ROUTE)).not.toMatch(/embedding|pgvector|cosine|<=>/i)
  })

  it('an empty or one-character query returns nothing, not everything', () => {
    expect(code(SEARCH_ROUTE)).toMatch(/q\.length < 2/)
  })

  it('MUTATION PROBE — removing the business filter is caught', () => {
    // The most important mutation in the sprint.
    const mutated = SEARCH_ROUTE.replace(".eq('business_id', bid)", '')
    expect(mutated).not.toBe(SEARCH_ROUTE)
    expect(code(mutated)).not.toMatch(/\.eq\('business_id', bid\)/)
  })

  it('MUTATION PROBE — letting tombstones back into results is caught', () => {
    const mutated = SEARCH_ROUTE.replace(".is('deleted_at', null)", '')
    expect(mutated).not.toBe(SEARCH_ROUTE)
    expect(code(mutated)).not.toMatch(/\.is\('deleted_at', null\)/)
  })
})

describe('S2B phase 3 · rename and pin', () => {
  it('the rename write is scoped and skips tombstoned threads', () => {
    const c = code(THREAD_ROUTE)
    expect(c).toMatch(/\.eq\('business_id', bid\)/)
    expect(c).toMatch(/\.is\('deleted_at', null\)/)
  })

  it('a rename records title_edited_at', () => {
    expect(code(THREAD_ROUTE)).toMatch(/patch\.title_edited_at = new Date\(\)\.toISOString\(\)/)
  })

  it('pin stores a TIMESTAMP, not a flag, so pins order among themselves', () => {
    expect(code(THREAD_ROUTE)).toMatch(/patch\.pinned_at = body\.pinned \? new Date\(\)\.toISOString\(\) : null/)
  })

  it('an empty rename is refused rather than erasing the name', () => {
    expect(code(THREAD_ROUTE)).toMatch(/A thread needs a name/)
  })

  it('THE AUTO-TITLER STILL CANNOT OVERWRITE A RENAME — the S1 mechanism, not a second one', () => {
    // S1 phase 6's guarantee is structural: /api/aria/ask writes a title exactly once, on INSERT,
    // and issues no title UPDATE anywhere. This route is therefore the ONLY title writer, and there
    // is nothing here to defend against. Re-asserted so the guarantee cannot rot silently.
    const c = code(ASK_ROUTE)
    const updates = [...c.matchAll(/\.update\(\{[\s\S]{0,400}?\}\)/g)].map(m => m[0])
    expect(updates.length).toBeGreaterThan(0)
    for (const u of updates) {
      expect(u, 'the ask route must never UPDATE a title').not.toMatch(/\btitle\s*:/)
    }
  })

  it('MUTATION PROBE — an auto-titler title UPDATE is caught', () => {
    const mutated = ASK_ROUTE.replace('last_intent: intentType,', "last_intent: intentType, title: 'auto',")
    expect(mutated).not.toBe(ASK_ROUTE)
    const updates = [...code(mutated).matchAll(/\.update\(\{[\s\S]{0,400}?\}\)/g)].map(m => m[0])
    expect(updates.some(u => /\btitle\s*:/.test(u))).toBe(true)
  })
})
