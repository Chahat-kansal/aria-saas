'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAriaStream } from './useAriaStream'
import AriaAvatarMount from './AriaAvatarMount'
import AnswerMarkdown from './AnswerMarkdown'
import type { ProvenanceInput } from '@/lib/aria/figure-provenance'
import { fallbackTitle } from '@/lib/aria/thread-title'
import ThreadsPanel from './rooms/ThreadsPanel'
import AwaitingRoom from './rooms/AwaitingRoom'
import MadeForYouRoom from './rooms/MadeForYouRoom'
import VoiceInput from '@/components/aria/VoiceInput'
import ChatSuggestions from '@/components/aria/ChatSuggestions'
import { SkillPicker } from '@/components/aria/SkillPicker'
import { BlockRenderer } from '@/components/dashboard/BlockRenderer'
import AuditLogCard from '@/components/aria/AuditLogCard'
import { segmentFigures } from '@/lib/aria/figure-provenance'
import { advisorShortfallNote } from '@/lib/aria/council-advisors'
import { toClipboardMarkdown } from '@/lib/aria/copy-markdown'
import { readDraft, writeDraft, clearDraft, adoptDraft } from '@/lib/aria/draft-store'
import { readThreadId, syncThreadUrl, restoreThread, rememberScroll, recallScroll } from '@/lib/aria/thread-session'
import PlanCard from './PlanCard'
import type { PlanResult } from '@/lib/aria/works/plan-shape'
import { formatAxFigure, type AxContext } from '@/lib/aria/ax-context-types'
import type { AutonomyMode, AutonomyState } from '@/lib/aria/autonomy'
import type { AskBlock } from '@/lib/aria/ask-types'

/**
 * ASK ARIA — ONE SCREEN, TWO STATES, AND NOW THE ROOMS.
 *
 * WELCOME (no thread) → WORKING (a thread is open), with the single animated transition between
 * them. Every class name comes from docs/design/ask-aria-transition.html and the stylesheet is that
 * file's <style> block lifted byte-for-byte. Nothing is re-authored; new elements use appended rules.
 *
 * ── THE THREE RULES THIS COMPONENT HOLDS ────────────────────────────────────────────────────────
 *
 * 1. NO FAKE CONTROLS. Every control below either does something real or is not here. MS17 phase 1
 *    counted TEN that did nothing: four room tabs, two mics, attach, share, more, and a mode chip
 *    that was a <span> dressed as a dropdown. Eight are now wired; two were removed and the reasons
 *    are in RUN-MS17.md. There is no disabled-but-styled third state.
 *
 * 2. THE AVATAR IS ONE DOM NODE. `.orbit`/`.corona`/`.figure` render exactly once and are never
 *    inside a conditional, so the 250px → 148px change tweens instead of remounting.
 *
 * 3. BOTH STATES ARE ALWAYS IN THE DOM. `.noticed`, `.bigask` and `.talk` are always rendered; the
 *    lifted CSS collapses them. Conditionally rendering them would make the transition a cut.
 *
 * THE DRAWN CSS FACE IS NEVER RENDERED. The contract carries it inside #ax-avatar as a marked
 * placeholder; it is not Aria and it is not reproduced here in any state.
 */

interface Turn {
  role: 'user' | 'aria'
  text: string
  streaming?: boolean
  skill?: string | null
  disagrees?: boolean
  blocks?: AskBlock[] | null
  /** Migrated from the old surface: it showed when the council answered. */
  usedCouncil?: boolean
  /** S1 phase 1 — the owner pressed Stop. A partial answer, never shown as a finished one. */
  incomplete?: boolean
  /**
   * S8 PHASE 2 — the advisors that did not report back on this turn. An answer from two of four
   * is not wrong, but it must not present as complete.
   */
  advisorsLost?: string[]
  /** S1 phase 8 — up to three suggested next questions, from the route's own payload. */
  followups?: string[]
  /**
   * S3 PHASE 1 — the anchors this answer was grounded against, carried from the route and, for a
   * restored thread, from the stored message. Absent means the turn captured no ground truth, and
   * every figure in it renders plain — the honest outcome, not a degraded one.
   */
  provenance?: ProvenanceInput
  /**
   * M11B PHASE 1 — this turn IS a plan rather than an answer. Carried on the turn (not a parallel
   * list) so it scrolls, restores and re-renders with everything else, and so a thread that had a
   * plan in it still has one after a reload.
   */
  plan?: {
    planId: string | null; result: PlanResult; status: string | null
    /** M11B phase 3 — what each step actually did, once the plan has been run. */
    outcomes?: Array<{ step_index: number; title: string; result: 'ran' | 'skipped' | 'failed'; note: string }>
  }
}

/** The rooms that survived phase 3. "Routines" is absent — see RUN-MS17.md. */
type Room = 'ask' | 'awaiting' | 'made'

const ROOMS: Array<{ id: Room; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'awaiting', label: 'Awaiting you' },
  { id: 'made', label: 'Made for you' },
]

const MODES: Array<{ id: AutonomyMode; label: string }> = [
  { id: 'suggest', label: 'Suggest' },
  { id: 'copilot', label: 'Co-pilot' },
  { id: 'auto', label: 'Auto' },
]

/** The mockup's three dot styles, in order. Identity only — never an accent. */
const DOT_CLASS = ['p', 'p b', 'p c']

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

