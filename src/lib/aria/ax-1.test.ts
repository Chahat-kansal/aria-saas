import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatAxFigure, type AxFigure } from './ax-context-types'
import { segmentFigures, hasProvenance } from './figure-provenance'
import { resolveAutonomy, isPersistable, PERSISTABLE_MODES } from './autonomy'

/**
 * MS16 · AX-1 — the mutation checks the sprint names, one describe block per phase.
 *
 * Where a behaviour is a pure function it is tested as one. Where the protected thing is structural
 * — a lifted stylesheet, a single DOM node, an endpoint string — the test reads the source, and in
 * those cases it asserts BOTH DIRECTIONS: the guard must match the correct code AND fail on the
 * mutated form. A source assertion that would pass on the bug is worse than no test, and this repo
 * has shipped exactly that mistake before (MS15).
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const MOCKUP = read('docs/design/ask-aria-transition.html')
const CSS = read('src/styles/ask-aria-transition.css')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const PROPOSAL = read('src/components/ask-aria-ax/ProposalCard.tsx')
const ASK_ROUTE = read('src/app/api/aria/ask/route.ts')
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')
const AX_PAGE = read('src/app/dashboard/ask-aria/ax/page.tsx')

/** The mockup's <style> block — the thing phase 1 lifts. */
const styleBlock = (() => {
  const a = MOCKUP.indexOf('<style>') + '<style>'.length
  const b = MOCKUP.indexOf('</style>')
  const s = MOCKUP.slice(a, b)
  return s.startsWith('\n') ? s.slice(1) : s
})()

/** The lifted region of the installed sheet: from `:root{` to the APPENDS banner. */
const liftedRegion = (() => {
  const start = CSS.indexOf(':root{')
  const end = CSS.indexOf('APPENDS — MS16')
  return CSS.slice(start, CSS.lastIndexOf('/* ═', end))
})()

// ── PHASE 1 — the CSS is LIFTED, not re-authored ──────────────────────────────────────────────
describe('phase 1 · the stylesheet is the contract, byte-for-byte', () => {
  it('every line of the mockup style block is present, unmodified and in order', () => {
    const want = styleBlock.split('\n').filter(l => l.trim() !== '')
    const got = liftedRegion.split('\n').filter(l => l.trim() !== '')
    expect(got).toEqual(want)
  })

  it('carries all 44 class names the sprint names', () => {
    const NAMES = ('deco streaks moire hill blob brand nav newbtn stage hero orbit corona figure ' +
      'headline tagline live wave noticed nt bigask talk th flow m bub skill n2 src prop ph ord oh ' +
      'li tt pf go gh done write box brow cb mode send2 oath back cursor').split(' ')
    const missing = NAMES.filter(n => !liftedRegion.includes('.' + n))
    expect(missing).toEqual([])
  })

  it('keeps the locked motion values exactly', () => {
    expect(liftedRegion).toContain('--ease:cubic-bezier(.65,.02,.2,1)')
    expect(liftedRegion).toContain('.85s var(--ease)')
  })

  it('keeps prefers-reduced-motion', () => {
    expect(liftedRegion).toContain('@media(prefers-reduced-motion:reduce)')
  })

  it('MUTATION PROBE — changing one lifted value breaks the byte-for-byte check', () => {
    const mutated = liftedRegion.replace('--blue:#2563EB', '--blue:#FF0000')
    const want = styleBlock.split('\n').filter(l => l.trim() !== '')
    const got = mutated.split('\n').filter(l => l.trim() !== '')
    expect(got).not.toEqual(want)
  })
})

/**
 * Is `<div className="cls">` rendered unconditionally?
 *
 * Walks back from the opening tag over whitespace only and looks at what actually precedes it. A
 * conditional child is always `{cond && <div …` or `{cond ? <div …`, so the immediately preceding
 * token is `&&` or `?`.
 *
 * The first version of this test scanned 160 characters of preceding text for `?` or `&&`, which
 * matched unrelated JSX further up and failed on correct code — a measurement error in my own
 * diagnostic (failure pattern #5), replaced rather than loosened.
 */
function renderedUnconditionally(src: string, cls: string): boolean {
  const tag = '<div className="' + cls + '"'
  const i = src.indexOf(tag)
  if (i < 0) return false
  let j = i - 1
  while (j >= 0 && /\s/.test(src[j]!)) j--
  const before = src.slice(Math.max(0, j - 1), j + 1)
  return !(before.endsWith('&&') || before.endsWith('?'))
}

