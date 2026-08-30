import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseAriaResponse, tolerantJSONParse, hasArtifact, ARTIFACT_FALLBACK_TEXT,
} from './artifact-segments'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ART = (type: string, title: string, json: string) =>
  '<aria_artifact type="' + type + '" title="' + title + '">' + json + '</aria_artifact>'

describe('S9 phase 3 · the artifact parser, moved not rewritten', () => {
  it('splits prose and artifacts, in order', () => {
    const text = 'Takings are up.\n' + ART('bar_chart', 'Revenue', '{"values":[1,2,3]}') + '\nAsk me more.'
    const { segments, failures } = parseAriaResponse(text)
    expect(failures).toEqual([])
    expect(segments.map(s => s.kind)).toEqual(['text', 'artifact', 'text'])
    expect(segments[0]).toEqual({ kind: 'text', content: 'Takings are up.' })
    expect(segments[1]).toEqual({ kind: 'artifact', type: 'bar_chart', title: 'Revenue', data: { values: [1, 2, 3] } })
    expect(segments[2]).toEqual({ kind: 'text', content: 'Ask me more.' })
  })

  it('a title is optional; an artifact with none still renders', () => {
    const { segments } = parseAriaResponse('<aria_artifact type="table">{"rows":[]}</aria_artifact>')
    expect(segments[0]).toMatchObject({ kind: 'artifact', type: 'table', title: undefined })
  })

  it('MALFORMED JSON becomes an honest sentence AND a reportable failure', () => {
    const { segments, failures } = parseAriaResponse(ART('bar_chart', 'Revenue', '{"values":[1,2,'))
    expect(segments).toEqual([{ kind: 'text', content: ARTIFACT_FALLBACK_TEXT }])
    expect(failures).toHaveLength(1)
    expect(failures[0]!.type).toBe('bar_chart')
    expect(failures[0]!.raw.length).toBeLessThanOrEqual(500)
    // The owner is told something is wrong. They are never shown raw JSON, and never a chart of
    // invented data — the fallback is a sentence, not a guess at what the numbers were.
    expect(segments[0]).not.toMatchObject({ kind: 'artifact' })
  })

  it('THE TOLERANT LADDER RECOVERS MODEL TICS, BUT NEVER ACCEPTS A TRUNCATED OBJECT', () => {
    expect(tolerantJSONParse('{"a":1,}')).toEqual({ a: 1 })              // trailing comma
    expect(tolerantJSONParse("{'a':1}")).toEqual({ a: 1 })                // single quotes
    expect(tolerantJSONParse('{"a":1')).toBeNull()                        // truncated -> refused
    expect(tolerantJSONParse('{"a":')).toBeNull()
    // S4's rule, still standing: the fix for truncation is the token budget, never a parser that
    // accepts half an object.
  })

  it('no artifact means no work — hasArtifact is the cheap guard', () => {
    expect(hasArtifact('just prose')).toBe(false)
    expect(hasArtifact('a ' + ART('t', 'x', '{}') + ' b')).toBe(true)
    const { segments, failures } = parseAriaResponse('just prose')
    expect(segments).toEqual([{ kind: 'text', content: 'just prose' }])
    expect(failures).toEqual([])
  })

  it('the regex has no sticky-state bug across calls', () => {
    // A module-level /g regex reused between calls carries lastIndex and silently skips matches on
    // every second call. parseAriaResponse builds a fresh one; this proves it.
    const t = ART('a', 'A', '{"v":1}')
    for (let i = 0; i < 3; i++) {
      expect(parseAriaResponse(t).segments.filter(s => s.kind === 'artifact')).toHaveLength(1)
    }
    for (let i = 0; i < 3; i++) expect(hasArtifact(t)).toBe(true)
  })
})

describe('S9 phase 3 · the migration is a reuse, not a second implementation', () => {
  it('ONE parser — classic no longer carries its own', () => {
    const classic = strip(read('src/app/dashboard/ask-aria/classic/page.tsx'))
    // The N-copies rule: one survives. classic keeps a thin wrapper that adds the reporting call,
    // but the regex and the tolerant ladder exist in exactly one place.
    expect(classic).not.toMatch(/const cleanups: Array<\(s: string\) => string>/)
    expect(classic).not.toMatch(/<aria_artifact\\s\+type=/)
    expect(classic).toContain("from '@/lib/aria/artifact-segments'")
  })

  it('the default surface renders artifacts and reuses AriaArtifact', () => {
    const am = strip(read('src/components/ask-aria-ax/AnswerMarkdown.tsx'))
    expect(am).toContain("from '@/components/aria/AriaArtifact'")
    expect(am).toContain('parseAriaResponse')
    expect(am).toContain('<AriaArtifact')
    // Reporting happens in an effect, never during render.
    expect(am).toMatch(/useEffect\(\(\) => \{\s*if \(parsed\?\.failures\.length\)/)
  })

  it('Save to Files and Schedule are on the default surface, and Email is NOT', () => {
    const room = strip(read('src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx'))
    expect(room).toContain('SaveToFilesButton')
    expect(room).toContain("sourceKind=\"ask_aria_deliverable\"")
    expect(room).toContain('/api/aria/intelligence/schedules')
    expect(room).toContain('/api/aria/deliverable-pdf')
    // SENDING IS PARKED. deliverable-email stays on /classic — this asserts the park held, so a
    // later sprint cannot quietly migrate it without this test noticing.
    expect(room, 'sending was migrated — that is on the PARK list')
      .not.toContain('deliverable-email')
  })

  it('APPROVE/REJECT STAYS PARKED, and /classic stays reachable', () => {
    const classicSrc = read('src/app/dashboard/ask-aria/classic/page.tsx')
    expect(classicSrc.length).toBeGreaterThan(1000)
    // The authorisation path is not on the default surface, deliberately.
    const room = strip(read('src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx'))
    expect(room).not.toMatch(/approve|reject/i)
  })

  it('MUTATION PROBE — breaking the artifact data path shows the honest fallback, not a chart', () => {
    // "Break the artifact data path" = the JSON no longer parses. The owner must get a sentence,
    // never a chart drawn from nothing, and the failure must still be reportable.
    const good = parseAriaResponse(ART('bar_chart', 'Revenue', '{"values":[1,2,3]}'))
    const broken = parseAriaResponse(ART('bar_chart', 'Revenue', '{"values":[1,2,3'))
    expect(good.segments[0]!.kind).toBe('artifact')
    expect(broken.segments[0]!.kind).toBe('text')
    expect(broken.segments[0]).toEqual({ kind: 'text', content: ARTIFACT_FALLBACK_TEXT })
    expect(good.failures).toHaveLength(0)
    expect(broken.failures).toHaveLength(1)
  })

  it('MUTATION PROBE — the streaming guard is what stops a half-tag flashing as prose', () => {
    // A partially-arrived artifact has no closing tag, so it is not an artifact yet.
    const half = 'Here you go <aria_artifact type="bar_chart" title="Revenue">{"values":[1,2'
    expect(hasArtifact(half)).toBe(false)
    const { segments } = parseAriaResponse(half)
    expect(segments).toHaveLength(1)
    expect(segments[0]!.kind).toBe('text')
  })
})
