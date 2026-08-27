'use client'
import { useCallback, useRef, useState } from 'react'
import { readAriaSse, isEventStream } from '@/lib/aria/ask-sse'
import {
  classifyChatError, stalledError, STREAM_STALL_MS, type ChatError,
} from '@/lib/aria/chat-errors'

/**
 * MS16 PHASE 4 — the client half of streaming.
 *
 * Sends `Accept: text/event-stream` and renders tokens AS THEY ARRIVE. The route answers with the
 * same three event types for every lane, so a fast lane (action planner, inventory agent) simply
 * emits `done` with no tokens and the UI behaves exactly as it did before.
 *
 * FALLS BACK RATHER THAN FAILING: if the response is not an event stream — an older deploy, a
 * proxy that strips the content type, a 4xx — the hook reads it as JSON and returns the same
 * shape. Streaming is an improvement to how an answer arrives, never a new way for it to fail.
 */

export interface AriaStreamResult {
  response?: string
  conversation_id?: string
  intent?: string
  blocks?: unknown[] | null
  followups?: string[]
  action?: Record<string, unknown> | null
  downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }> | null
  tool_calls?: Array<{ name: string; ms: number }>
  used_council?: boolean
  degraded_provider?: boolean
  figures?: unknown
  /**
   * S3 PHASE 1 — the anchors this turn was grounded against. Null/absent on paths that computed
   * none, in which case every figure renders `plain` and claims nothing.
   */
  provenance?: { anchors: number[]; anchorLabels?: Record<string, string> } | null
  [k: string]: unknown
}

export type AriaStage = 'idle' | 'thinking' | 'streaming' | 'done' | 'error' | 'stopped'

export function useAriaStream() {
  const [text, setText] = useState('')
  const [stage, setStage] = useState<AriaStage>('idle')
  const [error, setError] = useState<ChatError | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Mirrors `text` for the abort path: state is not readable synchronously inside the catch.
  const textRef = useRef('')
  // Set by the watchdog just before it aborts, so the catch can tell a stall from a user Stop.
  const stalledRef = useRef(false)
  // The last request body, so Retry can resend it verbatim.
  const lastBodyRef = useRef<Record<string, unknown> | null>(null)

  /**
   * S1 PHASE 1 — STOP GENERATING.
   *
   * Aborting the fetch cancels the request, which the route now propagates into the provider call,
   * so the model actually stops rather than generating on into a closed connection. `send()` below
   * returns the partial instead of throwing, because a stop is not an error.
   */
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStage('stopped')
  }, [])

  const send = useCallback(async (
    body: Record<string, unknown>,
    onDone?: (r: AriaStreamResult) => void,
  ): Promise<AriaStreamResult | null> => {
    const controller = new AbortController()
    abortRef.current = controller
    lastBodyRef.current = body
    setText('')
    textRef.current = ''
    setError(null)
    setStage('thinking')

    try {
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string; message?: string }
        throw new Error(errBody.message ?? errBody.error ?? `Request failed (${res.status})`)
      }

      // ── non-streaming fallback: same shape, no tokens ─────────────────────────────────────
      if (!isEventStream(res)) {
        const payload = await res.json() as AriaStreamResult
        setText(String(payload.response ?? ''))
        setStage('done')
        onDone?.(payload)
        return payload
      }

      // ── the stream ────────────────────────────────────────────────────────────────────────
      // Frame parsing lives in lib/aria/ask-sse.ts, shared with the live Ask Aria page, so the two
      // clients of this stream cannot drift apart (failure pattern #4).
      //
      // S1 PHASE 7 — THE WATCHDOG. A stream that sits in "streaming" forever is the worst failure
      // of the set: no error to read, no button to press, so the owner waits and then reloads and
      // loses the thread. Every frame resets the timer; silence past STREAM_STALL_MS aborts the
      // request and resolves to an ordinary retryable error.
      let stallTimer: ReturnType<typeof setTimeout> | undefined
      let stalled = false
      const kick = () => {
        if (stallTimer) clearTimeout(stallTimer)
        stallTimer = setTimeout(() => { stalled = true; stalledRef.current = true; controller.abort() }, STREAM_STALL_MS)
      }
      kick()

      let result: AriaStreamResult
      try {
        result = await readAriaSse<AriaStreamResult>(res, {
          onText: (full) => { kick(); setStage('streaming'); setText(full); textRef.current = full },
          onStage: () => { kick(); setStage('thinking') },
        })
      } finally {
        if (stallTimer) clearTimeout(stallTimer)
      }
      if (stalled) throw new Error('stream stalled')
      if (typeof result.response === 'string' && result.response.length > 0) setText(result.response)
      setStage('done')
      onDone?.(result)
      return result
    } catch (e) {
      // A stop is a deliberate act, not a failure. Return what streamed so the caller can keep it.
      // But an abort raised BY THE WATCHDOG is a stall, and must surface as a retryable error
      // rather than be mistaken for the owner pressing Stop.
      if ((e as Error).name === 'AbortError' && !stalledRef.current) {
        setStage('stopped')
        return { response: textRef.current, stopped: true, incomplete: true } as AriaStreamResult
      }
      const classified = stalledRef.current ? stalledError() : classifyChatError(e)
      stalledRef.current = false
      setError(classified)
      setStage('error')
      return null
    } finally {
      abortRef.current = null
    }
  }, [])

  /**
   * S1 PHASE 7 — RETRY. Resends the exact last request, so the owner never retypes a question that
   * failed for reasons that were nothing to do with them.
   */
  const retry = useCallback(async (onDone?: (r: AriaStreamResult) => void) => {
    const body = lastBodyRef.current
    if (!body) return null
    return send(body, onDone)
  }, [send])

  return {
    send, cancel, retry, text, stage, error,
    isBusy: stage === 'thinking' || stage === 'streaming',
  }
}
