import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')
const OLD = read('src/app/dashboard/ask-aria/classic/page.tsx')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S5 PHASE 4 — `?q=` is the capability the swap could not ship without.
 *
 * The old surface reads it (page.tsx:578); /ax read no query parameters at all. Around eight
 * places in the product link to Ask Aria with a question already attached, so swapping without
 * this lands every one on a blank composer and loses the owner's question silently.
 */
describe('S5 phase 4 · ?q= auto-send exists on the surface that will be default', () => {
  it('/ax reads q from the URL and sends it', () => {
    const c = code(AX)
    expect(c).toMatch(/new URLSearchParams\(window\.location\.search\)\.get\('q'\)/)
    expect(c).toMatch(/void ask\(q\)/)
  })

  it('it fires ONCE — a re-run would re-send the owner question', () => {
    // `ask` is recreated whenever conversationId changes, so the effect re-runs. Without the ref
    // guard the owner's question would be asked twice and billed twice.
    const c = code(AX)
    expect(c).toMatch(/const autoSentRef = useRef\(false\)/)
    expect(c).toMatch(/if \(autoSentRef\.current\) return/)
    expect(c).toMatch(/autoSentRef\.current = true/)
  })

  it('an empty or whitespace q does nothing', () => {
    expect(code(AX)).toMatch(/if \(!q \|\| !q\.trim\(\)\) return/)
  })

  it('it is SSR-safe — window is guarded', () => {
    expect(code(AX)).toMatch(/if \(typeof window === 'undefined'\) return/)
  })

  it('the old surface still has its own — nothing was removed from it', () => {
    // The old page stays reachable this sprint (capabilities parked), so its ?q= must keep working.
    expect(code(OLD)).toMatch(/new URLSearchParams\(window\.location\.search\)\.get\('q'\)/)
  })

  it('THE LINKS THAT DEPEND ON IT still point at /dashboard/ask-aria', () => {
    // If this list ever empties, ?q= support stops mattering. If it grows, it matters more.
    // Counted by scanning components for a ?q= link, so it cannot go stale silently.
    const dir = join(root, 'src/components')
    const found: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(e.name)) {
          const src = readFileSync(p, 'utf8')
          if (/\/dashboard\/ask-aria\?q=|ask-aria\?q=|ask-aria\?topic=/.test(src)) found.push(e.name)
        }
      }
    }
    walk(dir)
    expect(found.length, 'components linking with ?q=/?topic=: ' + found.join(', ')).toBeGreaterThanOrEqual(4)
  })

  it('MUTATION PROBE — removing the auto-send is detectable', () => {
    const mutated = AX.replace('void ask(q)', '/* dropped */')
    expect(mutated).not.toBe(AX)
    expect(code(mutated)).not.toMatch(/void ask\(q\)/)
  })
})
