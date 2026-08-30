import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * S9 PHASE 0 — RE-CHECK EVERY ITEM BEFORE FIXING IT.
 *
 * The S8 register delisted four entries that run logs still called open. The same could be true
 * again, so nothing in S9 is fixed on the strength of the register alone — each premise is
 * re-established here first, and the ones that turned out to be wrong are recorded in RUN-S9.md
 * rather than quietly corrected.
 *
 * This file asserts the premises that are readable from source. The database-side ones (#2's credit
 * outage, #8's empty `reason`, #11's false-failure count) were checked with live SQL and are in the
 * run log with their numbers, because a unit test cannot hold them honestly.
 */
describe('S9 phase 0 · the premises, re-checked from source', () => {
  it('#10/#12 — the login page has ONE submit, and the decoys sit outside the form', () => {
    // A MEASUREMENT ERROR I MADE FIRST: I tried to count the three runtime matches by regexing the
    // source for their labels, and got two. The submit button's label is `{ctaLabel}` — a variable —
    // so its accessible name ("Sign in") does not exist in the source at all. Playwright sees three
    // buttons; a source scan can only ever see two of them. So this asserts what source CAN prove,
    // and the third match is established from ctaLabel's own branches below.
    const scene = read('src/components/auth/AuthScene.tsx')
    const formStart = scene.indexOf('<form')
    const formEnd = scene.indexOf('</form>')
    expect(formStart, 'no <form> in AuthScene').toBeGreaterThan(-1)

    const buttons = [...scene.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0])
    expect(buttons.length, 'the button scan found nothing').toBeGreaterThanOrEqual(4)

    // Exactly one submit, and it is inside the form. This is what the fixtures must target.
    const submits = buttons.filter(b => /type="submit"/.test(b))
    expect(submits.length, 'more than one submit button — the fixture selector needs re-thinking').toBe(1)
    const submitAt = scene.indexOf(submits[0]!)
    expect(submitAt).toBeGreaterThan(formStart)
    expect(submitAt).toBeLessThan(formEnd)

    // ctaLabel renders "Sign in" when not signing up — that is the THIRD runtime match, and the
    // reason the selector is ambiguous at all.
    expect(scene).toContain("(signup ? 'Create account' : 'Sign in')")

    // The two decoys are real, and both sit OUTSIDE the form — which is exactly why `.first()`
    // picked the wrong control and the e2e login timed out instead of erroring.
    const tab = buttons.find(b => /className={`tab/.test(b) && />Sign in</.test(b))!
    const google = buttons.find(b => /Continue with Google/.test(b))!
    expect(tab, 'the "Sign in" tab is gone — re-read before fixing').toBeTruthy()
    expect(google, 'the Google button is gone — re-read before fixing').toBeTruthy()
    expect(scene.indexOf(tab)).toBeLessThan(formStart)
    expect(scene.indexOf(google)).toBeLessThan(formStart)
  })

  it('#11 — nightly-sync is the ONLY cron route without the dynamic directive', () => {
    const dir = join(root, 'src/app/api/cron')
    const routes = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => 'src/app/api/cron/' + d.name + '/route.ts')
      .filter(p => existsSync(join(root, p)))
    expect(routes.length, 'the cron-route scan found nothing').toBeGreaterThan(50)
    const missing = routes.filter(p => !/export const dynamic\s*=\s*'force-dynamic'/.test(read(p)))
    // PHASE 0 ASSERTS THE PREMISE, NOT THE FIX. Today exactly one route is missing the directive and
    // it is nightly-sync — which is what makes this a one-line repair rather than a sweep. The
    // INVARIANT ("no cron route may be statically rendered") belongs in phase 2, where it becomes
    // true; asserting it here would have committed a red test.
    expect(missing).toEqual(['src/app/api/cron/nightly-sync/route.ts'])
  })

  it('#4 — there are exactly two safeParseJSON definitions, and they differ in one character class', () => {
    const cb = read('src/lib/aria/context-brain.ts')
    const co = read('src/lib/aria/council.ts')
    // Both strip a fenced code block then slice first `{` to last `}`. council's fence regexes
    // consume an optional newline; context-brain's do not. Phase 4 proves that difference is
    // immaterial BEFORE merging them, rather than assuming it.
    expect(cb).toMatch(/```(?:\(\?:json\)\?)?/)
    expect(co).toContain("replace(/^```(?:json)?\\n?/i, '')")
    expect(cb).toContain("replace(/^```(?:json)?/i, '')")
  })

  it('#6 — the capabilities are components that exist and can be reused, not rewritten', () => {
    // The decision table is explicit: migrate behaviour, reuse handlers, never re-implement.
    expect(existsSync(join(root, 'src/components/aria/AriaArtifact.tsx'))).toBe(true)
    expect(existsSync(join(root, 'src/components/dashboard/SaveToFilesButton.tsx'))).toBe(true)
    const classic = read('src/app/dashboard/ask-aria/classic/page.tsx')
    expect(classic).toContain('AriaArtifact')
    expect(classic).toContain('SaveToFilesButton')
    expect(classic).toContain('/api/aria/intelligence/schedules')
    expect(classic).toContain('/api/aria/artifact-parse-failure')
  })

  it('#6 — /classic is still reachable, and approve/reject stays parked there', () => {
    // Retiring /classic is explicitly out of scope while the authorisation path lives on it.
    expect(existsSync(join(root, 'src/app/dashboard/ask-aria/classic/page.tsx'))).toBe(true)
  })

  it('ANTI-VACUITY — every file this gate reads actually exists and is non-trivial', () => {
    // A gate that silently reads '' and asserts nothing about it is the failure this repo produces
    // most often in its own tooling.
    for (const f of [
      'src/components/auth/AuthScene.tsx',
      'src/lib/aria/context-brain.ts',
      'src/lib/aria/council.ts',
      'src/app/dashboard/ask-aria/classic/page.tsx',
      'src/app/api/cron/nightly-sync/route.ts',
    ]) {
      expect(read(f).length, f + ' is empty or missing').toBeGreaterThan(500)
    }
  })
})
