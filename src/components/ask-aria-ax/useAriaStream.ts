'use client'
import { useCallback, useRef, useState } from 'react'
import { readAriaSse, isEventStream } from '@/lib/aria/ask-sse'

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
  [k: string]: unknown
}

export type AriaStage = 'idle' | 'thinking' | 'streaming' | 'done' | 'error' | 'stopped'

export function useAriaStream() {
  const [text, setText] = useState('')
  const [stage, setStage] = useState<AriaStage>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Mirrors `text` for the abort path: state is not readable synchronously inside the catch.
  const textRef = useRef('')

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
      const result = await readAriaSse<AriaStreamResult>(res, {
        onText: (full) => { setStage('streaming'); setText(full); textRef.current = full },
        onStage: () => setStage('thinking'),
      })
      if (typeof result.response === 'string' && result.response.length > 0) setText(result.response)
      setStage('done')
      onDone?.(result)
      return result
    } catch (e) {
      // A stop is a deliberate act, not a failure. Return what streamed so the caller can keep it.
      if ((e as Error).name === 'AbortError') {
        setStage('stopped')
        return { response: textRef.current, stopped: true, incomplete: true } as AriaStreamResult
      }
      setError((e as Error).message)
      setStage('error')
      return null
    } finally {
      abortRef.current = null
    }
  }, [])

  return { send, cancel, text, stage, error, isBusy: stage === 'thinking' || stage === 'streaming' }
}
