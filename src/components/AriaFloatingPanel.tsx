'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { speakAriaText, stopAriaSpeech, initVoice } from '@/lib/aria/headTTSBridge'
import { parseAriaTags } from '@/lib/aria/parse-aria-tags'

const AriaTalkingHead = dynamic(
  () => import('@/components/aria/AriaTalkingHead'),
  { ssr: false },
)

// ── Route → brain endpoint ──────────────────────────────────────────────────
function getBrain(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return '/api/aria/ask'
  if (pathname.startsWith('/staff/portal')) return '/api/aria/staff-talk'
  return '/api/aria/talk'
}

// ── Route → human-readable page name ────────────────────────────────────────
const PAGE_NAMES: [string, string][] = [
  ['/dashboard/ask-aria',         'Ask Aria'],
  ['/dashboard/staff',            'Staff Management'],
  ['/dashboard/inventory',        'Inventory'],
  ['/dashboard/cash-up',          'Cash Up'],
  ['/dashboard/reviews',          'Reviews'],
  ['/dashboard/customers',        'Customers'],
  ['/dashboard/autopilot',        'AI Autopilot'],
  ['/dashboard/intelligence',     'Business Intelligence'],
  ['/dashboard/daily-briefing',   'Daily Briefing'],
  ['/dashboard',                  'Dashboard Overview'],
  ['/staff/portal/timesheets',    'Timesheets'],
  ['/staff/portal/leave',         'Leave Management'],
  ['/staff/portal/availability',  'Availability'],
  ['/staff/portal/messages',      'Messages'],
  ['/staff/portal/training',      'Training'],
  ['/staff/portal',               'Staff Home'],
]

function getPageName(pathname: string): string {
  for (const [route, name] of PAGE_NAMES) {
    if (pathname === route || pathname.startsWith(route + '/')) return name
  }
  if (pathname.startsWith('/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/staff'))     return 'Staff Portal'
  return 'Aria'
}

