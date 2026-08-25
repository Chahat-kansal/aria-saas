/**
 * S1 PHASE 7 — ERRORS THAT END SOMEWHERE.
 *
 * A failure that just stops is a dead end: the owner retypes their question, or gives up on the
 * product. Every failure here resolves to one of a small set of states, each with a next step.
 *
 * And with Anthropic returning nothing usable (0 successes in 92 calls over the eight days to
 * 2026-08-25, a credit-balance failure), this is not hypothetical — it is the normal path.
 *
 * ── THE DISTINCTION THAT MATTERS ───────────────────────────────────────────────────────────────
 * RETRYABLE means the same request might work if sent again: a rate limit, a timeout, a dropped
 * connection, a 5xx. Offering Retry on these is honest.
 *
 * NOT RETRYABLE means the same request will fail the same way forever: a malformed request, an
 * expired key, an exhausted credit balance. Offering Retry there is a lie that costs the owner a
 * second wait to reach the same wall, so those get a plain explanation instead.
 */

export type ErrorKind =
  | 'rate_limit' | 'timeout' | 'network' | 'server'        // retryable
  | 'bad_request' | 'auth' | 'credit' | 'unknown'          // not

export interface ChatError {
  kind: ErrorKind
  retryable: boolean
  /** What the owner reads. Plain, specific, and never blames them. */
  message: string
  /** The raw text, kept for the run log and support — never rendered. */
  detail?: string
}

const RULES: Array<{ kind: ErrorKind; retryable: boolean; test: RegExp; message: string }> = [
  {
    kind: 'rate_limit', retryable: true,
    test: /rate.?limit|429|too many requests|quota exceeded/i,
    message: 'Aria is being asked a lot at once. Give it a moment and try again.',
  },
  {
    kind: 'credit', retryable: false,
    test: /credit balance|insufficient (funds|credit)|billing|payment required|402/i,
    message: 'Aria’s AI account needs topping up. Retrying won’t help — this one is on us to fix.',
  },
  {
    kind: 'auth', retryable: false,
    test: /\b401\b|unauthori[sz]ed|invalid api key|authentication|forbidden|\b403\b/i,
    message: 'Aria couldn’t authenticate with the AI provider. Retrying won’t help — this one is on us.',
  },
  {
    kind: 'timeout', retryable: true,
    test: /timed? ?out|timeout|deadline|etimedout/i,
    message: 'That took too long and Aria gave up waiting. Try again.',
  },
  {
    kind: 'network', retryable: true,
    test: /network|fetch failed|econnreset|socket|dns|enotfound|connection/i,
    message: 'The connection dropped before Aria finished. Try again.',
  },
  {
    kind: 'bad_request', retryable: false,
    test: /\b400\b|bad request|invalid request|validation|unprocessable|\b422\b/i,
    message: 'Aria couldn’t process that request. Rephrasing it may help; retrying as-is won’t.',
  },
  {
    kind: 'server', retryable: true,
    test: /\b5\d\d\b|internal server|bad gateway|unavailable|overloaded/i,
    message: 'The AI provider had a problem at their end. Try again.',
  },
]

/** Classify whatever a failure produced — an Error, a response body, a string. */
export function classifyChatError(input: unknown): ChatError {
  const detail = extractText(input)
  for (const r of RULES) {
    if (r.test.test(detail)) {
      return { kind: r.kind, retryable: r.retryable, message: r.message, detail }
    }
  }
  return {
    kind: 'unknown',
    retryable: true,
    // Unknown failures are treated as retryable: the cost of an extra attempt is small, and a dead
    // end with no next step is the thing this phase exists to remove.
    message: 'Something went wrong before Aria could answer. Try again.',
    detail,
  }
}

function extractText(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return input
  if (input instanceof Error) return `${input.name}: ${input.message}`
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    return [o.error, o.message, o.detail, o.status, o.code].filter(Boolean).map(String).join(' ')
  }
  return String(input)
}

/**
 * How long a stream may produce nothing before it is declared stalled.
 *
 * A stream that sits in "streaming" forever is the worst failure of the set: there is no error to
 * read and no button to press, so the owner waits, then reloads and loses the thread. The watchdog
 * turns that into an ordinary retryable error.
 *
 * 45s is deliberately longer than the provider's own 30-55s per-iteration timeout, so a slow but
 * live tool turn is never killed by the client.
 */
export const STREAM_STALL_MS = 45_000

export function stalledError(): ChatError {
  return {
    kind: 'timeout',
    retryable: true,
    message: 'Aria stopped responding partway through. Try again.',
    detail: `no stream activity for ${STREAM_STALL_MS}ms`,
  }
}
