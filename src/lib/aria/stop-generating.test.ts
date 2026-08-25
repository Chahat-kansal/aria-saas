import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linkAbort, isAbortError } from './abort-link'

/**
 * S1 PHASE 1 — STOP GENERATING.
 *
 * A streaming answer that cannot be interrupted is worse than no streaming: the owner watches a
 * wrong answer arrive and can do nothing about it.
 *
 * The claim this file has to support is NOT "there is a stop button". It is that pressing stop
 * CANCELS GENERATION SERVER-SIDE. A client-only abort is a disconnect: the browser stops listening
 * while the provider keeps generating, and the tokens are still billed.
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const PROVIDER = read('src/lib/aria/providers/anthropic.ts')
const ROUTE = read('src/app/api/aria/ask/route.ts')
const HOOK = read('src/components/ask-aria-ax/useAriaStream.ts')
const SURFACE = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

// ── THE MECHANISM, TESTED FOR REAL ─────────────────────────────────────────────────────────────
describe('linkAbort — the caller\'s stop reaches the provider call', () => {
  it('aborts the inner controller when the outer signal aborts', () => {
    const outer = new AbortController()
    const inner = new AbortController()
    linkAbort(outer.signal, inner)

    expect(inner.signal.aborted).toBe(false)
    outer.abort()
    expect(inner.signal.aborted).toBe(true)
  })

  it('aborts immediately when the caller has ALREADY given up', () => {
    // The race that matters: the owner stops while a tool turn is still running, so the NEXT
    // iteration must not start a fresh model call.
    const outer = new AbortController()
    outer.abort()
    const inner = new AbortController()
    linkAbort(outer.signal, inner)
    expect(inner.signal.aborted).toBe(true)
  })

  it('unlinking stops propagation, so a tool loop does not leak a listener per iteration', () => {
    const outer = new AbortController()
    const inner = new AbortController()
    const unlink = linkAbort(outer.signal, inner)
    unlink()
    outer.abort()
    expect(inner.signal.aborted).toBe(false)
  })

  it('does not leak listeners across many iterations', () => {
    const outer = new AbortController()
    const spyAdd = vi.spyOn(outer.signal, 'addEventListener')
    const spyRemove = vi.spyOn(outer.signal, 'removeEventListener')
    for (let i = 0; i < 8; i++) linkAbort(outer.signal, new AbortController())()
    expect(spyAdd).toHaveBeenCalledTimes(8)
    expect(spyRemove).toHaveBeenCalledTimes(8)
  })

  it('is a no-op when no signal was supplied', () => {
    const inner = new AbortController()
    expect(() => linkAbort(undefined, inner)()).not.toThrow()
    expect(inner.signal.aborted).toBe(false)
  })

  it('a stop is recognised as a stop, not a failure', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
    expect(isAbortError({ name: 'AbortedByCaller' })).toBe(true)
    expect(isAbortError(new Error('rate limited'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

// ── THE WIRING, END TO END ─────────────────────────────────────────────────────────────────────
describe('the stop is propagated all the way into the provider', () => {
  it('the provider accepts a caller signal and links it to the SDK call', () => {
    expect(PROVIDER).toMatch(/signal\?: AbortSignal/)
    expect(PROVIDER).toMatch(/linkAbort\(params\.signal, iterAc\)/)
    // iterAc's signal is what actually reaches the Anthropic SDK
    expect(PROVIDER).toMatch(/client\.messages\.stream\(requestBody, \{ signal: iterAc\.signal \}\)/)
    expect(PROVIDER).toMatch(/client\.messages\.create\(requestBody, \{ signal: iterAc\.signal \}\)/)
  })

  it('the provider refuses to start a new turn once the caller has stopped', () => {
    expect(PROVIDER).toMatch(/if \(params\.signal\?\.aborted\) throw new AbortedByCaller\(\)/)
  })

  it('the route threads the REQUEST signal into the tool loop', () => {
    // This is the link that was missing entirely before S1: the client aborted, and nothing
    // downstream ever heard about it.
    expect(ROUTE).toMatch(/signal\?: AbortSignal/)
    expect(ROUTE).toMatch(/\}, req\.signal\)/)
    expect(ROUTE).toMatch(/onToken: tokenSink,\s*\n\s*signal,/)
  })

  it('MUTATION PROBE — removing the server-side link is detectable', () => {
    const mutated = PROVIDER.replace('linkAbort(params.signal, iterAc)', 'linkAbort(undefined, iterAc)')
    expect(mutated).not.toBe(PROVIDER)
    expect(mutated).not.toMatch(/linkAbort\(params\.signal, iterAc\)/)
  })

  it('MUTATION PROBE — dropping req.signal at the route is detectable', () => {
    const mutated = ROUTE.replace('}, req.signal)', '})')
    expect(mutated).not.toBe(ROUTE)
    expect(mutated).not.toMatch(/\}, req\.signal\)/)
  })
})

// ── A STOPPED TURN IS KEPT, AND MARKED ─────────────────────────────────────────────────────────
describe('a stopped answer is persisted incomplete, never discarded and never dressed up', () => {
  it('the route persists the partial with an incomplete marker', () => {
    expect(ROUTE).toMatch(/incomplete\?: boolean/)
    expect(ROUTE).toMatch(/incomplete: true, stopped_by: 'user'/)
    // and it is stored, not thrown away
    expect(ROUTE).toMatch(/stoppedConvId = await upsertConversation\(/)
  })

  it('a stop returns a normal response, not an error, so the thread stays usable', () => {
    expect(ROUTE).toMatch(/stopped: true/)
    expect(ROUTE).toMatch(/intent: 'stopped'/)
  })

  it('the client treats a stop as a result, not a throw', () => {
    expect(HOOK).toMatch(/stopped: true, incomplete: true/)
    expect(HOOK).toMatch(/'stopped'/)
  })

  it('the surface shows Stop while streaming and marks the partial', () => {
    expect(SURFACE).toMatch(/onClick=\{cancel\}/)
    expect(SURFACE).toMatch(/aria-label="Stop generating"/)
    expect(SURFACE).toMatch(/ax-incomplete/)
    expect(SURFACE).toMatch(/this answer is unfinished/)
  })

  it('MUTATION PROBE — discarding the partial is detectable', () => {
    const mutated = ROUTE.replace("incomplete: true, stopped_by: 'user'", '')
    expect(mutated).not.toBe(ROUTE)
    expect(mutated).not.toMatch(/incomplete: true, stopped_by: 'user'/)
  })
})