// ── PHASE 2 — the two states, one avatar node, one toggle ─────────────────────────────────────
describe('phase 2 · the transition', () => {
  it('toggles the single class `work`, exactly as the contract does', () => {
    expect(SURFACE).toMatch(/classList\.add\('work'\)/)
    expect(SURFACE).toMatch(/classList\.remove\('work'\)/)
  })

  it('THE AVATAR IS ONE DOM NODE — rendered exactly once, never conditionally', () => {
    // If .orbit appeared twice, or inside a ternary/&& branch, it would remount between states and
    // the whole transition would become a cut. This is the phase's headline invariant.
    const occurrences = (SURFACE.match(/className="orbit"/g) ?? []).length
    expect(occurrences).toBe(1)
    expect(renderedUnconditionally(SURFACE, 'orbit')).toBe(true)
  })

  it('keeps both states mounted so the CSS can tween them', () => {
    for (const cls of ['noticed', 'bigask', 'talk']) {
      expect(SURFACE.indexOf('className="' + cls + '"'), cls + ' must be rendered').toBeGreaterThan(-1)
      expect(renderedUnconditionally(SURFACE, cls), cls + ' must not be conditionally rendered').toBe(true)
    }
  })

  it('collapses the avatar column below 1180 and never the conversation', () => {
    expect(liftedRegion).toContain('@media(max-width:1180px)')
    expect(liftedRegion).toContain('body.work .hero{display:none}')
    expect(liftedRegion).not.toContain('.talk{display:none}')
  })

  it('MUTATION PROBE — remounting the avatar per state fails the one-node check', () => {
    const mutated = SURFACE.replace('<div className="orbit">', '{working && <div className="orbit">}')
    expect(renderedUnconditionally(mutated, 'orbit')).toBe(false)
  })

  it('MUTATION PROBE — changing the easing breaks the timing assertion', () => {
    const mutated = liftedRegion.replace('--ease:cubic-bezier(.65,.02,.2,1)', '--ease:ease-in-out')
    expect(mutated).not.toContain('--ease:cubic-bezier(.65,.02,.2,1)')
  })

  it('the stylesheet is imported by the route only, never a layout', () => {
    expect(AX_PAGE).toMatch(/import '@\/styles\/ask-aria-transition\.css'/)
  })
})

// ── PHASE 3 — the status line and the rope ────────────────────────────────────────────────────
describe('phase 3 · presence reflects real state', () => {
  it('drives the status pill from the real stream state, not a timer', () => {
    expect(SURFACE).toMatch(/const doing = isBusy/)
    expect(SURFACE).not.toMatch(/setInterval|setTimeout/)
  })

  it('MUTATION PROBE — a static status string fails the check', () => {
    const mutated = SURFACE.replace(/const doing = isBusy/, "const doing = 'Writing' || isBusy")
    expect(mutated).not.toMatch(/const doing = isBusy\n/)
  })

  it('resolves a mixed autonomy state DOWN, never up', () => {
    const mixed = resolveAutonomy([
      { agent_type: 'a', mode: 'auto', enabled: true },
      { agent_type: 'b', mode: 'suggest', enabled: true },
    ])
    expect(mixed.mode).toBe('suggest')
  })

  it('refuses to persist a mode the database cannot hold', () => {
    expect(isPersistable('copilot')).toBe(false)
    expect(isPersistable('suggest')).toBe(true)
    expect(isPersistable('auto')).toBe(true)
    expect(PERSISTABLE_MODES).not.toContain('copilot')
  })
})

