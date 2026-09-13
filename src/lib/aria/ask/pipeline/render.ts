/**
 * M17 · BRAIN-1 PHASE 2 — STAGE 6. THE ONLY EXIT.
 *
 * ⚠️ THIS IS THE ONE FILE IN THE ASK PIPELINE PERMITTED TO CONSTRUCT A RESPONSE, and it is on
 * `ONE_EXIT_ALLOWLIST` for exactly that reason. `scripts/ask-one-exit-guard.ts` fails the push on a
 * response construction anywhere else under `src/lib/aria/ask/pipeline/`,
 * `src/lib/aria/ask/strategies/`, or the turn route itself — and it fails just as loudly if THIS
 * file ever stops constructing one, because forbidding every other exit while the single exit has
 * quietly disappeared would be a guard protecting nothing.
 *
 * It is deliberately tiny. Everything interesting happened in stages 1–5; this is the door.
 *
 * ⚠️ IT SERIALISES `result.body` AND NOTHING ELSE. The body is the lane's own object in the lane's
 * own key order — see the note on `TurnResult`. Composing a canonical object here would change
 * every byte of every answer while changing no behaviour, and would make phase 6's replay
 * unreadable.
 */
import { NextResponse } from 'next/server'
import type { VerifiedResult } from './types'

/**
 * STAGE 6. Persisting the turn already happened inside the strategies (M17 moves them, it does not
 * rewrite them); what this does is turn one `TurnResult` into one HTTP response.
 */
export function render(verified: VerifiedResult): NextResponse {
  const { result } = verified
  return NextResponse.json(result.body, { status: result.status })
}

/**
 * The SSE envelope. `_STREAMING_POST` wraps the same spine and emits the same payload as the
 * stream's `done` event, so a client that cannot stream loses nothing — and a `Response` carrying a
 * `ReadableStream` is not an early exit from the pipeline, it is the same single exit wearing a
 * different content type. It lives here rather than in the route so that the route keeps no way of
 * constructing a response at all.
 */
export function renderBodyOnly(verified: VerifiedResult): {
  body: Readonly<Record<string, unknown>>
  status: number
} {
  return { body: verified.result.body, status: verified.result.status }
}
