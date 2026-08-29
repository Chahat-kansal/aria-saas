import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectTruncation, classifyOutcome, isBudgetProblem, truncationNote } from './truncation'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S8 PHASE 1 — THE RAIL: A STRUCTURED MODEL CALL MUST BE ABLE TO NOTICE ITS OWN TRUNCATION.
 *
 * This class has now been found twice by looking at production data rather than by any test:
 *   S4  suggestions   maxTokens: 300  — could not physically hold four questions plus JSON
 *   S8  council brain max_tokens: 1200 — p90 at 1160, 8% pinned, two advisors lost mid-object
 *
 * Both times a comment was added. A comment did not stop the second one, and S6 and S7 both
 * established that only a rail does. The valuable assertion is the SECOND one below: it fails when
 * a model call that parses its response as JSON has no way to tell truncation from any other parse
 * failure. That is the property that made the 1200 bug invisible for two months — `succeeded:
 * false` meant both "ran out of room" and "returned prose", so nobody could count the first.
 *
 * ── WHAT THIS RAIL CANNOT CATCH, and the list is not short ─────────────────────────────────────
 *   · Whether a ceiling is BIG ENOUGH. Only production data can say that. The rail pins the one
 *     number we have evidence for and cannot derive the others.
 *   · Non-Anthropic calls. `context-brain.ts` calls Gemini over raw fetch and has no `max_tokens`
 *     at all, so `stop_reason` does not exist for it. It is out of this rail's reach, by provider.
 *   · Ceilings passed as variables rather than literals — the ask route computes `maxTokens` from
 *     the routed model, so the scan sees a name, not a number.
 *   · Whether the truncation, once detected, is HANDLED well. Phase 2 is about that.
 */
describe('S8 phase 1 · the token-ceiling rail', () => {
  const council = read('src/lib/aria/council.ts')

  it('the council advisor ceiling is at or above the measured floor', () => {
    // 1,016 real calls: avg 896, p50 878, p90 1160, p99 1200, 8% pinned exactly at 1200.
    // A p90 sitting at 97% of the cap is a clipped distribution, not a comfortable one.
    const m = strip(council).match(/max_tokens:\s*(\d+),/)
    expect(m, 'no advisor max_tokens literal found — the scan is broken, not the code').toBeTruthy()
    const ceiling = Number(m![1])
    expect(ceiling, 'advisor ceiling regressed toward the clipped 1200').toBeGreaterThanOrEqual(4000)
  })

  it('THE RAIL — every Anthropic call in council.ts inspects its own stop_reason', () => {
    // The property, not the instance: a fifth advisor added tomorrow without this is caught.
    const src = strip(council)
    const sites = [...src.matchAll(/messages\.create\(\{/g)]
    // ANTI-VACUITY. A scan that matches nothing passes this test while proving nothing — the
    // failure this repo produces most often in its own tooling. Two sites exist today: the shared
    // advisor runner and synthesis.
    expect(sites.length, 'the call-site scan found nothing').toBeGreaterThanOrEqual(2)

    const unchecked: string[] = []
    for (const site of sites) {
      // The response is inspected within the same block that reads `res.content`. 3,000 chars is
      // comfortably past the longest of the two, and short enough that a check in a DIFFERENT
      // function cannot be mistaken for this one's.
      const after = src.slice(site.index ?? 0, (site.index ?? 0) + 3000)
      if (!after.includes('inspectTruncation(res)')) {
        unchecked.push(src.slice(Math.max(0, (site.index ?? 0) - 90), site.index ?? 0).trim().slice(-70))
      }
    }
    expect(unchecked, 'model calls that cannot notice their own truncation: ' + unchecked.join(' | ')).toEqual([])
  })

  it('there is ONE definition of truncated, and council imports it', () => {
    // Six call sites deciding separately what "truncated" means is this repo's most-repeated
    // failure. `stop_reason` is compared to 'max_tokens' in exactly one file.
    expect(strip(council)).toMatch(/from '\.\/truncation'/)
    expect(strip(read('src/lib/aria/truncation.ts'))).toContain("=== 'max_tokens'")
  })

  it('HITTING THE CEILING IS NOT AUTOMATICALLY A FAILURE — 69 of 81 survived it', () => {
    // safeParseJSON slices first `{` to LAST `}`, so an advisor that finished its object and then
    // rambled to the cap still parses. Failing those would discard working advisors: a downgrade.
    const hit = { hitCeiling: true, stopReason: 'max_tokens', outputTokens: 1200 }
    expect(classifyOutcome(hit, true)).toBe('ok_at_ceiling')
    expect(classifyOutcome(hit, false)).toBe('truncated_mid_structure')
    const clean = { hitCeiling: false, stopReason: 'end_turn', outputTokens: 878 }
    expect(classifyOutcome(clean, true)).toBe('ok')
    expect(classifyOutcome(clean, false)).toBe('unparseable')

    // Both ceiling outcomes are budget problems worth recording; only one is a failure.
    expect(isBudgetProblem('ok_at_ceiling')).toBe(true)
    expect(isBudgetProblem('truncated_mid_structure')).toBe(true)
    expect(isBudgetProblem('unparseable')).toBe(false)
    expect(truncationNote('Risk', 'ok_at_ceiling')).toBeNull()
    expect(truncationNote('Risk', 'truncated_mid_structure')).toContain('ran out of room')
  })

  it('inspectTruncation reads the response, never guesses from length', () => {
    expect(inspectTruncation({ stop_reason: 'max_tokens', usage: { output_tokens: 1200 } }))
      .toEqual({ hitCeiling: true, stopReason: 'max_tokens', outputTokens: 1200 })
    expect(inspectTruncation({ stop_reason: 'end_turn', usage: { output_tokens: 4000 } }).hitCeiling)
      .toBe(false)   // 4000 tokens and NOT truncated — length proves nothing
    expect(inspectTruncation(null)).toEqual({ hitCeiling: false, stopReason: null, outputTokens: null })
    expect(inspectTruncation({}).hitCeiling).toBe(false)
  })

  it('NO PARSER WAS WIDENED — safeParseJSON is still strict', () => {
    // The forbidden fix, and S4 asserted the same thing for the same reason.
    const src = strip(council)
    const fn = src.slice(src.indexOf('function safeParseJSON'), src.indexOf('function safeParseJSON') + 420)
    expect(fn).toContain('JSON.parse(')
    expect(fn).not.toMatch(/repair|lenient|partial|salvage|tolerant/i)
  })

  it('MUTATION PROBE — restoring the 1200 ceiling makes the floor assertion red', () => {
    const mutated = strip(council).replace(/max_tokens:\s*4000,/, 'max_tokens: 1200,')
    expect(mutated, 'the mutation did not apply — the probe proves nothing').not.toBe(strip(council))
    const ceiling = Number(mutated.match(/max_tokens:\s*(\d+),/)![1])
    expect(ceiling).toBe(1200)
    expect(ceiling).toBeLessThan(4000)   // exactly what the first assertion would report
  })

  it('MUTATION PROBE — removing a stop_reason check makes the rail red', () => {
    const src = strip(council)
    const mutated = src.replace('inspectTruncation(res)', 'noopTruncation(res)')
    expect(mutated).not.toBe(src)
    const sites = [...mutated.matchAll(/messages\.create\(\{/g)]
    const unchecked = sites.filter(s =>
      !mutated.slice(s.index ?? 0, (s.index ?? 0) + 3000).includes('inspectTruncation(res)'))
    expect(unchecked.length, 'the rail would not have noticed the removal').toBeGreaterThan(0)
  })
})
