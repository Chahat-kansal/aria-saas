import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = dir + '/' + entry
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(entry)) out.push(rel)
  }
  return out
}
const SOURCES = [...walk('src'), ...walk('scripts')]

/**
 * Read every source ONCE, at module scope, shared by the tests below. The first version read them
 * inside the test and took 11s against ~1,900 files, which blew vitest's 5s default and made the
 * pre-push hook reject my own push. The assertion was right and the traversal was right; only the
 * cost was wrong. Fixed by hoisting the reads and giving the scan an explicit, honest timeout —
 * NOT by narrowing what it scans, which would have made it cheap by making it weaker.
 */
const CORPUS: Array<[string, string]> = SOURCES
  .filter(f => !f.endsWith('council-names.test.ts'))   // this file quotes the old names
  .map(f => [f, read(f)])
const SCAN_TIMEOUT_MS = 30_000

/**
 * M13B PHASE 2 — THE TWO COUNCILS ARE NAMED FOR THEIR JOBS.
 *
 * `lib/agents/council.ts` and `lib/aria/council.ts` were two live, unrelated features sharing one
 * name. One is a nightly cron that WRITES PROPOSALS; the other is the hero path that ANSWERS AN
 * OWNER. `import { … } from '@/lib/…/council'` read identically at every call site and meant
 * completely different things — the single most confusable pair in the repo, and M13 phase 6
 * recommended exactly this fix.
 *
 * Renamed to `agents/proposal-council.ts` and `aria/answer-council.ts`. NO RE-EXPORT SHIM: the
 * decision table is explicit, and a shim would preserve the ambiguous import line that is the
 * entire defect. This file is the rail that stops the old names returning.
 */
/** The four ways the retired names could be imported, as ONE expression so the rail and its own
 *  mutation check can never drift apart. Anchored on the CLOSING quote — `council-advisors`,
 *  `council-conflicts` and `council-executor` legitimately keep the prefix and must not match. */
const OLD_SPECIFIER =
  /(?:from\s*|require\(\s*)['"](?:@\/lib\/(?:aria|agents)|\.{1,2})\/council['"]/

describe('M13B phase 2 · the retired council names are gone and stay gone', () => {
  it('ANTI-VACUITY — the scan actually reads the tree', () => {
    // A rail that scans an empty list passes forever. Failure pattern #1 in this repo.
    expect(SOURCES.length).toBeGreaterThan(1500)
    expect(SOURCES).toContain('src/lib/aria/answer-council.ts')
    expect(SOURCES).toContain('src/lib/agents/proposal-council.ts')
  })

  it('zero imports of the retired specifiers, anywhere', () => {
    const hits: string[] = []
    for (const [f, src] of CORPUS) if (OLD_SPECIFIER.test(src)) hits.push(f)
    expect(hits).toEqual([])
  }, SCAN_TIMEOUT_MS)

  it('MUTATION — the scan CAN go red, proven against a real old-name import', () => {
    // Without this the assertion above is indistinguishable from a regex that matches nothing.
    const re = () => new RegExp(OLD_SPECIFIER.source)
    expect(re().test(`import { runAriaCouncil } from '@/lib/aria/council'`)).toBe(true)
    expect(re().test(`import { runCouncilSession } from '@/lib/agents/council'`)).toBe(true)
    expect(re().test(`import type { CouncilOutput } from '../council'`)).toBe(true)
    // And it must NOT fire on the siblings that legitimately keep the prefix.
    expect(re().test(`import { lostAdvisors } from '@/lib/aria/council-advisors'`)).toBe(false)
    expect(re().test(`import { x } from '@/lib/aria/council-conflicts'`)).toBe(false)
    expect(re().test(`import { executeProposal } from '@/lib/agents/council-executor'`)).toBe(false)
    expect(re().test(`import { x } from '@/lib/aria/answer-council'`)).toBe(false)
  })

  it('the eslint rule blocks the old specifier at the linter too', () => {
    const cfg = JSON.parse(read('.eslintrc.json'))
    const names = cfg.rules['no-restricted-imports'][1].paths.map((p: { name: string }) => p.name)
    expect(names).toContain('@/lib/aria/council')
    expect(names).toContain('@/lib/agents/council')
    // The two pre-existing deprecations must survive — this rule was extended, not replaced.
    expect(names).toContain('@/lib/cron-auth')
    expect(names).toContain('@/lib/plans')
  })

  it('NO SHIM — neither old path exists as a file re-exporting the new one', () => {
    const gone = ['src/lib/aria/council.ts', 'src/lib/agents/council.ts']
    for (const f of gone) expect(SOURCES, f).not.toContain(f)
    // The siblings that share the prefix are untouched and still real.
    for (const f of ['src/lib/aria/council-advisors.ts', 'src/lib/aria/council-conflicts.ts',
                     'src/lib/agents/council-executor.ts']) {
      expect(SOURCES, f).toContain(f)
    }
  })

  it('each file says which council it is, in its own first line', () => {
    expect(read('src/lib/agents/proposal-council.ts')).toContain('THE PROPOSAL COUNCIL')
    expect(read('src/lib/aria/answer-council.ts')).toContain('THE ANSWER COUNCIL')
  })
})
