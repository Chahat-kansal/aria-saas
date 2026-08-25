'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAriaStream } from './useAriaStream'
import AriaAvatarMount from './AriaAvatarMount'
import ThreadsPanel from './rooms/ThreadsPanel'
import AwaitingRoom from './rooms/AwaitingRoom'
import MadeForYouRoom from './rooms/MadeForYouRoom'
import VoiceInput from '@/components/aria/VoiceInput'
import ChatSuggestions from '@/components/aria/ChatSuggestions'
import { SkillPicker } from '@/components/aria/SkillPicker'
import { BlockRenderer } from '@/components/dashboard/BlockRenderer'
import AuditLogCard from '@/components/aria/AuditLogCard'
import { segmentFigures } from '@/lib/aria/figure-provenance'
import { toClipboardMarkdown } from '@/lib/aria/copy-markdown'
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
  const [degraded, setDegraded] = useState<{ note: string; outage: boolean } | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  // S1 phase 3 — which rendered message is being edited, and its working text.
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null)

  const { send, cancel, text, stage, error, isBusy } = useAriaStream()
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

  useEffect(() => {
    if (flowRef.current) flowRef.current.scrollTop = 9e9
  }, [turns.length, text, room])

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
  ) => {
    const msg = prompt.trim()
    if (!msg || isBusy) return
    setRoom('ask')            // asking always returns you to the conversation
    setWorking(true)          // enter WORKING — the transition runs
    setInput('')
    setWelcomeInput('')
    setTurns(prev => [...prev, { role: 'user', text: msg }, { role: 'aria', text: '', streaming: true }])

    const result = await send({
      message: msg,
      conversation_id: conversationId,
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
        }
      }
      return updated
    })
    if (result?.conversation_id) setConversationId(result.conversation_id)

    // Migrated: API-RESILIENCE-1/1B. Backup provider = amber, total outage = red. Only what the
    // route actually said — never inferred from a slow or empty answer.
    const r = result as { total_outage?: boolean; degraded_provider?: boolean; note?: string } | null
    if (r?.total_outage) {
      setDegraded({ outage: true, note: 'All AI providers are briefly offline. Your business data and POS are safe and working.' })
    } else if (r?.degraded_provider) {
      setDegraded({ outage: false, note: r.note ?? 'Aria is running on backup intelligence — answers use your latest saved data.' })
    } else {
      setDegraded(null)
    }
  }, [conversationId, isBusy, send])

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
  const openThread = useCallback((id: string, messages: Array<{ role: string; content: string }>) => {
    setConversationId(id)
    setRoom('ask')
    setWorking(true)
    setTurns(messages.map(m => ({
      role: (m.role === 'user' ? 'user' : 'aria') as 'user' | 'aria',
      text: String(m.content ?? ''),
      streaming: false,
    })))
  }, [])

  const home = useCallback(() => setWorking(false), [])

  const newChat = useCallback(() => {
    setTurns([])
    setConversationId(null)
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
    : (ctxLoading ? 'Looking at your day' : 'Watching your till')

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
    const n = noticed.length
    return { lead, em: n === 1 ? 'One thing stood out.' : n + ' things stood out.' }
  }, [ctx?.ownerName, ctxLoading, ctxUnreadable, noticed.length])

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
            {revenue
              ? 'Takings today ' + formatAxFigure(revenue) + '. I’ve been watching your stock, your money and your people.'
              : 'I’ve been watching your stock, your money and your people all day.'}
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

            {!ctxLoading && !ctxUnreadable && noticed.slice(0, 3).map((n, i) => (
              <button className="nt" key={n.id} onClick={() => ask(n.prompt)}>
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
                    : (turns.find(t => t.role === 'user')?.text.slice(0, 42) ?? 'Ask Aria')
              }</b>
              <span>Always on · connected records only</span>
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
            <AwaitingRoom ctx={ctx} loading={ctxLoading} unreadable={ctxUnreadable} onPrompt={ask}>
              {/* Migrated: what Aria has already done, and the rollback path. Real component,
                  real route (/api/aria/ask/audit, /rollback) over aria_action_log. */}
              <AuditLogCard />
            </AwaitingRoom>
          )}
          {room === 'made' && <MadeForYouRoom onPrompt={ask} />}

          {room === 'ask' && (
            <div className="flow" ref={flowRef}>
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
                const segs = segmentFigures(live, {})
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
                          {segs.map((s, j) => {
                            // A figure with no provenance behind it gets NO affordance. An underline
                            // is a promise, and this turn cannot keep one it never captured.
                            if (s.kind === 'text' || s.tier === 'plain') return <span key={j}>{s.text}</span>
                            const id = i + '-' + j
                            return (
                              <span
                                key={j}
                                className={s.tier === 'estimated' ? 'n2 est' : 'n2'}
                                onClick={() => setOpenSrc(openSrc === id ? null : id)}
                              >{s.text}</span>
                            )
                          })}
                          {t.streaming && <span className="cursor" />}
                          {segs.map((s, j) => {
                            if (s.kind !== 'figure' || s.tier === 'plain' || !s.source) return null
                            const id = i + '-' + j
                            const cls = 'src' + (s.tier === 'estimated' ? ' est' : '') + (openSrc === id ? ' on' : '')
                            return <div className={cls} key={'src' + j}><b>Where this came from</b> · {s.source}</div>
                          })}
                        </div>
                        {/* Migrated: charts, tables and KPI blocks render through the existing
                            BlockRenderer rather than a second implementation. */}
                        {(t.blocks ?? []).map((b, k) => (
                          <div key={'blk' + k} style={{ marginTop: 12 }}>
                            <BlockRenderer block={b} onChoice={ask} />
                          </div>
                        ))}
                        {t.incomplete && (
                          <div className="ax-incomplete">
                            Stopped — this answer is unfinished.
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

              {error && <div className="errline">{error}</div>}
            </div>
          )}

          <div className="write">
            <div className="box">
              <textarea
                rows={1}
                placeholder="Ask Aria anything…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input) }
                }}
              />
              <div className="brow">
                {/* Was a <span> dressed as a dropdown that did nothing. It now opens the skill
                    picker — the real one from the old surface, backed by /api/aria/skills. */}
                <button className="mode" onClick={() => setSkillsOpen(v => !v)}>💬 Skills ⌄</button>

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
