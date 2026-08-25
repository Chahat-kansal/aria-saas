import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyChatError, stalledError, STREAM_STALL_MS } from './chat-errors'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const HOOK = read('src/components/ask-aria-ax/useAriaStream.ts')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

describe('phase 7 · retryable and not-retryable are told apart', () => {
  it('rate limits, timeouts, network drops and 5xx are retryable', () => {
    for (const raw of [
      '429 Too Many Requests', 'rate_limit_error', 'Request timed out after 45000ms',
      'ETIMEDOUT', 'fetch failed', 'ECONNRESET', '503 Service Unavailable', 'Overloaded',
    ]) {
      const e = classifyChatError(raw)
      expect(e.retryable, raw + ' should be retryable').toBe(true)
      expect(e.message.length).toBeGreaterThan(10)
    }
  })

  it('credit, auth and bad-request failures are NOT retryable', () => {
    for (const raw of [
      'Your credit balance is too low to access the Anthropic API',
      '401 Unauthorized', 'invalid api key', '400 Bad Request', 'unprocessable entity',
    ]) {
      const e = classifyChatError(raw)
      expect(e.retryable, raw + ' should NOT be retryable').toBe(false)
    }
  })

  it('the live failure — Anthropic credit balance — is classified as credit, not retryable', () => {
    // This is what is ACTUALLY happening: 0 successes in 92 Anthropic calls over 8 days.
    const e = classifyChatError(new Error('Your credit balance is too low to access the Anthropic API'))
    expect(e.kind).toBe('credit')
    expect(e.retryable).toBe(false)
    expect(e.message).toMatch(/topping up/)
    expect(e.message).toMatch(/won.t help/)
  })

  it('an unknown failure is treated as retryable — a dead end is the worse outcome', () => {
    const e = classifyChatError(new Error('something inexplicable'))
    expect(e.kind).toBe('unknown')
    expect(e.retryable).toBe(true)
  })

  it('reads Errors, strings and response bodies alike', () => {
    expect(classifyChatError({ error: '429 rate limit' }).kind).toBe('rate_limit')
    expect(classifyChatError({ status: 503 }).kind).toBe('server')
    expect(classifyChatError(null).kind).toBe('unknown')
  })

  it('never blames the owner', () => {
    for (const raw of ['429', 'credit balance', '401', '400', 'timeout', 'fetch failed']) {
      expect(classifyChatError(raw).message).not.toMatch(/\byou (did|entered|typed|broke)\b/i)
    }
  })

  it('keeps the raw detail for support but it is not the message', () => {
    const e = classifyChatError(new Error('429 rate_limit_error from upstream'))
    expect(e.detail).toContain('429')
    expect(e.message).not.toContain('429')
  })
})

describe('phase 7 · the watchdog — no stream sits in streaming forever', () => {
  it('the hook arms a stall timer and every frame resets it', () => {
    expect(HOOK).toMatch(/STREAM_STALL_MS/)
    expect(HOOK).toMatch(/const kick = \(\) =>/)
    // both frame types reset it — a tool turn that emits only stage frames must not be killed
    expect(HOOK).toMatch(/onText: \(full\) => \{ kick\(\)/)
    expect(HOOK).toMatch(/onStage: \(\) => \{ kick\(\)/)
  })

  it('a stall aborts and surfaces as retryable, NOT as a user stop', () => {
    // The trap: the watchdog aborts the same controller the Stop button uses, so without a flag a
    // stall would be reported as "you stopped this".
    expect(HOOK).toMatch(/stalledRef\.current = true/)
    expect(HOOK).toMatch(/!stalledRef\.current/)
    expect(stalledError().retryable).toBe(true)
    expect(stalledError().kind).toBe('timeout')
  })

  it('the stall window is longer than the provider timeout, so a slow live turn is not killed', () => {
    // provider iteration timeouts are 30s (haiku) and 55s (sonnet) — see providers/anthropic.ts
    expect(STREAM_STALL_MS).toBeGreaterThanOrEqual(45_000)
  })

  it('MUTATION PROBE — removing the watchdog is detectable', () => {
    const mutated = HOOK.replace(/stallTimer = setTimeout\([\s\S]{0,140}?STREAM_STALL_MS\)/, '// no watchdog')
    expect(mutated).not.toBe(HOOK)
    expect(mutated).not.toMatch(/stallTimer = setTimeout/)
  })
})

describe('phase 7 · retry resends without retyping, and only when it can help', () => {
  it('the hook keeps the last body and resends it verbatim', () => {
    expect(HOOK).toMatch(/lastBodyRef\.current = body/)
    expect(HOOK).toMatch(/const retry = useCallback/)
    expect(HOOK).toMatch(/return send\(body, onDone\)/)
  })

  it('the surface offers Retry ONLY for retryable failures', () => {
    expect(SURFACE).toMatch(/error\.retryable \? \(/)
    expect(SURFACE).toMatch(/onClick=\{\(\) => void retry\(\)\}/)
    expect(SURFACE).toMatch(/Retrying won.t change this one/)
  })

  it('the surface names the provider that actually answered', () => {
    expect(SURFACE).toMatch(/Answered by \{degraded\.provider\}/)
  })
})
