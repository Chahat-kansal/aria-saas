import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const CTX = read('src/lib/aria/ax-context.ts')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S6 PHASE 4 — THE RAIL. A COUNT AND A PAGE SIZE MUST NOT SHARE A SOURCE.
 *
 * ax-context.ts:76 has stated this rule in a comment since MS17. It has now been broken twice
 * underneath that comment — the badge (MS17) and then the headline (S3). A comment has not stopped
 * it, so it is a test now.
 *
 * ── WHAT THIS SPRINT ACTUALLY FOUND, which is not what the paste assumed ────────────────────────
 * Queried live: 52 pending decisions, a zero-till notice, and a low-stock notice (7 lines) = 54
 * things noticed. NEITHER number is wrong. S3's fix is working; what was missing was any indication
 * on screen of why they differ. So phase 4 was a LABELLING fix, and this rail exists to stop the
 * original defect returning rather than to fix a live one.
 *
 * ── WHAT IT CANNOT CATCH — stated because a rail nobody trusts is worse than none ───────────────
 *   · a count query that is itself wrong (filtered by the wrong status, say). It checks the SHAPE
 *     of the source, not the correctness of the query.
 *   · a page size applied server-side inside an RPC or a view.
 *   · a total computed in a file this test does not read.
 *   · `.length` of a list that legitimately IS the whole set — which is why the check is scoped to
 *     identifiers named *Total, the names that promise completeness.
 */
describe('S6 phase 4 · a count never comes from a limited list', () => {
  it('awaitingTotal is its own exact count query', () => {
    expect(code(CTX)).toMatch(/select\('id', \{ count: 'exact', head: true \}\)/)
    expect(code(CTX)).toMatch(/awaitingTotal = count \?\? 0/)
  })

  it('the awaiting LIST is still capped — the cap is correct, sharing it was not', () => {
    expect(code(CTX)).toMatch(/\.limit\(6\)/)
  })

  it('noticedTotal is derived from the true count, never from the render list', () => {
    expect(code(CTX)).toMatch(/const noticedTotal = awaitingTotal \+ \(noticed\.length - awaiting\.length\)/)
  })

  it('THE RAIL — no identifier named *Total is assigned the .length of anything', () => {
    // The defect's shape both times: a name promising a total, fed by a list that was capped.
    const offenders: string[] = []
    for (const [file, src] of [['ax-context.ts', CTX], ['AskAriaTransition.tsx', SURFACE]] as const) {
      for (const m of code(src).matchAll(/\b(?:const|let)\s+(\w*Total)\s*(?::[^=]+)?=\s*([^\n]+)/g)) {
        const [, name, rhs] = m
        if (/\.length\b/.test(rhs!) && !/-\s*\w+\.length/.test(rhs!)) offenders.push(file + ': ' + name + ' = ' + rhs!.trim().slice(0, 60))
      }
    }
    expect(offenders, 'a *Total fed by a .length: ' + offenders.join(' | ')).toEqual([])
  })

  it('MUTATION PROBE — the rail goes red when a Total is fed by a length', () => {
    // Proves the assertion above can fail, rather than passing because the regex matches nothing.
    const mutated = 'const awaitingTotal = pendingList.length\n'
    const offenders: string[] = []
    for (const m of mutated.matchAll(/\b(?:const|let)\s+(\w*Total)\s*(?::[^=]+)?=\s*([^\n]+)/g)) {
      const [, name, rhs] = m
      if (/\.length\b/.test(rhs!) && !/-\s*\w+\.length/.test(rhs!)) offenders.push(name!)
    }
    expect(offenders).toEqual(['awaitingTotal'])
  })

  it('MUTATION PROBE — pointing the headline back at the capped list is detectable', () => {
    const mutated = SURFACE.replace('const n = ctx?.noticedTotal ?? noticed.length', 'const n = noticed.length')
    expect(mutated).not.toBe(SURFACE)
    expect(code(mutated)).not.toMatch(/const n = ctx\?\.noticedTotal \?\? noticed\.length/)
  })
})

describe('S6 phase 4 · the owner can tell what each number counts', () => {
  it('the headline says how many of them need a decision', () => {
    expect(code(SURFACE)).toMatch(/' — ' \+ decisions \+ ' need a decision\.'/)
  })

  it('the clause is suppressed when the two numbers are the same', () => {
    // Otherwise an owner with no extra notices reads "52 things stood out — 52 need a decision."
    expect(code(SURFACE)).toMatch(/decisions > 0 && decisions !== n/)
  })

  it('the badge still reads the decisions count, unchanged', () => {
    expect(code(SURFACE)).toMatch(/awaitingCount = ctx\?\.awaitingTotal/)
  })
})
