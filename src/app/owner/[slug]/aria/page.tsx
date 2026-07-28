'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOwnerBusiness } from '../OwnerBusinessContext'
import { INK, SUBTEXT, BORDER, FONT_MONO } from '@/app/owner/theme'
import type { ChatAction, SuggestedChip } from '@/lib/owner-app/chat'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
  error?: boolean
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '14px 16px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%', background: SUBTEXT, display: 'inline-block',
          animation: 'owner-typing 1.2s ease-in-out infinite', animationDelay: (i * 0.16) + 's',
        }} />
      ))}
      <style>{'@keyframes owner-typing { 0%,60%,100% { opacity:0.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-3px) } }'}</style>
    </div>
  )
}

export default function OwnerAriaChatPage() {
  const business = useOwnerBusiness()
  const router = useRouter()
  const [turns, setTurns] = useState<Turn[]>([])
  const [chips, setChips] = useState<SuggestedChip[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [creatingJob, setCreatingJob] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/owner/ask?business_id=' + business.id)
      .then(r => r.ok ? r.json() : { chips: [] })
      .then(j => setChips(j.chips ?? []))
      .catch(() => setChips([]))
  }, [business.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns, thinking])

  const send = useCallback(async (text: string) => {
    const question = text.trim()
    if (!question || thinking) return
    setInput('')
    // Multi-turn: prior turns go to the brain as context so follow-ups ("and next week?") work.
    // The brain already accepts messages[] + conversation_id — no new memory system built here.
    const priorTurns = turns.filter(t => !t.error).map(t => ({ role: t.role, content: t.content }))
    setTurns(prev => [...prev, { role: 'user', content: question }])
    setThinking(true)
    try {
      const res = await fetch('/api/owner/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, message: question, messages: priorTurns, conversation_id: conversationId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) {
        setTurns(prev => [...prev, { role: 'assistant', content: 'I couldn\'t get to your data just then. Tap to try again.', error: true }])
      } else {
        if (json.conversation_id) setConversationId(json.conversation_id)
        setTurns(prev => [...prev, { role: 'assistant', content: json.response || 'I don\'t have that in your data.', actions: json.actions ?? [] }])
      }
    } catch {
      setTurns(prev => [...prev, { role: 'assistant', content: 'I couldn\'t get to your data just then. Tap to try again.', error: true }])
    } finally {
      setThinking(false)
    }
  }, [business.id, conversationId, thinking, turns])

  async function runAction(action: ChatAction) {
    if (action.type === 'open_decision' && action.payload.decision_id) {
      router.push('/owner/' + business.slug + '/decisions?open=' + action.payload.decision_id)
      return
    }
    if (action.type === 'create_job' && action.payload.ask) {
      setCreatingJob(true)
      try {
        // Reuses PH-2's job endpoint exactly — no parallel creation path. That route already emits
        // the business_events job_created row, so a chat-originated job lands in the moat spine
        // identically to one created from the Jobs tab (chat is just another origin).
        const res = await fetch('/api/owner/jobs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: business.id, ask: action.payload.ask }),
        })
        if (res.ok) router.push('/owner/' + business.slug + '/jobs')
      } finally {
        setCreatingJob(false)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', padding: '20px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#d9f54e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: INK }}>a</div>
        <div style={{ fontWeight: 700, fontSize: 26, color: INK }}>Aria</div>
      </div>
      <div style={{ fontSize: 14, color: SUBTEXT, marginTop: 4, lineHeight: 1.5 }}>
        Reading today&apos;s shift, your POS, 30 days of history and every decision you&apos;ve made.
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        {turns.length === 0 && !thinking && (
          <div style={{ padding: 20, textAlign: 'center', color: SUBTEXT, fontSize: 13, border: '1px dashed ' + BORDER, borderRadius: 12 }}>
            Ask me anything about the business — I&apos;ll answer from your real numbers.
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '85%', animation: 'owner-rise 0.22s ease-out' }}>
              <div style={{
                background: t.role === 'user' ? INK : '#fff',
                color: t.role === 'user' ? '#fff' : INK,
                border: t.role === 'user' ? 'none' : '1px solid ' + (t.error ? '#f0c4c4' : BORDER),
                borderRadius: 16, padding: '12px 16px', fontSize: 14, lineHeight: 1.55,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {t.content}
              </div>
              {t.error && (
                <button onClick={() => send(turns[i - 1]?.content ?? '')}
                  style={{ marginTop: 6, background: 'transparent', border: 'none', color: INK, fontSize: 13, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                  Try again
                </button>
              )}
              {t.actions && t.actions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {t.actions.map((a, ai) => (
                    <button key={ai} disabled={creatingJob} onClick={() => runAction(a)}
                      style={{
                        padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid ' + BORDER, background: a.type === 'open_decision' ? '#d9f54e' : 'transparent', color: INK,
                        opacity: creatingJob ? 0.6 : 1,
                      }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#fff', border: '1px solid ' + BORDER, borderRadius: 16 }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {chips.length > 0 && turns.length === 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 16, paddingBottom: 4 }}>
          {chips.map(c => (
            <button key={c.question} onClick={() => send(c.question)}
              style={{ flexShrink: 0, padding: '10px 16px', borderRadius: 999, border: '1px solid ' + BORDER, background: '#fff', fontSize: 13, color: INK, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input) }}
          placeholder="Ask Aria…"
          style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid ' + BORDER, fontSize: 14, boxSizing: 'border-box' }}
        />
        <button
          disabled={!input.trim() || thinking}
          onClick={() => send(input)}
          style={{ padding: '0 20px', borderRadius: 12, border: 'none', background: INK, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: !input.trim() || thinking ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: SUBTEXT, marginTop: 8, textAlign: 'center', letterSpacing: '0.03em' }}>
        ARIA ANSWERS AND PROPOSES — MONEY AND PUBLISHING STAY GATED IN DECISIONS
      </div>
      <style>{'@keyframes owner-rise { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }'}</style>
    </div>
  )
}
