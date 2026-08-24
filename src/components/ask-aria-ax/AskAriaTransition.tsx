'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAriaStream } from './useAriaStream'
import { segmentFigures } from '@/lib/aria/figure-provenance'
import { formatAxFigure, type AxContext } from '@/lib/aria/ax-context-types'
import type { AutonomyMode, AutonomyState } from '@/lib/aria/autonomy'

/**
 * MS16 · AX-1 — ASK ARIA: ONE SCREEN, TWO STATES.
 *
 * WELCOME (no thread) → WORKING (a thread is open), with the single animated transition between
 * them. Every class name here comes from docs/design/ask-aria-transition.html and the stylesheet is
 * that file's <style> block lifted byte-for-byte. Nothing is re-authored.
 *
 * ── THE TWO RULES THIS COMPONENT EXISTS TO HOLD ──────────────────────────────────────────────
 *
 * 1. THE AVATAR IS ONE DOM NODE. `.orbit` / `.corona` / `.figure` are rendered exactly once, at the
 *    top level of `.hero`, and are NEVER inside a conditional. The state change is a class on
 *    <body>; CSS tweens the size and position. If this element ever unmounted and remounted the
 *    whole effect would be lost and the phase would have failed — so the element is deliberately
 *    never wrapped in a conditional branch below, and a test asserts both that it appears exactly
 *    once and that nothing conditional precedes it.
 *
 * 2. BOTH STATES ARE ALWAYS IN THE DOM. `.noticed`, `.bigask` and `.talk` are all rendered at all
 *    times; the lifted CSS collapses them by max-height/opacity. Conditionally rendering them would
 *    make the transition a cut rather than a tween.
 *
 * The state toggle is the class `work` on <body>, exactly as in the mockup, because every rule in
 * the lifted sheet is written as `body.work .x` and editing those selectors is forbidden.
 */

interface Turn {
  role: 'user' | 'aria'
  text: string
  streaming?: boolean
  skill?: string | null
  disagrees?: boolean
}

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
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [welcomeInput, setWelcomeInput] = useState('')
  const [ctx, setCtx] = useState<AxContext | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [ctxUnreadable, setCtxUnreadable] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [autonomy, setAutonomy] = useState<(AutonomyState & { explanations?: Record<string, string>; copilot_parked?: string }) | null>(null)
  const [autonomyNote, setAutonomyNote] = useState<string | null>(null)
  const [savingMode, setSavingMode] = useState(false)
  const [openSrc, setOpenSrc] = useState<string | null>(null)

  const { send, text, stage, error, isBusy } = useAriaStream()
  const flowRef = useRef<HTMLDivElement>(null)

  // ── the state toggle: one class on <body>, exactly as the contract has it ───────────────────
  useEffect(() => {
    const b = document.body
    if (working) b.classList.add('work')
    else b.classList.remove('work')
    // Leaving the page must not strand the class on <body> for the next route.
    return () => { b.classList.remove('work') }
  }, [working])

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
  }, [turns.length, text])

  const chooseMode = useCallback(async (mode: AutonomyMode) => {
    if (savingMode || !autonomy) return
    // Co-pilot has no storage yet — say so rather than appear to save. See lib/aria/autonomy.ts.
    if (mode === 'copilot') { setAutonomyNote(autonomy.copilot_parked ?? null); return }
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

  const ask = useCallback(async (prompt: string) => {
    const msg = prompt.trim()
    if (!msg || isBusy) return
    setWorking(true)          // enter WORKING — the transition runs
    setInput('')
    setWelcomeInput('')
    setTurns(prev => [...prev, { role: 'user', text: msg }, { role: 'aria', text: '', streaming: true }])

    const result = await send({ message: msg, conversation_id: conversationId })

    setTurns(prev => {
      const updated = [...prev]
      const last = updated[updated.length - 1]
      if (last?.role === 'aria') {
        updated[updated.length - 1] = {
          role: 'aria',
          text: String(result?.response ?? '').replace(/\s*\[DELIVERABLE:[^\]]+\]\s*/g, '').trim(),
          streaming: false,
          skill: (result?.tool_calls ?? [])[0]?.name ?? null,
        }
      }
      return updated
    })
    if (result?.conversation_id) setConversationId(result.conversation_id)
  }, [conversationId, isBusy, send])

  const home = useCallback(() => setWorking(false), [])

  const newChat = useCallback(() => {
    setTurns([])
    setConversationId(null)
    setWorking(false)
  }, [])

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

  return (
    <>
      {/* ── decoration ── */}
      <div className="deco">
        <div className="streaks"><i /><i /></div>
        <div className="moire" />
        <div className="hill" />
        <div className="blob one"><span /></div>
        <div className="blob two"><span /></div>
        <div className="blob three"><span /></div>
      </div>

      <div className="brand"><i>A</i>Aria</div>
      <nav className="nav">
        <a className="on">Ask</a>
        <a>Awaiting you</a>
        <a>Made for you</a>
        <a>Routines</a>
      </nav>
      <button className="newbtn" onClick={newChat}>New chat</button>

      <div className="stage">
        <div className="hero">
          {/*
            ONE NODE, BOTH STATES. Never conditional, never keyed, never remounted — the CSS tweens
            it from 250px centred to 148px in the left column.
          */}
          <div className="orbit">
            <div className="corona" />
            <div className="figure">
              <div className="hair" /><div className="head" /><div className="fringe" />
              <div className="eye l" /><div className="eye r" /><div className="smile" />
              <div className="torso" /><div className="lapel" />
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
                <span className="go">→</span>
              </button>
            ))}
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
            <button className="mic" aria-label="Voice">🎙</button>
            <button className="send" onClick={() => void ask(welcomeInput)}>↑</button>
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
              <b>{turns.find(t => t.role === 'user')?.text.slice(0, 42) ?? 'Ask Aria'}</b>
              <span>Always on · connected records only</span>
            </div>
            <div className="r">
              <button aria-label="Share">🔗</button>
              <button aria-label="More">⋯</button>
            </div>
          </div>

          <div className="flow" ref={flowRef}>
            {turns.map((t, i) => {
              const live = t.streaming ? text : t.text
              if (t.role === 'user') {
                return (
                  <div className="m me" key={i}>
                    <div className="a" style={{ background: 'var(--tan)', color: '#4a3719' }}>CK</div>
                    <div>
                      <div className="who">You</div>
                      <div className="bub">{t.text}</div>
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
                    </div>
                  </div>
                </div>
              )
            })}

            {error && <div className="errline">{error}</div>}
          </div>

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
                <span className="mode">💬 Ask ⌄</span>
                <button className="cb" aria-label="Attach">📎</button>
                <button className="cb" aria-label="Voice">🎙</button>
                <button className="send2" onClick={() => void ask(input)} disabled={isBusy}>↑</button>
              </div>
            </div>
            <div className="oath">Connected records only — she won’t invent missing data</div>
          </div>
        </div>
      </div>

      <button className="back" onClick={home}>← Back to welcome</button>
    </>
  )
}