export default function AskAriaTransition() {
  const [working, setWorking] = useState(false)
  const [room, setRoom] = useState<Room>('ask')
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [welcomeInput, setWelcomeInput] = useState('')
  const [ctx, setCtx] = useState<AxContext | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [ctxUnreadable, setCtxUnreadable] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [autonomy, setAutonomy] = useState<(AutonomyState & { explanations?: Record<string, string> }) | null>(null)
  const [autonomyNote, setAutonomyNote] = useState<string | null>(null)
  const [savingMode, setSavingMode] = useState(false)
  const [openSrc, setOpenSrc] = useState<string | null>(null)
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Migrated from the old surface (page.tsx:534): the provider-degraded / total-outage notice.
  // It is set ONLY from what the route reports, never guessed.
  const [degraded, setDegraded] = useState<{ note: string; outage: boolean; provider?: string | null } | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  // S1 phase 3 — which rendered message is being edited, and its working text.
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null)
  // M11B phase 1 — a plan is being built. Separate from isBusy: the planner is not the stream.
  const [planning, setPlanning] = useState(false)
  // M11B phase 2 — which plan is mid-approval. Per plan id, not a boolean: two plans can be on
  // screen and only the one being approved should show as busy.
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const { send, cancel, retry, text, stage, error, isBusy } = useAriaStream()
  const flowRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── live context ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/aria/ax-context')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<AxContext> })
      .then(d => { if (!cancelled) { setCtx(d); setCtxUnreadable(false) } })
      // A failed read is stated, never smoothed into an empty-but-fine screen.
      .catch(() => { if (!cancelled) setCtxUnreadable(true) })
      .finally(() => { if (!cancelled) setCtxLoading(false) })
    return () => { cancelled = true }
  }, [])

  // ── the real autonomy setting ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch('/api/aria/autonomy')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setAutonomy(d) })
      .catch(() => { /* the control shows its unknown state */ })
    return () => { cancelled = true }
  }, [])

  /**
   * M11 PHASE 1 — the offset a restore should land on, when the owner had scrolled up.
   *
   * Null in the ordinary case, and the ordinary case is the bottom: a new message arriving must
   * always pull the view to it. This is set ONCE by the reload restore below and consumed by the
   * very next run of the scroll effect, so it can never hold a live conversation away from its
   * newest turn.
   */
  const pendingScrollRef = useRef<number | null>(null)

  useEffect(() => {
    if (!flowRef.current) return
    const pending = pendingScrollRef.current
    if (pending !== null) {
      pendingScrollRef.current = null
      // Clamp: the thread may render shorter than it did last time (S2B pages the tail at 50
      // messages), and an offset past the end would silently become the bottom anyway.
      const max = Math.max(0, flowRef.current.scrollHeight - flowRef.current.clientHeight)
      flowRef.current.scrollTop = Math.min(pending, max)
      return
    }
    flowRef.current.scrollTop = 9e9
  }, [turns.length, text, room])

  /**
   * S2 PHASE 5 — restore this thread's unsent draft.
   *
   * Runs on every thread change, so switching threads swaps drafts rather than carrying one across.
   * A draft is per-thread precisely so a half-written note to one supplier cannot surface in a
   * conversation about something else.
   */
  useEffect(() => {
    setInput(readDraft(conversationId))
  }, [conversationId])

  const chooseMode = useCallback(async (mode: AutonomyMode) => {
    if (savingMode || !autonomy) return
    setAutonomyNote(null)
    setSavingMode(true)
    try {
      const res = await fetch('/api/aria/autonomy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (res.ok) {
        const saved = await res.json() as AutonomyState
        setAutonomy(prev => ({ ...(prev as AutonomyState), ...saved }))
      } else {
        setAutonomyNote("Couldn't save that — your setting is unchanged.")
      }
    } catch {
      setAutonomyNote("Couldn't save that — your setting is unchanged.")
    } finally { setSavingMode(false) }
  }, [autonomy, savingMode])

  const ask = useCallback(async (
    prompt: string,
    /**
     * S1 phases 2 & 3. 'regenerate' re-runs the last answer; 'edit' replaces an earlier question.
     * Both SUPERSEDE rather than delete — the old rows stay in the database (conversation-branch.ts).
     */
    branch?: { regenerate?: true } | { editLiveIndex: number },
    /**
     * S8 PHASE 3 — the record this question came from, when it came from clicking one of Aria's
     * own notices. An id and a source; never the notice's text. The route re-reads the row itself,
     * scoped to the business, so nothing sent from here has to be trusted.
     */
    noticeRef?: { id: string; source: 'aria_action' | 'deliverable' },
  ) => {
    const msg = prompt.trim()
    if (!msg || isBusy) return
    setRoom('ask')            // asking always returns you to the conversation
    setWorking(true)          // enter WORKING — the transition runs
    setInput('')
    setWelcomeInput('')
    // S2 phase 5 — the thought has been sent, so it is no longer a draft.
    clearDraft(conversationId)
    setTurns(prev => [...prev, { role: 'user', text: msg }, { role: 'aria', text: '', streaming: true }])

    const result = await send({
      message: msg,
      conversation_id: conversationId,
      ...(noticeRef ? { notice_ref: noticeRef } : {}),
      ...(branch && 'regenerate' in branch ? { regenerate: true } : {}),
      ...(branch && 'editLiveIndex' in branch ? { edit_live_index: branch.editLiveIndex } : {}),
    })

    setTurns(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.role === 'aria') {
        updated[updated.length - 1] = {
          role: 'aria',
          text: String(result?.response ?? '').replace(/\s*\[DELIVERABLE:[^\]]+\]\s*/g, '').trim(),
          streaming: false,
          skill: (result?.tool_calls ?? [])[0]?.name ?? null,
          blocks: (result?.blocks as AskBlock[] | null | undefined) ?? null,
          usedCouncil: Boolean(result?.used_council),
          // S1 phase 1 — a stopped turn keeps its partial text and says it is partial.
          incomplete: Boolean(result?.incomplete ?? result?.stopped),
          // Deliberately NOT folded into `incomplete`: that one means "you pressed stop", and
          // conflating a user's own action with a council shortfall would make both unreadable.
          advisorsLost: Array.isArray(result?.advisors_lost) ? result.advisors_lost as string[] : undefined,
          // S1 phase 8 — the route already produced these; nothing new is generated for them.
          followups: (Array.isArray(result?.followups) ? result.followups : []).slice(0, 3),
          // S3 phase 1 — carried straight from the route. Never synthesised client-side: the
          // client cannot know what was queried, so a client-built anchor set would be a guess.
          provenance: (result?.provenance as ProvenanceInput | null | undefined) ?? undefined,
        }
      }
      return updated
    })
    if (result?.conversation_id) {
      // A draft typed before the thread existed belongs to the thread it produced.
      adoptDraft(result.conversation_id)
      setConversationId(result.conversation_id)
      // M11 phase 1 — the first answer is what creates the thread, so this is the moment the URL
      // becomes able to point at it. It also strips the `?q=` that may have started this
      // conversation, so reloading never re-asks the question.
      syncThreadUrl(result.conversation_id)
    }

    // Migrated: API-RESILIENCE-1/1B. Backup provider = amber, total outage = red. Only what the
    // route actually said — never inferred from a slow or empty answer.
    const r = result as {
      total_outage?: boolean; degraded_provider?: boolean | string; note?: string; provider?: string
    } | null
    if (r?.total_outage) {
      setDegraded({ outage: true, note: 'All AI providers are briefly offline. Your business data and POS are safe and working.' })
    } else if (r?.degraded_provider) {
      // S1 phase 7 — say WHICH provider answered. "Backup intelligence" alone tells the owner
      // nothing they can act on or report.
      const who = typeof r.degraded_provider === 'string' ? r.degraded_provider : (r.provider ?? null)
      setDegraded({
        outage: false,
        note: r.note ?? 'Aria is running on backup intelligence — answers use your latest saved data.',
        provider: who,
      })
    } else {
      setDegraded(null)
    }
  }, [conversationId, isBusy, send])

  /**
   * M11B PHASE 1 — DELEGATE A JOB.
   *
   * An EXPLICIT gesture, never an inference. Deciding on every turn whether a message is a question
   * or a delegation would silently change every answer the owner gets; a button changes only the
   * turns they press it on.
   *
   * Writes nothing on its own — the route persists the plan and returns its id, and NOTHING runs
   * until the owner approves it.
   */
  const delegate = useCallback(async (prompt: string) => {
    const msg = prompt.trim()
    if (!msg || isBusy || planning) return
    setPlanning(true)
    setRoom('ask')
    setWorking(true)
    setInput('')
    setWelcomeInput('')
    clearDraft(conversationId)
    setTurns(prev => [...prev, { role: 'user', text: msg }])
    try {
      const res = await fetch('/api/aria/works/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: msg, business_id: ctx?.businessId, conversation_id: conversationId }),
      })
      const j = await res.json() as {
        plan?: PlanResult | null; plan_id?: string | null
        stored?: { plan?: { status?: string } } | null; error?: string
      }
      if (!res.ok || !j.plan) {
        // The route says what went wrong; it is never smoothed into a plan that is not there.
        setTurns(prev => [...prev, {
          role: 'aria', streaming: false,
          text: j.error ?? 'Aria could not plan that just now. Nothing was attempted.',
        }])
        return
      }
      const built: PlanResult = j.plan
      setTurns(prev => [...prev, {
        role: 'aria', text: '', streaming: false,
        // The status comes from the STORED row, so the card shows the database's state rather than
        // an assumption about what the write did.
        plan: { planId: j.plan_id ?? null, result: built, status: j.stored?.plan?.status ?? null },
      }])
    } catch {
      setTurns(prev => [...prev, { role: 'aria', streaming: false, text: 'Aria could not reach the planner. Nothing was attempted.' }])
    } finally {
      setPlanning(false)
    }
  }, [conversationId, ctx, isBusy, planning])

  /**
   * M11B PHASE 2 — APPROVE A PLAN.
   *
   * Approving does not execute; it records that the owner said yes. The card's state is refreshed
   * from what the SERVER says the plan is now, never from an assumption that the click worked —
   * a second tab may have approved it already, and the route answers that honestly rather than
   * erroring.
   */
  const approvePlan = useCallback(async (planId: string, turnIndex: number) => {
    if (approvingId) return
    setApprovingId(planId)
    try {
      const res = await fetch('/api/aria/works/plan/' + encodeURIComponent(planId) + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: ctx?.businessId }),
      })
      const j = await res.json() as {
        approved?: boolean; already?: boolean; note?: string; error?: string
        stored?: { plan?: { status?: string } } | null
      }
      if (!res.ok) {
        setTurns(prev => [...prev, { role: 'aria', streaming: false, text: j.error ?? 'That approval did not go through. Nothing has run.' }])
        return
      }
      const status = j.stored?.plan?.status ?? null
      setTurns(prev => prev.map((t, i) => (
        i === turnIndex && t.plan ? { ...t, plan: { ...t.plan, status } } : t
      )))
      // An already-approved plan is a true answer, not an error, and the owner is told plainly.
      if (j.already && j.note) {
        setTurns(prev => [...prev, { role: 'aria', streaming: false, text: j.note as string }])
        return
      }
      if (!j.approved) return

      // M11B PHASE 3 — the button says "approve and run the safe steps", so it runs them. A
      // separate request against a separate route: the approval is a fact worth recording on its
      // own, and runPlan claims the plan atomically, so this cannot start a second run.
      const runRes = await fetch('/api/aria/works/plan/' + encodeURIComponent(planId) + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: ctx?.businessId }),
      })
      const r = await runRes.json() as {
        ran?: boolean; note?: string; outcomes?: Array<{ step_index: number; title: string; result: 'ran' | 'skipped' | 'failed'; note: string }>
        stored?: { plan?: { status?: string } } | null
      }
      if (!runRes.ok) {
        setTurns(prev => [...prev, { role: 'aria', streaming: false, text: 'The plan was approved, but running it did not start. Nothing was changed.' }])
        return
      }
      // "Already running" / "not approved yet" come back ran:false with a true sentence.
      if (!r.ran && r.note) {
        setTurns(prev => [...prev, { role: 'aria', streaming: false, text: r.note as string }])
      }
      setTurns(prev => prev.map((t, i) => (
        i === turnIndex && t.plan
          ? { ...t, plan: { ...t.plan, status: r.stored?.plan?.status ?? t.plan.status, outcomes: r.outcomes } }
          : t
      )))
    } catch {
      setTurns(prev => [...prev, { role: 'aria', streaming: false, text: 'Could not reach the approval. Nothing has run.' }])
    } finally {
      setApprovingId(null)
    }
  }, [approvingId, ctx])

  /**
   * Regenerate — migrated from the old surface (page.tsx:830). Drops the last Aria turn and re-asks
   * the last question. Same behaviour, same route.
   */
  /**
   * S1 PHASE 2 — REGENERATE. The previous answer is NOT overwritten.
   *
   * MS17 shipped a version of this that did `turns.slice(0, lastUser)` — it threw the old answer
   * away, which is exactly what this phase forbids. Server-side the old answer is superseded and
   * kept; client-side the question is not repeated, and the new answer replaces the old one in the
   * rendered path only.
   */
  const regenerate = useCallback(() => {
    let lastUser = -1
    for (let i = turns.length - 1; i >= 0; i--) if (turns[i]?.role === 'user') { lastUser = i; break }
    if (lastUser === -1 || isBusy) return
    const question = turns[lastUser]!.text
    // drop only the RENDERED old answer; the stored one is superseded, not deleted
    setTurns(prev => prev.slice(0, lastUser + 1))
    void ask(question, { regenerate: true })
  }, [ask, isBusy, turns])

  /**
   * S1 PHASE 3 — EDIT AND RE-RUN. Everything after the edited question is superseded server-side,
   * never deleted. No branch-navigation UI: a café owner will never use one.
   */
  const submitEdit = useCallback((liveIndex: number, newText: string) => {
    const text = newText.trim()
    if (!text || isBusy) return
    setEditing(null)
    setTurns(prev => prev.slice(0, liveIndex))
    void ask(text, { editLiveIndex: liveIndex })
  }, [ask, isBusy])

  /** Copy an answer — the old surface's MessageActions (page.tsx:96). */
  /**
   * S1 PHASE 4 — copy the RAW MARKDOWN, never the rendered DOM text.
   *
   * `body` is the model's own output, so a table stays a table and a code block keeps its fence.
   * Reading innerText here would flatten all of it and the owner would paste mush into an email.
   */
  const copyAnswer = useCallback(async (i: number, body: string) => {
    try {
      await navigator.clipboard.writeText(toClipboardMarkdown(body))
      setCopied(i)
      // cleared on the next copy or the next turn; no timer, which the presence rail forbids
    } catch { setCopied(null) }
  }, [])

  /**
   * File upload — migrated from the old surface's `uploadFile` (page.tsx:842). Same route, same
   * FormData shape, same document summary. The behaviour moved; it was not rewritten.
   */
  const uploadFile = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    setRoom('ask')
    setWorking(true)
    setTurns(prev => [...prev,
      { role: 'user', text: '📎 ' + file.name },
      { role: 'aria', text: '', streaming: true },
    ])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/aria/ask/upload', { method: 'POST', body: fd })
      const data = await res.json() as {
        document?: { type: string; supplier?: string; date?: string; line_items: unknown[]; suggested_action: string }
        error?: string
      }
      if (data.error) throw new Error(data.error)
      const doc = data.document!
      const n = doc.line_items.length
      const summary = 'Document read: ' + doc.type + (doc.supplier ? ' from ' + doc.supplier : '')
        + (doc.date ? ' (' + doc.date + ')' : '') + '. Found ' + n + ' line item'
        + (n === 1 ? '' : 's') + '. ' + doc.suggested_action
      setTurns(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last?.role === 'aria') u[u.length - 1] = { ...last, text: summary, streaming: false }
        return u
      })
    } catch (e) {
      setTurns(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last?.role === 'aria') u[u.length - 1] = { ...last, text: 'Upload failed: ' + (e as Error).message, streaming: false }
        return u
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [uploading])

  /** Restore a past conversation — migrated from `loadConversation` (page.tsx:610). */
  const openThread = useCallback((id: string, messages: Array<{ role: string; content: string; provenance?: ProvenanceInput }>) => {
    setConversationId(id)
    // M11 phase 1 — the address bar now carries the open thread, so a refresh comes back here.
    syncThreadUrl(id)
    setRoom('ask')
    setWorking(true)
    setTurns(messages.map(m => ({
      role: (m.role === 'user' ? 'user' : 'aria') as 'user' | 'aria',
      text: String(m.content ?? ''),
      streaming: false,
      // S3 PHASE 1 — THIS is what makes provenance survive a reload. Dropping it here would undo
      // the persistence: the tier would exist in the database and vanish on the way to the screen,
      // which is indistinguishable from never having stored it.
      provenance: m.provenance,
    })))
  }, [])

  /**
   * S5 PHASE 4 — `?q=` AUTO-SEND. THE ONE CAPABILITY THE SWAP COULD NOT SHIP WITHOUT.
   *
   * The old surface reads `?q=` and sends it on load (page.tsx:578). About eight places in the
   * product link here with a question already attached — all three of the daily briefing's "full
   * detailed briefing" actions, AriaSays, MorningCommandCentre's prompt list, ProWidgets, the
   * spotlight tour's Ask-Aria step and the POS coming-soon page.
   *
   * Without this, every one of those links would land on a BLANK COMPOSER and the owner's question
   * would vanish with no error — the quietest possible regression, and the exact class this sprint
   * series exists to stop shipping.
   *
   * Reads window.location.search rather than useSearchParams() deliberately: the hook requires a
   * Suspense boundary around this component, and adding one to satisfy a URL read would be a
   * structural change to the surface for no behavioural gain. The old page reads it the same way.
   *
   * Fires ONCE. The ref guard matters because `ask` is recreated whenever conversationId changes,
   * and re-running would re-send the owner's question a second time.
   */
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (autoSentRef.current) return
    if (typeof window === 'undefined') return
    // M11 PHASE 1 — a thread URL asks nothing. `?c=` means "put me back where I was"; auto-sending
    // on top of that would append a question the owner never typed to a conversation they were only
    // returning to. `threadSearch` strips `q` when it writes `c`, so the two should never co-occur;
    // this is the second lock, for a hand-assembled or bookmarked URL carrying both.
    if (readThreadId(window.location.search)) return
    const q = new URLSearchParams(window.location.search).get('q')
    if (!q || !q.trim()) return
    autoSentRef.current = true
    void ask(q)
  }, [ask])

  /**
   * M11 PHASE 1 — A REFRESH MUST NOT LOSE THE CONVERSATION.
   *
   * Before this, the open thread lived only in `useState`, so F5 returned the owner to the welcome
   * screen with their work still in the database and no sign of it on screen. Nothing new is stored
   * to fix that: the thread's identity rides in the URL, and this effect hands it to the SAME route
   * and the SAME `openThread` the Threads panel uses, so a URL restore and a click restore cannot
   * produce different screens.
   *
   * WORKING IS ENTERED IMMEDIATELY, before the fetch resolves. Waiting would show the welcome
   * screen for as long as the round trip takes and then snap away — a flash of the exact wrong
   * state. If the thread turns out to be gone (deleted, another business's, a mangled link) the
   * screen falls back to welcome and the stale id is dropped from the URL.
   *
   * Fires ONCE, guarded by a ref for the same reason the `?q=` effect is: `openThread` is stable
   * but a re-run would re-fetch and stamp over whatever the owner had since typed.
   */
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    if (typeof window === 'undefined') return
    const id = readThreadId(window.location.search)
    if (!id) return
    restoredRef.current = true
    setRoom('ask')
    setWorking(true)
    let cancelled = false
    void (async () => {
      const restored = await restoreThread(id, (u) => fetch(u))
      if (cancelled) return
      if (!restored) {
        // The link no longer resolves for this owner. Say nothing alarming — a stale thread link is
        // an ordinary thing to click — but do not leave the id in the URL pretending otherwise.
        setWorking(false)
        syncThreadUrl(null)
        return
      }
      // Where they had scrolled to, if this tab remembers. Read BEFORE openThread so the scroll
      // effect that fires on the new turns finds it already waiting.
      pendingScrollRef.current = recallScroll(restored.id)
      openThread(restored.id, restored.messages)
    })()
    return () => { cancelled = true }
  }, [openThread])

  const home = useCallback(() => setWorking(false), [])

  const newChat = useCallback(() => {
    setTurns([])
    setConversationId(null)
    // M11 phase 1 — leaving a thread must clear it from the URL too, or the next refresh would
    // reopen the conversation the owner just stepped out of.
    syncThreadUrl(null)
    setRoom('ask')
    setWorking(false)
  }, [])

  // The last SETTLED Aria reply — the avatar's only text input. Never `text` (the live stream),
  // because that would change on every token.
  const settledReply = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i]
      if (t && t.role === 'aria' && !t.streaming && t.text) return t.text
    }
    return ''
  }, [turns])

  // ── what the status pill says. Real state, never a timer. ───────────────────────────────────
  const doing = isBusy
    ? (stage === 'streaming' ? 'Writing' : 'Reading your till')
    // S6 PHASE 5 — was 'Watching your till', which sat directly above "Takings today A$0.00".
    // Aria does not watch anything continuously: it reads the business on load and when asked.
    // 'Connected' is the true version of that and claims no surveillance it isn't doing. The till's
    // actual state belongs in the tagline below, where it can be stated as a fact.
    : (ctxLoading ? 'Looking at your day' : 'Connected')

  // ── the headline: what Aria actually noticed ────────────────────────────────────────────────
  const noticed = ctx?.noticed ?? []
  const headline = useMemo(() => {
    // "Evening, Chahat." — the contract greets by name. A missing name drops the clause entirely
    // rather than substituting "there": a wrong or generic name reads worse than none.
    const name = ctx?.ownerName?.trim()
    const lead = greeting(new Date()) + (name ? ', ' + name + '.' : '.')
    if (ctxUnreadable) return { lead: 'I can’t see your business right now.', em: '' }
    if (ctxLoading) return { lead, em: 'Having a look…' }
    if (noticed.length === 0) return { lead, em: 'Nothing needs you.' }
    // S3 PHASE 5 — the TRUE total, not the length of the capped render list. `noticed` holds at
    // most 6 decisions because that is the panel's page size; counting it told the owner "8 things
    // stood out" while the tab beside it said 55. Falls back to the list length only if the route
    // is an older deploy that does not send noticedTotal.
    const n = ctx?.noticedTotal ?? noticed.length
    // S6 PHASE 4 — SAY WHY THE TWO NUMBERS DIFFER, because both are right.
    //
    // The headline counts everything Aria noticed; the "Awaiting you" tab counts DECISIONS
    // waiting. On this business that is 54 and 52 — 52 pending decisions plus a zero-till notice
    // and a low-stock notice. Verified against the database, not assumed. S3 already removed the
    // real defect here (the headline was counting a capped list); what was left was two true
    // numbers sitting side by side with nothing explaining the gap, which reads as a bug.
    //
    // The clause only appears when they actually differ — an owner with 0 extra notices should
    // not be shown "52 things stood out — 52 need a decision."
    const decisions = ctx?.awaitingTotal ?? 0
    const head = n === 1 ? 'One thing stood out.' : n + ' things stood out.'
    const em = decisions > 0 && decisions !== n
      ? head.replace(/\.$/, '') + ' — ' + decisions + ' need a decision.'
      : head
    return { lead, em }
  }, [ctx?.ownerName, ctx?.noticedTotal, ctx?.awaitingTotal, ctxLoading, ctxUnreadable, noticed.length])

  const revenue = ctx?.today.find(f => f.label === 'Revenue today')
  /**
   * The TRUE number of pending decisions, counted server-side — not the length of the capped list.
   * Using the list length showed "6" while 55 were pending.
   */
  const awaitingCount = ctx?.awaitingTotal ?? 0

  const enterRoom = useCallback((id: Room) => {
    setRoom(id)
    if (id !== 'ask') setWorking(true)
  }, [])

  return (
    // THE SURFACE OWNS EVERYTHING. `work` lives here, not on <body>, and isolation:isolate in the
    // lifted sheet stops decoration escaping into the dashboard shell around it.
    <div className={working ? 'ax-surface work' : 'ax-surface'}>
      {/* ── decoration — position:absolute in the contract, so it cannot leave this box ── */}
      <div className="deco">
        <div className="streaks"><i /><i /></div>
        <div className="moire" />
        <div className="hill" />
        <div className="blob one"><span /></div>
        <div className="blob two"><span /></div>
        <div className="blob three"><span /></div>
      </div>

      {/* No brand mark: the dashboard sidebar already carries one, and two collided on screen.
          The pill below is ARIA'S OWN ROOMS, not app navigation — the sidebar still owns that.
          Every tab switches a real room. "Routines" is gone; see RUN-MS17.md. */}
      <nav className="nav">
        {ROOMS.map(r => (
          <a
            key={r.id}
            className={room === r.id ? 'on' : undefined}
            role="button"
            tabIndex={0}
            onClick={() => enterRoom(r.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterRoom(r.id) }
            }}
          >
            {r.label}
            {r.id === 'awaiting' && awaitingCount > 0 && <span className="badge">{awaitingCount}</span>}
          </a>
        ))}
      </nav>
      <button className="newbtn" onClick={newChat}>New chat</button>

      {/* Migrated: the provider-degraded / outage notice. Red for a total outage, amber for
          backup intelligence. Shown only when the route said so. */}
      {degraded && (
        <div className={degraded.outage ? 'ax-degraded out' : 'ax-degraded'} role="status">
          {degraded.note}
          {degraded.provider && (
            <span className="ax-degraded-who"> Answered by {degraded.provider}.</span>
          )}
        </div>
      )}

      <div className="stage">
        <div className="hero">
          {/* #ax-avatar is the mount point the contract names, and the REAL Aria mounts into it:
              the VRM at public/models/Aria.glb via AriaTalkingHead. The contract's drawn
              .hair/.head/.fringe/.eye/.smile/.torso/.lapel children are deliberately absent in
              every state — that face is a mockup placeholder, not Aria.

              `settledReply` is deliberately NOT the streaming buffer. Feeding the avatar in-flight
              text would change its props on every token and re-render a WebGL canvas per token. */}
          <div className="orbit">
            <div className="corona" />
            <div className="figure" id="ax-avatar">
              <AriaAvatarMount replyText={settledReply} speaking={isBusy} />
            </div>
          </div>

          <div className="headline">
            {headline.lead} <em>{headline.em}</em>
          </div>
          <div className="tagline">
            {/* S6 PHASE 5 — "I've been watching your stock, your money and your people ALL DAY" is
                the strongest unsupported claim on the surface: Aria reads the business on load, not
                continuously. Note what was NOT wrong — the domains are real (95 products, 1,802
                completed sales, 4 active staff, 51 customers), so this is not corrected into "I
                have no data", which would be its own untruth. Only the continuity claim goes.
                When the till is empty today, that fact leads, because it is the thing the owner
                can act on. */}
            {revenue
              ? 'Takings today ' + formatAxFigure(revenue) + '. Connected to your till, stock and people.'
              : 'Nothing through the till yet today. Connected to your till, stock and people.'}
          </div>

          <div className="live">
            <span className="wave"><i /><i /><i /><i /></span>
            <span>{doing}</span>
          </div>

          {/* ── WELCOME-ONLY: what Aria noticed, ranked. Always in the DOM; CSS collapses it. ── */}
          <div className="noticed">
            {ctxLoading && <div className="quiet">Having a look at your day…</div>}

            {!ctxLoading && ctxUnreadable && (
              <div className="quiet">
                Your data couldn’t be read, so I’m not going to guess at what’s happening.
                That’s a problem at our end, not a quiet day.
              </div>
            )}

            {!ctxLoading && !ctxUnreadable && noticed.length === 0 && (
              <div className="quiet">
                I’ve been through today’s takings, what’s waiting on a decision, and what’s running
                low. There’s nothing I’d put in front of you. Ask me anything.
              </div>
            )}

            {/* S8 PHASE 3 — `n.id` was already on the next line as the React key and went no
                further, while the council got `Tell me about "<title>"` and asked the owner where
                they had seen it. A 'computed' notice has no row to look up, so it passes no
                reference rather than a fabricated one. */}
            {!ctxLoading && !ctxUnreadable && noticed.slice(0, 3).map((n, i) => (
              <button
                className="nt"
                key={n.id}
                onClick={() => void ask(n.prompt, undefined,
                  n.source === 'aria_action' ? { id: n.id, source: 'aria_action' } : undefined)}
              >
                <span className={DOT_CLASS[i] ?? 'p'} />
                <span>
                  <span className="h">{n.title}</span>
                  <span className="s">{n.subtitle}</span>
                </span>
                <span className="arrow">→</span>
              </button>
            ))}

            {/* Migrated from the old surface: real suggestions from /api/aria/ask/suggestions. */}
            <ChatSuggestions onSelect={ask} disabled={isBusy} />
          </div>

          {/* ── the autonomy control (appended styles; the real agent_settings.mode) ── */}
          <div className="rope">
            <div className="l">HOW MUCH ROPE</div>
            <div className="track" role="group" aria-label="How much autonomy Aria has">
              {MODES.map(m => (
                <button
                  key={m.id}
                  className={autonomy?.mode === m.id ? 'on' : undefined}
                  aria-pressed={autonomy?.mode === m.id}
                  disabled={savingMode || !autonomy}
                  onClick={() => chooseMode(m.id)}
                >{m.label}</button>
              ))}
            </div>
            {!autonomy && <div className="ex">Reading your current setting…</div>}
            {autonomy?.mode && autonomy.explanations?.[autonomy.mode] && (
              <div className="ex">{autonomy.explanations[autonomy.mode]}</div>
            )}
            {autonomyNote && <div className="ex warn">{autonomyNote}</div>}
          </div>

          <div className="bigask">
            <input
              placeholder="Ask Aria anything, or tell her to do it…"
              value={welcomeInput}
              onChange={e => setWelcomeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void ask(welcomeInput) } }}
            />
            {/* Real voice, migrated from the old surface's VoiceInput. */}
            <VoiceInput onTranscript={t => setWelcomeInput(t)} disabled={isBusy} />
            {isBusy ? (
              <button className="send stop" onClick={cancel} aria-label="Stop generating">■</button>
            ) : (
              <button className="send" onClick={() => void ask(welcomeInput)}>↑</button>
            )}
          </div>

          {/* the collapsed column repeats the control compactly */}
          <div className="ropemini">
            <div className="track">
              {MODES.map(m => (
                <button
                  key={m.id}
                  className={autonomy?.mode === m.id ? 'on' : undefined}
                  disabled={savingMode || !autonomy}
                  onClick={() => chooseMode(m.id)}
                >{m.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── WORKING: the conversation card. Always in the DOM; CSS fades it in. ── */}
        <div className="talk">
          <div className="th">
            <div className="av">A</div>
            <div>
              <b>{
                room === 'awaiting' ? 'Awaiting you'
                  : room === 'made' ? 'Made for you'
                    : (() => {
                  // S3 PHASE 6 — was `.slice(0, 42)`, a raw cut with no ellipsis and no quote
                  // balancing, which rendered `Tell me about "Revenue below weekly target` with
                  // the closing quote lopped off. fallbackTitle applies the SAME rule the thread
                  // list uses — strip the stock opener, strip wrapping quotes, truncate on a word
                  // boundary, close any quote the cut left hanging — so the header and the list
                  // name a thread identically instead of two truncations disagreeing.
                  const first = turns.find(t => t.role === 'user')?.text
                  return first ? fallbackTitle(first) : 'Ask Aria'
                })()
              }</b>
              {/* S6 PHASE 5 — "Always on" is the same continuity claim in miniature. The honest
                  half of this line was always the second half. */}
              <span>Connected records only</span>
            </div>
            <div className="r">
              {/* The share button is GONE. There is no thread-share route — only
                  /api/aria/task-outputs/[id]/share, which shares an OUTPUT, not a conversation.
                  A button that cannot share is worse than no button. */}
              <button aria-label="Your threads" onClick={() => setThreadsOpen(v => !v)}>⋯</button>
            </div>
          </div>

          {room === 'awaiting' && (
            // ONE .ax-room. The audit log goes INSIDE the room as a child rather than beside it in
            // a second wrapper — nesting two `.ax-room`s gave two competing scroll containers and
            // collapsed the content to a sliver.
            <AwaitingRoom ctx={ctx} loading={ctxLoading} unreadable={ctxUnreadable}
              onPrompt={(p, ref) => void ask(p, undefined, ref)}>
              {/* Migrated: what Aria has already done, and the rollback path. Real component,
                  real route (/api/aria/ask/audit, /rollback) over aria_action_log. */}
              <AuditLogCard />
            </AwaitingRoom>
          )}
          {room === 'made' && <MadeForYouRoom onPrompt={(p, ref) => void ask(p, undefined, ref)} />}

          {room === 'ask' && (
            <div
              className="flow"
              ref={flowRef}
              /**
               * M11 phase 1 — remember where in the thread the owner is reading, so a refresh
               * returns them to it rather than to the bottom. Per thread, this tab only, and never
               * while a reply is streaming: the view is being pulled to the newest token then, and
               * recording that would remember the machine's position instead of the owner's.
               */
              onScroll={e => { if (!isBusy) rememberScroll(conversationId, (e.target as HTMLDivElement).scrollTop) }}
            >
              {turns.map((t, i) => {
                const live = t.streaming ? text : t.text
                if (t.role === 'user') {
                  const isEditing = editing?.index === i
                  return (
                    <div className="m me" key={i}>
                      <div className="a" style={{ background: 'var(--tan)', color: '#4a3719' }}>You</div>
                      <div>
                        <div className="who">You</div>
                        {isEditing ? (
                          <div className="ax-edit">
                            <textarea
                              value={editing!.text}
                              autoFocus
                              onChange={e => setEditing({ index: i, text: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(i, editing!.text) }
                                if (e.key === 'Escape') setEditing(null)
                              }}
                            />
                            <div className="ax-msgacts">
                              <button className="go" onClick={() => submitEdit(i, editing!.text)}>Ask again</button>
                              <button className="gh" onClick={() => setEditing(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="bub">{t.text}</div>
                            <div className="ax-msgacts">
                              <button className="gh" onClick={() => setEditing({ index: i, text: t.text })}>Edit</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                }
                // M11B PHASE 1 — a plan turn. Rendered in the flow like any other turn, so it
                // scrolls, restores and sits in the conversation it belongs to.
                if (t.plan) {
                  return (
                    <div key={i}>
                      <div className="skill"><i>✦</i> <b>A plan</b> · nothing has run</div>
                      <div className="m">
                        <div className="a aria">A</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="who">Aria</div>
                          {/* M11B phase 2 — the approve button is live. PlanCard renders it only
                              for a plan that has a row AND is still 'proposed', so an approved or
                              abandoned plan shows its state rather than a button that would no-op. */}
                          <PlanCard
                            result={t.plan.result}
                            planId={t.plan.planId}
                            status={t.plan.status}
                            outcomes={t.plan.outcomes}
                            approving={approvingId !== null && approvingId === t.plan.planId}
                            onApprove={id => void approvePlan(id, i)}
                          />
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i}>
                    {t.skill && (
                      <div className="skill"><i>✦</i> <b>{t.skill}</b> · checked your records</div>
                    )}
                    {t.usedCouncil && (
                      <div className="skill"><i>✦</i> <b>The council</b> · several advisors weighed in</div>
                    )}
                    <div className={t.disagrees ? 'm disagree' : 'm'}>
                      <div className="a aria">A</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="who">Aria</div>
                        <div className="bub">
                          {/* S1 PHASE 8 — real markdown. Provenance is wrapped INSIDE the rendered
                              elements (table cells included), so a number in a table keeps its
                              truth tier and click-to-source exactly as one in a paragraph does. */}
                          <AnswerMarkdown
                            text={live}
                            streaming={t.streaming}
                            provenance={t.provenance}
                            idPrefix={String(i)}
                            openSrc={openSrc}
                            onToggleSrc={setOpenSrc}
                          />
                          {t.streaming && <span className="cursor" />}
                        </div>
                        {/* Migrated: charts, tables and KPI blocks render through the existing
                            BlockRenderer rather than a second implementation. */}
                        {(t.blocks ?? []).map((b, k) => (
                          <div key={'blk' + k} style={{ marginTop: 12 }}>
                            <BlockRenderer block={b} onChoice={ask} />
                          </div>
                        ))}
                        {/* S1 PHASE 8 — up to three suggested next questions. These come from the
                            route's existing payload; nothing is invented client-side, and they are
                            absent when the route had none. */}
                        {!t.streaming && (t.followups ?? []).length > 0 && (
                          <div className="ax-followups">
                            {(t.followups ?? []).slice(0, 3).map(f => (
                              <button key={f} className="ax-followup" onClick={() => void ask(f)}>{f}</button>
                            ))}
                          </div>
                        )}
                        {t.incomplete && (
                          <div className="ax-incomplete">
                            Stopped — this answer is unfinished.
                          </div>
                        )}
                        {/* S8 PHASE 2 — a narrower answer says so. No percentage and no quality
                            score: the owner cannot act on either, and GROUNDING-TEETH forbids a
                            number that is not measured. It says what happened and nothing more. */}
                        {!t.streaming && t.advisorsLost && t.advisorsLost.length > 0 && (
                          <div className="ax-incomplete">
                            {advisorShortfallNote(t.advisorsLost.length)}
                          </div>
                        )}
                        {/* Migrated from the old surface's MessageActions: copy, and re-ask. */}
                        {!t.streaming && t.text && (
                          <div className="ax-msgacts">
                            <button className="gh" onClick={() => void copyAnswer(i, t.text)}>
                              {copied === i ? 'Copied' : 'Copy'}
                            </button>
                            {i === turns.length - 1 && (
                              <button className="gh" onClick={regenerate} disabled={isBusy}>
                                Ask again
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* S1 PHASE 7 — A FAILURE THAT ENDS SOMEWHERE. Retry appears only when retrying can
                  actually help: offering it on an exhausted credit balance or a bad key would cost
                  the owner a second wait to reach the same wall. */}
              {error && (
                <div className="ax-error">
                  <div className="ax-error-msg">{error.message}</div>
                  {error.retryable ? (
                    <button className="go" onClick={() => void retry()} disabled={isBusy}>
                      Try again
                    </button>
                  ) : (
                    <div className="ax-error-note">Retrying won’t change this one.</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="write">
            <div className="box">
              <textarea
                rows={1}
                placeholder="Ask Aria anything…"
                value={input}
                onChange={e => { setInput(e.target.value); writeDraft(conversationId, e.target.value) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input) }
                }}
              />
              <div className="brow">
                {/* Was a <span> dressed as a dropdown that did nothing. It now opens the skill
                    picker — the real one from the old surface, backed by /api/aria/skills. */}
                <button className="mode" onClick={() => setSkillsOpen(v => !v)}>💬 Skills ⌄</button>

                {/* M11B PHASE 1 — DELEGATE. An explicit gesture: this is how the owner says "do
                    this" rather than "tell me about this". Nothing is inferred from the wording of
                    a message, because that guess would change every turn rather than this one. */}
                <button
                  className="mode"
                  disabled={planning || isBusy || !input.trim()}
                  title="Describe an outcome and Aria will plan it. Nothing runs until you approve."
                  onClick={() => void delegate(input)}
                  style={{ opacity: (planning || isBusy || !input.trim()) ? 0.4 : 1 }}
                >{planning ? '⏳ Planning…' : '🗂 Delegate'}</button>

                {/* Real attach: same route and FormData shape as the old surface. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f) }}
                />
                <button
                  className="cb"
                  aria-label="Attach a file"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >📎</button>

                <VoiceInput onTranscript={t => setInput(t)} disabled={isBusy} />
                {/* S1 PHASE 1 — STOP GENERATING. While a turn is in flight the send button becomes
                    Stop, because a streaming answer you cannot interrupt is worse than no streaming:
                    the owner watches a wrong answer arrive and can do nothing. */}
                {isBusy ? (
                  <button className="send2 stop" onClick={cancel} aria-label="Stop generating">■</button>
                ) : (
                  <button className="send2" onClick={() => void ask(input)}>↑</button>
                )}
              </div>
            </div>
            <div className="oath">Connected records only — she won’t invent missing data</div>
          </div>

          {skillsOpen && (
            <div className="ax-skills">
              <div className="ax-skills-h">
                Your skills
                <button className="cb" onClick={() => setSkillsOpen(false)} aria-label="Close">✕</button>
              </div>
              <SkillPicker />
            </div>
          )}
        </div>
      </div>

      <ThreadsPanel
        open={threadsOpen}
        onClose={() => setThreadsOpen(false)}
        onOpenThread={openThread}
        activeId={conversationId}
      />

      <button className="back" onClick={home}>← Back to welcome</button>
    </div>
  )
}
