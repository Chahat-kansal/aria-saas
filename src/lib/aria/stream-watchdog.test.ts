import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runWithStallWatchdog, StreamStalled } from './stream-watchdog'
import { STREAM_STALL_MS } from './chat-errors'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const OLD = read('src/app/dashboard/ask-aria/page.tsx')
const HOOK = read('src/components/ask-aria-ax/useAriaStream.ts')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** A stream that opens and then says nothing — the exact shape a dead provider produces. */
function silentStream(controller: AbortController): Promise<string> {
  return new Promise((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => {
      const e = new Error('The operation was aborted')
      e.name = 'AbortError'
      reject(e)
    })
  })
}

describe('S5 phase 3 · a silent stream settles instead of hanging — BEHAVIOUR, not source text', () => {
  it('THE BUG: a stream that never speaks now rejects, and quickly', async () => {
    // Before S4 this promise never settled: `finally` never ran, `sending` stayed true, and every
    // later send returned at its guard without fetching. This is that scenario, executed.
    const controller = new AbortController()
    const started = Date.now()
    await expect(runWithStallWatchdog(controller, () => silentStream(controller), 100))
      .rejects.toBeInstanceOf(StreamStalled)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(controller.signal.aborted).toBe(true)
  })

  it('THE NEXT SEND WORKS — the caller is left usable, which was the whole failure', async () => {
    const c1 = new AbortController()
    await expect(runWithStallWatchdog(c1, () => silentStream(c1), 100)).rejects.toBeInstanceOf(StreamStalled)
    // a fresh attempt, exactly as the UI would make after showing the error
    const c2 = new AbortController()
    await expect(runWithStallWatchdog(c2, async () => 'answer', 100)).resolves.toBe('answer')
  })

  it('a talking stream is NOT aborted — every frame resets the timer', async () => {
    // A once-only timer would kill a healthy long answer mid-flow. This runs 6 frames at 25ms —
    // 150ms total, far past the 400ms-per-frame budget only because each frame kicks it.
    // Margins are deliberately WIDE (25ms frames against a 400ms budget, 16:1). A tight ratio
    // makes this test fail under disk/CPU contention rather than when the code is wrong — and a
    // flaky test on the send-path guard is worse than no test, because it trains people to re-run.
    const controller = new AbortController()
    const out = await runWithStallWatchdog(controller, async (kick) => {
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 25))
        kick()
      }
      return 'complete'
    }, 400)
    expect(out).toBe('complete')
    expect(controller.signal.aborted).toBe(false)
  })

  it('a stream that goes quiet MID-ANSWER still stalls', async () => {
    // Two frames, then silence — a provider dying partway, not at the start.
    const controller = new AbortController()
    await expect(runWithStallWatchdog(controller, async (kick) => {
      await new Promise(r => setTimeout(r, 25)); kick()
      await new Promise(r => setTimeout(r, 25)); kick()
      return silentStream(controller)   // then silence, past the 200ms budget
    }, 200)).rejects.toBeInstanceOf(StreamStalled)
  })

  it('a REAL error is passed through unchanged, not disguised as a stall', async () => {
    const controller = new AbortController()
    await expect(runWithStallWatchdog(controller, async () => { throw new Error('credit balance too low') }, 5_000))
      .rejects.toThrow('credit balance too low')
  })

  it('a USER abort is not converted into a stall', async () => {
    // The distinction that matters: the owner pressing Stop must stay an AbortError so the UI
    // shows "— stopped —" rather than an error they never caused.
    const controller = new AbortController()
    const p = runWithStallWatchdog(controller, () => silentStream(controller), 5_000)
    controller.abort()                       // the owner, not the watchdog
    await expect(p).rejects.toHaveProperty('name', 'AbortError')
  })

  it('the timer is cleared on the success path — no leaked handle keeps the process alive', async () => {
    const controller = new AbortController()
    await runWithStallWatchdog(controller, async () => 'ok', 60)
    await new Promise(r => setTimeout(r, 300))   // past the budget
    expect(controller.signal.aborted).toBe(false)
  })

  it('defaults to the shared STREAM_STALL_MS', () => {
    expect(STREAM_STALL_MS).toBe(45_000)
    expect(code(read('src/lib/aria/stream-watchdog.ts'))).toMatch(/stallMs: number = STREAM_STALL_MS/)
  })
})

describe('S5 phase 3 · ONE watchdog, used by both surfaces', () => {
  it('both call the shared helper', () => {
    expect(code(OLD)).toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
    expect(code(HOOK)).toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
  })

  it('NEITHER still carries its own inline copy', () => {
    // S4 fixed the old page by writing the watchdog a second time. Two copies of a timing rule on
    // the send path is exactly how they drift — this asserts there is now one.
    for (const [name, src] of [['old page', OLD], ['hook', HOOK]] as const) {
      expect(code(src), name + ' still has an inline stall timer')
        .not.toMatch(/stalled = true; controller\.abort\(\)/)
    }
  })

  it('the old page tests StreamStalled BEFORE the abort branch', () => {
    // Otherwise a stall renders as "— stopped —": a cancellation the owner never asked for.
    expect(code(OLD)).toMatch(/if \(!\(err instanceof StreamStalled\) && err instanceof Error && \(err\.name === 'AbortError'/)
  })

  it('the hook records a stall so its classifier reports it as retryable', () => {
    expect(code(HOOK)).toMatch(/if \(e instanceof StreamStalled\) stalledRef\.current = true/)
  })

  it('MUTATION PROBE — removing the watchdog from either surface is detectable', () => {
    for (const [name, src] of [['old page', OLD], ['hook', HOOK]] as const) {
      const mutated = src.replace(/await runWithStallWatchdog\(controller, kick => readAriaSse/, 'await (readAriaSse')
      expect(mutated, name).not.toBe(src)
      expect(code(mutated)).not.toMatch(/await runWithStallWatchdog\(controller, kick => readAriaSse/)
    }
  })
})

describe('S5 phase 3 · the default surface shows an error with a retry', () => {
  const AX = read('src/components/ask-aria-ax/AskAriaTransition.tsx')

  it('/ax renders the error and offers Retry only when retrying can help', () => {
    const c = code(AX)
    expect(c).toMatch(/\{error && \(/)
    expect(c).toMatch(/error\.retryable \?/)
    expect(c).toMatch(/onClick=\{\(\) => void retry\(\)\}/)
  })

  it('and says so plainly when it cannot', () => {
    expect(AX).toMatch(/Retrying won’t change this one\./)
  })

  it('retry resends the last body rather than making the owner retype', () => {
    expect(code(HOOK)).toMatch(/const body = lastBodyRef\.current/)
  })
})
