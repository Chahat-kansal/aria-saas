import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * S1 PHASE 8 — the renderer's standing guarantees.
 *
 * The BEHAVIOURAL proof lives in scripts/s1-render-verify.tsx, which renders in real Chromium and
 * asserts a real table, a working code-copy button, that hostile output does not execute, and that
 * provenance survives. This file is the cheap rail that keeps those properties true between runs.
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const RENDERER = read('src/components/ask-aria-ax/AnswerMarkdown.tsx')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const PKG = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> }

/** Source with comments stripped — prose explaining a rule must not satisfy the rule. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('phase 8 · model output is never HTML', () => {
  it('does NOT enable rehype-raw', () => {
    // react-markdown 9 does not render raw HTML unless rehype-raw is added. Not adding it means a
    // <script> in model output is never HTML in the first place — it arrives as text and React
    // escapes it. That is stronger than a sanitiser, because there is no allowlist to get wrong.
    expect(code(RENDERER)).not.toMatch(/rehype-raw/)
    expect(code(RENDERER)).not.toMatch(/rehypePlugins/)
  })

  it('never uses dangerouslySetInnerHTML', () => {
    expect(code(RENDERER)).not.toMatch(/dangerouslySetInnerHTML/)
    expect(code(SURFACE)).not.toMatch(/dangerouslySetInnerHTML/)
  })

  it('PROBE — these checks can go red', () => {
    // Proves the assertions above are falsifiable rather than vacuously true.
    const mutated = 'const x = <div dangerouslySetInnerHTML={{ __html: source }} />'
    expect(code(mutated)).toMatch(/dangerouslySetInnerHTML/)
    expect(code('rehypePlugins={[rehypeRaw]}')).toMatch(/rehypePlugins/)
  })

  it('model-supplied links cannot reach back into the app', () => {
    expect(RENDERER).toMatch(/rel="noopener noreferrer nofollow"/)
    expect(RENDERER).toMatch(/target="_blank"/)
  })

  it('uses libraries the repo already depends on — no new supply chain', () => {
    expect(PKG.dependencies?.['react-markdown']).toBeTruthy()
    expect(PKG.dependencies?.['remark-gfm']).toBeTruthy()
  })
})

describe('phase 8 · provenance outranks rendering', () => {
  it('figures are wrapped INSIDE the rendered elements, table cells included', () => {
    // The sprint is explicit: if rendering breaks provenance, provenance wins. So segmentFigures is
    // applied to the parser's text nodes rather than to the raw string before parsing — otherwise a
    // number inside a table cell would silently lose its tier.
    for (const el of ['p', 'li', 'td', 'th', 'strong', 'em']) {
      expect(RENDERER, el + ' must wrap its children for provenance')
        .toMatch(new RegExp(el + ': \\(\\{ children \\}\\) => <' + el + '>\\{wrap\\(children\\)\\}'))
    }
  })

  it('PROBE — the element-wrapper pattern can fail to match', () => {
    expect(/td: \(\{ children \}\) => <td>\{wrap\(children\)\}/.test('td: ({ children }) => <td>{children}</td>')).toBe(false)
  })

  it('a figure with no backing still gets no affordance', () => {
    expect(RENDERER).toMatch(/s\.kind === 'text' \|\| s\.tier === 'plain'/)
  })

  it('the surface renders answers through the markdown component', () => {
    expect(SURFACE).toMatch(/<AnswerMarkdown/)
    expect(SURFACE).toMatch(/streaming=\{t\.streaming\}/)
  })
})

describe('phase 8 · follow-ups come from the route, not from the client', () => {
  it('renders at most three, and only from the payload', () => {
    expect(SURFACE).toMatch(/followups: \(Array\.isArray\(result\?\.followups\) \? result\.followups : \[\]\)\.slice\(0, 3\)/)
    expect(SURFACE).toMatch(/\(t\.followups \?\? \[\]\)\.slice\(0, 3\)\.map/)
  })

  it('shows none while streaming, and none when the route had none', () => {
    expect(SURFACE).toMatch(/!t\.streaming && \(t\.followups \?\? \[\]\)\.length > 0/)
  })

  it('a follow-up asks the question rather than just filling the box', () => {
    expect(SURFACE).toMatch(/onClick=\{\(\) => void ask\(f\)\}/)
  })
})
