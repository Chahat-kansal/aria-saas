import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatNoticeContext, isValidNoticeId, isValidNoticeSource, type NoticeRecord } from './notice-context'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The production row behind the reported turn, verbatim from aria_actions. */
const REPORTED: NoticeRecord = {
  id: '6f867757-95c6-475c-bc46-b0462090ff57',
  title: 'Briefing pipeline stalled — only 0 rows written in last 24h',
  category: 'system_health',
  priority: 'high',
  status: 'pending',
  source: 'cron:aria-health-monitor',
  recommendation: 'Check the generate-briefings cron. If 0 rows in 24h, the briefing pipeline is stalled.',
  expected_impact: 'data integrity',
  confidence: 'high',
  payload: { value: 0, details: { business_name: 'Smoke Test Café', daily_briefings: 0 } },
  created_at: '2026-08-29T05:01:06.207Z',
}

describe('S8 phase 3 · the notice carries its own identity into the turn', () => {
  it('THE REPORTED TURN: the answer to "what system is this?" is in the block', () => {
    // Aria replied "Where did you see this message? What system or service is it related to?"
    // while `cron:aria-health-monitor` sat in the row her own notice was rendered from.
    const block = formatNoticeContext(REPORTED, 'aria_action')
    expect(block).toContain('cron:aria-health-monitor')
    expect(block).toContain('system_health')
    expect(block).toContain('Check the generate-briefings cron')
    expect(block).toContain('data integrity')
    expect(block).toContain('6f867757-95c6-475c-bc46-b0462090ff57')
    // and the evidence the notice fired on
    expect(block).toContain('"value":0')
    // RULE 19 — the model is given the fact, not forbidden the symptom.
    expect(block).toContain('it is yours')
    expect(block).toContain('Do NOT ask where they saw it')
  })

  it('NEVER INVENTS — a missing column produces no line, not "unknown"', () => {
    const thin: NoticeRecord = { id: 'a', title: 'Something happened' }
    const block = formatNoticeContext(thin, 'aria_action')
    expect(block).toContain('title: Something happened')
    expect(block).not.toMatch(/category|priority|recommendation|expected_impact|evidence/)
    expect(block).not.toMatch(/unknown|n\/a|null|undefined/i)
  })

  it('a record with nothing to say produces NOTHING, not an empty heading', () => {
    // The same rule the block renderers and the synthesis prompt now follow: no chrome over
    // an empty body, in a prompt or anywhere else.
    expect(formatNoticeContext({ id: '' }, 'aria_action')).toBe('')
    expect(formatNoticeContext(null, 'aria_action')).toBe('')
    expect(formatNoticeContext(undefined, 'deliverable')).toBe('')
  })

  it('a blank string is not content', () => {
    expect(formatNoticeContext({ id: 'x', title: '   ', category: '' }, 'aria_action')).toBe('')
  })

  it('a deliverable is described as a report, not as a notice', () => {
    const block = formatNoticeContext({ id: 'd1', title: 'Weekly report', output_kind: 'weekly_report' }, 'deliverable')
    expect(block).toContain('a report Aria produced')
    expect(block).toContain('kind: weekly_report')
  })

  it('a large payload is truncated so it cannot crowd out the business context', () => {
    const huge = { id: 'x', title: 't', payload: { blob: 'y'.repeat(5000) } }
    const block = formatNoticeContext(huge, 'aria_action')
    expect(block.length).toBeLessThan(1200)
    expect(block).toContain('evidence: ')
  })

  it('ONLY A UUID IS ACCEPTED — this value goes straight into a database filter', () => {
    expect(isValidNoticeId('6f867757-95c6-475c-bc46-b0462090ff57')).toBe(true)
    expect(isValidNoticeId('no-sales-today')).toBe(false)   // a computed notice has no row
    expect(isValidNoticeId('low-stock')).toBe(false)
    expect(isValidNoticeId("' or 1=1--")).toBe(false)
    expect(isValidNoticeId(null)).toBe(false)
    expect(isValidNoticeId(12)).toBe(false)
    expect(isValidNoticeSource('aria_action')).toBe(true)
    expect(isValidNoticeSource('deliverable')).toBe(true)
    expect(isValidNoticeSource('aria_conversations')).toBe(false)   // no table-name smuggling
    expect(isValidNoticeSource('computed')).toBe(false)             // nothing to look up
  })
})

