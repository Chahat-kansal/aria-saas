import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeParseJSON } from './safe-json'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * THE TWO ORIGINALS, VERBATIM. Kept here so the equivalence claim is checkable rather than
 * asserted — the sprint says "check they behave identically before merging" and this is that check,
 * not a promise that it was done.
 */
function councilOriginal(text: string): Record<string, unknown> | null {
  try {
    const s = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const start = s.indexOf('{'), end = s.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1))
    return null
  } catch { return null }
}
function contextBrainOriginal(text: string): Record<string, unknown> | null {
  try {
    const stripped = text.trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1))
    return null
  } catch { return null }
}

/** Real shapes these two actually see: fenced, unfenced, prose-wrapped, truncated, junk. */
const CORPUS: string[] = [
  '{"a":1}',
  '  {"a":1}  ',
  '```json\n{"a":1}\n```',
  '```\n{"a":1}\n```',
  '```json{"a":1}```',
  '```JSON\n{"a":1}\n```',
  'Here you go:\n```json\n{"observations":["x"],"confidence":"high"}\n```\nHope that helps.',
  'Sure — {"a":1} — done.',
  '{"a":{"b":[1,2,3]},"c":"}"}',
  '{"a":1}\n\n{"b":2}',                     // two objects: outermost slice spans both -> invalid
  '{"a":1',                                  // truncated
  '{"plan":"p","verify_findings":"v","observations":[],"recommendations":[],"confidence":"low"}',
  '',
  '   ',
  'no json at all',
  '}{',
  '```json\n{"a":"line1\\nline2"}\n```',
  '{"external_factors":[],"risk_flags":[],"opportunities":[],"confidence":"medium","sources_used":[]}',
  '\n\n```json\n\n{"a":1}\n\n```\n\n',
  'text before\n{"a":1}\ntext after',
]

describe('S9 phase 4 · the two safeParseJSON implementations were equivalent — proven, then merged', () => {
  it('THE EQUIVALENCE PROOF — both originals agree on every case in the corpus', () => {
    const disagreements: string[] = []
    for (const input of CORPUS) {
      const a = JSON.stringify(councilOriginal(input))
      const b = JSON.stringify(contextBrainOriginal(input))
      if (a !== b) disagreements.push(JSON.stringify(input) + ' -> council=' + a + ' contextBrain=' + b)
    }
    expect(disagreements, 'the two were NOT equivalent — the merge is not justified: '
      + disagreements.join(' | ')).toEqual([])
  })

  it('the survivor matches council, which is what the canonical engine used', () => {
    for (const input of CORPUS) {
      expect(JSON.stringify(safeParseJSON(input)), 'diverged on ' + JSON.stringify(input))
        .toBe(JSON.stringify(councilOriginal(input)))
    }
  })

  it('ANTI-VACUITY — the corpus is not empty and it exercises both outcomes', () => {
    // A corpus of only-nulls or only-successes would make the two loops above pass while proving
    // nothing about the interesting half.
    expect(CORPUS.length).toBeGreaterThanOrEqual(15)
    const parsed = CORPUS.filter(c => safeParseJSON(c) !== null)
    const failed = CORPUS.filter(c => safeParseJSON(c) === null)
    expect(parsed.length, 'no input in the corpus parses').toBeGreaterThanOrEqual(5)
    expect(failed.length, 'no input in the corpus fails').toBeGreaterThanOrEqual(4)
  })

  it('STILL STRICT — a truncated object is refused, as S4 and S8 both require', () => {
    expect(safeParseJSON('{"a":1')).toBeNull()
    expect(safeParseJSON('{"observations":["half a thoug')).toBeNull()
    // and nothing was made lenient on the way through
    expect(strip(read('src/lib/aria/safe-json.ts'))).not.toMatch(/repair|lenient|partial|salvage/i)
    expect(strip(read('src/lib/aria/safe-json.ts'))).toContain('JSON.parse(')
  })

  it('a fenced reply with trailing prose still parses — the common real case', () => {
    expect(safeParseJSON('Here:\n```json\n{"confidence":"high"}\n```\nAnything else?'))
      .toEqual({ confidence: 'high' })
  })

  it('THE N-COPIES RAIL — exactly one definition of safeParseJSON survives', () => {
    for (const f of ['src/lib/aria/council.ts', 'src/lib/aria/context-brain.ts']) {
      const src = strip(read(f))
      expect(src, f + ' still defines its own safeParseJSON')
        .not.toMatch(/function safeParseJSON\s*\(/)
      expect(src, f + ' does not import the shared one').toMatch(/from '\.\/safe-json'/)
    }
    // ANTI-VACUITY: the scan must be looking at real files, and the survivor must actually exist.
    expect(read('src/lib/aria/council.ts').length).toBeGreaterThan(1000)
    expect(read('src/lib/aria/context-brain.ts').length).toBeGreaterThan(500)
    expect(strip(read('src/lib/aria/safe-json.ts'))).toMatch(/export function safeParseJSON/)
  })

  it('MUTATION PROBE — reintroducing a second definition goes red', () => {
    // Prove the rail above can fail, by running its own check against a mutated copy.
    const mutated = strip(read('src/lib/aria/council.ts'))
      + '\nfunction safeParseJSON(text: string) { return null }\n'
    expect(mutated).toMatch(/function safeParseJSON\s*\(/)
    expect(strip(read('src/lib/aria/council.ts'))).not.toMatch(/function safeParseJSON\s*\(/)
  })
})
