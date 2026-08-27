import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * MS17 PHASES 3 & 6 — THE NO-FAKE-CONTROL RAIL.
 *
 * The founder's rule: "Everything visible on screen must be real." Every control on the Ask Aria
 * surface either does something, or it is not on the surface. There is no disabled-but-styled third
 * state and no "coming soon".
 *
 * MS17 phase 1 counted TEN fake controls on this surface — four room tabs, two mics, attach, share,
 * more, and a mode chip that was a <span> dressed as a dropdown with a caret. This test is what
 * stops that number climbing back up.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
 *   Every <button>, <a>, <input> and <textarea> in the Ask Aria surface files carries a real
 *   handler (onClick / onChange / onKeyDown / onSubmit), or is a file input, or is explicitly a
 *   presentational element that cannot be interacted with.
 *   And: no handler is a no-op — `() => {}`, a bare console.log, or a lone toast.
 *
 * ── WHAT IT CANNOT CATCH — stated because a rail nobody trusts is worse than none ──────────────
 *   1. A handler that calls a route which 404s, or writes to a table with no reader. It proves a
 *      wire exists, not that the wire carries current. Phase 5's control-by-control walk is what
 *      covers that, and only against the data present on the day it ran.
 *   2. A control rendered by an imported component (VoiceInput, SkillPicker, BlockRenderer). Those
 *      are covered by their own files, not by this scan of the surface.
 *   3. Anything built from a variable or a map whose tag text this regex does not see, e.g. a
 *      component that spreads props: `<button {...handlers} />`.
 *   4. A handler that runs but does nothing useful — `onClick={() => setOpen(open)}`. Syntactically
 *      live, semantically dead.
 *   It is a floor, not a ceiling.
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** Every file that renders part of the Ask Aria surface's own markup. */
const SURFACE_FILES = [
  'src/components/ask-aria-ax/AskAriaTransition.tsx',
  'src/components/ask-aria-ax/rooms/ThreadsPanel.tsx',
  'src/components/ask-aria-ax/rooms/AwaitingRoom.tsx',
  'src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx',
  'src/components/ask-aria-ax/ProposalCard.tsx',
]

const INTERACTIVE = ['button', 'a', 'input', 'textarea', 'select']

/** Handler props that make an element genuinely interactive. */
const HANDLER = /\bon(Click|Change|KeyDown|KeyUp|Submit|Input|Focus)\s*=/

