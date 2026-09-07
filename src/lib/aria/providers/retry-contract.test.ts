import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldRetryModelCall, retryDelayMs } from './anthropic'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')
const COUNCIL = read('src/lib/aria/council.ts')

const decide = (errorMessage: string, mayRetry = true, attempt = 0, maxAttempts = 2) =>
  shouldRetryModelCall({ errorMessage, attempt, maxAttempts, mayRetry })

/**
 * M13B PHASE 1 — THE RETRY CONTRACT.
 *
 * ⚠️ THE BRIEF ASKS FOR A RETRY CONTRACT TO BE ADDED. IT ALREADY EXISTED — `providers/anthropic.ts`
 * has had `withBackoff` all along, wrapping BOTH provider call sites. What it did not have was a
 * written-down contract, a test, or safety on the streaming path.
 *
 * ── AND IT CONTAINED A REAL BUG ────────────────────────────────────────────────────────────────
 * `withBackoff` wrapped the ENTIRE streaming closure. A stream that delivered tokens to
 * `params.onToken` and then hit a transient error was retried, opening a second stream that
 * re-emitted from the beginning — **the owner would read a partial answer followed by a complete
 * one, concatenated.** The main Ask Aria lane is the only streaming call site in the codebase, so
 * the exposed path was the one that answers the owner.
 */
describe('M13B phase 1 · retry before the first token, fail honestly after', () => {
  it('THE BUG: a transient failure IS retryable — until something has been delivered', () => {
    expect(decide('Error 529: overloaded_error', /* mayRetry */ true)).toBe(true)
    // The same error, after a token reached the client. This single flag is the fix.
    expect(decide('Error 529: overloaded_error', /* mayRetry */ false)).toBe(false)
  })

  it('every transient shape the original matched still retries', () => {
    for (const msg of [
      'Error 529: overloaded_error',
      '503 Service Unavailable',
      'Anthropic API overloaded',
      'rate limit exceeded',
      'rate-limit exceeded',
    ]) {
      expect(decide(msg), msg).toBe(true)
    }
  })

  it('nothing else retries — repeating an auth error does not make it truer', () => {
    for (const msg of [
      'authentication_error: invalid x-api-key',
      'invalid_request_error: max_tokens too large',
      'Anthropic call timed out after 55000ms',
      '',
    ]) {
      expect(decide(msg), msg).toBe(false)
    }
  })

  it('TWO ATTEMPTS — one retry, never more', () => {
    expect(decide('529 overloaded', true, /* attempt */ 0, 2)).toBe(true)
    expect(decide('529 overloaded', true, /* attempt */ 1, 2)).toBe(false)
  })

  it('the backoff is 1000ms then capped at 4000ms', () => {
    expect(retryDelayMs(0)).toBe(1000)
    expect(retryDelayMs(1)).toBe(2000)
    expect(retryDelayMs(2)).toBe(4000)
    expect(retryDelayMs(9)).toBe(4000)
  })

  it('MUTATION — retrying after the first token is exactly what goes red', () => {
    // The sprint's named mutation. A version that ignored delivery would return true for a
    // mid-stream transient failure, which is the duplicate-output bug.
    const ignoresDelivery = (msg: string) => /529|503|overload|rate.?limit/i.test(msg)
    const midStream = 'Error 529: overloaded_error'
    expect(decide(midStream, /* delivered */ false)).toBe(false)
    expect(ignoresDelivery(midStream)).toBe(true)          // ← what the bug did
    expect(decide(midStream, false)).not.toBe(ignoresDelivery(midStream))
  })
})

describe('M13B phase 1 · the gate is actually wired to the stream', () => {
  it('the streaming site sets a flag on the FIRST delta and passes it as canRetry', () => {
    // A contract nothing calls is the failure this repo keeps finding. These two lines are what
    // make the pure decision above matter.
    expect(PROVIDER).toContain('let deliveredToClient = false')
    expect(PROVIDER).toMatch(/streamed\.on\('text', \(delta: string\) => \{\s*\n\s*deliveredToClient = true/)
    expect(PROVIDER).toContain('}, 2, () => !deliveredToClient),')
  })

  it('the flag is per ITERATION, not per call — each tool turn is its own stream', () => {
    // Declared inside the loop body, immediately before the race. A call-scoped flag would block
    // a legitimate retry on turn 2 because turn 1 had streamed.
    const at = PROVIDER.indexOf('let deliveredToClient = false')
    const loopAt = PROVIDER.lastIndexOf('for (', at)
    expect(loopAt).toBeGreaterThan(-1)
    expect(at - loopAt).toBeLessThan(4000)
  })

  it('withBackoff calls the extracted decision — not a second copy of the rule', () => {
    expect(PROVIDER).toContain('if (!shouldRetryModelCall({')
    expect(PROVIDER).toContain('await new Promise(r => setTimeout(r, retryDelayMs(attempt)))')
    // The regex lives in ONE place. Two copies is how the contract drifts from the code.
    //
    // Counted with comments stripped: the doc block above `shouldRetryModelCall` QUOTES the regex
    // to write the contract down, so a raw scan finds two and fails on its own documentation. My
    // first version did exactly that — the fourth time this run that a scan matched its own prose.
    const providerCode = PROVIDER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect((providerCode.match(/529\|503\|overload\|rate\.\?limit/g) ?? []).length).toBe(1)
  })

  it('retries never re-execute a tool — the loop accumulates results outside the retry', () => {
    // The decision table's rule. executeTool is called in the loop body AFTER the awaited race,
    // so a retried model turn cannot replay a side effect that already happened.
    const raceAt = PROVIDER.indexOf('withBackoff(async () => {')
    const execAt = PROVIDER.indexOf('await params.executeTool(', raceAt)
    expect(execAt).toBeGreaterThan(raceAt)
    const between = PROVIDER.slice(raceAt, execAt)
    expect(between).toContain('iterHardTimeout,')      // the race closes before any tool runs
  })
})

describe('M13B phase 1 · it matches what the answer council does today', () => {
  it('the council backoff this must replace has the SAME shape', () => {
    // Read before writing, as the brief required. The council's own withBackoff: 2 attempts, the
    // identical transient regex, throw on anything else. It differs ONLY in the delay constants
    // (800/3000 against the provider's 1000/4000) — so migrating it in phase 3 changes when a
    // retry happens by 200ms, and changes nothing about whether one happens.
    expect(COUNCIL).toContain('maxAttempts = 2')
    expect(COUNCIL).toMatch(/529\|503\|overload\|rate\.\?limit/)
    expect(COUNCIL).toContain('Math.min(800 * Math.pow(2, attempt), 3000)')
  })

  it('temperature is now carried, so the council keeps its 0.25 and 0.2', () => {
    // M13 accepted temperature at the gateway and dropped it, because the provider had no field.
    // Migrating the council without this would have changed model behaviour in the same commit as
    // its plumbing — the decision table forbids exactly that.
    expect(PROVIDER).toContain('temperature?: number')
    expect(PROVIDER).toContain("...(params.temperature !== undefined ? { temperature: params.temperature } : {})")
    expect(read('src/lib/ai/gateway.ts')).toContain('temperature: req.temperature,')
    // Only when set — an explicit undefined is not the same as sending nothing.
    expect(COUNCIL).toContain('temperature: 0.25')
    expect(COUNCIL).toContain('temperature: 0.2')
  })
})
