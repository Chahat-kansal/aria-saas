/**
 * MS16 PHASE 4 — the ONE SSE reader for /api/aria/ask.
 *
 * There are two clients for this stream (the live Ask Aria page and the AX-1 useAriaStream hook) and
 * this repo's fourth failure pattern is "N copies drift" — six business-id resolvers, 120 revenue
 * filters. So the frame parsing lives here once and both callers import it.
 *
 * Frame contract, matching the route: SSE frames separated by a blank line, each carrying one JSON
 * object of type `token` (a text delta), `stage` (progress), `done` (the authoritative payload, the
 * same shape the non-streaming response has always returned) or `error`.
 */

export interface AriaSseHandlers {
  /** Called with the FULL text so far — not the delta — so a caller can assign it straight to state. */
  onText?: (fullText: string) => void
  onStage?: (stage: string) => void
}

/**
 * Read a streaming ask response to completion and return the final payload.
 *
 * If the `done` frame never arrives (a connection cut mid-answer), the streamed text is returned as
 * the response rather than throwing — the owner keeps the words Aria already said instead of
 * watching them vanish.
 */
export async function readAriaSse<T extends { response?: string }>(
  res: Response,
  handlers: AriaSseHandlers = {},
): Promise<T> {
  if (!res.body) throw new Error('This answer had no body to read.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamed = ''
  let final: T | null = null

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // A partial frame stays in the buffer until its blank line arrives.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      let evt: { type?: string; text?: string; stage?: string; payload?: T; message?: string }
      try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }

      if (evt.type === 'token' && typeof evt.text === 'string') {
        streamed += evt.text
        handlers.onText?.(streamed)
      } else if (evt.type === 'stage') {
        handlers.onStage?.(evt.stage ?? '')
      } else if (evt.type === 'done' && evt.payload) {
        final = evt.payload
      } else if (evt.type === 'error') {
        throw new Error(evt.message ?? 'Aria stopped mid-answer.')
      }
    }
  }

  // The `done` payload is authoritative — it carries blocks, downloads, actions and the
  // conversation id, none of which travel as tokens.
  return final ?? ({ response: streamed } as T)
}

/** True when the response is a live token stream rather than a single buffered JSON body. */
export function isEventStream(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').includes('text/event-stream') && res.body !== null
}