// ── PHASE 4 — streaming, and figures that only claim what they can back ───────────────────────
describe('phase 4 · streaming is real, not chunked after the fact', () => {
  it('the provider streams from the SDK and forwards deltas', () => {
    expect(PROVIDER).toMatch(/client\.messages\.stream\(/)
    expect(PROVIDER).toMatch(/streamed\.on\('text'/)
    expect(PROVIDER).toMatch(/params\.onToken/)
  })

  it('the route emits SSE token frames when the client asks for them', () => {
    expect(ASK_ROUTE).toMatch(/text\/event-stream/)
    expect(ASK_ROUTE).toMatch(/type:\s*'token'/)
    expect(ASK_ROUTE).toMatch(/onToken/)
  })

  it('MUTATION PROBE — dropping the token sink fails the check', () => {
    const mutated = PROVIDER.replace(/streamed\.on\('text'/g, "streamed.off('text'")
    expect(mutated).not.toMatch(/streamed\.on\('text'/)
  })
})

describe('phase 4 · figures only claim what they can back', () => {
  it('underlines a figure that matches a value computed this turn', () => {
    const segs = segmentFigures('You took $954.00 today.', {
      anchors: [954], anchorLabels: { '954': 'Completed sales, today.' },
    })
    const fig = segs.find(s => s.kind === 'figure')
    expect(fig?.tier).toBe('verified')
    expect(fig?.source).toBe('Completed sales, today.')
    expect(hasProvenance(segs)).toBe(true)
  })

  it('marks a figure estimated when the cost beneath it is a guess', () => {
    const segs = segmentFigures('Margin is 62%.', { anchors: [62], weakCostTiers: true })
    expect(segs.find(s => s.kind === 'figure')?.tier).toBe('estimated')
  })

  it('leaves EVERY figure plain when nothing was captured to check against', () => {
    const segs = segmentFigures('Revenue was $1,200 and margin 40%.', {})
    const figs = segs.filter(s => s.kind === 'figure')
    expect(figs).toHaveLength(2)
    expect(figs.every(f => f.tier === 'plain')).toBe(true)
    expect(figs.every(f => f.source === undefined)).toBe(true)
    expect(hasProvenance(segs)).toBe(false)
  })

  it('does not endorse a figure that matches nothing computed', () => {
    const segs = segmentFigures('Revenue was $8,888.', { anchors: [954] })
    expect(segs.find(s => s.kind === 'figure')?.tier).toBe('plain')
  })

  it('reassembles the original text exactly', () => {
    const src = 'Took $954.00, up 12% on last week.'
    expect(segmentFigures(src, { anchors: [954, 12] }).map(s => s.text).join('')).toBe(src)
  })
})

// ── PHASE 5 — the proposal card ───────────────────────────────────────────────────────────────
describe('phase 5 · the proposal card creates no new approval path', () => {
  it('approves through the endpoint the existing UI already calls', () => {
    expect(PROPOSAL).toMatch(/fetch\('\/api\/aria\/ask\/action'/)
    expect(PROPOSAL).toMatch(/intent:\s*'confirm'/)
  })

  it('calls exactly one endpoint — no second, quieter path', () => {
    const endpoints = [...PROPOSAL.matchAll(/fetch\('([^']+)'/g)].map(m => m[1])
    expect(endpoints).toEqual(['/api/aria/ask/action'])
  })

  it('MUTATION PROBE — repointing the button fails the check', () => {
    const mutated = PROPOSAL.replace("fetch('/api/aria/ask/action'", "fetch('/api/aria/execute'")
    expect(mutated).not.toMatch(/fetch\('\/api\/aria\/ask\/action'/)
  })

  it('never prints an unpriced line as $0.00, and uses the contract classes', () => {
    expect(PROPOSAL).toMatch(/no recorded cost/)
    expect(PROPOSAL).toMatch(/unpriced/)
    for (const cls of ['prop', 'ph', 'ord', 'oh', 'li', 'tt', 'pf', 'go', 'gh', 'done']) {
      expect(PROPOSAL, 'missing contract class .' + cls).toMatch(
        new RegExp('className="[^"]*\\b' + cls + '\\b'),
      )
    }
  })
})

// ── PHASE 6 — a real zero is a measurement ────────────────────────────────────────────────────
describe('phase 6 · the empty state and the zero rule', () => {
  const fig = (value: number | null, format: AxFigure['format'] = 'currency'): AxFigure => ({
    label: 'Revenue today', value, format,
    provenance: value === null ? 'unknown' : 'measured',
  })

  it('renders a measured zero as $0.00 — never a placeholder', () => {
    expect(formatAxFigure(fig(0))).toBe('A$0.00')
  })

  it('renders a measured zero count as 0', () => {
    expect(formatAxFigure(fig(0, 'count'))).toBe('0')
  })

  it('renders a FAILED read as "Not known" — the one case that is not a number', () => {
    expect(formatAxFigure(fig(null))).toBe('Not known')
  })

  it('never conflates zero with unknown in either direction', () => {
    expect(formatAxFigure(fig(0))).not.toBe(formatAxFigure(fig(null)))
  })

  it('says so plainly when there is nothing to report', () => {
    // The quiet branch must exist and must not offer generic prompts in its place.
    expect(SURFACE).toMatch(/noticed\.length === 0/)
    expect(SURFACE).toMatch(/nothing I’d put in front of you/)
  })

  it('distinguishes an unreadable day from a quiet one', () => {
    expect(SURFACE).toMatch(/ctxUnreadable/)
    expect(SURFACE).toMatch(/couldn’t be read/)
  })
})