// ── Heuristic mood for endpoints that don't return [mood:X] tags ────────────
function heuristicMood(text: string): string {
  const t = text.toLowerCase()
  if (/\b(great|excellent|up|growth|well done|positive|good news)\b/.test(t)) return 'happy'
  if (/\b(concern|issue|problem|drop|risk|alert|low)\b/.test(t))              return 'concerned'
  if (/\b(consider|suggest|recommend|analysing|looking at)\b/.test(t))        return 'thinking'
  return 'neutral'
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const T = {
  border:  'rgba(127,184,151,0.12)',
  text:    '#E8EDE7',
  sage:    '#7FB897',
  deep:    '#2D5240',
  body:    'var(--font-body, Outfit, Inter, sans-serif)',
}

type SpeechRecognitionEvent = {
  results: Array<{ 0: { transcript: string }; isFinal: boolean }>
}
type AriaRecog = {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror:  ((e: unknown) => void) | null
  onend:    (() => void) | null
  start: () => void; stop: () => void; abort: () => void
}

export default function AriaFloatingPanel({ onClose }: { onClose: () => void }) {
  const pathname  = usePathname() ?? '/'
  const [phase,   setPhase]   = useState<Phase>('idle')
  const [input,   setInput]   = useState('')
  const [reply,   setReply]   = useState('')
  const [mood,    setMood]    = useState('neutral')
  const [gesture, setGesture] = useState('')
  const [error,   setError]   = useState('')
  const [micOk,   setMicOk]   = useState(false)

  // Conversation history — passed to API for context, never rendered
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  const inputRef  = useRef<HTMLInputElement>(null)
  const recognRef = useRef<AriaRecog | null>(null)
  const brain     = getBrain(pathname)
  const pageName  = getPageName(pathname)

  useEffect(() => {
    initVoice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    setMicOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition))
    return () => { stopAriaSpeech(); recognRef.current?.abort() }
  }, [])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || phase === 'thinking' || phase === 'speaking') return

    // Append user turn before API call (memory cap: 20 messages)
    const newMessages = [...messages, { role: 'user' as const, content: msg }].slice(-20)
    setMessages(newMessages)

    stopAriaSpeech()
    setReply('')
    setError('')
    setInput('')
    setGesture('')
    setPhase('thinking')

    try {
      const res = await fetch(brain, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          messages: newMessages,
          page_context: { route: pathname, page_name: pageName },
        }),
      })
      const data = await res.json() as { reply?: string; response?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong — try again.')
        setPhase('idle')
        return
      }

      const raw = (data.reply ?? data.response ?? '').trim()
      const { clean, mood: m, gesture: g } = parseAriaTags(raw)
      const resolvedMood    = (m !== 'neutral' || /\[mood:/.test(raw)) ? m : heuristicMood(clean)
      const resolvedGesture = g || (resolvedMood === 'happy' ? 'thumbup' : resolvedMood === 'concerned' ? 'shrug' : '')

      // Silently append Aria's reply to hidden history
      setMessages(prev => [...prev, { role: 'assistant' as const, content: clean }].slice(-20))
      setMood(resolvedMood)
      setGesture(resolvedGesture)
      setReply(clean)
      setPhase('speaking')

      speakAriaText(clean, (_schedule, _startMs) => {
        const approxMs = Math.max(1500, clean.split(' ').length * 350)
        setTimeout(() => {
          setPhase('idle')
          setReply('')
          inputRef.current?.focus()
        }, approxMs)
      })
    } catch (e) {
      setError((e as Error).message ?? 'Network error')
      setPhase('idle')
    }
  }, [phase, brain, pathname, pageName, messages])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    const rec: AriaRecog = new SR()
    recognRef.current = rec
    rec.lang = 'en-AU'; rec.continuous = false; rec.interimResults = true
    setPhase('listening'); setError('')
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t) }
    }
    rec.onerror = () => { setPhase('idle') }
    rec.onend   = () => { setPhase(p => p === 'listening' ? 'idle' : p) }
    rec.start()
  }, [send])

  const stopListening = useCallback(() => {
    recognRef.current?.stop()
    setPhase('idle')
  }, [])

  const busy = phase === 'thinking' || phase === 'speaking'

  const statusText =
    phase === 'thinking' ? 'Aria is thinking…' :
    phase === 'speaking' ? 'Aria is speaking…' :
    phase === 'listening' ? 'Listening…' : null

  return (
    <div style={{
      position: 'fixed', bottom: 88, right: 24, zIndex: 9998,
      width: 360, height: 520,
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100vh - 104px)',
      background: 'rgba(14,20,17,0.97)',
      backdropFilter: 'blur(20px)',
      border: '1px solid ' + T.border,
      borderRadius: 24,
      boxShadow: '0 16px 60px rgba(0,0,0,0.75)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      animation: 'ariaSlideUp 250ms cubic-bezier(0.34,1.56,0.64,1) forwards',
    }}>

      {/* Close — floating top-right */}
      <button
        onClick={onClose}
        aria-label="Close Aria"
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 20,
          width: 30, height: 30, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.10)',
          cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
          fontSize: 17, lineHeight: 1, padding: 0,
        }}
      >×</button>

      {/* Avatar — takes all remaining vertical space */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        <AriaTalkingHead
          mode={phase === 'speaking' ? 'talking' : 'idle'}
          replyText={reply}
          mood={mood}
          gesture={gesture}
        />
        {/* Subtle page context badge, bottom-left */}
        {pageName !== 'Aria' && (
          <div style={{
            position: 'absolute', bottom: 8, left: 14, zIndex: 10,
            fontSize: 9, color: 'rgba(127,184,151,0.5)',
            fontFamily: T.body, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {pageName}
          </div>
        )}
      </div>

      {/* Bottom controls — input + status only */}
      <div style={{
        padding: '10px 14px 14px',
        background: 'linear-gradient(0deg, rgba(14,20,17,1) 0%, rgba(14,20,17,0.88) 100%)',
        borderTop: '1px solid rgba(127,184,151,0.07)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {micOk && (
            <button
              onClick={phase === 'listening' ? stopListening : startListening}
              disabled={busy}
              title={phase === 'listening' ? 'Stop' : 'Speak'}
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: phase === 'listening' ? 'rgba(127,184,151,0.22)' : 'rgba(127,184,151,0.07)',
                border: '1px solid ' + (phase === 'listening' ? 'rgba(127,184,151,0.45)' : 'rgba(127,184,151,0.15)'),
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.4 : 1,
                animation: phase === 'listening' ? 'ariaVoicePulse 0.9s ease-in-out infinite' : 'none',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {phase === 'listening'
                ? <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill={T.sage}/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sage} strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="2" width="6" height="12" rx="3"/>
                    <path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/>
                    <line x1="8" y1="22" x2="16" y2="22"/>
                  </svg>
              }
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={phase === 'listening' ? 'Listening…' : 'Ask Aria…'}
            disabled={busy || phase === 'listening'}
            style={{
              flex: 1, height: 38, padding: '0 12px',
              borderRadius: 10,
              border: '1px solid rgba(127,184,151,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: T.text, fontSize: 13, fontFamily: T.body,
              outline: 'none',
              opacity: (busy || phase === 'listening') ? 0.5 : 1,
            }}
          />

          <button
            onClick={() => send(input)}
            disabled={!input.trim() || busy || phase === 'listening'}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.deep, border: 'none',
              cursor: (!input.trim() || busy || phase === 'listening') ? 'default' : 'pointer',
              opacity: (!input.trim() || busy || phase === 'listening') ? 0.3 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {/* Subtle status line — no bubbles */}
        {(statusText || error) && (
          <p style={{
            fontSize: 11, margin: 0, textAlign: 'center', fontFamily: T.body,
            color: error ? '#EF4444' : 'rgba(127,184,151,0.55)',
          }}>
            {error ?? statusText}
          </p>
        )}
      </div>

      <style>{`
        @keyframes ariaSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes ariaVoicePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