/** Handlers that exist but do nothing — the "looks wired, isn't" case. */
const NO_OP = [
  /on\w+\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/,                      // () => {}
  /on\w+\s*=\s*\{\s*\(\s*\)\s*=>\s*console\.\w+\([^)]*\)\s*\}/,        // () => console.log(...)
  /on\w+\s*=\s*\{\s*\(\s*\)\s*=>\s*(alert|toast)\(/,                   // () => toast(...)
  /on\w+\s*=\s*\{\s*undefined\s*\}/,
  /on\w+\s*=\s*\{\s*noop\s*\}/,
]

/**
 * Pull every opening tag for the given element names out of a source file.
 * Returns the raw tag text, e.g. `<button className="cb" onClick={x}>`.
 */
function openingTags(src: string, names: string[]): Array<{ name: string; tag: string; index: number }> {
  const out: Array<{ name: string; tag: string; index: number }> = []
  for (const name of names) {
    // `<button` followed by whitespace, `>` or `/` — so `<a` does not match `<AwaitingRoom`.
    const re = new RegExp('<' + name + '(?=[\\s/>])', 'g')
    for (const m of src.matchAll(re)) {
      const start = m.index ?? 0
      // walk to the end of the opening tag, respecting braces so `onClick={() => f('>')}` is safe
      let depth = 0
      let end = start
      for (let i = start; i < src.length; i++) {
        const ch = src[i]
        if (ch === '{') depth++
        else if (ch === '}') depth--
        else if (ch === '>' && depth === 0) { end = i; break }
      }
      out.push({ name, tag: src.slice(start, end + 1), index: start })
    }
  }
  return out
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length
}

describe('MS17 · no fake controls on the Ask Aria surface', () => {
  it('every interactive element has a real handler', () => {
    const offenders: string[] = []

    for (const file of SURFACE_FILES) {
      const src = read(file)
      for (const { name, tag, index } of openingTags(src, INTERACTIVE)) {
        // a file input is driven by its own onChange; a hidden one is triggered programmatically
        if (name === 'input' && /type="file"/.test(tag)) continue
        // a controlled input with a value binding and onChange is covered by the HANDLER test below
        if (HANDLER.test(tag)) continue
        // `<a href=...>` is a real navigation, which counts
        if (name === 'a' && /\bhref\s*=/.test(tag)) continue
        offenders.push(`${file}:${lineOf(src, index)}  <${name} …>  ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
      }
    }

    expect(offenders, 'interactive elements with no handler:\n' + offenders.join('\n')).toEqual([])
  })

  it('no handler is a no-op', () => {
    const offenders: string[] = []
    for (const file of SURFACE_FILES) {
      const src = read(file)
      for (const re of NO_OP) {
        for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
          offenders.push(`${file}:${lineOf(src, m.index ?? 0)}  ${m[0].replace(/\s+/g, ' ')}`)
        }
      }
    }
    expect(offenders, 'handlers that do nothing:\n' + offenders.join('\n')).toEqual([])
  })

  // ── THE PROBES. Each proves the check above can actually go red. ────────────────────────────
  //
  // Required by the standing rules after two assertions in this repo silently passed because a
  // `\b` written inside a `new RegExp('...')` string is a BACKSPACE character, not a word boundary.
  // These patterns are built the same way `openingTags` builds them, so if that construction is
  // broken the probes fail too.

  it('PROBE — a handler-less button is caught', () => {
    const src = 'const X = () => <div><button className="cb">📎</button></div>'
    const tags = openingTags(src, INTERACTIVE)
    expect(tags).toHaveLength(1)
    expect(HANDLER.test(tags[0]!.tag)).toBe(false)
  })

  it('PROBE — a wired button is not caught', () => {
    const src = 'const X = () => <button className="cb" onClick={() => doThing()}>go</button>'
    const tags = openingTags(src, INTERACTIVE)
    expect(tags).toHaveLength(1)
    expect(HANDLER.test(tags[0]!.tag)).toBe(true)
  })

  it('PROBE — a bare <a> tab with no handler is caught (the MS16 room tabs)', () => {
    const src = '<nav className="nav"><a className="on">Ask</a><a>Awaiting you</a></nav>'
    const tags = openingTags(src, ['a'])
    expect(tags).toHaveLength(2)
    expect(tags.every(t => !HANDLER.test(t.tag))).toBe(true)
  })

  it('PROBE — the tag walker is not fooled by a > inside a handler', () => {
    const src = '<button onClick={() => setX(a > b)}>x</button>'
    const tags = openingTags(src, ['button'])
    expect(tags).toHaveLength(1)
    expect(tags[0]!.tag).toContain('a > b')
    expect(HANDLER.test(tags[0]!.tag)).toBe(true)
  })

  it('PROBE — <a> does not match a component name like <AwaitingRoom', () => {
    const src = '<AwaitingRoom ctx={c} /><a onClick={f}>x</a>'
    const tags = openingTags(src, ['a'])
    expect(tags).toHaveLength(1)
    expect(tags[0]!.tag).toContain('onClick')
  })

  it('PROBE — each no-op pattern really matches its shape', () => {
    const samples = [
      'onClick={() => {}}',
      'onClick={() => console.log("x")}',
      'onClick={() => toast("soon")}',
      'onClick={undefined}',
    ]
    for (const s of samples) {
      expect(NO_OP.some(re => re.test(s)), s + ' should be flagged').toBe(true)
    }
    expect(NO_OP.some(re => re.test('onClick={() => void ask(input)}'))).toBe(false)
  })
})

// -- MS17 PHASE 6 -- THE WIRE MUST REACH SOMETHING ---------------------------------------------
//
// The handler check above proves a control is wired. It does NOT prove the wire reaches anything:
// `onClick={() => fetch('/api/aria/does-not-exist')}` passes it happily. That was the first
// limitation listed in this file's header, and this closes it — every /api/ path the surface calls
// must resolve to a route file on disk.
//
// It still cannot prove the route WORKS against real data. Nothing static can. Phase 5's walk is
// the nearest available, and only for the day it ran.
describe('MS17 . the awaiting room layout and its count', () => {
  const ROOM = read('src/components/ask-aria-ax/rooms/AwaitingRoom.tsx')
  const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

  it('the caller does NOT wrap AwaitingRoom in a second .ax-room', () => {
    // `.ax-room` is flex:1 + overflow-y:auto + padding. Two nested gave two competing scroll
    // containers and collapsed the room to a sliver with a dead gap below — what the founder saw.
    // Extra content goes in as children so there is exactly one container.
    const at = SURFACE.indexOf('<AwaitingRoom')
    expect(at).toBeGreaterThan(-1)
    const before = SURFACE.slice(Math.max(0, at - 400), at)
    expect(before, 'AwaitingRoom must not sit inside another .ax-room')
      .not.toMatch(/className="ax-room"[^]*$/)
  })

  it('AwaitingRoom renders its own single room container', () => {
    expect(ROOM).toMatch(/className="ax-room"/)
    expect(ROOM).toMatch(/children/)
  })

  it('the badge is the TRUE pending count, not the length of the capped list', () => {
    // These differed 6 vs 55 on the first live screenshot: the list is .limit(6) server-side, so
    // its length is a page size. A count and a page size must not share a source.
    expect(SURFACE).toMatch(/awaitingCount = ctx\?\.awaitingTotal/)
    expect(SURFACE).not.toMatch(/awaitingCount = ctx\?\.awaiting\.length/)
    expect(ROOM).toMatch(/ctx\.awaitingTotal/)
  })

  it('the room says so when it is showing a page rather than everything', () => {
    expect(ROOM).toMatch(/most recent of/)
  })

  it('the server counts pending separately from the list it returns', () => {
    const CTX = read('src/lib/aria/ax-context.ts')
    expect(CTX).toMatch(/count: 'exact', head: true/)
    expect(CTX).toMatch(/awaitingTotal = count \?\? 0/)
  })

  it('MUTATION PROBE -- reverting the badge to the list length is caught', () => {
    const mutated = SURFACE.replace('const awaitingCount = ctx?.awaitingTotal ?? 0',
                                    'const awaitingCount = ctx?.awaiting.length ?? 0')
    expect(mutated).not.toBe(SURFACE)
    expect(mutated).toMatch(/awaitingCount = ctx\?\.awaiting\.length/)
  })
})

describe('MS17 phase 6 . every wire reaches a real route', () => {
  const CALLERS = [
    'src/components/ask-aria-ax/AskAriaTransition.tsx',
    'src/components/ask-aria-ax/rooms/ThreadsPanel.tsx',
    'src/components/ask-aria-ax/rooms/MadeForYouRoom.tsx',
    'src/components/ask-aria-ax/ProposalCard.tsx',
    'src/components/ask-aria-ax/useAriaStream.ts',
  ]

  /** Every /api/... path a file fetches, quote or backtick, query string trimmed. */
  function apiPaths(src: string): string[] {
    const out = new Set<string>()
    for (const m of src.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"?$]*)/g)) out.add(m[1]!)
    return [...out]
  }

  function routeExists(apiPath: string): boolean {
    return existsSync(join(root, 'src/app', apiPath.replace(/^\//, ''), 'route.ts'))
  }

  it('every /api path the surface calls has a route file', () => {
    const dead: string[] = []
    for (const f of CALLERS) {
      for (const p of apiPaths(read(f))) {
        if (!routeExists(p)) dead.push(f + ' -> ' + p)
      }
    }
    expect(dead, 'controls wired to routes that do not exist: ' + dead.join(' | ')).toEqual([])
  })

  it('the surface really does call the routes it should', () => {
    // A guard against the check above passing vacuously because nothing was found to check.
    const all = CALLERS.flatMap(f => apiPaths(read(f)))
    expect(all.length).toBeGreaterThanOrEqual(8)
    expect(all).toContain('/api/aria/ask/history')
    expect(all).toContain('/api/aria/ask/upload')
    expect(all).toContain('/api/aria/deliverables')
  })

  it('PROBE -- a route that does not exist is caught', () => {
    expect(routeExists('/api/aria/ask/history')).toBe(true)
    expect(routeExists('/api/aria/definitely-not-a-route')).toBe(false)
  })

  it('PROBE -- the path extractor sees both quote styles', () => {
    const quoted = "fetch('/api/aria/ask/delete', { method: 'DELETE' })"
    const templated = 'fetch(`/api/aria/ask/history?id=${id}&messages=true`)'
    expect(apiPaths(quoted)).toContain('/api/aria/ask/delete')
    expect(apiPaths(templated)).toContain('/api/aria/ask/history')
  })
})

describe('MS17 · the rooms are over stores that have a writer', () => {
  const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

  /**
   * Source with comments stripped. The file explains in prose WHY the Routines room was removed,
   * and that explanation must not fail the check that it was removed — the same trap that made an
   * MS16C assertion fail against its own warning comment.
   */
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('there is no Routines / House rules room', () => {
    // aria_business_memory kind='house_rule' has ZERO rows for every business, ever, and its only
    // production writer is onboarding provisioning — no API route and no UI can create one. A tab
    // over it could only ever be empty, which is a fake control wearing an empty state.
    expect(code(SURFACE)).not.toMatch(/Routines/)
    expect(code(SURFACE)).not.toMatch(/House rules/)
  })

  it('PROBE — the comment stripper does not hide a real Routines tab', () => {
    const withTab = code(SURFACE).replace("{ id: 'made', label: 'Made for you' },",
      "{ id: 'made', label: 'Made for you' },\n  { id: 'routines', label: 'Routines' },")
    expect(withTab).toMatch(/Routines/)
  })

  it('every room tab switches to a room that renders something real', () => {
    expect(SURFACE).toMatch(/id: 'ask'/)
    expect(SURFACE).toMatch(/id: 'awaiting'/)
    expect(SURFACE).toMatch(/id: 'made'/)
    expect(SURFACE).toMatch(/<AwaitingRoom/)
    expect(SURFACE).toMatch(/<MadeForYouRoom/)
  })

  it('the awaiting badge is a live count, never a constant', () => {
    // CHANGED after the first live screenshot. This originally asserted
    // `awaitingCount = ctx?.awaiting.length`, which WAS live — and still wrong. `awaiting` is
    // capped at 6 server-side, so its length is a page size: the badge read 6 while 55 decisions
    // were actually pending. "Live" was never the whole requirement; "true" is. The assertion now
    // pins the server-side count, and the old shape is asserted ABSENT so it cannot come back.
    expect(SURFACE).toMatch(/awaitingCount = ctx\?\.awaitingTotal/)
    expect(SURFACE).not.toMatch(/awaitingCount = ctx\?\.awaiting\.length/)
    expect(SURFACE).toMatch(/awaitingCount > 0 && <span className="badge">\{awaitingCount\}/)
  })

  it('MUTATION PROBE — a hard-coded badge is caught', () => {
    // Re-pointed at the current source line for the same reason as the test above. It still proves
    // the same thing: replacing the count with a constant is detectable.
    const mutated = SURFACE.replace(
      'const awaitingCount = ctx?.awaitingTotal ?? 0',
      'const awaitingCount = 3',
    )
    expect(mutated).not.toBe(SURFACE)
    expect(mutated).not.toMatch(/awaitingCount = ctx\?\.awaitingTotal/)
  })
})


/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * S3 PHASE 4 — THE UNREACHABLE-CAPABILITY RAIL.
 *
 * The rail above catches a control that LOOKS real and does nothing. This one catches the exact
 * opposite, and it is the failure that has now happened three times:
 *
 *   S1   `cancel` was returned by useAriaStream and never destructured. Stop existed, worked, and
 *        was not on screen.
 *   S2B  rename and pin were built as routes and panel handlers; the database still says 0 and 0.
 *   S3   `provenance` was accepted by AnswerMarkdown from the day it was written and never passed.
 *        0 of 288 conversations carried a tier.
 *
 * All three are invisible to a rail that inspects rendered controls, because the missing thing is
 * not a control — it is the WIRE to one. A capability nothing calls is as broken as a dead button,
 * and it is harder to see: the code reads as finished.
 *
 * ── WHAT IT CHECKS ──────────────────────────────────────────────────────────────────────────────
 *   1. Every key a surface hook RETURNS is destructured by a surface file. (The Stop case.)
 *   2. Every prop a surface component ACCEPTS is passed by at least one caller. (The provenance
 *      case — this is the check that would have caught phase 1 on the day it was written.)
 *
 * ── WHAT IT CANNOT CATCH — and this list is the honest half ─────────────────────────────────────
 *   a. A prop that is passed but always `undefined` — `provenance={t.provenance}` where nothing
 *      ever sets `t.provenance`. Syntactically wired, semantically dead. Phase 1's own chain test
 *      pins that end; this rail only proves the prop is handed over.
 *   b. A destructured value that is never USED after destructuring (`const { cancel } = ...` and
 *      then nothing). Catching that needs scope analysis, not a regex.
 *   c. Anything reached dynamically — `obj[name]()`, a spread `{...handlers}`, or a capability
 *      called from a file outside the surface list.
 *   d. A route with no caller at all. That is a different scan (a URL string search) and is not
 *      attempted here rather than half-attempted.
 *
 *   It proves a capability is HANDED OVER. It does not prove anyone uses what they were handed.
 *
 * ⚠️ FALSE POSITIVES ARE EXPECTED AND ARE HANDLED BY NAMING THEM, NOT BY LOOSENING THE CHECK.
 *   S2B's first isolation rail flagged 11 blocks and none were leaks. So every exemption below is
 *   an explicit entry with a reason, and the list is short enough to read. If it ever grows long,
 *   that is the signal the rail is wrong — not that the exemptions need extending again.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Keys a hook hands back, read from its `return { ... }`. */
function hookReturnKeys(src: string): string[] {
  // the LAST top-level `return {` in the file is the hook's public surface
  const idx = src.lastIndexOf('\n  return {')
  if (idx < 0) return []
  const close = src.indexOf('\n  }', idx)
  const body = src.slice(idx + '\n  return {'.length, close)
  return body
    .split(',')
    .map(part => part.split(':')[0]!.trim())
    .filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
}

/** Props a component declares in its `interface XProps { ... }`. */
function declaredProps(src: string, interfaceName: string): string[] {
  const m = src.match(new RegExp('interface\\s+' + interfaceName + '\\s*\\{([\\s\\S]*?)\\n\\}'))
  if (!m) return []
  return m[1]!
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^[A-Za-z_][A-Za-z0-9_]*\??\s*:/.test(l))
    .map(l => l.split(/[?:]/)[0]!.trim())
}

describe('S3 phase 4 · a capability nothing calls is as broken as a dead button', () => {
  const SURFACE_SRC = SURFACE_FILES.filter(f => existsSync(join(root, f))).map(read).join('\n')

  it('every key useAriaStream returns is destructured by the surface', () => {
    // THE S1 REGRESSION TEST. `cancel` was returned and never taken; Stop did not exist on screen
    // even though it was fully built and working.
    const keys = hookReturnKeys(read('src/components/ask-aria-ax/useAriaStream.ts'))
    expect(keys.length).toBeGreaterThan(3)
    const destructured = SURFACE_SRC.match(/const \{([^}]*)\} = useAriaStream\(\)/)?.[1] ?? ''
    const taken = destructured.split(',').map(k => k.trim())
    const orphans = keys.filter(k => !taken.includes(k))
    expect(orphans, 'useAriaStream returns these and nothing takes them: ' + orphans.join(', ')).toEqual([])
  })

  it('every prop AnswerMarkdown accepts is passed by its caller', () => {
    // THE S3 PHASE 1 REGRESSION TEST. `provenance` was accepted and never passed, for the whole
    // life of the component, and the moat quietly did nothing.
    const props = declaredProps(read('src/components/ask-aria-ax/AnswerMarkdown.tsx'), 'AnswerMarkdownProps')
    expect(props).toContain('provenance')
    const call = SURFACE_SRC.match(/<AnswerMarkdown([\s\S]*?)\/>/)?.[1] ?? ''
    const orphans = props.filter(pr => !new RegExp('\\b' + pr + '=').test(call))
    expect(orphans, 'AnswerMarkdown accepts these and no caller passes them: ' + orphans.join(', ')).toEqual([])
  })

  it('every prop ThreadsPanel accepts is passed by its caller', () => {
    const props = declaredProps(read('src/components/ask-aria-ax/rooms/ThreadsPanel.tsx'), 'ThreadsPanelProps')
    expect(props.length).toBeGreaterThan(2)
    const call = SURFACE_SRC.match(/<ThreadsPanel([\s\S]*?)\/>/)?.[1] ?? ''
    const orphans = props.filter(pr => !new RegExp('\\b' + pr + '=').test(call))
    expect(orphans, 'ThreadsPanel accepts these and no caller passes them: ' + orphans.join(', ')).toEqual([])
  })

  it('RED/GREEN PROOF — a deliberately orphaned hook key is caught', () => {
    // The phase asks for proof it goes red against an orphan and green when wired. Both directions
    // are exercised here rather than asserted, because a rail nobody has seen fail is not a rail.
    const keys = ['send', 'cancel', 'retry']
    const wired = 'const { send, cancel, retry } = useAriaStream()'
    const orphaned = 'const { send, retry } = useAriaStream()'
    const check = (surface: string) => {
      const taken = (surface.match(/const \{([^}]*)\} = useAriaStream\(\)/)?.[1] ?? '')
        .split(',').map(k => k.trim())
      return keys.filter(k => !taken.includes(k))
    }
    expect(check(wired)).toEqual([])            // green when wired
    expect(check(orphaned)).toEqual(['cancel']) // red when orphaned — the exact S1 bug
  })

  it('RED/GREEN PROOF — a deliberately orphaned prop is caught', () => {
    const props = ['text', 'provenance']
    const wired = '<AnswerMarkdown text={live} provenance={t.provenance} />'
    const orphaned = '<AnswerMarkdown text={live} />'
    const check = (call: string) => props.filter(pr => !new RegExp('\\b' + pr + '=').test(call))
    expect(check(wired)).toEqual([])
    expect(check(orphaned)).toEqual(['provenance'])  // the exact S3 phase 1 bug
  })
})
