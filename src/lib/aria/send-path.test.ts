import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyChatError, STREAM_STALL_MS } from './chat-errors'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const OLD_SURFACE = read('src/app/dashboard/ask-aria/classic/page.tsx')
const HOOK = read('src/components/ask-aria-ax/useAriaStream.ts')

/** Strip comments — this sprint is entirely about prose describing work nobody wired. */

/*
 * ⚠️ REWRITTEN BY S5 PHASE 3 — the behaviour these assert MOVED, it was not removed.
 *
 * S1 built the stall watchdog inline in useAriaStream. S4 found the old page had none and fixed it
 * by writing the same watchdog a SECOND time, inline, in that page. S5 extracted the single copy to
 * lib/aria/stream-watchdog.ts because two copies of a timing rule on the send path is exactly how
 * they drift apart.
 *
 * So the assertions below no longer look for an inline `setTimeout(... controller.abort())` — they
 * look for the shared helper being called. The GUARANTEE is unchanged and is now tested for real,
 * against actual timers and an actually-silent stream, in stream-watchdog.test.ts. These were
 * rewritten rather than deleted so the history of what they were protecting stays readable.
 */

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * S4 PHASES 1 & 2 — WHY SEND STOPPED SENDING.
 *
 * THE CHAIN, established from the deployment and the database rather than guessed:
 *
 *   · /dashboard/ask-aria (the 1,674-line ORIGINAL surface) is what the owner loads — Vercel
 *     runtime logs show 1 hit on it and ZERO on /dashboard/ask-aria/ax, where S1-S3 shipped.
 *   · That surface awaited readAriaSse() with NO watchdog.
 *   · Anthropic has rejected this deployment's key for 24h, so a stream can open and go silent.
 *   · A silent stream means the await never settles -> `finally` never runs -> `sending` stays
 *     true forever -> the bubble streams forever -> every later send returns at the `sending`
 *     guard WITHOUT FETCHING.
 *   · Corroborated independently: the newest row in aria_conversations is 26 Aug 17:30 Melbourne.
 *     Nothing has been persisted since.
 */
describe('S4 phase 1 · the stream read can never hang forever', () => {
  it('the OLD surface now has the watchdog S1 built for the new one', () => {
    const c = code(OLD_SURFACE)
    expect(c).toMatch(/import \{ runWithStallWatchdog, StreamStalled \} from '@\/lib\/aria\/stream-watchdog'/)
    expect(c).toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
  })

  it('the timer is kicked by every frame, not set once', () => {
    // A once-only timer would abort a healthy long answer mid-flow.
    // The kick is now the helper's callback parameter; the surface still calls it per frame.
    const c = code(OLD_SURFACE)
    expect(c).toMatch(/onText: \(full\) => \{\s*kick\(\)/)
    expect(c).toMatch(/runWithStallWatchdog\(controller, kick =>/)
  })

  it('the timer is always cleared, including on the success path', () => {
    // Clearing moved into the helper, where it is covered by a real-timer test:
    // "the timer is cleared on the success path — no leaked handle keeps the process alive".
    expect(code(read('src/lib/aria/stream-watchdog.ts'))).toMatch(/finally \{\s*if \(timer\) clearTimeout\(timer\)/)
  })

  it('a watchdog abort is NOT reported as the owner pressing Stop', () => {
    // The catch treats AbortError as "— stopped —". Without this throw, a stall would render as
    // though the owner had cancelled a question they were still waiting on.
    // Now expressed as a typed error the catch tests for FIRST, before the abort branch.
    expect(code(OLD_SURFACE)).toMatch(/!\(err instanceof StreamStalled\) && err instanceof Error/)
    expect(code(read('src/lib/aria/stream-watchdog.ts'))).toMatch(/class StreamStalled extends Error/)
  })

  it('BOTH surfaces use the SAME shared constant — no second timeout was invented', () => {
    // Stronger than before: neither surface names the constant now, because neither owns the
    // timing. One helper does, and it defaults to the one shared value.
    expect(STREAM_STALL_MS).toBe(45_000)
    expect(code(read('src/lib/aria/stream-watchdog.ts'))).toMatch(/stallMs: number = STREAM_STALL_MS/)
    for (const src of [code(HOOK), code(OLD_SURFACE)]) {
      expect(src).toMatch(/runWithStallWatchdog/)
      expect(src).not.toMatch(/setTimeout\([^)]*45_?000/)
    }
  })

  it('MUTATION PROBE — removing the watchdog is detectable', () => {
    const mutated = OLD_SURFACE.replace('await runWithStallWatchdog(controller, kick => readAriaSse', 'await (readAriaSse')
    expect(mutated).not.toBe(OLD_SURFACE)
    expect(code(mutated)).not.toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
  })

  it('THE GUARD THAT SILENCED EVERYTHING is still there — the fix is the watchdog, not its removal', () => {
    // `sending` must keep guarding double-submits. The bug was never the guard; it was that
    // nothing could ever clear it. Deleting the guard would trade one bug for a worse one.
    expect(code(OLD_SURFACE)).toMatch(/if \(\(!msg && attachedFiles\.length === 0\) \|\| sending\) return/)
    expect(code(OLD_SURFACE)).toMatch(/setSending\(false\)/)
  })
})

describe('S4 phase 2 · a failed turn never leaves a cursor blinking', () => {
  it('the error path uses S1 classifier, not a second set of messages', () => {
    const c = code(OLD_SURFACE)
    expect(c).toMatch(/const classified = classifyChatError\(err\)/)
    expect(c).toMatch(/content: classified\.message, streaming: false/)
  })

  it('the raw provider error is no longer shown to the owner', () => {
    // It rendered `Something went wrong: Your credit balance is too low to access the Anthropic
    // API` — a vendor's billing message, on a cafe owner's screen.
    expect(code(OLD_SURFACE)).not.toMatch(/Something went wrong: \$\{errMsg\}/)
  })

  it('the raw detail still reaches the console for support', () => {
    expect(code(OLD_SURFACE)).toMatch(/console\.error\('\[ask-aria\] turn failed:'/)
  })

  it('a credit failure does NOT invite a pointless retry', () => {
    const e = classifyChatError(new Error('Your credit balance is too low to access the Anthropic API'))
    expect(e.kind).toBe('credit')
    expect(e.retryable).toBe(false)
    expect(e.message).not.toMatch(/try again/i)
  })

  it('a timeout or rate limit DOES tell the owner to try again', () => {
    expect(classifyChatError(new Error('rate limit exceeded')).retryable).toBe(true)
    expect(classifyChatError(new Error('rate limit exceeded')).message).toMatch(/try again/i)
  })

  it('no classified message blames the owner or leaks a vendor name', () => {
    for (const raw of ['429 too many requests', 'network failure', 'credit balance too low', 'boom']) {
      const m = classifyChatError(new Error(raw)).message
      expect(m).not.toMatch(/anthropic|gemini|openai/i)
      expect(m).not.toMatch(/\byou (did|caused|broke)\b/i)
    }
  })

  it('MUTATION PROBE — restoring the raw-error bubble is detectable', () => {
    const mutated = OLD_SURFACE.replace(
      'content: classified.message, streaming: false',
      'content: `Something went wrong: ${errMsg}`, streaming: false',
    )
    expect(mutated).not.toBe(OLD_SURFACE)
    expect(code(mutated)).toMatch(/Something went wrong/)
  })
})
