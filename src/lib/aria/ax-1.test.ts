import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatAxFigure, type AxFigure } from './ax-context-types'
import { segmentFigures, hasProvenance } from './figure-provenance'
import { resolveAutonomy, isPersistable, PERSISTABLE_MODES, mayActWithoutAsking } from './autonomy'

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
    const NAMES = ('ax-surface deco streaks moire hill blob nav newbtn stage hero orbit corona ' +
      'figure headline tagline live wave noticed nt arrow bigask talk th flow m bub skill n2 src ' +
      'prop ph ord oh li tt pf go gh done write box brow cb mode send2 oath back cursor').split(' ')
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
  it('toggles `work` on the surface itself, never on <body>', () => {
    // CHANGED BY MS16C. The previous contract was a standalone page and put the state on <body>;
    // inside the dashboard shell that leaked. The contract now scopes it to .ax-surface, so the
    // component must not write to document.body at all.
    expect(SURFACE).toMatch(/working \? 'ax-surface work' : 'ax-surface'/)
    expect(SURFACE).not.toMatch(/document\.body\.classList/)
    expect(liftedRegion).toContain('.ax-surface.work')
    expect(liftedRegion).not.toContain('body.work')
  })

  it('THE SURFACE IS ISOLATED — nothing can escape it', () => {
    // The fix for what Chahat saw: decoration anchored to the viewport instead of the surface.
    expect(liftedRegion).toContain('isolation:isolate')
    expect(liftedRegion).not.toContain('position:fixed')
    expect(liftedRegion).toMatch(/\.deco\{position:absolute/)
  })

  it('MUTATION PROBE — position:fixed anywhere in the lifted sheet is caught', () => {
    const mutated = liftedRegion.replace('.deco{position:absolute', '.deco{position:fixed')
    expect(mutated).toContain('position:fixed')
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
    expect(liftedRegion).toContain('.ax-surface.work .hero{display:none}')
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

  it('accepts all three real modes, and still refuses anything else', () => {
    // CHANGED BY MS16B PHASE 4. The CHECK constraint on agent_settings.mode was widened on 24 Aug
    // to CHECK (mode = ANY (ARRAY['suggest','copilot','auto'])), verified live against the database
    // on 25 Aug before this test changed. Co-pilot is persistable now, so asserting it is NOT would
    // be asserting something false. Widening the vocabulary is not the same as accepting anything,
    // so the refusal of unknown values is asserted alongside.
    expect(isPersistable('suggest')).toBe(true)
    expect(isPersistable('copilot')).toBe(true)
    expect(isPersistable('auto')).toBe(true)
    expect(PERSISTABLE_MODES).toEqual(['suggest', 'copilot', 'auto'])

    for (const junk of ['', 'AUTO', 'full', 'yolo', 'admin', 'true']) {
      expect(isPersistable(junk), junk + ' must be refused').toBe(false)
    }
  })
})

// ── MS16B PHASE 4 — CO-PILOT MUST NOT WIDEN A GATED PATH ──────────────────────────────────────
describe('phase 4 (16B) · Co-pilot grants no permission Suggest does not', () => {
  it('only auto may act without asking', () => {
    expect(mayActWithoutAsking('auto')).toBe(true)
    expect(mayActWithoutAsking('copilot')).toBe(false)
    expect(mayActWithoutAsking('suggest')).toBe(false)
  })

  it('an unknown or absent mode never acts unprompted', () => {
    // The predicate is a POSITIVE test, so a future fourth mode lands on the safe side by default
    // instead of inheriting permission nobody granted it.
    for (const v of [null, undefined, '', 'Auto', 'AUTO', 'copilot ', 'full']) {
      expect(mayActWithoutAsking(v as string | null | undefined), String(v)).toBe(false)
    }
  })

  it('THE RAIL — no agent gate is written in the negative form', () => {
    // This is the check that makes Co-pilot safe rather than accidentally safe. Every gate in the
    // agent layer tests `mode === 'auto'`. Had one been written `mode !== 'suggest'`, adding a third
    // value would have silently promoted every Co-pilot business to full execution — including the
    // paths that send SMS to customers and spend money. If anyone ever writes one, this goes red.
    const AGENT_FILES = [
      'src/lib/agents/clv-agent.ts',
      'src/lib/agents/council.ts',
      'src/lib/agents/flash-revenue-agent.ts',
      'src/lib/agents/base-agent.ts',
      'src/lib/aria/labour-realtime.ts',
    ]
    for (const f of AGENT_FILES) {
      const src = read(f)
      expect(src, f + ' must not gate on a negative mode test').not.toMatch(/mode\s*!==?\s*['"]suggest['"]/)
      expect(src, f + ' must not gate on a negative mode test').not.toMatch(/mode\s*!==?\s*['"]copilot['"]/)
    }
  })

  it('the three gated actions still test for auto positively', () => {
    expect(read('src/lib/agents/clv-agent.ts')).toMatch(/if \(mode === 'auto'\)/)
    expect(read('src/lib/agents/council.ts')).toMatch(/if \(mode === 'auto'\)/)
    expect(read('src/lib/agents/flash-revenue-agent.ts')).toMatch(/if \(mode === 'auto'\)/)
    expect(read('src/lib/agents/flash-revenue-agent.ts')).toMatch(/mode === 'auto' \? 'executed' : 'pending'/)
  })

  it('MUTATION PROBE — a negative-form gate is caught', () => {
    const mutated = "if (mode !== 'suggest') { await sendSms() }"
    expect(mutated).toMatch(/mode\s*!==?\s*['"]suggest['"]/)
  })

  it('resolves a mixed three-way state DOWN to the least rope', () => {
    const mixed = resolveAutonomy([
      { agent_type: 'a', mode: 'auto', enabled: true },
      { agent_type: 'b', mode: 'copilot', enabled: true },
    ])
    expect(mixed.mode).toBe('copilot')
    expect(mixed.mixed).toBe(true)

    const withSuggest = resolveAutonomy([
      { agent_type: 'a', mode: 'auto', enabled: true },
      { agent_type: 'b', mode: 'copilot', enabled: true },
      { agent_type: 'c', mode: 'suggest', enabled: true },
    ])
    expect(withSuggest.mode).toBe('suggest')
  })

  it('all-copilot resolves to copilot, and it is persisted', () => {
    const all = resolveAutonomy([
      { agent_type: 'a', mode: 'copilot', enabled: true },
      { agent_type: 'b', mode: 'copilot', enabled: true },
    ])
    expect(all.mode).toBe('copilot')
    expect(all.persisted).toBe(true)
    expect(all.mixed).toBe(false)
  })

  it('an unrecognised stored value is read as the least rope, never the most', () => {
    const junk = resolveAutonomy([{ agent_type: 'a', mode: 'god-mode', enabled: true }])
    expect(junk.mode).toBe('suggest')
  })

  it('disabled agents do not drag the resolution', () => {
    const r = resolveAutonomy([
      { agent_type: 'a', mode: 'auto', enabled: true },
      { agent_type: 'b', mode: 'suggest', enabled: false },
    ])
    expect(r.mode).toBe('auto')
  })

  it('the surface no longer tells the owner Co-pilot cannot be saved', () => {
    expect(SURFACE).not.toMatch(/copilot_parked/)
    expect(SURFACE).not.toMatch(/can.t be saved/i)
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
