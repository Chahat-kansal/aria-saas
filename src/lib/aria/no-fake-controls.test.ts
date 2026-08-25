import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    expect(SURFACE).toMatch(/awaitingCount = ctx\?\.awaiting\.length/)
    expect(SURFACE).toMatch(/awaitingCount > 0 && <span className="badge">\{awaitingCount\}/)
  })

  it('MUTATION PROBE — a hard-coded badge is caught', () => {
    const mutated = SURFACE.replace(
      'const awaitingCount = ctx?.awaiting.length ?? 0',
      'const awaitingCount = 3',
    )
    expect(mutated).not.toBe(SURFACE)
    expect(mutated).not.toMatch(/awaitingCount = ctx\?\.awaiting\.length/)
  })
})
