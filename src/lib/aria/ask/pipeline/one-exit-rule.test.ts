import { describe, it, expect } from 'vitest'
import {
  ONE_EXIT_ALLOWLIST,
  ONE_EXIT_GRANDFATHERED,
  ONE_EXIT_SCAN_FILES,
  ONE_EXIT_SCAN_ROOTS,
  findOneExitViolations,
  isExemptFromOneExit,
  isOneExitViolation,
  isScanned,
  oneExitIsIntact,
  stripComments,
} from './one-exit-rule'

/**
 * M17 PHASE 2 — WALL 9, DRIVEN BY CALLING IT.
 *
 * ⚠️ EVERY ASSERTION CALLS `isOneExitViolation` / `findOneExitViolations` / `oneExitIsIntact` and
 * reads the answer. `scripts/ask-one-exit-guard.ts` imports the same functions, so the rule enforced
 * on push and the rule driven here cannot drift apart — the WALL 8 pattern. Nothing in this file
 * greps a source file to decide what the rule is.
 *
 * The guard was also proven by observation, both directions, with a genuinely new probe line — see
 * `docs/aria/RUN-M17.md` phase 2. A diff-scanning guard cannot catch a reintroduced line, which is
 * why this one reads whole files.
 */

const EXIT = 'return NextResponse.json({ response: text }, { status: 200 })'
const NEW_EXIT = 'return new NextResponse(body, { status: 429 })'

