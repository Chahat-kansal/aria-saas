import { STREAM_STALL_MS } from './chat-errors'

/**
 * S5 PHASE 3 — ONE WATCHDOG, USED BY BOTH SURFACES.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────────────────────
 * S1 phase 7 built a stall watchdog inside `useAriaStream` for the /ax surface. S4 discovered the
 * old page had none — `await readAriaSse(...)` with no timer, so a silent stream never settled, the
 * `finally` never ran, `sending` stayed true forever, and every later send returned at its guard
 * without fetching. One stuck boolean silenced the product.
 *
 * S4 fixed that by writing the SAME watchdog a second time, inline, in the old page. That was the
 * right call under time pressure and the wrong shape to leave behind: this repo's most-repeated
 * failure is N copies of one rule drifting apart, and a timing rule that guards the send path is
 * the last place to have two of them. Extracted here so there is exactly one, and so it can be
 * tested against real timers instead of asserted against source text.
 *
 * ── THE CONTRACT ────────────────────────────────────────────────────────────────────────────────
 * `run` receives a `kick` it must call on every frame it receives. Silence longer than `stallMs`
 * aborts the controller and throws `StreamStalled`.
 *
 * THROWS rather than returns a flag, deliberately: both call sites already have a catch that
 * classifies errors, and a stall IS an error — a retryable one. Returning a flag would let a caller
 * forget to check it, which is precisely how the original bug survived.
 *
 * ⚠️ A STALL IS NOT THE OWNER PRESSING STOP. The abort this raises produces an `AbortError` inside
 * `run`, indistinguishable from a user cancel — so `StreamStalled` is thrown in its place and both
 * catches test for it first. Without that distinction a hung request renders as "— stopped —", a
 * cancellation the owner never asked for.
 */
export class StreamStalled extends Error {
  constructor() {
    super('Aria stopped responding. Nothing was lost — try again.')
    this.name = 'StreamStalled'
  }
}

export async function runWithStallWatchdog<T>(
  controller: AbortController,
  run: (kick: () => void) => Promise<T>,
  stallMs: number = STREAM_STALL_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stalled = false

  const kick = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { stalled = true; controller.abort() }, stallMs)
  }

  kick()
  try {
    const result = await run(kick)
    // Checked AFTER the await as well as in the catch: a stream can deliver its final frame in the
    // same tick the timer fires, and resolving normally there would hand back a truncated answer
    // as though it were complete.
    if (stalled) throw new StreamStalled()
    return result
  } catch (e) {
    if (stalled) throw new StreamStalled()
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
}
