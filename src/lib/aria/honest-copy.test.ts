import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const jsx = (s: string) => code(s).replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

/**
 * S6 PHASE 5 — THE PROVENANCE PRINCIPLE, APPLIED TO PROSE.
 *
 * Aria does not invent numbers. It should not imply work it isn't doing either. Three claims sat on
 * the surface asserting continuous activity that nothing performs — Aria reads the business on load
 * and when asked, not "all day".
 *
 * ⚠️ WHAT WAS NOT WRONG, and why this is not corrected into an apology: the DOMAINS are real.
 * Sip has 95 products, 1,802 completed sales all-time, 4 active staff and 51 customers. "I have no
 * data" would be its own untruth. Only the continuity claim was removed.
 */
describe('S6 phase 5 · no claim of activity the product is not performing', () => {
  it('THE HEADLINE CASE: "watching ... all day" is gone', () => {
    // It sat above "Takings today A$0.00" on a business with nothing through the till.
    expect(jsx(SURFACE)).not.toMatch(/watching your stock, your money and your people/i)
    expect(jsx(SURFACE)).not.toMatch(/all day/i)
  })

  it('the idle status pill no longer claims to be watching', () => {
    expect(jsx(SURFACE)).not.toMatch(/'Watching your till'/)
    expect(jsx(SURFACE)).toMatch(/: 'Connected'\)/)
  })

  it('"Always on" is gone; the true half of that line stayed', () => {
    expect(jsx(SURFACE)).not.toMatch(/Always on/)
    expect(jsx(SURFACE)).toMatch(/Connected records only/)
  })

  it('AN EMPTY TILL IS STATED AS A FACT, calmly, not apologised for', () => {
    expect(jsx(SURFACE)).toMatch(/Nothing through the till yet today\./)
    // and not overcorrected into a claim of ignorance
    expect(jsx(SURFACE)).not.toMatch(/I have no data|I can't see anything|nothing to show you/i)
  })

  it('the real domains are still named — they are backed by real rows', () => {
    // 95 products, 1,802 sales, 4 staff, 51 customers. Dropping these would be a different lie.
    expect(jsx(SURFACE)).toMatch(/Connected to your till, stock and people\./)
  })

  it('the takings figure is still shown when there is one', () => {
    expect(jsx(SURFACE)).toMatch(/'Takings today ' \+ formatAxFigure\(revenue\)/)
  })

  it('SWEEP — no surviving continuous-activity verb in the surface copy', () => {
    // The class, not the three instances: any first-person claim of ongoing monitoring.
    const banned = [/\bI['’]ve been watching\b/i, /\bwatching your\b/i, /\bmonitoring your\b/i,
                    /\bkeeping an eye on\b/i, /\ball day\b/i, /\balways on\b/i]
    const offenders = banned.filter(re => re.test(jsx(SURFACE))).map(String)
    expect(offenders, 'unsupported activity claim: ' + offenders.join(', ')).toEqual([])
  })

  it('MUTATION PROBE — the sweep can go red', () => {
    // Proves the assertion above is not passing merely because its regexes match nothing anywhere.
    // Mutating the CODE expression, not the bare string: my own explanatory comment contains
    // 'Connected', and a naive replace landed there instead — where jsx() strips it, so the
    // probe passed while proving nothing. Anchoring on the ternary makes it hit real code.
    const mutated = SURFACE.replace(": 'Connected')", ": 'Watching your till')")
    expect(mutated).not.toBe(SURFACE)
    expect(/\bwatching your\b/i.test(jsx(mutated))).toBe(true)
  })
})
