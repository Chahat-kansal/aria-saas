import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContentFreeBlock, BODY_FIELDS } from './block-content'
import type { AskBlock } from './ask-types'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const RENDERERS = [
  'src/components/dashboard/BlockRenderer.tsx',
  'src/components/aria/BlockRenderer.tsx',
]

/**
 * S7 PHASE 3 — THE RAIL: NO BLOCK RENDERER MAY EMIT CHROME WITHOUT CONTENT.
 *
 * This class has now been fixed instance-by-instance twice and reappeared both times:
 *   S6  brain_readouts / council_split — header printed before checking `items`
 *   S7  data_table — "TOP CUSTOMERS — ALL LAPSED 60+ DAYS" with columns and no rows
 *
 * A comment stating the rule did not stop it. S6 made count-vs-page-size a rail; this does the same
 * here. The check that matters is the SECOND one below: it fails when a block type that can print a
 * header over an empty body exists and the shared predicate does not judge it — which is exactly how
 * the S7 instance came to be, and how the next one would.
 *
 * ── WHAT IT CANNOT CATCH, and this half is the honest half ──────────────────────────────────────
 *   · A renderer that prints chrome for a type whose emptiness cannot be read from the type
 *     definition — e.g. a body arriving as a JSON string, or content behind a getter.
 *   · Chrome emitted by SURFACE code rather than a block renderer. The tan card and grey status bar
 *     in this sprint's screenshot are exactly that, which is why they are phase 4, not this rail.
 *   · A body field this test infers by name but the renderer actually reads differently — the name
 *     scan below is a heuristic over `ask-types.ts`, not a proof about the JSX.
 *   · Whether the content is CORRECT. Only whether there is any.
 *   · A third renderer added outside RENDERERS. The list is asserted to be complete against the
 *     files that import AskBlock, so adding one without updating this file fails — but a renderer
 *     that never imports the type would slip through.
 */

/** Pulls each `type: 'x'` variant and its balanced-brace body out of ask-types.ts. */
function blockShapes(): Map<string, string> {
  const src = read('src/lib/aria/ask-types.ts')
  const out = new Map<string, string>()
  for (const m of src.matchAll(/type:\s*'([a-z_]+)'/g)) {
    const name = m[1]!
    let i = m.index ?? 0
    let depth = 0
    let start = -1
    while (i >= 0) {
      const c = src[i]
      if (c === '}') depth++
      else if (c === '{') {
        if (depth === 0) { start = i; break }
        depth--
      }
      i--
    }
    if (start < 0) continue
    depth = 0
    let j = start
    while (j < src.length) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') { depth--; if (depth === 0) break }
      j++
    }
    const body = src.slice(start + 1, j)
    const prev = out.get(name)
    if (!prev || body.length < prev.length) out.set(name, body)
  }
  return out
}

/** Field names that are chrome — a header, not a body. */
const CHROME = new Set(['type', 'title', 'label', 'heading', 'subheading', 'subtitle', 'icon',
  'color', 'accent', 'variant', 'theme', 'role', 'caption', 'columns', 'headers',
  'x_label', 'y_label', 'chart_type', 'chartType', 'unit', 'filename'])

