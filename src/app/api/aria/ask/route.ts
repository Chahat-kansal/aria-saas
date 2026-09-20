export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * M17B · PHASE 2 — THE ROUTE IS NOW PARSE → runTurn() → DONE.
 *
 * This file was **2,820 lines** with **28 `return NextResponse` statements**, 22 of them before the
 * council gate. It was a waterfall of guards: whichever condition matched first won, in source
 * order, and a lane could — and every sprint since June did — skip grounding, the council or the
 * verifier by returning early. M12's bathroom answer and M3's 0-of-288 missing provenance tiers
 * were the same fault seen from two ends.
 *
 * ⚠️ THERE IS NO LONGER ANY WAY TO LEAVE THIS FILE EARLY. Not one response is constructed here.
 * `scripts/ask-one-exit-guard.ts` reads this file whole and fails the push on a single
 * `NextResponse.json(…)`, and as of this commit **the grandfather list that exempted it is empty**.
 *
 *     understand → decide → ground → act → verify → render
 *
 * Everything that used to live in these 2,800 lines now lives in
 * `src/lib/aria/ask/pipeline/` (the six stages, admission, persistence) and
 * `src/lib/aria/ask/strategies/` (the twelve lanes). The order the gates run in — which is
 * load-bearing in two places — lives in `runTurn()`, stated once, instead of being implied by where
 * a `return` happened to sit.
 */
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { isValidNoticeId, isValidNoticeSource, type NoticeRef } from '@/lib/aria/notice-context'
import { runTurn, type ParsedTurn } from '@/lib/aria/ask/pipeline/run-turn'
import { STRATEGIES } from '@/lib/aria/ask/strategies'
import { admitBeforeParse, admitBadRequest, admitSpend } from '@/lib/aria/ask/pipeline/admission'
import { savePlanGate } from '@/lib/aria/ask/strategies/save-plan'
import { recordTurn } from '@/lib/aria/ask/pipeline/turn-record'

/**
 * route.ts:320–368, unchanged. Accepts both JSON and multipart/form-data (for file attachments).
 *
 * ⚠️ The old line 368 — `if (!message) message = 'Please analyse the attached file(s).'` — sat
 * AFTER the 400 check at 366, and it could only ever fire when there WERE attachments, because
 * otherwise 366 had already returned. Guarding it on `attachments.length > 0` here is exactly
 * equivalent and keeps the parse a single step.
 */
async function parseTurnInput(req: Request): Promise<ParsedTurn> {
  const contentType = req.headers.get('content-type') ?? ''
  let message = ''
  let conversationId: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments: any[] = []
  let clientMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let noticeRef: NoticeRef | null = null
  /**
   * S1 PHASES 2 & 3 — regenerate / edit-and-rerun. Supersede, never delete: the previous answer
   * (and, for an edit, everything after the edited question) stays in the database and stops
   * rendering. Default 'append' is the ordinary new-question case.
   */
  let branchIntent: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number } = { mode: 'append' }

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    message = String(formData.get('message') ?? '').trim()
    conversationId = formData.get('conversation_id') ? String(formData.get('conversation_id')) : null

    const files = formData.getAll('files') as File[]
    if (files.length > 0) {
      const { parseAttachment } = await import('@/lib/aria/attachments')
      for (const file of files.slice(0, 5)) {
        const parsed = await parseAttachment(file)
        if (!('error' in parsed)) attachments.push(parsed)
      }
    }
  } else {
    const body = await req.json() as {
      message?: string; conversation_id?: string
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>
      // S1 phases 2 & 3 — how this turn joins the thread. Absent means a normal new question.
      regenerate?: boolean
      edit_live_index?: number
      // S8 PHASE 3 — the record a click came from. An id and a source, never content: text from a
      // client would be both an injection point and a second copy of something already in a table.
      notice_ref?: { id?: unknown; source?: unknown }
    }
    message = (body.message ?? '').trim()
    conversationId = body.conversation_id ?? null
    clientMessages = Array.isArray(body.messages) ? body.messages.slice(-20) : []
    if (isValidNoticeId(body.notice_ref?.id) && isValidNoticeSource(body.notice_ref?.source)) {
      noticeRef = { id: body.notice_ref.id, source: body.notice_ref.source }
    }
    if (body.regenerate) branchIntent = { mode: 'regenerate' }
    else if (typeof body.edit_live_index === 'number') {
      branchIntent = { mode: 'edit', editLiveIndex: body.edit_live_index }
    }
  }

  // route.ts:368 — see the note above.
  if (!message && attachments.length > 0) message = 'Please analyse the attached file(s).'

  return { message, conversationId, attachments, clientMessages, noticeRef, branchIntent }
}

