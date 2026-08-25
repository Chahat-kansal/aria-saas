/**
 * S1 PHASE 1 — linking a caller's cancellation to a provider call.
 *
 * WHY THIS IS ITS OWN FILE: it is the mechanism that makes "Stop" mean stop. Left inline in the
 * tool loop it could only ever be grep-asserted — "the code contains an addEventListener" — which
 * proves a wire exists, not that current flows. Here it is a pure function with a real test.
 *
 * THE DISTINCTION THAT MATTERS: aborting the browser's fetch cancels the REQUEST. It does not, by
 * itself, stop the model — the provider keeps generating into a connection nobody is listening to,
 * and the tokens are still billed. Propagating the signal into the SDK call is what turns a
 * disconnect into a cancellation.
 */

/**
 * Abort `inner` whenever `outer` aborts, including when `outer` has already aborted.
 *
 * Returns an unlink function. Call it once the call completes: an AbortSignal can outlive many
 * iterations of a tool loop, and a listener per iteration that is never removed is a leak.
 */
export function linkAbort(outer: AbortSignal | undefined, inner: AbortController): () => void {
  if (!outer) return () => {}

  // Already given up before this iteration began — do not start, and do not wait for an event
  // that has already fired.
  if (outer.aborted) {
    inner.abort()
    return () => {}
  }

  const onAbort = () => inner.abort()
  outer.addEventListener('abort', onAbort, { once: true })
  return () => outer.removeEventListener('abort', onAbort)
}

/** True when this error is the owner pressing Stop rather than something going wrong. */
export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const name = (e as { name?: string }).name
  return name === 'AbortError' || name === 'AbortedByCaller'
}