describe('S8 phase 3 · every deep link carries the reference, and the lookup is scoped', () => {
  it('the notice type says which record its id refers to', () => {
    expect(strip(read('src/lib/aria/ax-context-types.ts'))).toMatch(/source\?: 'aria_action' \| 'computed'/)
    const ctx = strip(read('src/lib/aria/ax-context.ts'))
    expect(ctx).toContain("source: 'aria_action' as const")
    // the two derived notices have no row and say so
    expect((ctx.match(/source: 'computed' as const/g) ?? []).length).toBe(2)
  })

  it('ALL THREE deep-link sites pass a reference — the sibling sweep found three, not one', () => {
    const sites: Array<[string, string]> = [
      ['src/components/ask-aria-ax/AskAriaTransition.tsx', "source: 'aria_action'"],
      ['src/components/ask-aria-ax/rooms/AwaitingRoom.tsx', "source: 'aria_action'"],
      ['src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx', "source: 'deliverable'"],
    ]
    const missing = sites.filter(([f, needle]) => !strip(read(f)).includes(needle)).map(([f]) => f)
    expect(missing, 'deep links still sending only a title: ' + missing.join(', ')).toEqual([])
  })

  it('the rooms are NOT handed `ask` raw — the ref would land in the branch slot', () => {
    // `onPrompt={ask}` typechecks, because both the second parameters are optional objects, and
    // would silently send the notice reference as a branch intent instead.
    const src = strip(read('src/components/ask-aria-ax/AskAriaTransition.tsx'))
    expect(src).not.toMatch(/onPrompt=\{ask\}/)
    expect(src).toMatch(/onPrompt=\{\(p, ref\) => void ask\(p, undefined, ref\)\}/)
  })

  it('THE LOOKUP IS SCOPED TO THE BUSINESS — three rows share the reported title', () => {
    // Smoke Test Café, Global Liquor and Sip all have a row titled
    // "Briefing pipeline stalled — only 0 rows written in last 24h". An id-only lookup would be a
    // cross-business read waiting to happen.
    const route = strip(read('src/app/api/aria/ask/route.ts'))
    const i = route.indexOf('noticeRef.source')
    expect(i, 'the notice lookup is not in the route').toBeGreaterThan(-1)
    const block = route.slice(i, i + 900)
    expect(block).toContain(".eq('id', noticeRef.id)")
    expect(block).toContain(".eq('business_id', bid)")
    // RULE 7 — the error is checked, never discarded into an empty result.
    expect(block).toMatch(/if \(noticeErr\)/)
  })

  it('the route never trusts client-sent notice CONTENT', () => {
    const route = strip(read('src/app/api/aria/ask/route.ts'))
    // Only an id and a source are read off the body; the row is re-read server-side.
    expect(route).toMatch(/notice_ref\?: \{ id\?: unknown; source\?: unknown \}/)
    expect(route).toMatch(/isValidNoticeId\(body\.notice_ref\?\.id\)/)
    expect(route).not.toMatch(/body\.notice_ref\.(title|recommendation|subtitle|text)/)
  })

  it('MUTATION PROBE — dropping the reference sends the turn back to a bare title', () => {
    // What the old code did: the display string, and nothing else.
    const withRef = formatNoticeContext(REPORTED, 'aria_action')
    const withoutRef = formatNoticeContext(null, 'aria_action')
    expect(withoutRef).toBe('')
    expect(withRef).not.toBe(withoutRef)
    // With no block, all the council receives is the sentence that caused the bug.
    const bareTurn = 'OWNER_QUESTION: Tell me about "' + REPORTED.title + '"'
    expect(bareTurn).not.toContain('cron:aria-health-monitor')
    expect(bareTurn).not.toContain('system_health')
  })

  it('MUTATION PROBE — matching on the title instead of the id is ambiguous by construction', () => {
    // Three real rows, one title. This is why the reference travels rather than the text.
    const rows = [
      { ...REPORTED, id: '6f867757-95c6-475c-bc46-b0462090ff57' },
      { ...REPORTED, id: '2ea3b3ea-d8e0-4bb2-8a5f-b4f5dcdcb21a' },
      { ...REPORTED, id: '7dd519d2-4a74-45b0-b29d-3dbcdf8d5259' },
    ]
    expect(new Set(rows.map(r => r.title)).size).toBe(1)
    expect(new Set(rows.map(r => r.id)).size).toBe(3)
  })
})