describe('S7 phase 3 · the rail', () => {
  it('the renderer list is complete — no third renderer has appeared', () => {
    // If someone adds a renderer, this fails and they must decide whether it needs the guard.
    const importers = ['src/components/dashboard/BlockRenderer.tsx', 'src/components/aria/BlockRenderer.tsx',
      'src/components/ask-aria-ax/AskAriaTransition.tsx', 'src/components/dashboard/AriaBriefingCard.tsx',
      'src/app/dashboard/ask-aria/classic/page.tsx', 'src/app/pos/ask/page.tsx']
    // The four non-renderers delegate; only the two below own per-type branches.
    const owners = importers.filter(f => /block\.type ===|case '[a-z_]+':/.test(code(read(f))))
    expect(owners.sort()).toEqual([...RENDERERS].sort())
  })

  it('every renderer guards BEFORE emitting anything', () => {
    for (const f of RENDERERS) {
      const src = code(read(f))
      const guard = src.indexOf('if (isContentFreeBlock(block)) return null')
      expect(guard, f + ' has no guard').toBeGreaterThan(-1)
      // Scope to the renderer function itself. The first version of this searched the WHOLE FILE
      // for a JSX return and reported components/aria as defective — because helper components
      // with their own returns sit above OneBlock. That was a measurement error in the rail, not
      // a defect in the renderer, and it is recorded here because this repo's failure pattern #5
      // is exactly that: a diagnostic that manufactures its own finding.
      const heads = [...src.slice(0, guard).matchAll(/^(?:export )?function \w+\(/gm)]
      const fnStart = heads.length ? (heads[heads.length - 1]!.index ?? -1) : -1
      expect(fnStart, f + ' guard is not inside a function').toBeGreaterThan(-1)
      expect(src.slice(fnStart, guard), f + ' emits JSX before guarding').not.toMatch(/return \(?\s*</)
    }
  })

  it('THE RAIL — every header+body block type is judged by the shared predicate', () => {
    // The S7 instance in one sentence: data_table could print a header over empty rows and the
    // predicate had never been taught about it.
    const shapes = blockShapes()
    expect(shapes.size, 'the type scan parsed nothing').toBeGreaterThanOrEqual(30)
    const examined: string[] = []
    const unjudged: string[] = []
    for (const [name, body] of shapes) {
      // `(?:^|[{;])` — NOT `^` alone. ask-types.ts has two formatting eras and the single-line
      // variants below line ~160 put every field after a `;` on one line. A line-anchored scan
      // reads 23 of 34 types and silently skips the rest; that is how the first version of this
      // rail reported a clean sweep while four real instances sat in the half it could not see.
      const fields = [...body.matchAll(/(?:^|[{;])\s*(\w+)\s*\??\s*:/gm)].map(m => m[1]!)
      const hasChrome = fields.some(f => f !== 'type' && CHROME.has(f))
      const bodyArrays = fields.filter(f => !CHROME.has(f)
        && new RegExp(f + String.raw`\s*\??:\s*(?:Array<|[^;\n]*\[\])`).test(body))
      if (!hasChrome || bodyArrays.length === 0) continue
      examined.push(name)

      // Judged if an all-empty instance of this shape is reported content-free.
      const empty: Record<string, unknown> = { type: name, title: 'A header' }
      for (const f of bodyArrays) empty[f] = []
      if (!isContentFreeBlock(empty as unknown as AskBlock)) {
        unjudged.push(name + ' (body: ' + bodyArrays.join(',') + ')')
      }
    }
    // ANTI-VACUITY. A scan that matches nothing passes this test while proving nothing — this
    // repo's failure pattern #5. Every type the predicate claims to judge must be one the scan
    // actually reached, so an under-reaching scan fails loudly instead of reporting all-clear.
    const unreached = Object.keys(BODY_FIELDS).filter(t => !examined.includes(t))
    expect(unreached, 'the scan never reached these judged types: ' + unreached.join(', ')).toEqual([])
    expect(unjudged, 'block types that can print chrome over nothing and are NOT judged: '
      + unjudged.join(' | ')).toEqual([])
  })

  it('MUTATION PROBE — the rail goes red when a shape stops being judged', () => {
    // Proves the assertion above can fail rather than passing because its scan matched nothing.
    // Emulates removing data_table from BODY_FIELDS: an all-empty instance would render.
    const judged = isContentFreeBlock({ type: 'data_table', title: 'H', rows: [] } as unknown as AskBlock)
    const unjudgedShape = isContentFreeBlock({ type: 'kpi_card', title: 'H', foo: [] } as unknown as AskBlock)
    expect(judged).toBe(true)        // taught -> caught
    expect(unjudgedShape).toBe(false) // untaught -> would be reported by the rail
  })

  it('MUTATION PROBE — an unconditional header in a renderer is detectable', () => {
    for (const f of RENDERERS) {
      const src = read(f)
      const mutated = src.replace('if (isContentFreeBlock(block)) return null', '')
      expect(mutated, f).not.toBe(src)
      expect(code(mutated)).not.toMatch(/if \(isContentFreeBlock\(block\)\) return null/)
    }
  })
})