describe('M17 phase 2 · wall 9 — one exit', () => {
  it('FIRES on a response constructed anywhere in the pipeline or the strategies', () => {
    for (const f of [
      'src/lib/aria/ask/pipeline/run-turn.ts',
      'src/lib/aria/ask/pipeline/types.ts',
      'src/lib/aria/ask/pipeline/anything-new.ts',
      'src/lib/aria/ask/strategies/council.ts',
      'src/lib/aria/ask/strategies/general.ts',
      'src/lib/aria/ask/strategies/a/deeply/nested/one.ts',
    ]) {
      expect(isOneExitViolation(f, EXIT), f).toBe(true)
      expect(isOneExitViolation(f, NEW_EXIT), f).toBe(true)
    }
  })

  it('ALLOWS the identical line in render.ts — the same text, the one place it belongs', () => {
    expect(isOneExitViolation(ONE_EXIT_ALLOWLIST[0], EXIT)).toBe(false)
    expect(isOneExitViolation(ONE_EXIT_ALLOWLIST[0], NEW_EXIT)).toBe(false)
  })

  it('⚠️ IGNORES the ELEVEN SIBLING ROUTES in the same directory as the turn route', () => {
    // The reason the turn route is named as a FILE and not covered by a prefix. Scanning
    // `src/app/api/aria/ask/` would have failed the push on every one of these — ordinary REST
    // endpoints with no connection to the turn pipeline. A rule that fires on the innocent gets
    // loosened until it fires on nothing.
    for (const sibling of [
      'src/app/api/aria/ask/action/route.ts',
      'src/app/api/aria/ask/audit/route.ts',
      'src/app/api/aria/ask/delete/route.ts',
      'src/app/api/aria/ask/escalate/route.ts',
      'src/app/api/aria/ask/export/route.ts',
      'src/app/api/aria/ask/history/route.ts',
      'src/app/api/aria/ask/rollback/route.ts',
      'src/app/api/aria/ask/search/route.ts',
      'src/app/api/aria/ask/suggestions/route.ts',
      'src/app/api/aria/ask/thread/route.ts',
      'src/app/api/aria/ask/upload/route.ts',
    ]) {
      expect(isScanned(sibling), sibling + ' should not be scanned').toBe(false)
      expect(isOneExitViolation(sibling, EXIT), sibling).toBe(false)
    }
  })

  it('scans the turn route itself — and grandfathers it only while the migration runs', () => {
    const route = ONE_EXIT_SCAN_FILES[0]
    expect(isScanned(route)).toBe(true)
    // Phases 2–3: on the list, so its 28 surviving exits do not block the push.
    // Phase 4: the list is emptied and this assertion is rewritten to expect `true`.
    const grandfathered = ONE_EXIT_GRANDFATHERED.includes(route)
    expect(isOneExitViolation(route, EXIT)).toBe(!grandfathered)
  })

  it('ignores everything outside the guarded tree', () => {
    for (const f of ['src/app/api/pos/sale/route.ts', 'src/lib/aria/council.ts', 'src/lib/aria/ask/intent.ts']) {
      expect(isScanned(f)).toBe(false)
      expect(isOneExitViolation(f, EXIT), f).toBe(false)
    }
  })

  it('strips comments first — a rule must not fire on the sentence describing it', () => {
    expect(stripComments('  // never write return NextResponse.json(x) here').trim()).toBe('')
    expect(isOneExitViolation(
      'src/lib/aria/ask/strategies/council.ts',
      '  // a lane must never `return NextResponse.json(...)` — it returns a TurnResult',
    )).toBe(false)
    // …but the real thing on the same line as a trailing comment still fires.
    expect(isOneExitViolation(
      'src/lib/aria/ask/strategies/council.ts',
      '  return NextResponse.json(body) // oops',
    )).toBe(true)
  })

  it('catches redirect and rewrite too, not only .json', () => {
    const f = 'src/lib/aria/ask/strategies/general.ts'
    expect(isOneExitViolation(f, "  return NextResponse.redirect('/login')")).toBe(true)
    expect(isOneExitViolation(f, "  return NextResponse.rewrite(url)")).toBe(true)
    expect(isOneExitViolation(f, '  return NextResponse.next()')).toBe(true)
  })

  it('does NOT fire on returning a TurnResult — the thing lanes are supposed to do', () => {
    const f = 'src/lib/aria/ask/strategies/general.ts'
    expect(isOneExitViolation(f, "  return makeTurnResult('general', body)")).toBe(false)
    expect(isOneExitViolation(f, '  return null // this lane declines')).toBe(false)
  })

  it('does not fire inside test files — they assert ON response shapes', () => {
    expect(isOneExitViolation('src/lib/aria/ask/strategies/council.test.ts', EXIT)).toBe(false)
  })

  it('findOneExitViolations reports file, line and the offending text', () => {
    const text = ['import x', '', 'export function f() {', '  ' + EXIT, '}'].join('\n')
    const v = findOneExitViolations([['src/lib/aria/ask/strategies/bad.ts', text]])
    expect(v).toHaveLength(1)
    expect(v[0]!.file).toBe('src/lib/aria/ask/strategies/bad.ts')
    expect(v[0]!.line).toBe(4)
    expect(v[0]!.text).toBe(EXIT)
  })

  it('normalises Windows path separators — the guard runs on this machine', () => {
    expect(isScanned('src\\lib\\aria\\ask\\pipeline\\run-turn.ts')).toBe(true)
    expect(isExemptFromOneExit('src\\lib\\aria\\ask\\pipeline\\render.ts')).toBe(true)
  })

  describe('⚠️ anti-vacuity — the guard must FAIL when it is guarding nothing', () => {
    const GOOD_RENDER = 'export function render(v) {\n  return NextResponse.json(v.result.body)\n}'

    it('fails when the walk found nothing', () => {
      expect(oneExitIsIntact(0, GOOD_RENDER)).toMatch(/scanned 0 file/)
      expect(oneExitIsIntact(1, GOOD_RENDER)).toMatch(/scanned 1 file/)
    })

    it('fails when the single exit file has been deleted', () => {
      expect(oneExitIsIntact(12, null)).toMatch(/does not exist/)
    })

    it('⚠️ fails when render.ts has stopped constructing a response', () => {
      // The subtlest way this guard could rot: every other exit still forbidden, and the one exit
      // quietly gone — a pipeline with no way out, and a green guard.
      expect(oneExitIsIntact(12, 'export function render(v) {\n  return v.result.body\n}'))
        .toMatch(/constructs no response/)
    })

    it('PASSES only when it actually scanned files and the exit is intact', () => {
      expect(oneExitIsIntact(12, GOOD_RENDER)).toBeNull()
    })
  })

  it('the scan roots and allowlist are what the guard script walks', () => {
    expect(ONE_EXIT_SCAN_ROOTS).toContain('src/lib/aria/ask/pipeline/')
    expect(ONE_EXIT_SCAN_ROOTS).toContain('src/lib/aria/ask/strategies/')
    expect(ONE_EXIT_SCAN_FILES).toEqual(['src/app/api/aria/ask/route.ts'])
    expect(ONE_EXIT_ALLOWLIST).toEqual(['src/lib/aria/ask/pipeline/render.ts'])
  })
})
