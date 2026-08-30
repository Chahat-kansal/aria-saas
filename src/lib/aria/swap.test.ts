import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const has = (p: string) => existsSync(join(root, p))
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CANONICAL = 'src/app/dashboard/ask-aria/page.tsx'
const CLASSIC   = 'src/app/dashboard/ask-aria/classic/page.tsx'

/**
 * S5 PHASE 5 — THE SWAP.
 *
 * /ax was never broken: 13 serverless renders, 13x 200 over 7 days. Nothing routed anyone to it —
 * ~14 navigation entry points all pointed at /dashboard/ask-aria. This pins that the canonical URL
 * now serves the built surface, and that the old one is still reachable because 5 capabilities
 * are parked on it.
 */
describe('S5 phase 5 · the canonical route serves the built surface', () => {
  it('/dashboard/ask-aria renders AskAriaTransition', () => {
    const c = code(read(CANONICAL))
    expect(c).toMatch(/import AskAriaTransition from '@\/components\/ask-aria-ax\/AskAriaTransition'/)
    expect(c).toMatch(/return <AskAriaTransition \/>/)
  })

  it('it is a thin page — the 1,691-line surface is NOT what serves this route now', () => {
    expect(read(CANONICAL).split('\n').length).toBeLessThan(60)
  })

  it('THE OLD SURFACE IS STILL REACHABLE, because 5 capabilities are parked on it', () => {
    // The decision table: a parked capability means no retirement. Deleting this file would
    // silently remove approve/reject, artifacts, save-to-Files, parse telemetry and scheduled
    // reports from the product.
    expect(has(CLASSIC), 'the classic surface must remain reachable').toBe(true)
    expect(read(CLASSIC).split('\n').length).toBeGreaterThan(1_000)
  })

  it('the classic surface kept its own capabilities intact', () => {
    const c = code(read(CLASSIC))
    for (const cap of ['AriaArtifact', 'SaveToFilesButton', 'ActionPreviewCard', 'intelligence/schedules']) {
      expect(c, 'classic lost ' + cap).toMatch(new RegExp(cap.replace('/', '\/')))
    }
    // REWRITTEN IN S9 PHASE 3, AND THE REASON MATTERS MORE THAN THE EDIT.
    // This list used to include the literal 'artifact-parse-failure', because classic POSTed to
    // that endpoint from its own copy of parseAriaResponse. Phase 3 moved that parser to
    // @/lib/aria/artifact-segments so the DEFAULT surface could render artifacts too, so the
    // string is no longer in this file — but the capability is not gone, it is shared. Asserting
    // the string would now fail for the one reason it was written to catch: nothing was lost.
    //
    // So it asserts the capability instead: classic still parses artifacts and still reports
    // malformed ones, through the module that owns both.
    expect(c, 'classic no longer reaches the artifact parser').toMatch(/artifact-segments/)
    const shared = code(read('src/lib/aria/artifact-segments.ts'))
    expect(shared, 'the parse-failure endpoint is gone entirely').toContain('/api/aria/artifact-parse-failure')
  })

  it('the stylesheet stays page-scoped, never in a layout', () => {
    // It carries *, body and :root rules from the design contract; in a layout it would reach
    // every route beneath it.
    expect(code(read(CANONICAL))).toMatch(/import '@\/styles\/ask-aria-transition\.css'/)
    expect(code(read('src/app/dashboard/layout.tsx'))).not.toMatch(/ask-aria-transition\.css/)
  })

  it('the watchdog is on the surface that is now default — the one thing this must not get wrong', () => {
    const hook = code(read('src/components/ask-aria-ax/useAriaStream.ts'))
    expect(hook).toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
  })

  it('and so is ?q=, which ~8 links depend on', () => {
    const ax = code(read('src/components/ask-aria-ax/AskAriaTransition.tsx'))
    expect(ax).toMatch(/new URLSearchParams\(window\.location\.search\)\.get\('q'\)/)
  })

  it('every navigation link still resolves to a real route', () => {
    // They all point at /dashboard/ask-aria, which is exactly why the swap was the fix.
    const dir = join(root, 'src/components')
    let linkers = 0
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name) && /\/dashboard\/ask-aria/.test(readFileSync(p, 'utf8'))) linkers++
      }
    }
    walk(dir)
    expect(linkers).toBeGreaterThanOrEqual(8)
    expect(has(CANONICAL)).toBe(true)
  })

  it('MUTATION PROBE — pointing the route back at the old surface is detectable', () => {
    const mutated = read(CANONICAL).replace('return <AskAriaTransition />', 'return <div>old</div>')
    expect(mutated).not.toBe(read(CANONICAL))
    expect(code(mutated)).not.toMatch(/return <AskAriaTransition \/>/)
  })
})