/**
 * MS16 PHASE 4 — `onToken` is threaded in rather than bolted on. It reaches exactly ONE place: the
 * main tool-loop call inside `strategies/main.ts`. Every other lane returns fast and emits its
 * result as the stream's `done` event, so nothing had to be duplicated to get streaming.
 *
 * S1 PHASE 1 — `signal` is the request's abort signal, threaded all the way into the provider call
 * so that pressing Stop CANCELS generation rather than merely closing the browser's ear to it.
 */
async function _POST(
  req: Request,
  _routeCtx: unknown,
  { supabase, userId, businessId }: BusinessContext,
  onToken?: (t: string) => void,
  signal?: AbortSignal,
) {
  return runTurn(
    { req, bid: businessId, userId, supabase, onToken, signal },
    {
      registry: STRATEGIES,
      // The order below is route.ts's order. It is load-bearing in two places and both are
      // explained in pipeline/admission.ts: the per-user limit precedes the parse, and the
      // save-plan sentinel precedes the spend gates AND the classifiers.
      beforeParse: admitBeforeParse,                                     // route.ts:316
      parse: parseTurnInput,                                             // route.ts:320–368
      afterParse: p => admitBadRequest(p.message, p.attachments.length), // route.ts:366
      savePlanGate,                                                      // route.ts:372
      spendGates: admitSpend,                                            // route.ts:403–440
      onRecord: recordTurn,
    },
  )
}

/**
 * MS16 PHASE 4 — SSE when the client asks for it, unchanged JSON when it doesn't.
 *
 * The stream carries three event types: `stage` (what Aria is doing — the avatar column's live
 * status line reads these), `token` (real deltas), and `done` (the full JSON payload the
 * non-streaming client already understands, so blocks, downloads, actions and provenance arrive
 * exactly as before). A client that cannot stream loses nothing.
 *
 * ⚠️ IT WRAPS THE SAME SPINE. `_POST` *is* `runTurn()` now, so the streaming path and the JSON path
 * are the same six stages and the same single `render()`. The `Response` below carries a
 * `ReadableStream`; it is the stream's envelope, not an early exit, and it is the reason the
 * one-exit rule targets `NextResponse` specifically.
 */
function wantsStream(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('text/event-stream')
}

const _STREAMING_POST = async (req: Request, routeCtx: unknown, biz: BusinessContext): Promise<Response> => {
  if (!wantsStream(req)) return _POST(req, routeCtx, biz)

  const encoder = new TextEncoder()
  const line = (o: unknown) => encoder.encode(`data: ${JSON.stringify(o)}\n\n`)
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  void (async () => {
    try {
      await writer.write(line({ type: 'stage', stage: 'thinking' }))
      const res = await _POST(req, routeCtx, biz, (t: string) => {
        void writer.write(line({ type: 'token', text: t }))
      }, req.signal)
      const payload = await res.json().catch(() => ({ error: 'unreadable response' }))
      await writer.write(line({ type: 'done', payload }))
    } catch (e) {
      // A failure mid-stream must still tell the client something true.
      await writer.write(line({ type: 'error', message: (e as Error).message })).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const POST = withBusinessContext('aria/ask', _STREAMING_POST)
