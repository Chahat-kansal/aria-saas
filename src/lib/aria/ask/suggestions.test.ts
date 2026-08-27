import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withBudget, TIMED_OUT, SUGGESTION_BUDGET_MS } from './suggestions'

const root = join(__dirname, '..', '..', '..', '..')
const SRC = readFileSync(join(root, 'src/lib/aria/ask/suggestions.ts'), 'utf8')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S4 PHASE 4 — /api/aria/ask/suggestions took 16.5s and produced nothing usable.
 *
 * Live log, in order:
 *   [gemini] response truncated at maxOutputTokens=300 for agent ask_suggestions
 *   [ai-json] parse failed in aria/gemini-fallback/ask_suggestions: parse_failed_all_strategies
 *   ...then the same failure again in suggestions/generate
 *
 * The cause is the token budget, not the parser. 300 tokens cannot hold four data-referencing
 * questions plus a JSON envelope, so the model was asked for something it could not emit.
 */
describe('S4 phase 4 · the cause was the budget, not the parser', () => {
  it('the token budget is no longer the truncating 300', () => {
    expect(code(SRC)).toMatch(/maxTokens: 700,/)
    expect(code(SRC)).not.toMatch(/maxTokens: 300,/)
  })

  it('THE PARSER WAS NOT WIDENED — it still fails closed on unparseable output', () => {
    // The forbidden fix. Accepting truncated JSON would turn a loud failure into a silent
    // half-answer, which is the exact class this whole sprint is about.
    const c = code(SRC)
    expect(c).toMatch(/parseLLMJsonOr<\{ suggestions\?: string\[\] \}>\(result\.raw, \{\}, 'suggestions\/generate'\)/)
    expect(c).not.toMatch(/repairJson|truncat\w*Json|lenientParse|acceptPartial/i)
  })

  it('MUTATION PROBE — restoring the truncating budget is detectable', () => {
    const mutated = SRC.replace('maxTokens: 700,', 'maxTokens: 300,')
    expect(mutated).not.toBe(SRC)
    expect(code(mutated)).toMatch(/maxTokens: 300,/)
    expect(code(mutated)).not.toMatch(/maxTokens: 700,/)
  })
})

describe('S4 phase 4 · it fails fast instead of failing slowly', () => {
  it('a budget of 6s replaces an observed 16.5s', () => {
    expect(SUGGESTION_BUDGET_MS).toBe(6_000)
    expect(SUGGESTION_BUDGET_MS).toBeLessThan(16_500)
  })

  it('MEASURED: a slow generation gives up at the budget, not at 16s', async () => {
    const started = Date.now()
    const slow = new Promise<string>(r => setTimeout(() => r('too late'), 5_000))
    const out = await withBudget(120, slow)
    const elapsed = Date.now() - started
    expect(out).toBe(TIMED_OUT)
    expect(elapsed).toBeLessThan(1_000)   // the point: it returns in ms, not seconds
  })

  it('a fast generation is returned untouched — the budget is not a ceiling on success', async () => {
    expect(await withBudget(1_000, Promise.resolve({ ok: true }))).toEqual({ ok: true })
  })

  it('a REJECTED generation resolves rather than throwing', async () => {
    // A provider error must be a decision (serve the generic set), not an exception that
    // unwinds past the caching guard.
    expect(await withBudget(1_000, Promise.reject(new Error('credit balance too low')))).toBe(TIMED_OUT)
  })

  it('TIMED_OUT is distinguishable from a legitimate empty result', () => {
    // A provider may legitimately return null/undefined; conflating that with a timeout would
    // make the two indistinguishable in the logs.
    expect(TIMED_OUT).not.toBe(null)
    expect(TIMED_OUT).not.toBe(undefined)
    expect(typeof TIMED_OUT).toBe('symbol')
  })
})

describe('S4 phase 4 · a fallback is never cached as though it were generated', () => {
  it('the generic set is returned WITHOUT being written to the cache', () => {
    // The old code cached whatever it ended up with, so ONE truncated response poisoned every
    // page load for four hours — the failure outlived the request that caused it.
    const c = code(SRC)
    expect(c).toMatch(/const generated = Array\.isArray\(parsed\.suggestions\) && parsed\.suggestions\.length > 0/)
    expect(c).toMatch(/if \(!generated\) \{[\s\S]{0,300}?return mergeOpenLoop\(FALLBACK_SUGGESTIONS, openLoopQ\)/)
  })

  it('the cache write happens only after the generated check', () => {
    const c = code(SRC)
    const guardAt = c.indexOf('const generated =')
    const cacheAt = c.indexOf("from('aria_suggestions').insert")
    expect(guardAt).toBeGreaterThan(-1)
    expect(cacheAt).toBeGreaterThan(guardAt)
  })

  it('every failure path is logged — none returns the generic set silently', () => {
    const c = code(SRC)
    expect(c).toMatch(/console\.error\('\[suggestions\] generation exceeded '/)
    expect(c).toMatch(/console\.error\('\[suggestions\] model returned no parseable suggestions/)
  })

  it('MUTATION PROBE — caching a fallback again is detectable', () => {
    const mutated = SRC.replace('if (!generated) {', 'if (false) {')
    expect(mutated).not.toBe(SRC)
    expect(code(mutated)).not.toMatch(/if \(!generated\) \{/)
  })
})
